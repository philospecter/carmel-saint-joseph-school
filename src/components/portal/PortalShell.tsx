import { type ReactNode, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useMe } from "@/hooks/use-me";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQueryClient } from "@tanstack/react-query";
import { Menu, LogOut } from "lucide-react";

export type NavItem = { to: string; labelKey: string };

export function PortalShell({
  title,
  nav,
  headerExtra,
  children,
}: {
  title: string;
  nav: NavItem[];
  headerExtra?: ReactNode;
  children: ReactNode;
}) {
  const { t, locale, setLocale, dir } = useI18n();
  const { data: me } = useMe();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const path = useRouterState({ select: (s) => s.location.pathname });

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div dir={dir} className="min-h-screen bg-secondary/20 flex">
      <aside
        className={`fixed inset-y-0 z-40 w-64 bg-card border-r transition-transform md:relative md:translate-x-0 ${
          open ? "translate-x-0" : dir === "rtl" ? "translate-x-full" : "-translate-x-full"
        } ${dir === "rtl" ? "right-0" : "left-0"}`}
      >
        <div className="p-4 border-b">
          <div className="font-serif text-lg font-semibold text-primary">{t("app.name")}</div>
          <div className="text-xs text-muted-foreground">{title}</div>
        </div>
        <nav className="p-2 space-y-1">
          {nav.map((n) => {
            const active = path === n.to || (n.to !== "/" && path.startsWith(n.to + "/"));
            return (
              <Link
                key={n.to}
                to={n.to}
                onClick={() => setOpen(false)}
                className={`block rounded-md px-3 py-2 text-sm transition-colors ${
                  active ? "bg-primary text-primary-foreground" : "hover:bg-secondary"
                }`}
              >
                {t(n.labelKey)}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b h-14 flex items-center gap-2 px-4">
          <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setOpen((v) => !v)}>
            <Menu className="w-5 h-5" />
          </Button>
          <div className="font-medium truncate">{me?.profile?.full_name ?? ""}</div>
          <div className="flex-1" />
          {headerExtra}
          <Select value={locale} onValueChange={(v) => setLocale(v as "en" | "ar" | "fr")}>
            <SelectTrigger className="w-20 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="en">EN</SelectItem>
              <SelectItem value="ar">AR</SelectItem>
              <SelectItem value="fr">FR</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="ghost" size="sm" onClick={signOut}>
            <LogOut className="w-4 h-4 mr-1" />
            <span className="hidden sm:inline">{t("auth.signout")}</span>
          </Button>
        </header>
        <main className="flex-1 p-4 md:p-6 max-w-6xl w-full mx-auto">{children}</main>
      </div>

      {open && <div className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={() => setOpen(false)} />}
    </div>
  );
}

export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="text-2xl font-serif font-semibold text-foreground">{title}</h1>
        {action}
      </div>
      <div>{children}</div>
    </section>
  );
}

export function EmptyState({ text }: { text: string }) {
  return <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">{text}</div>;
}
