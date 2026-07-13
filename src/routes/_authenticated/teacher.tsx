import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useMe } from "@/hooks/use-me";
import { PortalShell } from "@/components/portal/PortalShell";
import { teacherNav } from "@/lib/portal-nav";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/teacher")({
  head: () => ({ meta: [{ title: "Teacher Portal" }, { name: "robots", content: "noindex" }] }),
  component: Layout,
});

function Layout() {
  const { data: me } = useMe();
  const navigate = useNavigate();
  const { t } = useI18n();
  if (!me) return null;
  const isStaff = me.roles.includes("stage_manager") || me.roles.includes("admin");
  const extra = isStaff ? (
    <Button size="sm" variant="outline" onClick={() => navigate({ to: "/staff" })}>{t("auth.switch_staff")}</Button>
  ) : null;
  return (
    <PortalShell title="Teacher" nav={teacherNav} headerExtra={extra}>
      <Outlet />
    </PortalShell>
  );
}
