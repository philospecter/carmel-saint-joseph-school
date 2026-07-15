## Diagnosis (bug #1)

The `?year=` param is passed correctly and the fetchers on `staff.year.$id.tsx` do include `.eq("academic_year_id", yearId)`. The queries return zero rows because of RLS, not the frontend.

On `public.grades` and `public.attendance`, the `year_restrict` policy is **RESTRICTIVE** and applies to `ALL` commands (including `SELECT`), with `USING (academic_year_id = current_academic_year_id())`. RESTRICTIVE policies AND with permissive ones, so even the admin's `Admin full grades` / `att_staff_manage` permissive policies cannot bypass it — any row whose `academic_year_id` is not the current year is filtered out for everyone.

The earlier "split write vs read" fix was applied only to `student_enrollments` (which is why the Graduates panel works). `grades` and `attendance` were missed, so past-year reads still return empty.

Confirmed via `pg_policies`:
- `grades.year_restrict` — RESTRICTIVE, ALL
- `attendance.year_restrict` — RESTRICTIVE, ALL
- `student_enrollments.year_restrict_{write,update,delete}` — RESTRICTIVE, INSERT/UPDATE/DELETE only (correct pattern)

## Fix

### 1. Migration — allow cross-year reads, keep writes locked to current year

On `public.grades` and `public.attendance`:
- `DROP POLICY year_restrict`
- Recreate as three RESTRICTIVE policies, one each for `INSERT`, `UPDATE`, `DELETE`, using the same `academic_year_id = current_academic_year_id()` predicate (matches the enrollments pattern).
- No change to permissive policies — admin/stage-manager/student SELECTs continue to gate access; writes stay pinned to the current year.

### 2. PDF export on `src/routes/_authenticated/staff.year.$id.tsx`

Current export buttons in `GradesPanel`, `AttendancePanel`, and `GraduatesPanel` are CSV + Excel only. Add PDF:
- Add `downloadPDF(name, title, rows)` helper using `jspdf` + `jspdf-autotable` (same pattern as `staff.export.tsx`).
- Add "PDF" button next to CSV/Excel in all three panels, for both "This selection" and "All school" where applicable.

## Files touched

- New migration: split `year_restrict` on `grades` and `attendance` into write-only restrictive policies.
- `src/routes/_authenticated/staff.year.$id.tsx`: add PDF helper + PDF buttons in the three panels.

## Verification

- After migration, re-open View on the just-closed year → Grades panel with a subject/term/month that has data returns rows; Attendance panel for a known date returns rows.
- Try writing (create/edit) a grade or attendance record scoped to a past year → still rejected by RLS.
- Click each new PDF button → file downloads with the expected rows.
