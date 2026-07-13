import { createFileRoute } from "@tanstack/react-router";
import { useMe } from "@/hooks/use-me";
import { useI18n } from "@/lib/i18n";
import { Section } from "@/components/portal/PortalShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/student/")({ component: Dashboard });

function Dashboard() {
  const { t } = useI18n();
  const { data: me } = useMe();
  const stage = me?.enrollment?.stage_group;
  const grade = me?.enrollment?.grade_level;

  const { data: announcement } = useQuery({
    queryKey: ["student-latest-ann", stage],
    enabled: !!stage,
    queryFn: async () => {
      const { data } = await supabase.from("announcements").select("*").eq("scope", "stage").eq("stage_group", stage!).order("created_at", { ascending: false }).limit(1);
      return data?.[0] ?? null;
    },
  });

  const { data: attToday } = useQuery({
    queryKey: ["student-att-today", me?.userId],
    enabled: !!me?.userId,
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data } = await supabase.from("attendance").select("status").eq("student_id", me!.userId).eq("date", today).maybeSingle();
      return data?.status ?? null;
    },
  });

  const yearStart = `${new Date().getFullYear()}-01-01`;
  const { data: attSummary } = useQuery({
    queryKey: ["student-att-sum", me?.userId],
    enabled: !!me?.userId,
    queryFn: async () => {
      const { data } = await supabase
        .from("attendance")
        .select("status")
        .eq("student_id", me!.userId)
        .gte("date", yearStart);
      const rows = data ?? [];
      return {
        absent: rows.filter((r) => r.status === "absent").length,
        late: rows.filter((r) => r.status === "late").length,
      };
    },
  });

  const { data: recentGrades } = useQuery({
    queryKey: ["student-recent-grades", me?.userId],
    enabled: !!me?.userId,
    queryFn: async () => {
      const { data } = await supabase
        .from("grades")
        .select("id, score, term, committed_at, subjects(name)")
        .eq("student_id", me!.userId)
        .order("committed_at", { ascending: false })
        .limit(3);
      return data ?? [];
    },
  });

  const firstName = me?.profile?.full_name?.split(" ")[0] ?? me?.profile?.full_name ?? "";

  return (
    <Section title={t("nav.dashboard")}>
      {me?.profile && (
        <div className="mb-6">
          <h2 className="font-serif text-2xl">
            {t("dashboard.hello")}, {firstName}
          </h2>
          {stage && grade && (
            <p className="text-sm text-muted-foreground mt-1">
              {t(`stage.${stage}`)} · {t(`grade.${grade}`)}
            </p>
          )}
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">{t("nav.announcements")}</CardTitle></CardHeader>
          <CardContent>
            {announcement ? (
              <div>
                <div className="font-medium">{announcement.title}</div>
                <p className="text-sm text-muted-foreground line-clamp-3 mt-1">{announcement.body}</p>
              </div>
            ) : <p className="text-sm text-muted-foreground">{t("common.empty")}</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">{t("nav.attendance")}</CardTitle></CardHeader>
          <CardContent>
            <div className="text-sm text-muted-foreground">Today</div>
            <div className="text-2xl font-serif capitalize">{attToday ? t(`attendance.${attToday}`) : "—"}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">{t("dashboard.attendance_summary")}</CardTitle></CardHeader>
          <CardContent>
            <div className="flex gap-6">
              <div>
                <div className="text-3xl font-serif">{attSummary?.absent ?? 0}</div>
                <div className="text-xs text-muted-foreground">{t("dashboard.absences")}</div>
              </div>
              <div>
                <div className="text-3xl font-serif">{attSummary?.late ?? 0}</div>
                <div className="text-xs text-muted-foreground">{t("dashboard.lates")}</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">{t("dashboard.recent_grades")}</CardTitle></CardHeader>
          <CardContent>
            {(recentGrades ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("common.empty")}</p>
            ) : (
              <ul className="space-y-2">
                {recentGrades!.map((g) => {
                  const subj = (g as unknown as { subjects?: { name: string } }).subjects?.name ?? "";
                  return (
                    <li key={g.id} className="flex justify-between text-sm">
                      <span className="truncate">{subj}</span>
                      <span className="font-medium">{g.score}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </Section>
  );
}
