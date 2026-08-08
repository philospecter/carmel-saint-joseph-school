import { defineTool } from "@lovable.dev/mcp-js";
import { errorResult, jsonResult, notAuthenticated, supabaseForUser } from "../supabase";

export default defineTool({
  name: "whoami",
  title: "Who am I",
  description: "Return the signed-in user's profile, roles, and current enrollment in the school portal.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const supabase = supabaseForUser(ctx);
    const userId = ctx.getUserId()!;
    const [{ data: profile, error }, { data: roles }, { data: enrollment }] = await Promise.all([
      supabase.from("profiles").select("id,full_name,mobile,address,email,status").eq("id", userId).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
      supabase
        .from("student_enrollments")
        .select("stage_group,grade_level,is_graduated,academic_year_id")
        .eq("user_id", userId)
        .eq("is_graduated", false)
        .maybeSingle(),
    ]);
    if (error) return errorResult(error.message);
    return jsonResult({
      email: ctx.getUserEmail() ?? profile?.email ?? null,
      profile: profile ?? null,
      roles: (roles ?? []).map((r) => r.role),
      enrollment: enrollment ?? null,
    });
  },
});