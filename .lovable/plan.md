## Delete Homeroom subjects

Run a one-off data change that removes every subject whose name ends with "Homeroom" (the 12 per-grade seed subjects like "Primary 1 Homeroom", "Secondary 3 Homeroom", etc.).

### Steps

1. Check reference counts to confirm none of the Homeroom subjects still have teacher assignments, homework, or grades tied to them (the seed links teachers, so we may need to remove those `teacher_assignments` rows first).
2. If references exist: delete the dependent `teacher_assignments` rows for those subjects (no homework/grades expected against Homeroom).
3. Delete matching rows from `public.subjects` where `name ILIKE '% Homeroom'`.

### Notes

- No schema change, no code change — pure data cleanup via the insert/delete tool.
- Real curriculum subjects (Arabic, Maths, English, etc.) are untouched.
