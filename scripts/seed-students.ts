import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const DOMAIN = "students.carmelstjoseph.local";
const PASSWORD = "student1476";

const students = [
  { name: "Student One",   nid: "30606010102451" },
  { name: "Student Two",   nid: "30606010102452" },
  { name: "Student Three", nid: "30606010102453" },
  { name: "Student Four",  nid: "30606010102454" },
  { name: "Student Five",  nid: "30606010102455" },
  { name: "Student Six",   nid: "30606010102456" },
];

const streets = ["Shaykh Rihan St", "Talaat Harb St", "El Horreya Rd", "El Nasr Rd", "Gomhoreya St", "El Tahrir St"];
const districts = ["Nasr City", "Heliopolis", "Maadi", "Zamalek", "Smouha", "Sidi Gaber"];
const cities = ["Cairo", "Giza", "Alexandria", "Mansoura", "Tanta", "Ismailia"];
const mobilePrefixes = ["010", "011", "012", "015"];

function pick<T>(arr: T[], i: number) { return arr[i % arr.length]; }

function addressFor(i: number) {
  return `${10 + i * 7} ${pick(streets, i)}, ${pick(districts, i)}, ${pick(cities, i)}, Egypt`;
}

function mobileFor(i: number) {
  const prefix = pick(mobilePrefixes, i);
  const suffix = String(20304050 + i * 111111).padStart(8, "0");
  return `${prefix}${suffix}`;
}

async function findUserByEmail(email: string) {
  let page = 1;
  while (page < 20) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const u = data.users.find((x) => x.email?.toLowerCase() === email.toLowerCase());
    if (u) return u;
    if (data.users.length < 200) return null;
    page++;
  }
  return null;
}

async function upsertStudent(s: { name: string; nid: string }, i: number) {
  const email = `${s.nid}@${DOMAIN}`;
  const mobile = mobileFor(i);
  const address = addressFor(i);

  let existing = await findUserByEmail(email);
  let userId: string;

  if (existing) {
    userId = existing.id;
    const { error } = await admin.auth.admin.updateUserById(userId, {
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: s.name, national_id: s.nid },
    });
    if (error) throw error;
    console.log(`updated auth user ${email}`);
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: s.name, national_id: s.nid },
    });
    if (error || !data.user) throw error ?? new Error("create failed");
    userId = data.user.id;
    console.log(`created auth user ${email}`);
  }

  const { error: pErr } = await admin.from("profiles").upsert(
    {
      id: userId,
      full_name: s.name,
      national_id: s.nid,
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

  const { data: year } = await admin
    .from("academic_years")
    .select("id")
    .eq("is_current", true)
    .maybeSingle();
  if (!year) throw new Error("no current academic year");

  const { error: eErr } = await admin.from("student_enrollments").upsert(
    {
      user_id: userId,
      stage_group: "secondary",
      grade_level: "sec2",
      academic_year_id: year.id,
      is_graduated: false,
    },
    { onConflict: "user_id,academic_year_id" },
  );
  if (eErr) throw eErr;

  console.log(`✓ ${s.name} (${email})  mobile=${mobile}`);
}

for (let i = 0; i < students.length; i++) {
  await upsertStudent(students[i], i);
}
console.log("done");
