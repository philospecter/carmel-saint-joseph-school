import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { errorResult, jsonResult, notAuthenticated, supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_subjects",
  title: "List subjects",
  description: "List the school's subjects, optionally filtered by grade level or stage group.",
  inputSchema: {
    grade_level: z
      .string()
      .optional()
      .describe("Grade code such as p1, p6, prep2, sec3."),
    stage_group: z
      .string()
      .optional()
      .describe("Stage group: primary_1_2, primary_3_6, preparatory, or secondary."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ grade_level, stage_group }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const supabase = supabaseForUser(ctx);
    let query = supabase.from("subjects").select("id,name,grade_level,stage_group").order("name");
    if (grade_level) query = query.eq("grade_level", grade_level as never);
    if (stage_group) query = query.eq("stage_group", stage_group as never);
    const { data, error } = await query;
    if (error) return errorResult(error.message);
    return jsonResult({ subjects: data ?? [] });
  },
});