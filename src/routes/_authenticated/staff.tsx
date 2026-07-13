import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useMe } from "@/hooks/use-me";
import { PortalShell } from "@/components/portal/PortalShell";
import { staffNav } from "@/lib/portal-nav";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/staff")({
  head: () => ({ meta: [{ title: "Staff Portal" }, { name: "robots", content: "noindex" }] }),
  component: Layout,
});

function Layout() {
  const { data: me } = useMe();
  const navigate = useNavigate();
  const { t } = useI18n();
  if (!me) return null;
  const isAdmin = me.roles.includes("admin");
  const isSm = me.roles.includes("stage_manager");
  if (!isAdmin && !isSm) return <div className="p-8">Not authorized.</div>;
  const isTeacher = me.roles.includes("teacher");
  const extra = isTeacher ? <Button size="sm" variant="outline" onClick={() => navigate({ to: "/teacher" })}>{t("auth.switch_teacher")}</Button> : null;
  return (
    <PortalShell title={isAdmin ? "Admin" : "Stage Manager"} nav={staffNav(isAdmin)} headerExtra={extra}>
      <Outlet />
    </PortalShell>
  );
}
