import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { errorResult, jsonResult, notAuthenticated, supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_my_attendance",
  title: "List my attendance",
  description: "List the signed-in student's attendance records (date and status), newest first.",
  inputSchema: {
    from: z.string().optional().describe("Only records on or after this ISO date (YYYY-MM-DD)."),
    to: z.string().optional().describe("Only records on or before this ISO date (YYYY-MM-DD)."),
    limit: z.number().int().optional().describe("Max rows to return (default 50)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ from, to, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("attendance")
      .select("id,date,status")
      .eq("student_id", ctx.getUserId()!)
      .order("date", { ascending: false })
      .limit(Math.min(Math.max(limit ?? 50, 1), 365));
    if (from) query = query.gte("date", from);
    if (to) query = query.lte("date", to);
    const { data, error } = await query;
    if (error) return errorResult(error.message);
    return jsonResult({ attendance: data ?? [] });
  },
});