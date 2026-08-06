import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/use-me";
import { useI18n } from "@/lib/i18n";
import { Section } from "@/components/portal/PortalShell";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCurrentYearId } from "@/lib/rosters";
import { ChatPanel, type ChatPeer } from "@/components/chat/ChatPanel";
import { useAdminChats, useProfileNames } from "@/lib/chat";

export const Route = createFileRoute("/_authenticated/teacher/chat")({
  head: () => ({
    meta: [
      { title: "Messages — Teacher Portal" },
      { name: "description", content: "Message your students per subject and your stage manager." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Page,
});

type Assignment = {
  id: string;
  subject_id: string;
  subjects: { id: string; name: string; stage_group: string; grade_level: string };
};

function Page() {
  const { t } = useI18n();
  const { data: me } = useMe();
  const { data: yearId } = useCurrentYearId();
  const teacherId = me?.userId ?? "";

  const { data: assignments, isLoading: loadingA } = useQuery({
    queryKey: ["chat-teacher-assignments", teacherId, yearId],
    enabled: !!teacherId && !!yearId,
    queryFn: async () =>
      ((await supabase
        .from("teacher_assignments")
        .select("id, subject_id, subjects(id, name, stage_group, grade_level)")
        .eq("teacher_id", teacherId)
        .eq("academic_year_id", yearId!)).data ?? []) as unknown as Assignment[],
  });

  const { data: students, isLoading: loadingS } = useQuery({
    queryKey: ["chat-teacher-students", teacherId, yearId, (assignments ?? []).length],
    enabled: !!yearId && (assignments ?? []).length > 0,
    queryFn: async () => {
      const rows: { subject: Assignment["subjects"]; user_id: string }[] = [];
      for (const a of assignments!) {
        const { data } = await supabase
          .from("student_enrollments")
          .select("user_id")
          .eq("stage_group", a.subjects.stage_group as never)
          .eq("grade_level", a.subjects.grade_level as never)
          .eq("academic_year_id", yearId!)
          .eq("is_graduated", false);
        for (const r of data ?? []) rows.push({ subject: a.subjects, user_id: r.user_id });
      }
      return rows;
    },
  });

  const { data: managers, isLoading: loadingM } = useQuery({
    queryKey: ["chat-teacher-managers", teacherId, (assignments ?? []).length],
    enabled: (assignments ?? []).length > 0,
    queryFn: async () => {
      const stages = Array.from(new Set((assignments ?? []).map((a) => a.subjects.stage_group)));
      const { data } = await supabase
        .from("stage_manager_assignments")
        .select("user_id, stage_group")
        .in("stage_group", stages as never[]);
      return data ?? [];
    },
  });

  const names = useProfileNames([
    ...(students ?? []).map((s) => s.user_id),
    ...(managers ?? []).map((m) => m.user_id),
  ]);
  const nameOf = (id: string) => names.data?.get(id) ?? "—";
  const { data: adminIds } = useAdminChats(teacherId);
  const adminNames = useProfileNames(adminIds ?? []);
  const adminPeers: ChatPeer[] = (adminIds ?? []).map((id) => ({
    key: `admin:${id}`,
    name: adminNames.data?.get(id) ?? "—",
    subtitle: t("chat.administration"),
    kind: "admin_user",
    teacherId: id,
    otherId: teacherId,
  }));

  const studentPeers: ChatPeer[] = (students ?? []).map((s) => ({
    key: `${s.subject.id}:${s.user_id}`,
    name: nameOf(s.user_id),
    subtitle: `${s.subject.name} — ${t(`grade.${s.subject.grade_level}`)}`,
    kind: "teacher_student",
    teacherId,
    otherId: s.user_id,
    subjectId: s.subject.id,
  }));

  const smPeers: ChatPeer[] = Array.from(
    new Map((managers ?? []).map((m) => [m.user_id, m])).values(),
  ).map((m) => ({
    key: `sm:${m.user_id}`,
    name: nameOf(m.user_id),
    subtitle: t(`stage.${m.stage_group}`),
    kind: "sm_teacher",
    teacherId,
    otherId: m.user_id,
  }));

  return (
    <Section title={t("nav.messages")}>
      <Tabs defaultValue="students">
        <TabsList>
          <TabsTrigger value="students">{t("chat.students")}</TabsTrigger>
          <TabsTrigger value="sm">{t("chat.stage_manager")}</TabsTrigger>
          <TabsTrigger value="admins">{t("chat.administration")}</TabsTrigger>
        </TabsList>
        <TabsContent value="students" className="mt-4">
          <ChatPanel
            peers={studentPeers}
            meId={teacherId}
            yearId={yearId ?? null}
            loading={loadingA || loadingS}
            emptyText={t("chat.no_students")}
          />
        </TabsContent>
        <TabsContent value="sm" className="mt-4">
          <ChatPanel
            peers={smPeers}
            meId={teacherId}
            yearId={yearId ?? null}
            loading={loadingA || loadingM}
            emptyText={t("chat.no_managers")}
          />
        </TabsContent>
        <TabsContent value="admins" className="mt-4">
          <ChatPanel
            peers={adminPeers}
            meId={teacherId}
            yearId={yearId ?? null}
            emptyText={t("chat.no_admins")}
          />
        </TabsContent>
      </Tabs>
    </Section>
  );
}