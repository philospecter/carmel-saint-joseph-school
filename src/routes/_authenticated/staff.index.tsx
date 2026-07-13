import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useI18n } from "@/lib/i18n";
import { Section } from "@/components/portal/PortalShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, ClipboardCheck, UserPlus, BookOpen, AlertTriangle } from "lucide-react";
import { getStaffDashboardStats } from "@/lib/dashboard.functions";

export const Route = createFileRoute("/_authenticated/staff/")({ component: Page });

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.round(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

function Page() {
  const { t } = useI18n();
  const statsFn = useServerFn(getStaffDashboardStats);
  const { data: stats } = useQuery({ queryKey: ["staff-dashboard"], queryFn: () => statsFn() });

  return (
    <Section title={t("nav.dashboard")}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><Users className="h-4 w-4" />{t("dashboard.active_students")}</CardTitle></CardHeader>
          <CardContent><div className="text-4xl font-serif">{stats?.active_students ?? "—"}</div></CardContent>
        </Card>
        <Link to="/staff/attendance">
          <Card className="hover:bg-accent/50 transition">
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><ClipboardCheck className="h-4 w-4" />{t("dashboard.attendance_today")}</CardTitle></CardHeader>
            <CardContent>
              <div className="text-4xl font-serif">
                {stats ? `${stats.attendance_today.taken}/${stats.attendance_today.taken + stats.attendance_today.pending}` : "—"}
              </div>
              {stats && stats.attendance_today.pending > 0 && (
                <div className="text-xs text-muted-foreground mt-1">{t("dashboard.pending_classes")}</div>
              )}
            </CardContent>
          </Card>
        </Link>
        {stats?.is_admin ? (
          <Link to="/staff/requests">
            <Card className="hover:bg-accent/50 transition">
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><UserPlus className="h-4 w-4" />{t("nav.requests")}</CardTitle></CardHeader>
              <CardContent><div className="text-4xl font-serif">{stats?.pending_signups ?? 0}</div></CardContent>
            </Card>
          </Link>
        ) : (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><BookOpen className="h-4 w-4" />{t("dashboard.sessions_pending")}</CardTitle></CardHeader>
            <CardContent><div className="text-4xl font-serif">{stats?.sessions_pending.length ?? 0}</div></CardContent>
          </Card>
        )}
        <Link to="/staff/grades">
          <Card className="hover:bg-accent/50 transition">
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><BookOpen className="h-4 w-4" />{t("dashboard.sessions_pending")}</CardTitle></CardHeader>
            <CardContent><div className="text-4xl font-serif">{stats?.sessions_pending.length ?? 0}</div></CardContent>
          </Card>
        </Link>
      </div>

      {stats && stats.sessions_pending.length > 0 && (
        <Card className="mt-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              {t("dashboard.sessions_pending_list")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1">
              {stats.sessions_pending.slice(0, 8).map((s) => (
                <Badge key={s.subject_id} variant="outline" className="text-xs">
                  {s.subject_name} · {t(`grade.${s.grade_level}`)}
                </Badge>
              ))}
              {stats.sessions_pending.length > 8 && (
                <Badge variant="outline" className="text-xs">+{stats.sessions_pending.length - 8}</Badge>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {stats && stats.recent_grades.length > 0 && (
        <Card className="mt-4">
          <CardHeader className="pb-2"><CardTitle className="text-sm">{t("dashboard.recent_grade_activity")}</CardTitle></CardHeader>
          <CardContent>
            <div className="divide-y">
              {stats.recent_grades.map((g) => (
                <div key={g.id} className="py-2 flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="truncate">
                      <span className="font-medium">{g.student_name}</span>
                      <span className="text-muted-foreground"> · {g.subject_name}</span>
                    </div>
                    {g.entered_by_name && (
                      <div className="text-xs text-muted-foreground">
                        {g.entered_by_name} · {timeAgo(g.updated_at)}
                      </div>
                    )}
                  </div>
                  <Badge variant="secondary" className="font-serif shrink-0">
                    {g.score}/{g.max_score}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </Section>
  );
}
