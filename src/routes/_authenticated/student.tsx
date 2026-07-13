import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useMe } from "@/hooks/use-me";
import { PortalShell } from "@/components/portal/PortalShell";
import { studentNav } from "@/lib/portal-nav";

export const Route = createFileRoute("/_authenticated/student")({
  head: () => ({ meta: [{ title: "Student Portal – Carmel Saint Joseph" }, { name: "robots", content: "noindex" }] }),
  component: StudentLayout,
});

function StudentLayout() {
  const { data: me } = useMe();
  if (!me) return null;
  if (!me.roles.includes("student")) {
    return <div className="p-8">This portal is for students only.</div>;
  }
  return (
    <PortalShell title="Student Portal" nav={studentNav}>
      <Outlet />
    </PortalShell>
  );
}
