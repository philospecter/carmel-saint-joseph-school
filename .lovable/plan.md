
## Goal

End-to-end QA of the four core flows (Attendance, Grading, Question Banks, Homework) across all three portals (Admin/Staff, Teacher, Student), then a written report — no fixes applied this round.

## Step 1 — Grant admin access

Run a one-line data update via the insert tool:

```
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin' FROM auth.users WHERE email = 'teacher1@gmail.com'
ON CONFLICT DO NOTHING;
```

This gives `teacher1@gmail.com / teacher1476` both teacher and admin roles so I can exercise every screen with a single login. Nothing else in the schema or seed data changes.

If you'd rather I use a different existing account (or a brand-new dedicated admin email/password), say so and I'll use that instead.

## Step 2 — Test matrix

For each area I'll drive the live preview with Playwright, capture screenshots, watch console + network, and query the DB to confirm writes landed correctly and are year/roster-scoped.

**Attendance**
- Staff: mark present/late/absent for a class; "Mark all present"; switch date; confirm rows in `attendance`.
- Student view of own attendance.
- Historical year read-only view (`?year=`) shows past data, blocks edits.

**Grading**
- Staff: set subject max score, enter grades, edit max (confirm dialog → clears cell), verify lock behavior.
- Teacher: enter grades on assigned subject only; permission checks on unassigned subjects.
- Student: sees own grades, totals, term filtering.
- Historical year view is read-only.

**Question Banks**
- Teacher: create bank, add MCQ / short-answer questions, edit, delete.
- Reuse a bank when creating homework.
- RLS: teacher can't see another teacher's bank.

**Homework**
- Teacher: create assignment (with questions and/or file), set due date, publish.
- Student: view list, open, submit answers + upload file to `homework-files` bucket, view submission state.
- Teacher: see submissions, grade them, feedback visible to student.
- Announcements linkage on the subject page.

**Cross-cutting spot-checks**
- Graduated-student login → congratulations screen only.
- Dashboard counts (active students, sessions pending, recent grades) scoped to current year.
- Rosters everywhere exclude graduated / other-year students.

## Step 3 — Report

You'll get a single report grouped by area with:
- What works
- Bugs found (severity, reproduction steps, screenshot, suspected root cause)
- Anything I couldn't test and why

No code or schema changes beyond the one-line admin grant in Step 1 until you approve fixes.

## Confirmations needed

1. OK to promote `teacher1@gmail.com` to admin? (Or provide a different account.)
2. OK that Step 1 writes to `user_roles` — everything else is read-only inspection plus test data I create through the UI (a few attendance rows, grades, a question bank, a homework assignment) using the seeded accounts.
