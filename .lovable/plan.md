## Understanding of the reordered rollover flow

Today, "Start New Academic Year" closes the current year and creates the new one immediately, then navigates to a promotion screen that mutates enrollments after the fact. If the admin closes the tab between the two steps, the new year exists with nobody enrolled.

New flow (single atomic commit):

1. Admin clicks **Start New Academic Year** → dialog collects new label, password, typed CONFIRM (unchanged from today).
2. Instead of calling `start_new_academic_year` on confirm, that dialog only validates inputs (label uniqueness, password via `signInWithPassword`, CONFIRM text) and stashes them in local state, then navigates to a **Promotion Review** screen.
3. Promotion Review screen queries the *current* (still-open) year's enrollments grouped by stage → grade. Each student has a "will repeat" checkbox (default off = promoted). Controls:
   - Per-grade **Mark all as promoted** (clears repeats in that group).
   - Top-level **Promote entire school** (clears every repeat, one click to finalize).
   - Final **Confirm & start year** button.
4. On confirm, one server function runs one SQL RPC that, in a single transaction:
   - Verifies caller is admin.
   - Re-checks the label is still unique.
   - Closes current year (`is_current=false`, `closed_at=now()`).
   - Inserts new year (`is_current=true`), copies teacher_assignments forward (as today).
   - Iterates old-year enrollments and inserts new-year rows using the promotion map + repeats array (same logic as current `promote_students`, but reading from the just-closed year rather than "most recently closed").
   - Rejects pending signup_requests.
   Any failure rolls the whole thing back — no partial year.

### Technical concerns / decisions to flag

- **Password re-auth can't cross into the promotion screen.** `signInWithPassword` refreshes the session immediately; if the admin then spends 10 minutes on the promotion screen we can't "hold" the re-auth. Options: (a) re-prompt for password on the final Confirm button on the promotion screen instead of the first dialog, (b) accept re-auth at step 2 and trust the session for step 4. **Recommend (a)** — password gate belongs on the destructive action.
- **Atomicity requires a new combined RPC** (`start_year_and_promote(_label, _promotions, _repeats)`). The existing `start_new_academic_year` and `promote_students` stay for now but the UI stops calling them separately. `promote_students` currently reads "most recently closed year" — the new RPC reads from the year it just closed in the same tx, which is more correct.
- **Route lifecycle:** navigating away from the promotion screen abandons the pending rollover with zero side effects (nothing has been written yet). That's the whole point of the reorder. We'll keep the pending inputs in React Router state / a small store; no server draft table needed.

## 2. Fix View to show real historical data

Add `?year=<id>` awareness to the existing staff Grades and Attendance pages (they currently assume current year). The `View` button on a past year links to those pages with the year param preset and inputs locked. A read-only banner already exists in `staff.year.$id.tsx`; we move that banner into the grades/attendance pages when `year !== current`. Server functions accept an optional `academic_year_id`; when omitted, they use current (today's behavior).

The `staff.year.$id.tsx` counts page becomes a small hub linking to `/staff/grades?year=<id>` and `/staff/attendance?year=<id>`.

## 3. Delete a year

New RPC `delete_academic_year(_year uuid)`:
- Admin only.
- Rejects if `is_current`.
- Rejects if it's the only year.
- Deletes rows scoped to that year in: `grades`, `attendance`, `homework_answers` / `homework_submissions` / `homework`, `announcements`, `teacher_assignments`, `student_enrollments`, then the `academic_years` row. (FKs today are `REFERENCES academic_years(id)` without cascade, so explicit deletes are needed and safer.)

UI: new `Delete` button per row. Disabled with tooltip on the current year ("Set another year as current first"). Click opens a confirmation dialog that fetches counts via `year_scoped_counts(_year)` and shows them in the warning, plus password + typed CONFIRM.

## 4. Rename + Set-as-current

- `rename_academic_year(_year uuid, _label text)` — admin only, validates uniqueness (case-insensitive), trims. Simple inline edit dialog (label only).
- `set_current_academic_year(_year uuid)` — admin only, wraps: `UPDATE academic_years SET is_current=false, closed_at=coalesce(closed_at, now()) WHERE is_current; UPDATE academic_years SET is_current=true, closed_at=NULL WHERE id=_year;` in one transaction. Confirmation dialog (no password — reversible, no data loss).

## Files touched

**New migration** adds four RPCs: `start_year_and_promote`, `delete_academic_year`, `rename_academic_year`, `set_current_academic_year`.

**Server functions** (`src/lib/academic-years.functions.ts`): add wrappers for the four RPCs; add `previewPromotionForCurrent()` that reads the still-open current year (the existing `previewPromotion` reads the closed year and stays for backwards compat but is no longer used by UI).

**Routes:**
- `src/routes/_authenticated/staff.year.tsx` — add Edit / Delete / Set-current buttons, disabled logic, dialogs.
- `src/routes/_authenticated/staff.year.promote.tsx` — becomes the pre-creation review screen; receives pending `{label, password}` via router state; final Confirm calls `start_year_and_promote`.
- `src/routes/_authenticated/staff.year.$id.tsx` — keep counts, add "Open grades / attendance" links passing `?year=<id>`.
- `src/routes/_authenticated/staff.grades.tsx` and `staff.attendance.tsx` — accept `?year=` search param, pass to fetchers, render read-only banner + disable write actions when not current.

**i18n:** new strings for delete warning, rename, set-current, "promote entire school", "mark all promoted".

## Open questions before I build

1. Password gate: on the first dialog (current) or on the final Confirm on the promotion screen (my recommendation)?
2. `staff.grades.tsx` and `staff.attendance.tsx` currently have rich editing UIs. For historical years should I (a) render the same UI with every input disabled, or (b) render a simpler read-only table view? (a) is less code and matches the existing "view" banner pattern.
3. Delete: do you want the confirmation dialog to also list the *label* of the year being deleted and require typing that exact label (stricter), or is typing `CONFIRM` enough (consistent with start-year)?