import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { errorResult, jsonResult, notAuthenticated, supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_my_grades",
  title: "List my grades",
  description:
    "List the signed-in student's approved grades (subject, term, month, score, max score). Teachers and staff see the grades their role allows.",
  inputSchema: {
    term: z.enum(["first", "second"]).optional().describe("Filter to one term."),
    limit: z.number().int().optional().describe("Max rows to return (default 50)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ term, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("grades")
      .select("id,score,max_score,term,month,approved_at,subjects(name,grade_level)")
      .eq("student_id", ctx.getUserId()!)
      .order("updated_at", { ascending: false })
      .limit(Math.min(Math.max(limit ?? 50, 1), 200));
    if (term) query = query.eq("term", term as never);
    const { data, error } = await query;
    if (error) return errorResult(error.message);
    return jsonResult({ grades: data ?? [] });
  },
});