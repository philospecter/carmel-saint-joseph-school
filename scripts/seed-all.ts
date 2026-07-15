/**
 * Idempotent seed:
 *  - 6 students per grade (72 total), password student1476
 *  - 1 teacher per grade (12 total), password teacher1476
 *  - Creates a per-grade subject and links each teacher via teacher_assignments
 *
 * Run: bun run scripts/seed-all.ts
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!url || !serviceKey) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required");

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const STUDENT_DOMAIN = "students.carmelstjoseph.local";
const STUDENT_PASSWORD = "student1476";
const TEACHER_PASSWORD = "teacher1476";

type StageGroup = "primary_1_2" | "primary_3_6" | "preparatory" | "secondary";
type GradeLevel =
  | "p1" | "p2" | "p3" | "p4" | "p5" | "p6"
  | "prep1" | "prep2" | "prep3"
  | "sec1" | "sec2" | "sec3";

interface GradeDef {
  label: string;
  grade: GradeLevel;
  stage: StageGroup;
  subject: string;
  teacherIndex: number; // 1..12
}

const PRIMARY_SUBJECTS = ["Arabic", "Mathematics", "Religion", "French", "English"];
const PREP_SUBJECTS = [...PRIMARY_SUBJECTS, "Science", "Social Studies"];
const SEC_SUBJECTS = [...PRIMARY_SUBJECTS, "History", "Geography", "Philosophy", "Integrated Science", "Chemistry", "Physics", "Biology"];

const GRADES: GradeDef[] = [
  { label: "Primary 1",     grade: "p1",    stage: "primary_1_2", subject: "Arabic",             teacherIndex: 1  },
  { label: "Primary 2",     grade: "p2",    stage: "primary_1_2", subject: "Mathematics",        teacherIndex: 2  },
  { label: "Primary 3",     grade: "p3",    stage: "primary_3_6", subject: "Religion",           teacherIndex: 3  },
  { label: "Primary 4",     grade: "p4",    stage: "primary_3_6", subject: "French",             teacherIndex: 4  },
  { label: "Primary 5",     grade: "p5",    stage: "primary_3_6", subject: "English",            teacherIndex: 5  },
  { label: "Primary 6",     grade: "p6",    stage: "primary_3_6", subject: "Arabic",             teacherIndex: 6  },
  { label: "Preparatory 1", grade: "prep1", stage: "preparatory", subject: "Mathematics",        teacherIndex: 7  },
  { label: "Preparatory 2", grade: "prep2", stage: "preparatory", subject: "Science",            teacherIndex: 8  },
  { label: "Preparatory 3", grade: "prep3", stage: "preparatory", subject: "Social Studies",     teacherIndex: 9  },
  { label: "Secondary 1",   grade: "sec1",  stage: "secondary",   subject: "History",            teacherIndex: 10 },
  { label: "Secondary 2",   grade: "sec2",  stage: "secondary",   subject: "Chemistry",          teacherIndex: 11 },
  { label: "Secondary 3",   grade: "sec3",  stage: "secondary",   subject: "Biology",            teacherIndex: 12 },
];

function curriculumFor(stage: StageGroup): string[] {
  if (stage === "primary_1_2" || stage === "primary_3_6") return PRIMARY_SUBJECTS;
  if (stage === "preparatory") return PREP_SUBJECTS;
  return SEC_SUBJECTS;
}

const STUDENTS_PER_GRADE = 6;

// National ID base: 30606010102451, each grade uses 6 consecutive IDs starting there.
const NID_BASE = 30606010102451n;

const streets = [
  "Shaykh Rihan St", "Talaat Harb St", "El Horreya Rd", "El Nasr Rd",
  "Gomhoreya St", "El Tahrir St", "Ramses St", "Salah Salem St",
  "Corniche El Nil", "El Merghany St", "Abbas El Akkad St", "Makram Ebeid St",
];
const districts = [
  "Nasr City", "Heliopolis", "Maadi", "Zamalek", "Smouha", "Sidi Gaber",
  "Dokki", "Mohandessin", "Shubra", "New Cairo", "6th of October", "Sheikh Zayed",
];
const cities = ["Cairo", "Giza", "Alexandria", "Mansoura", "Tanta", "Ismailia", "Port Said", "Suez"];
const mobilePrefixes = ["010", "011", "012", "015"];

function pick<T>(arr: T[], i: number): T { return arr[i % arr.length]; }

function addressFor(seed: number) {
  return `${5 + seed * 3} ${pick(streets, seed)}, ${pick(districts, seed + 1)}, ${pick(cities, seed + 2)}, Egypt`;
}

// Deterministic unique 11-digit mobile per seed (0..999999).
function mobileFor(seed: number) {
  const prefix = pick(mobilePrefixes, seed);
  const suffix = String(20000000 + seed * 137).padStart(8, "0").slice(-8);
  return `${prefix}${suffix}`;
}

async function findUserByEmail(email: string) {
  let page = 1;
  while (page < 30) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const u = data.users.find((x) => x.email?.toLowerCase() === email.toLowerCase());
    if (u) return u;
    if (data.users.length < 200) return null;
    page++;
  }
  return null;
}

async function ensureCurrentYear(): Promise<string> {
  const { data } = await admin.from("academic_years").select("id").eq("is_current", true).maybeSingle();
  if (data) return data.id;
  const { data: ins, error } = await admin
    .from("academic_years")
    .insert({ label: "2025/2026", is_current: true })
    .select("id")
    .single();
  if (error) throw error;
  console.log(`created academic year ${ins.id}`);
  return ins.id;
}

async function ensureSubject(name: string, stage: StageGroup, grade: GradeLevel): Promise<string> {
  const { data: existing } = await admin
    .from("subjects")
    .select("id")
    .eq("name", name)
    .eq("stage_group", stage)
    .eq("grade_level", grade)
    .maybeSingle();
  if (existing) return existing.id;
  const { data, error } = await admin
    .from("subjects")
    .insert({ name, stage_group: stage, grade_level: grade })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

async function upsertAuthUser(
  email: string,
  password: string,
  metadata: Record<string, unknown>,
): Promise<string> {
  const existing = await findUserByEmail(email);
  if (existing) {
    const { error } = await admin.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
      user_metadata: metadata,
    });
    if (error) throw error;
    return existing.id;
  }
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: metadata,
  });
  if (error || !data.user) throw error ?? new Error("create failed");
  return data.user.id;
}

async function seedStudent(
  yearId: string,
  gradeDef: GradeDef,
  name: string,
  nid: string,
  seed: number,
) {
  const email = `${nid}@${STUDENT_DOMAIN}`;
  const mobile = mobileFor(seed);
  const address = addressFor(seed);

  const userId = await upsertAuthUser(email, STUDENT_PASSWORD, {
    full_name: name,
    national_id: nid,
  });

  const { error: pErr } = await admin.from("profiles").upsert(
    {
      id: userId,
      full_name: name,
      national_id: nid,
      mobile,
      address,
      email,
      status: "active",
    },
    { onConflict: "id" },
  );
  if (pErr) throw pErr;

  const { error: rErr } = await admin
    .from("user_roles")
    .upsert({ user_id: userId, role: "student" }, { onConflict: "user_id,role" });
  if (rErr) throw rErr;

  const { error: eErr } = await admin.from("student_enrollments").upsert(
    {
      user_id: userId,
      stage_group: gradeDef.stage,
      grade_level: gradeDef.grade,
      academic_year_id: yearId,
      is_graduated: false,
    },
    { onConflict: "user_id,academic_year_id" },
  );
  if (eErr) throw eErr;

  console.log(`  ✓ ${gradeDef.label}: ${name} (${email})  mobile=${mobile}`);
}

async function seedTeacher(
  yearId: string,
  gradeDef: GradeDef,
  seed: number,
) {
  const name = `Teacher ${gradeDef.teacherIndex}`;
  const email = `teacher${gradeDef.teacherIndex}@gmail.com`;
  const mobile = mobileFor(seed);
  const address = addressFor(seed);

  const userId = await upsertAuthUser(email, TEACHER_PASSWORD, { full_name: name });

  const { error: pErr } = await admin.from("profiles").upsert(
    {
      id: userId,
      full_name: name,
      email,
      mobile,
      address,
      status: "active",
    },
    { onConflict: "id" },
  );
  if (pErr) throw pErr;

  const { error: rErr } = await admin
    .from("user_roles")
    .upsert({ user_id: userId, role: "teacher" }, { onConflict: "user_id,role" });
  if (rErr) throw rErr;

  const subjectId = await ensureSubject(gradeDef.subject, gradeDef.stage, gradeDef.grade);

  const { error: aErr } = await admin.from("teacher_assignments").upsert(
    {
      teacher_id: userId,
      subject_id: subjectId,
      academic_year_id: yearId,
    },
    { onConflict: "teacher_id,subject_id,academic_year_id" },
  );
  if (aErr) throw aErr;

  console.log(`  ✓ ${gradeDef.label}: ${name} <${email}> mobile=${mobile}`);
}

async function main() {
  const yearId = await ensureCurrentYear();
  console.log(`academic year: ${yearId}\n`);

  let studentSeed = 0;
  let teacherSeed = 1000; // separate mobile-number space to avoid collisions

  for (let g = 0; g < GRADES.length; g++) {
    const gradeDef = GRADES[g];
    console.log(`\n[${gradeDef.label}]`);

    console.log(" Teacher:");
    await seedTeacher(yearId, gradeDef, teacherSeed++);

    console.log(" Students:");
    for (let s = 0; s < STUDENTS_PER_GRADE; s++) {
      const index = g * STUDENTS_PER_GRADE + s; // 0..71
      const nid = (NID_BASE + BigInt(index)).toString();
      const name = `Student ${index + 1}`;
      await seedStudent(yearId, gradeDef, name, nid, studentSeed++);
    }
  }

  console.log("\n✅ seed complete: 72 students + 12 teachers");
}

await main();
