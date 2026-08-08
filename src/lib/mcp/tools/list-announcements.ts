import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { currentYearId, errorResult, jsonResult, notAuthenticated, supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_announcements",
  title: "List announcements",
  description: "List school announcements visible to the signed-in user, newest first.",
  inputSchema: { limit: z.number().int().optional().describe("Max announcements to return (default 20).") },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const supabase = supabaseForUser(ctx);
    const yearId = await currentYearId(supabase);
    let query = supabase
      .from("announcements")
      .select("id,title,body,scope,stage_group,created_at")
      .order("created_at", { ascending: false })
      .limit(Math.min(Math.max(limit ?? 20, 1), 100));
    if (yearId) query = query.eq("academic_year_id", yearId);
    const { data, error } = await query;
    if (error) return errorResult(error.message);
    return jsonResult({ announcements: data ?? [] });
  },
});