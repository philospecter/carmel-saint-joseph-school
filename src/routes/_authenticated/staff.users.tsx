import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n, STAGE_GROUPS, GRADES_BY_STAGE } from "@/lib/i18n";
import { Section, EmptyState } from "@/components/portal/PortalShell";
import { useMe } from "@/hooks/use-me";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { setUserPassword, updateUserProfile, deleteUser, createAdminAccount } from "@/lib/auth.functions";
import { useCurrentYearId } from "@/lib/rosters";
import { toast } from "sonner";
import { formatSupabaseError } from "@/lib/errors";

export const Route = createFileRoute("/_authenticated/staff/users")({ component: Page });

const SYNTH_EMAIL_SUFFIX = "@students.carmelstjoseph.local";
function displayEmail(email: string | null | undefined): string {
  if (!email) return "";
  if (email.toLowerCase().endsWith(SYNTH_EMAIL_SUFFIX)) return "";
  return email;
}

type Role = "student" | "teacher" | "stage_manager" | "admin";
type UserRow = {
  id: string;
  full_name: string | null;
  national_id: string | null;
  mobile: string | null;
  email: string | null;
  address: string | null;
  status: string | null;
  roles: Role[];
  enrollment: { stage_group: string; grade_level: string } | null;
  managed_stages: string[];
};

function Page() {
  const { t } = useI18n();
  const { data: me } = useMe();
  const qc = useQueryClient();
  const isAdmin = !!me?.roles.includes("admin");

  const [role, setRole] = useState<Role | "all">("all");
  const [stage, setStage] = useState<string>("all");
  const [grade, setGrade] = useState<string>("all");
  const [q, setQ] = useState("");

  const { data, isLoading } = useQuery<UserRow[]>({
    queryKey: ["admin-users"],
    enabled: isAdmin,
    queryFn: async () => {
      const [profiles, roles, enrolls, sms] = await Promise.all([
        supabase.from("profiles").select("id, full_name, national_id, mobile, email, address, status").order("full_name"),
        supabase.from("user_roles").select("user_id, role"),
        supabase.from("student_enrollments").select("user_id, stage_group, grade_level"),
        supabase.from("stage_manager_assignments").select("user_id, stage_group"),
      ]);
      const rolesByUser = new Map<string, Role[]>();
      for (const r of roles.data ?? []) {
        const arr = rolesByUser.get(r.user_id) ?? [];
        arr.push(r.role as Role);
        rolesByUser.set(r.user_id, arr);
      }
      const enrollByUser = new Map((enrolls.data ?? []).map((e) => [e.user_id, { stage_group: e.stage_group as string, grade_level: e.grade_level as string }]));
      const smByUser = new Map<string, string[]>();
      for (const s of sms.data ?? []) {
        const arr = smByUser.get(s.user_id) ?? [];
        arr.push(s.stage_group as string);
        smByUser.set(s.user_id, arr);
      }
      return (profiles.data ?? []).map((p) => ({
        ...p,
        roles: rolesByUser.get(p.id) ?? [],
        enrollment: enrollByUser.get(p.id) ?? null,
        managed_stages: smByUser.get(p.id) ?? [],
      })) as UserRow[];
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin-users"] });

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (data ?? []).filter((u) => {
      if (role !== "all" && !u.roles.includes(role)) return false;
      if (stage !== "all") {
        const inStage = u.enrollment?.stage_group === stage || u.managed_stages.includes(stage);
        if (!inStage) return false;
      }
      if (grade !== "all") {
        if (u.enrollment?.grade_level !== grade) return false;
      }
      if (term) {
        const emailForSearch = displayEmail(u.email);
        const hay = `${u.full_name ?? ""} ${u.national_id ?? ""} ${emailForSearch} ${u.mobile ?? ""}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [data, role, stage, grade, q]);

  if (!isAdmin) return <div className="p-4">Not authorized.</div>;

  const gradesForStage = stage !== "all" ? GRADES_BY_STAGE[stage as keyof typeof GRADES_BY_STAGE] ?? [] : [];
  const admins = (data ?? []).filter((u) => u.roles.includes("admin"));

  return (
    <div className="space-y-8">
      <Section title={t("nav.users")}>
        <div className="flex flex-wrap gap-2 mb-4">
          <Input placeholder={t("common.search")} className="w-56" value={q} onChange={(e) => setQ(e.target.value)} />
          <Select value={role} onValueChange={(v) => setRole(v as Role | "all")}>
            <SelectTrigger className="w-44"><SelectValue placeholder={t("users.role")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("users.all_roles")}</SelectItem>
              <SelectItem value="student">{t("role.student")}</SelectItem>
              <SelectItem value="teacher">{t("role.teacher")}</SelectItem>
              <SelectItem value="stage_manager">{t("role.stage_manager")}</SelectItem>
              <SelectItem value="admin">{t("role.admin")}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={stage} onValueChange={(v) => { setStage(v); setGrade("all"); }}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("users.all_stages")}</SelectItem>
              {STAGE_GROUPS.map((s) => <SelectItem key={s} value={s}>{t(`stage.${s}`)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={grade} onValueChange={setGrade} disabled={stage === "all"}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("users.all_grades")}</SelectItem>
              {gradesForStage.map((g) => <SelectItem key={g} value={g}>{t(`grade.${g}`)}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="ms-auto text-sm text-muted-foreground self-center">{filtered.length} / {data?.length ?? 0}</div>
        </div>
        {isLoading ? (
          <div className="text-sm text-muted-foreground">{t("common.loading")}</div>
        ) : filtered.length === 0 ? (
          <EmptyState text={t("common.empty")} />
        ) : (
          <div className="rounded-lg border divide-y">
            {filtered.map((u) => (
              <UserRowView key={u.id} user={u} onChanged={invalidate} currentUserId={me?.userId ?? ""} />
            ))}
          </div>
        )}
      </Section>

      <Section title={t("users.admins")} action={<CreateAdminDialog onDone={invalidate} />}>
        {admins.length === 0 ? <EmptyState text={t("common.empty")} /> : (
          <div className="rounded-lg border divide-y">
            {admins.map((u) => (
              <UserRowView key={u.id} user={u} onChanged={invalidate} currentUserId={me?.userId ?? ""} />
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

function UserRowView({ user, onChanged, currentUserId }: { user: UserRow; onChanged: () => void; currentUserId: string }) {
  const { t } = useI18n();
  const isSelf = user.id === currentUserId;
  return (
    <div className="p-3 flex items-center gap-3 flex-wrap">
      <div className="min-w-0 flex-1">
        <div className="font-medium truncate">{user.full_name}</div>
        <div className="text-xs text-muted-foreground truncate">
          {user.national_id ? `${t("users.national_id")}: ${user.national_id}` : ""}
          {displayEmail(user.email) ? `${user.national_id ? " · " : ""}${displayEmail(user.email)}` : ""}
          {user.mobile ? ` · ${user.mobile}` : ""}
        </div>
        {user.enrollment && (
          <div className="text-xs text-muted-foreground">
            {t(`stage.${user.enrollment.stage_group}`)} · {t(`grade.${user.enrollment.grade_level}`)}
          </div>
        )}
        {user.managed_stages.length > 0 && (
          <div className="text-xs text-muted-foreground">
            {user.managed_stages.map((s) => t(`stage.${s}`)).join(", ")}
          </div>
        )}
      </div>
      <div className="flex gap-1 flex-wrap">
        {user.roles.map((r) => (
          <Badge key={r} variant={r === "admin" ? "default" : "secondary"}>{t(`role.${r}`)}</Badge>
        ))}
        {user.status === "pending" && <Badge variant="destructive">pending</Badge>}
      </div>
      <EditUserDialog user={user} onDone={onChanged} />
      <SetPasswordDialog userId={user.id} name={user.full_name ?? ""} />
      {!isSelf && <DeleteUserButton userId={user.id} name={user.full_name ?? ""} onDone={onChanged} />}
    </div>
  );
}

function SetPasswordDialog({ userId, name }: { userId: string; name: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true);
    try {
      await setUserPassword({ data: { userId, password: pw } });
      toast.success("Password updated");
      setPw(""); setOpen(false);
    } catch (e) { toast.error(formatSupabaseError(e)); }
    finally { setBusy(false); }
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="outline">{t("users.set_password")}</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("users.set_password")} — {name}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">Existing passwords are hashed and can't be shown. Enter a new one.</p>
          <div><Label>{t("auth.password")}</Label><Input type="text" value={pw} onChange={(e) => setPw(e.target.value)} /></div>
        </div>
        <DialogFooter><Button onClick={submit} disabled={busy || pw.length < 6}>{t("common.save")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteUserButton({ userId, name, onDone }: { userId: string; name: string; onDone: () => void }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true);
    try {
      await deleteUser({ data: { userId } });
      toast.success("Deleted");
      onDone();
    } catch (e) { toast.error(formatSupabaseError(e)); }
    finally { setBusy(false); }
  }
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="destructive">{t("common.delete")}</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("common.delete")} — {name}</AlertDialogTitle>
          <AlertDialogDescription>{t("users.delete_confirm")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction onClick={submit} disabled={busy}>{t("common.delete")}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function EditUserDialog({ user, onDone }: { user: UserRow; onDone: () => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [full_name, setFullName] = useState(user.full_name ?? "");
  const [mobile, setMobile] = useState(user.mobile ?? "");
  const [address, setAddress] = useState(user.address ?? "");
  const [national_id, setNationalId] = useState(user.national_id ?? "");
  const [stageG, setStageG] = useState(user.enrollment?.stage_group ?? "");
  const [gradeL, setGradeL] = useState(user.enrollment?.grade_level ?? "");
  const [managed, setManaged] = useState<string[]>(user.managed_stages);
  const [busy, setBusy] = useState(false);
  const isStudent = user.roles.includes("student");
  const isSM = user.roles.includes("stage_manager");
  const gradesForStage = stageG ? GRADES_BY_STAGE[stageG as keyof typeof GRADES_BY_STAGE] ?? [] : [];

  function reset() {
    setFullName(user.full_name ?? ""); setMobile(user.mobile ?? ""); setAddress(user.address ?? "");
    setNationalId(user.national_id ?? "");
    setStageG(user.enrollment?.stage_group ?? ""); setGradeL(user.enrollment?.grade_level ?? "");
    setManaged(user.managed_stages);
  }

  async function submit() {
    if (!full_name.trim()) return toast.error(t("common.name"));
    setBusy(true);
    try {
      await updateUserProfile({
        data: {
          userId: user.id,
          full_name,
          mobile,
          address,
          ...(isStudent ? { national_id, enrollment: stageG && gradeL ? { stage_group: stageG, grade_level: gradeL } : null } : {}),
          ...(isSM ? { managed_stages: managed } : {}),
        },
      });
      toast.success(t("users.updated"));
      setOpen(false); onDone();
    } catch (e) { toast.error(formatSupabaseError(e)); }
    finally { setBusy(false); }
  }

  function toggleStage(s: string) {
    setManaged((m) => m.includes(s) ? m.filter((x) => x !== s) : [...m, s]);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (v) reset(); }}>
      <DialogTrigger asChild><Button size="sm" variant="outline">{t("users.edit")}</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("users.edit_user")}</DialogTitle></DialogHeader>
        <div className="space-y-3 max-h-[60vh] overflow-y-auto">
          <div><Label>{t("common.name")}</Label><Input value={full_name} onChange={(e) => setFullName(e.target.value)} /></div>
          <div><Label>{t("common.mobile")}</Label><Input value={mobile} onChange={(e) => setMobile(e.target.value)} /></div>
          <div><Label>{t("common.address")}</Label><Input value={address} onChange={(e) => setAddress(e.target.value)} /></div>
          {isStudent && (
            <>
              <div><Label>{t("users.national_id")}</Label><Input value={national_id} onChange={(e) => setNationalId(e.target.value)} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>{t("auth.stage")}</Label>
                  <Select value={stageG} onValueChange={(v) => { setStageG(v); setGradeL(""); }}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>{STAGE_GROUPS.map((s) => <SelectItem key={s} value={s}>{t(`stage.${s}`)}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{t("auth.grade")}</Label>
                  <Select value={gradeL} onValueChange={setGradeL} disabled={!stageG}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>{gradesForStage.map((g) => <SelectItem key={g} value={g}>{t(`grade.${g}`)}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
            </>
          )}
          {isSM && (
            <div>
              <Label>{t("users.managed_stages")}</Label>
              <div className="flex flex-wrap gap-2 mt-1">
                {STAGE_GROUPS.map((s) => (
                  <label key={s} className={`text-xs rounded-full border px-3 py-1 cursor-pointer ${managed.includes(s) ? "bg-primary text-primary-foreground border-primary" : ""}`}>
                    <input type="checkbox" className="hidden" checked={managed.includes(s)} onChange={() => toggleStage(s)} />
                    {t(`stage.${s}`)}
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
        <DialogFooter><Button onClick={submit} disabled={busy}>{t("common.save")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateAdminDialog({ onDone }: { onDone: () => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ full_name: "", email: "", password: "", mobile: "", address: "" });
  const [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true);
    try {
      await createAdminAccount({ data: form });
      toast.success("Admin created");
      setForm({ full_name: "", email: "", password: "", mobile: "", address: "" });
      setOpen(false); onDone();
    } catch (e) { toast.error(formatSupabaseError(e)); }
    finally { setBusy(false); }
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm">+ {t("users.add_admin")}</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("users.add_admin")}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>{t("common.name")}</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
          <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div><Label>{t("auth.password")}</Label><Input type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
          <div><Label>{t("common.mobile")}</Label><Input value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} /></div>
          <div><Label>{t("common.address")}</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
        </div>
        <DialogFooter><Button onClick={submit} disabled={busy}>{t("common.create")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

