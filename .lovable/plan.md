## Diagnosis

Roster queries pull from `student_enrollments` filtered only by `stage_group` and `grade_level`. When no `yearId` is provided (the normal Admin/Stage Manager entry flow), they return rows across ALL years — including graduated `sec3` rows in past years and any old-year enrollments that weren't rolled into the current year. Result: graduated + historically-enrolled students show up on today's roster.

### Affected queries (all missing `academic_year_id = current` AND `is_graduated = false`)

1. `src/routes/_authenticated/staff.grades.tsx` (lines 91–102) — Grades entry roster.
2. `src/routes/_authenticated/staff.attendance.tsx` (lines 34–43) — Attendance entry roster.
3. `src/routes/_authenticated/staff.export.tsx` (lines 69, 86) — Export by grade/stage rosters.
4. `src/routes/_authenticated/staff.users.tsx` (line 64) — Users management enrollment lookup (pulls all-year rows; can attribute wrong current stage/grade to a student who has multiple year rows).

Not affected (already correctly scoped):
- `src/lib/dashboard.functions.ts` (filters `is_graduated=false`, scoped by current year in the query context).
- `src/lib/academic-years.functions.ts` preview functions (explicitly filter by year + `is_graduated=false`).
- `staff.year.$id.tsx` (always passes an explicit year id).

### Grades/attendance for a new year starting empty

`grades` and `attendance` inserts include `academic_year_id`, and read queries in those roster screens filter by `date` (attendance) or by `subject/term/month + year_id` (grades server fns). So new-year cells legitimately start empty — this piece works. Confirmed by inspection, no code change needed.

## Fix

Introduce a single shared roster helper and route the four affected screens through it, so this class of bug can't recur on a new screen.

1. **New helper** `src/lib/rosters.ts`:
   ```ts
   export function activeRosterQuery(supabase, { stage, grade, yearId }) {
     let q = supabase
       .from("student_enrollments")
       .select("user_id, stage_group, grade_level, is_graduated, academic_year_id, profiles!student_enrollments_user_id_profiles_fkey(full_name, national_id)")
       .eq("stage_group", stage)
       .eq("grade_level", grade)
       .eq("is_graduated", false);
     if (yearId) q = q.eq("academic_year_id", yearId);
     else q = q.eq("academic_year_id", supabase.rpc(...))  // see below
     return q;
   }
   ```
   Because PostgREST can't inline an RPC into `.eq`, the helper will first resolve the current year id via a small cached query (`academic_years` where `is_current=true`) and then apply `.eq("academic_year_id", currentId)`. Exposed as `useCurrentYearId()` hook + `activeRosterQuery` builder.

2. **Update the four call sites** to use `activeRosterQuery` (or the equivalent scoped query for `staff.users.tsx`, which needs the full enrollment map — filter to `is_graduated=false` AND current year).

3. **Belt-and-suspenders at the DB layer**: add a permissive-facing note only; no RLS change required because past-year read access is intentionally allowed for the historical View screens. The frontend scoping is the correct place for the "active roster" contract.

### Verification

- Load Grades entry as Admin for Secondary 3 → previous graduates no longer appear.
- Load Attendance entry for the same → same.
- Load Export → totals match current-year active students only.
- Load Users → each student shows exactly one current-year stage/grade.
- Confirm historical View (`?year=<past>`) still shows past-year rosters unchanged.
