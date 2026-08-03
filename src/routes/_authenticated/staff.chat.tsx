import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/use-me";
import { useI18n } from "@/lib/i18n";
import { Section, EmptyState } from "@/components/portal/PortalShell";
import { useCurrentYearId } from "@/lib/rosters";
import { ChatPanel, type ChatPeer } from "@/components/chat/ChatPanel";
import { useProfileNames } from "@/lib/chat";

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

  const peers: ChatPeer[] = Array.from(
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
            otherId: me?.userId ?? "",
          } satisfies ChatPeer,
        ]),
    ).values(),
  );

  if (me && stages.length === 0) {
    return (
      <Section title={t("nav.messages")}>
        <EmptyState text={t("chat.sm_only")} />
      </Section>
    );
  }

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