
## Diagnosis

### 1. Promotion flow after rollover
- `staff.year.tsx` does call `navigate({ to: "/staff/year/promote" })` on rollover success — that part fires.
- `staff.year.promote.tsx` calls `previewPromotion`, which looks up `oldYear` as the most-recently-closed year and then reads `student_enrollments WHERE academic_year_id = oldYear.id AND is_graduated=false`.
- Root cause: the seeded students were enrolled with `academic_year_id = current_academic_year_id()` at seed time. After rollover, that "current" year is the closed year, so this piece is fine — but if seed was re-run after rollover, the enrollments landed on the NEW year (2026‑2027) and the OLD year (2025‑2026) has zero enrollments. `roster.length === 0` renders "no students to promote" without an obvious message that this is why. Also, `promoteStudents` itself is fine; it can be run any time after rollover as long as there are un-promoted rows in the closed year.
- Fix: after rollover succeed, keep the auto-navigate but also expose promotion as a persistent action on `/staff/year` (a "Promote students" button visible whenever there are un-promoted enrollments in the last closed year), and show an explicit empty-state explaining "no un-promoted students found in <closed year label>" instead of a bare message.

### 2. "View" button does nothing useful
- The button links to `/staff/year/$id`, which is only a counts summary page. It never sets `?year=` on grades/attendance/etc., and none of the staff pages read a year param — they all query without any `academic_year_id` filter.
- Fix: introduce a `?year=<id>` search param, plumbed through the staff pages listed below; "View" navigates to `/staff/grades?year=<id>` (or a dedicated read‑only landing). When the param is set, queries filter by that id and the UI shows a read-only banner. When absent, queries filter by the current year.

### 3. Data bleeding across years (root cause)
- The `year_restrict` RLS policy on `grades`, `attendance`, `announcements`, `homework`, `homework_submissions`, `teacher_assignments`, `student_enrollments` is:
  `has_role(auth.uid(),'admin') OR academic_year_id = current_academic_year_id()`
  The `OR admin` clause makes admins see every year mixed together. Combined with client queries that never filter by `academic_year_id`, admin views naturally show last year's rows.
- Client queries in `staff.grades.tsx`, `staff.attendance.tsx`, `staff.announcements.tsx`, plus student-side `student.grades.tsx`, `student.attendance.tsx`, `student.announcements.tsx`, and dashboard reads in `dashboard.functions.ts` / `grades.functions.ts` / `homework.functions.ts`, do not scope by `academic_year_id`.
- Fix in two layers:
  a. DB: keep admins allowed to READ any year but drop the "admin sees everything by default" behavior at the app layer by always applying an explicit `academic_year_id` filter. Do NOT tighten the RLS policy (admins still need cross-year access via `?year=`).
  b. App: every read/write against year-scoped tables filters by the effective year (URL param when present + admin, else `current_academic_year_id()` fetched once via `getCurrentAcademicYear` / a small `useCurrentYear` hook). Writes always stamp `academic_year_id` with the current year (never with a historical `?year=`).

## Plan

### DB / server
- Add a `resolve_year_id(_maybe uuid)` SQL helper returning `_maybe` if the caller is admin and it's non-null, else `current_academic_year_id()`. Use it in new server fns.
- Add server fns for admin cross-year reads keyed by `year_id`:
  - `getGradesForYear`, `getAttendanceForYear`, `getAnnouncementsForYear`, `getEnrollmentsForYear`, `getTeacherAssignmentsForYear`, `getHomeworkForYear`.
  - Each verifies admin (or falls back to current year for non-admin) and applies `.eq("academic_year_id", resolved)`.
- Leave existing `year_restrict` RLS policies in place (they still protect non-admin roles). No RLS rewrite needed; the visible bleed is app-layer.

### Client
- New helper `src/hooks/use-year-scope.ts`:
  - Reads `?year=` from route search, validates against `listAcademicYears`.
  - Exposes `{ yearId, isHistorical, yearLabel }` where `yearId` defaults to current when unset/invalid.
- Update `validateSearch` on staff routes that should honor the toggle: `staff.grades`, `staff.attendance`, `staff.announcements`, `staff.subjects`, `staff.users` (enrollments count), `staff.teachers` (assignments).
- Update every year-scoped query in those routes to `.eq("academic_year_id", yearId)` on read and to stamp `academic_year_id: currentYearId` on write. Disable mutations when `isHistorical`.
- Show a top-of-page read-only banner ("Viewing <2025‑2026> — read only") when historical.
- `staff.year.tsx`:
  - "View" button links to `/staff/grades?year=<id>` (primary historical landing) plus keep the existing `/staff/year/$id` counts page from a secondary link.
  - Add a persistent "Promote students" button next to the current year row when un-promoted enrollments exist in the last closed year.
- `staff.year.promote.tsx`:
  - Improve empty state to name the source year and offer a "Go to year overview" link.
  - Guard against navigating away before mutation resolves (already handled by `onSuccess`).
- Dashboard/homework/grades server fns (`dashboard.functions.ts`, `grades.functions.ts`, `homework.functions.ts`): add `.eq("academic_year_id", current_academic_year_id)` on every year-scoped read.

### Verification
- After migration + edits, run `bunx tsgo --noEmit`.
- Drive Playwright: sign in as admin, confirm current-year `/staff/grades` shows only 2026‑2027 rows; click "View" on 2025‑2026 and confirm the URL gets `?year=…` and grades/attendance switch to that year with read-only banner; run promotion from the persistent button after a fresh rollover.

## Files touched (technical)
- Migration: add `resolve_year_id` (optional; can inline instead).
- New: `src/hooks/use-year-scope.ts`, new admin server fns in `src/lib/year-scope.functions.ts`.
- Edit: `src/routes/_authenticated/staff.year.tsx`, `staff.year.promote.tsx`, `staff.grades.tsx`, `staff.attendance.tsx`, `staff.announcements.tsx`, `staff.users.tsx`, `staff.teachers.tsx`, `staff.subjects.tsx`, `student.grades.tsx`, `student.attendance.tsx`, `student.announcements.tsx`, `src/lib/dashboard.functions.ts`, `src/lib/grades.functions.ts`, `src/lib/homework.functions.ts`.

Ready to implement on approval.
