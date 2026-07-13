import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const STUDENT_EMAIL_DOMAIN = "students.carmelstjoseph.local";

function studentEmailFor(nationalId: string) {
  return `${nationalId.trim()}@${STUDENT_EMAIL_DOMAIN}`;
}

function randomPassword(length = 12) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  const arr = new Uint32Array(length);
  crypto.getRandomValues(arr);
  for (let i = 0; i < length; i++) out += chars[arr[i] % chars.length];
  return out;
}

export const signupStudent = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      full_name: string;
      national_id: string;
      mobile: string;
      address: string;
      password: string;
      stage_group: "primary_1_2" | "primary_3_6" | "preparatory" | "secondary";
      grade_level: string;
    }) => input,
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (!data.national_id || !/^\d{5,20}$/.test(data.national_id.trim())) {
      throw new Error("National ID must be digits only.");
    }
    if (!data.full_name.trim()) throw new Error("Full name is required.");
    if (data.password.length < 6) throw new Error("Password must be at least 6 characters.");

    const email = studentEmailFor(data.national_id);

    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: data.password,
      email_confirm: true,
      user_metadata: { national_id: data.national_id, full_name: data.full_name },
    });
    if (createErr || !created.user) {
      throw new Error(createErr?.message || "Could not create account.");
    }
    const userId = created.user.id;

    const { error: profErr } = await supabaseAdmin.from("profiles").insert({
      id: userId,
      full_name: data.full_name.trim(),
      national_id: data.national_id.trim(),
      mobile: data.mobile,
      address: data.address,
      email,
      status: "pending",
    });
    if (profErr) {
      await supabaseAdmin.auth.admin.deleteUser(userId);
      throw new Error(profErr.message);
    }

    const { error: reqErr } = await supabaseAdmin.from("signup_requests").insert({
      user_id: userId,
      stage_group: data.stage_group,
      grade_level: data.grade_level as never,
      status: "pending",
    });
    if (reqErr) {
      await supabaseAdmin.auth.admin.deleteUser(userId);
      throw new Error(reqErr.message);
    }

    return { ok: true };
  });

export const seedAdminIfNeeded = createServerFn({ method: "POST" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const ADMIN_EMAIL = "philopateermikhail@gmail.com";
  const ADMIN_PASSWORD = "philoxx1476";

  const { data: existing } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("email", ADMIN_EMAIL)
    .maybeSingle();
  if (existing) return { ok: true, seeded: false };

  const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: "System Administrator" },
  });

  let userId: string | undefined = created?.user?.id;

  if (!userId) {
    // User may already exist in auth.users but be missing profile/role rows.
    // Look them up by email and continue seeding the app-side rows.
    const { data: list, error: listErr } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    if (listErr) throw new Error(error?.message || listErr.message || "Seed failed");
    userId = list.users.find((u) => u.email?.toLowerCase() === ADMIN_EMAIL)?.id;
    if (!userId) throw new Error(error?.message || "Seed failed");
  }

  await supabaseAdmin.from("profiles").upsert({
    id: userId,
    full_name: "System Administrator",
    email: ADMIN_EMAIL,
    status: "active",
  });
  await supabaseAdmin
    .from("user_roles")
    .upsert({ user_id: userId, role: "admin" }, { onConflict: "user_id,role" });
  return { ok: true, seeded: true };
});

// Reset password: admin can reset anyone; SM can reset a teacher they've assigned in their stage.
export const resetUserPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    let authorized = !!isAdmin;

    if (!authorized) {
      // SM can reset a teacher whose assignment is in their stage.
      const { data: assignments } = await supabase
        .from("teacher_assignments")
        .select("subject_id, subjects!inner(stage_group)")
        .eq("teacher_id", data.userId);
      const stages = new Set<string>((assignments ?? []).map((a) => (a as { subjects: { stage_group: string } }).subjects.stage_group));
      if (stages.size > 0) {
        const { data: mine } = await supabase
          .from("stage_manager_assignments")
          .select("stage_group")
          .eq("user_id", userId);
        const mineSet = new Set((mine ?? []).map((r) => r.stage_group));
        for (const s of stages) if (mineSet.has(s as never)) authorized = true;
      }
    }

    if (!authorized) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const newPassword = randomPassword(12);
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, { password: newPassword });
    if (error) throw new Error(error.message);
    return { password: newPassword };
  });

// Admin-only: set a user's password to a specific value (manual entry).
export const setUserPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string; password: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");
    if (!data.password || data.password.length < 6) throw new Error("Password must be at least 6 characters.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, { password: data.password });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Admin-only: update a user's profile fields + optional enrollment / managed stages.
export const updateUserProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      userId: string;
      full_name?: string;
      mobile?: string | null;
      address?: string | null;
      national_id?: string | null;
      enrollment?: { stage_group: string; grade_level: string } | null;
      managed_stages?: string[] | null;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");
    const patch: Record<string, unknown> = {};
    if (typeof data.full_name === "string") {
      if (!data.full_name.trim()) throw new Error("Name cannot be empty.");
      patch.full_name = data.full_name.trim();
    }
    if (data.mobile !== undefined) patch.mobile = data.mobile;
    if (data.address !== undefined) patch.address = data.address;
    if (data.national_id !== undefined) patch.national_id = data.national_id;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (Object.keys(patch).length > 0) {
      const { error } = await supabaseAdmin.from("profiles").update(patch as never).eq("id", data.userId);
      if (error) throw new Error(error.message);
    }
    if (data.enrollment) {
      const { data: year, error: yErr } = await supabaseAdmin
        .from("academic_years")
        .select("id")
        .eq("is_current", true)
        .maybeSingle();
      if (yErr) throw new Error(yErr.message);
      if (!year) throw new Error("No current academic year");
      const { error } = await supabaseAdmin
        .from("student_enrollments")
        .upsert(
          {
            user_id: data.userId,
            stage_group: data.enrollment.stage_group as never,
            grade_level: data.enrollment.grade_level as never,
            academic_year_id: year.id,
          },
          { onConflict: "user_id,academic_year_id" },
        );
      if (error) throw new Error(error.message);
    }
    if (data.managed_stages) {
      await supabaseAdmin.from("stage_manager_assignments").delete().eq("user_id", data.userId);
      if (data.managed_stages.length > 0) {
        const rows = data.managed_stages.map((s) => ({ user_id: data.userId, stage_group: s as never }));
        const { error } = await supabaseAdmin.from("stage_manager_assignments").insert(rows);
        if (error) throw new Error(error.message);
      }
    }
    return { ok: true };
  });

// Admin-only: delete a user completely.
export const deleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.userId === userId) throw new Error("You cannot delete yourself.");
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Admin-only: create another admin account.
export const createAdminAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { full_name: string; email: string; password: string; mobile?: string; address?: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");
    if (!data.email || !data.password || data.password.length < 6) throw new Error("Email + password (6+ chars) required.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.full_name },
    });
    if (error || !created.user) throw new Error(error?.message || "Could not create account.");
    const newId = created.user.id;
    await supabaseAdmin.from("profiles").insert({
      id: newId,
      full_name: data.full_name,
      email: data.email,
      mobile: data.mobile ?? null,
      address: data.address ?? null,
      status: "active",
    });
    await supabaseAdmin.from("user_roles").upsert({ user_id: newId, role: "admin" }, { onConflict: "user_id,role" });
    return { ok: true, userId: newId };
  });

export const createStaffAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      kind: "teacher" | "stage_manager";
      full_name: string;
      email: string;
      mobile: string;
      address: string;
      password: string;
      stage_group?: "primary_1_2" | "primary_3_6" | "preparatory" | "secondary";
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const { userId, supabase } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");
    if (data.kind === "stage_manager" && !data.stage_group) throw new Error("Stage is required for a stage manager.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.full_name },
    });
    if (error || !created.user) throw new Error(error?.message || "Could not create account.");
    const newId = created.user.id;

    await supabaseAdmin.from("profiles").insert({
      id: newId,
      full_name: data.full_name,
      email: data.email,
      mobile: data.mobile,
      address: data.address,
      status: "active",
    });
    await supabaseAdmin.from("user_roles").insert({ user_id: newId, role: data.kind });
    if (data.kind === "stage_manager") {
      await supabaseAdmin.from("stage_manager_assignments").insert({
        user_id: newId,
        stage_group: data.stage_group!,
      });
    }
    return { ok: true, userId: newId };
  });

export const approveSignupRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { requestId: string; approve: boolean }) => input)
  .handler(async ({ data, context }) => {
    const { userId, supabase } = context;
    const { data: req, error: reqErr } = await supabase
      .from("signup_requests")
      .select("*")
      .eq("id", data.requestId)
      .maybeSingle();
    if (reqErr) throw new Error(reqErr.message);
    if (!req) throw new Error("Request not found or you don't have permission.");
    if (req.status !== "pending") throw new Error("This request has already been reviewed.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: updated, error: updErr } = await supabaseAdmin
      .from("signup_requests")
      .update({
        status: data.approve ? "approved" : "rejected",
        reviewed_by: userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", data.requestId)
      .eq("status", "pending")
      .select()
      .maybeSingle();
    if (updErr) throw new Error(updErr.message);
    if (!updated) throw new Error("Already reviewed.");

    if (data.approve) {
      await supabaseAdmin.from("profiles").update({ status: "active" }).eq("id", req.user_id);
      await supabaseAdmin.from("user_roles").upsert({ user_id: req.user_id, role: "student" }, { onConflict: "user_id,role" });
      await supabaseAdmin.from("student_enrollments").upsert(
        { user_id: req.user_id, stage_group: req.stage_group, grade_level: req.grade_level },
        { onConflict: "user_id" },
      );
    } else {
      await supabaseAdmin.auth.admin.deleteUser(req.user_id);
    }
    return { ok: true };
  });

export const assignTeacherSubject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { teacherId: string; subjectId: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("teacher_assignments").insert({
      teacher_id: data.teacherId,
      subject_id: data.subjectId,
      assigned_by: userId,
    });
    if (error) throw new Error(error.message);

    // Ensure teacher role exists
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: data.teacherId, role: "teacher" }, { onConflict: "user_id,role" });
    return { ok: true };
  });

export const removeTeacherSubject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { assignmentId: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("teacher_assignments").delete().eq("id", data.assignmentId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const selfAssignSubject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { subjectId: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // SM can only self-assign in their stage — teacher_assignments policy already enforces this.
    const { error } = await supabase.from("teacher_assignments").insert({
      teacher_id: userId,
      subject_id: data.subjectId,
      assigned_by: userId,
    });
    if (error) throw new Error(error.message);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("user_roles").upsert({ user_id: userId, role: "teacher" }, { onConflict: "user_id,role" });
    return { ok: true };
  });

export { studentEmailFor };
