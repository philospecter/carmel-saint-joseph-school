import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/use-me";
import { useI18n } from "@/lib/i18n";
import { Section, EmptyState } from "@/components/portal/PortalShell";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCurrentYearId } from "@/lib/rosters";
import { ChatPanel, type ChatPeer } from "@/components/chat/ChatPanel";
import { useAdminChats, useProfileNames } from "@/lib/chat";

export const Route = createFileRoute("/_authenticated/staff/chat")({
  head: () => ({
    meta: [
      { title: "Messages — Staff Portal" },
      { name: "description", content: "Message the teachers of the stages you manage." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Page,
});

type Row = {
  teacher_id: string;
  subjects: { id: string; name: string; stage_group: string; grade_level: string } | null;
};

function Page() {
  const { t } = useI18n();
  const { data: me } = useMe();
  const { data: yearId } = useCurrentYearId();
  const stages = me?.stages ?? [];
  const isAdmin = !!me?.roles.includes("admin");
  const meId = me?.userId ?? "";

  const { data: rows, isLoading } = useQuery({
    queryKey: ["chat-sm-teachers", stages.join(","), yearId],
    enabled: stages.length > 0 && !!yearId,
    queryFn: async () => {
      const { data: subjects } = await supabase
        .from("subjects")
        .select("id")
        .in("stage_group", stages as never[]);
      const ids = (subjects ?? []).map((s) => s.id);
      if (ids.length === 0) return [] as Row[];
      const { data } = await supabase
        .from("teacher_assignments")
        .select("teacher_id, subjects(id, name, stage_group, grade_level)")
        .in("subject_id", ids)
        .eq("academic_year_id", yearId!);
      return (data ?? []) as unknown as Row[];
    },
  });

  const names = useProfileNames((rows ?? []).map((r) => r.teacher_id));
  const { data: adminIds } = useAdminChats(meId);
  const adminNames = useProfileNames(adminIds ?? []);

  const teacherPeers: ChatPeer[] = Array.from(
    new Map(
      (rows ?? [])
        .filter((r) => !!r.subjects)
        .map((r) => [
          r.teacher_id,
          {
            key: `sm:${r.teacher_id}`,
            name: names.data?.get(r.teacher_id) ?? "—",
            subtitle: t(`stage.${r.subjects!.stage_group}`),
            kind: "sm_teacher" as const,
            teacherId: r.teacher_id,
            otherId: meId,
          } satisfies ChatPeer,
        ]),
    ).values(),
  );

  const adminPeers: ChatPeer[] = (adminIds ?? []).map((id) => ({
    key: `admin:${id}`,
    name: adminNames.data?.get(id) ?? "—",
    subtitle: t("chat.administration"),
    kind: "admin_user",
    teacherId: id,
    otherId: meId,
  }));

  // Admin directory: everyone the admin can message.
  const { data: directory, isLoading: loadingDir } = useQuery({
    queryKey: ["chat-admin-directory", yearId, meId],
    enabled: isAdmin && !!yearId,
    queryFn: async () => {
      const [profiles, roles, enrolls] = await Promise.all([
        supabase.from("profiles").select("id, full_name").order("full_name"),
        supabase.from("user_roles").select("user_id, role"),
        supabase
          .from("student_enrollments")
          .select("user_id, stage_group, grade_level")
          .eq("academic_year_id", yearId as never)
          .eq("is_graduated", false),
      ]);
      const roleBy = new Map<string, string[]>();
      for (const r of roles.data ?? []) {
        const arr = roleBy.get(r.user_id) ?? [];
        arr.push(r.role as string);
        roleBy.set(r.user_id, arr);
      }
      const enrollBy = new Map(
        (enrolls.data ?? []).map((e) => [e.user_id as string, { stage: e.stage_group as string, grade: e.grade_level as string }]),
      );
      return (profiles.data ?? [])
        .filter((p) => p.id !== meId)
        .map((p) => {
          const rs = roleBy.get(p.id) ?? [];
          const enr = enrollBy.get(p.id);
          const isStudent = rs.includes("student") && !rs.some((r) => r !== "student");
          return { id: p.id, name: p.full_name ?? "—", roles: rs, enr, isStudent };
        })
        .filter((p) => (p.isStudent ? !!p.enr : p.roles.length > 0));
    },
  });

  const directoryPeers: ChatPeer[] = (directory ?? []).map((p) => ({
    key: `dir:${p.id}`,
    name: p.name,
    subtitle: p.enr
      ? `${t(`stage.${p.enr.stage}`)} · ${t(`grade.${p.enr.grade}`)}`
      : p.roles.map((r) => t(`role.${r}`)).join(", "),
    kind: "admin_user",
    teacherId: meId,
    otherId: p.id,
  }));

  if (me && stages.length === 0 && !isAdmin && adminPeers.length === 0) {
    return (
      <Section title={t("nav.messages")}>
        <EmptyState text={t("chat.sm_only")} />
      </Section>
    );
  }

  return (
    <Section title={t("nav.messages")}>
      <Tabs defaultValue={isAdmin ? "everyone" : "teachers"}>
        <TabsList>
          {isAdmin && <TabsTrigger value="everyone">{t("chat.everyone")}</TabsTrigger>}
          {stages.length > 0 && <TabsTrigger value="teachers">{t("nav.teachers")}</TabsTrigger>}
          <TabsTrigger value="admins">{t("chat.administration")}</TabsTrigger>
        </TabsList>
        {isAdmin && (
          <TabsContent value="everyone" className="mt-4">
            <ChatPanel
              peers={directoryPeers}
              meId={meId}
              yearId={yearId ?? null}
              loading={loadingDir}
              emptyText={t("chat.no_people")}
            />
          </TabsContent>
        )}
        {stages.length > 0 && (
          <TabsContent value="teachers" className="mt-4">
            <ChatPanel
              peers={teacherPeers}
              meId={meId}
              yearId={yearId ?? null}
              loading={isLoading}
              emptyText={t("chat.no_teachers")}
            />
          </TabsContent>
        )}
        <TabsContent value="admins" className="mt-4">
          <ChatPanel
            peers={adminPeers}
            meId={meId}
            yearId={yearId ?? null}
            emptyText={t("chat.no_admins")}
          />
        </TabsContent>
      </Tabs>
    </Section>
  );
}
