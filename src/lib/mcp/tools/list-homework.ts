import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { currentYearId, errorResult, jsonResult, notAuthenticated, supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_homework",
  title: "List homework",
  description: "List homework and assignments visible to the signed-in user for the current academic year.",
  inputSchema: { limit: z.number().int().optional().describe("Max rows to return (default 20).") },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const supabase = supabaseForUser(ctx);
    const yearId = await currentYearId(supabase);
    let query = supabase
      .from("homework")
      .select("id,title,body,kind,due_at,locked,link_url,created_at")
      .order("created_at", { ascending: false })
      .limit(Math.min(Math.max(limit ?? 20, 1), 100));
    if (yearId) query = query.eq("academic_year_id", yearId);
    const { data, error } = await query;
    if (error) return errorResult(error.message);
    return jsonResult({ homework: data ?? [] });
  },
});