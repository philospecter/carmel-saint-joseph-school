import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/use-me";
import { useI18n } from "@/lib/i18n";
import { Section } from "@/components/portal/PortalShell";
import { useCurrentYearId } from "@/lib/rosters";
import { ChatPanel, type ChatPeer } from "@/components/chat/ChatPanel";
import { useProfileNames } from "@/lib/chat";

export const Route = createFileRoute("/_authenticated/student/chat")({
  head: () => ({
    meta: [
      { title: "Messages — Student Portal" },
      { name: "description", content: "Message the teachers of your subjects directly." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Page,
});

type Row = {
  teacher_id: string;
  subjects: { id: string; name: string; grade_level: string } | null;
};

function Page() {
  const { t } = useI18n();
  const { data: me } = useMe();
  const { data: yearId } = useCurrentYearId();
  const grade = me?.enrollment?.grade_level ?? null;
  const stage = me?.enrollment?.stage_group ?? null;

  const { data: rows, isLoading } = useQuery({
    queryKey: ["chat-student-teachers", grade, stage, yearId],
    enabled: !!grade && !!stage && !!yearId,
    queryFn: async () => {
      const { data: subjects } = await supabase
        .from("subjects")
        .select("id, name, grade_level")
        .eq("grade_level", grade as never)
        .eq("stage_group", stage as never);
      const ids = (subjects ?? []).map((s) => s.id);
      if (ids.length === 0) return [] as Row[];
      const { data } = await supabase
        .from("teacher_assignments")
        .select("teacher_id, subjects(id, name, grade_level)")
        .in("subject_id", ids)
        .eq("academic_year_id", yearId!);
      return (data ?? []) as unknown as Row[];
    },
  });

  const names = useProfileNames((rows ?? []).map((r) => r.teacher_id));

  const peers: ChatPeer[] = (rows ?? [])
    .filter((r) => !!r.subjects)
    .map((r) => ({
      key: `${r.subjects!.id}:${r.teacher_id}`,
      name: names.data?.get(r.teacher_id) ?? "—",
      subtitle: r.subjects!.name,
      kind: "teacher_student" as const,
      teacherId: r.teacher_id,
      otherId: me?.userId ?? "",
      subjectId: r.subjects!.id,
    }));

  return (
    <Section title={t("nav.messages")}>
      <ChatPanel
        peers={peers}
        meId={me?.userId ?? ""}
        yearId={yearId ?? null}
        loading={isLoading}
        emptyText={t("chat.no_teachers")}
      />
    </Section>
  );
}