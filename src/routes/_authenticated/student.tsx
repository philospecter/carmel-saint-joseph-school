import { createFileRoute, Outlet, Link } from "@tanstack/react-router";
import { useMe } from "@/hooks/use-me";
import { PortalShell } from "@/components/portal/PortalShell";
import { studentNav } from "@/lib/portal-nav";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

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
  if (me.isGraduated) {
    return <GraduatedScreen name={me.profile?.full_name ?? ""} />;
  }
  return (
    <PortalShell title="Student Portal" nav={studentNav}>
      <Outlet />
    </PortalShell>
  );
}

function GraduatedScreen({ name }: { name: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="max-w-lg text-center">
        <div className="text-6xl mb-6">🎓</div>
        <h1 className="font-serif text-3xl md:text-4xl text-foreground">
          Congratulations{name ? `, ${name}` : ""}!
        </h1>
        <p className="mt-4 text-muted-foreground">
          You have graduated from Carmel Saint Joseph School — École Des Carmélites.
          We wish you every success in the next chapter of your journey.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Button asChild variant="outline">
            <Link to="/">Home</Link>
          </Button>
          <Button
            onClick={async () => {
              await supabase.auth.signOut();
              window.location.href = "/";
            }}
          >
            Sign out
          </Button>
        </div>
      </div>
    </div>
  );
}
