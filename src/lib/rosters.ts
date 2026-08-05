import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Shared roster helper for resolving the effective academic year.
 *
 * IMPORTANT: Roster queries must scope by academic_year_id AND filter
 * is_graduated = false. Graduated students are listed only in the
 * dedicated "Graduates" section of a past year, never in class rosters,
 * grade entry, attendance, or active-student counts.
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
