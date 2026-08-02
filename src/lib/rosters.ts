import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Shared roster helper for resolving the effective academic year.
 *
 * IMPORTANT: Any query against student_enrollments that is already scoped
 * to a specific academic_year_id (whether current or historical) MUST NOT
 * filter by is_graduated. That flag is a per-row historical marker; it
 * should NOT hide students from the roster of the year they graduated FROM.
 * Scoping by academic_year_id already isolates the correct row.
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
