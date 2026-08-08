import { createFileRoute, redirect, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { signupStudent, seedAdminIfNeeded } from "@/lib/auth.functions";
import { fetchMe, primaryPortal } from "@/hooks/use-me";
import { useI18n, STAGE_GROUPS, GRADES_BY_STAGE, stageGroupForGrade } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { formatSupabaseError } from "@/lib/errors";
import { z } from "zod";

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    next: typeof s.next === "string" && s.next.startsWith("/") && !s.next.startsWith("//") ? s.next : undefined,
  }),
  head: () => ({ meta: [{ title: "Sign in – Carmel Saint Joseph Portal" }, { name: "robots", content: "noindex" }] }),
  component: AuthPage,
  errorComponent: ({ error }) => <div className="p-8 text-center text-destructive">{error.message}</div>,
});

const STUDENT_DOMAIN = "students.carmelstjoseph.local";

function AuthPage() {
  const { t, locale, setLocale, dir } = useI18n();
  const navigate = useNavigate();
  const { next } = Route.useSearch();

  useEffect(() => {
    // fire seed once (idempotent, safe if it errors)
    seedAdminIfNeeded().catch(() => {});
  }, []);

  useEffect(() => {
    (async () => {
      const me = await fetchMe();
      if (me) {
        if (next) {
          window.location.replace(next);
          return;
        }
        const to = primaryPortal(me.roles);
        if (to) navigate({ to, replace: true });
      }
    })();
  }, [navigate, next]);

  return (
    <div dir={dir} className="min-h-screen bg-gradient-to-br from-background via-secondary/30 to-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-between">
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">← {t("common.back")}</Link>
          <Select value={locale} onValueChange={(v) => setLocale(v as "en" | "ar" | "fr")}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="en">English</SelectItem>
              <SelectItem value="ar">العربية</SelectItem>
              <SelectItem value="fr">Français</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Card className="border-primary/10 shadow-xl">
          <CardHeader className="text-center">
            <CardTitle className="font-serif text-2xl">{t("app.name")}</CardTitle>
            <CardDescription>{t("app.tagline")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="login">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login">{t("auth.login")}</TabsTrigger>
                <TabsTrigger value="signup">{t("auth.signup")}</TabsTrigger>
              </TabsList>
              <TabsContent value="login" className="mt-4"><LoginForm next={next} /></TabsContent>
              <TabsContent value="signup" className="mt-4"><SignupForm /></TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function LoginForm({ next }: { next?: string }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const id = identifier.trim();
      const email = id.includes("@") ? id : `${id}@${STUDENT_DOMAIN}`;
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      const me = await fetchMe();
      if (me?.profile?.status === "pending") {
        await supabase.auth.signOut();
        toast.info(t("auth.pending"));
        return;
      }
      const to = me ? primaryPortal(me.roles) : null;
      if (next) window.location.replace(next);
      else if (to) navigate({ to, replace: true });
      else navigate({ to: "/", replace: true });
    } catch (err) {
      toast.error(formatSupabaseError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="identifier">{t("auth.national_id")}</Label>
        <Input id="identifier" value={identifier} onChange={(e) => setIdentifier(e.target.value)} required autoComplete="username" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">{t("auth.password")}</Label>
        <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? t("common.loading") : t("auth.submit_login")}
      </Button>
    </form>
  );
}

const signupSchema = z.object({
  full_name: z.string().trim().min(2).max(100).regex(/^[A-Za-z\s'.-]+$/, "English letters only"),
  national_id: z.string().trim().regex(/^\d{5,20}$/, "Digits only"),
  mobile: z.string().trim().min(6).max(20),
  address: z.string().trim().min(2).max(200),
  password: z.string().min(6).max(72),
  grade_level: z.string(),
});

function SignupForm() {
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState<(typeof STAGE_GROUPS)[number]>("primary_1_2");
  const [grade, setGrade] = useState("p1");
  const [form, setForm] = useState({ full_name: "", national_id: "", mobile: "", address: "", password: "" });
  const [confirmPw, setConfirmPw] = useState("");
  const [showPw, setShowPw] = useState(false);

  const stageOptions: { value: (typeof STAGE_GROUPS)[number]; grades: string[] }[] = [
    { value: "primary_1_2", grades: [...GRADES_BY_STAGE.primary_1_2, ...GRADES_BY_STAGE.primary_3_6] },
    { value: "preparatory", grades: GRADES_BY_STAGE.preparatory },
    { value: "secondary", grades: GRADES_BY_STAGE.secondary },
  ];

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (form.password !== confirmPw) {
      toast.error(t("auth.password_mismatch"));
      return;
    }
    setLoading(true);
    try {
      const parsed = signupSchema.safeParse({ ...form, grade_level: grade });
      if (!parsed.success) {
        toast.error(parsed.error.issues[0]?.message ?? "Invalid input");
        return;
      }
      const finalStage = stageGroupForGrade(grade);
      await signupStudent({ data: { ...parsed.data, stage_group: finalStage } });
      toast.success(t("auth.pending"));
      setForm({ full_name: "", national_id: "", mobile: "", address: "", password: "" });
      setConfirmPw("");
    } catch (err) {
      toast.error(formatSupabaseError(err));
    } finally {
      setLoading(false);
    }
  }

  const currentGrades =
    stage === "primary_1_2"
      ? [...GRADES_BY_STAGE.primary_1_2, ...GRADES_BY_STAGE.primary_3_6]
      : GRADES_BY_STAGE[stage];

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="grid gap-3">
        <div className="space-y-1.5">
          <Label>{t("auth.full_name")}</Label>
          <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required />
        </div>
        <div className="space-y-1.5">
          <Label>{t("auth.national_id_only")}</Label>
          <Input value={form.national_id} onChange={(e) => setForm({ ...form, national_id: e.target.value })} required inputMode="numeric" />
        </div>
        <div className="space-y-1.5">
          <Label>{t("auth.mobile")}</Label>
          <Input value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} required />
        </div>
        <div className="space-y-1.5">
          <Label>{t("auth.address")}</Label>
          <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>{t("auth.password")}</Label>
            <div className="relative">
              <Input
                type={showPw ? "text" : "password"}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
                className="pr-10"
              />
              <button
                type="button"
                aria-label={showPw ? t("auth.hide_password") : t("auth.show_password")}
                onClick={() => setShowPw((v) => !v)}
                className="absolute inset-y-0 right-2 flex items-center text-muted-foreground hover:text-foreground"
              >
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t("auth.confirm_password")}</Label>
            <Input
              type={showPw ? "text" : "password"}
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
              required
            />
            {confirmPw && form.password !== confirmPw && (
              <p className="text-xs text-destructive">{t("auth.password_mismatch")}</p>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>{t("auth.stage")}</Label>
            <Select value={stage} onValueChange={(v) => { const s = v as (typeof STAGE_GROUPS)[number]; setStage(s); setGrade(s === "primary_1_2" ? "p1" : GRADES_BY_STAGE[s][0]); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {stageOptions.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{t(`stage.${s.value === "primary_1_2" ? "primary_1_2" : s.value}`).replace("1 & 2", "").trim() || t(`stage.${s.value}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t("auth.grade")}</Label>
            <Select value={grade} onValueChange={setGrade}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {currentGrades.map((g) => (
                  <SelectItem key={g} value={g}>{t(`grade.${g}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? t("common.loading") : t("auth.submit_signup")}
      </Button>
    </form>
  );
}
