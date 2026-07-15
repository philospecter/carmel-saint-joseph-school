import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Shared roster contract for "active students":
 *   academic_year_id = <current or explicit year> AND is_graduated = false
 *
 * Every screen that lists students for grade entry, attendance entry,
 * exports, or user management MUST resolve enrollments through this
 * helper so graduated / historical rows never leak into today's roster.
 */

export function useCurrentYearId() {
  return useQuery({
    queryKey: ["current-academic-year-id"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("academic_years")
        .select("id")
        .eq("is_current", true)
        .maybeSingle();
      if (error) throw error;
      return (data?.id as string | undefined) ?? null;
    },
  });
}

/**
 * Returns the effective year id to scope roster queries by.
 * When `yearId` is provided (historical view), use it as-is.
 * Otherwise fall back to the current academic year id.
 */
export function resolveRosterYear(
  yearId: string | null | undefined,
  currentYearId: string | null | undefined,
): string | null {
  return (yearId ?? currentYearId) ?? null;
}
