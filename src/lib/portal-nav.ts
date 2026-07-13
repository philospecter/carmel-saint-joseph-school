import type { NavItem } from "@/components/portal/PortalShell";

export const studentNav: NavItem[] = [
  { to: "/student", labelKey: "nav.dashboard" },
  { to: "/student/announcements", labelKey: "nav.announcements" },
  { to: "/student/subjects", labelKey: "nav.subjects" },
  { to: "/student/attendance", labelKey: "nav.attendance" },
  { to: "/student/grades", labelKey: "nav.grades" },
];

export const teacherNav: NavItem[] = [
  { to: "/teacher", labelKey: "nav.subjects" },
  { to: "/teacher/banks", labelKey: "nav.question_banks" },
];

export function staffNav(isAdmin: boolean): NavItem[] {
  const base: NavItem[] = [
    { to: "/staff", labelKey: "nav.dashboard" },
    { to: "/staff/requests", labelKey: "nav.requests" },
    { to: "/staff/announcements", labelKey: "nav.announcements" },
    { to: "/staff/attendance", labelKey: "nav.attendance" },
    { to: "/staff/grades", labelKey: "nav.grades" },
    { to: "/staff/teachers", labelKey: "nav.teachers" },
  ];
  if (isAdmin) base.push({ to: "/staff/managers", labelKey: "nav.stage_managers" });
  if (isAdmin) base.push({ to: "/staff/subjects", labelKey: "nav.subjects_admin" });
  if (isAdmin) base.push({ to: "/staff/settings", labelKey: "nav.settings" });
  if (isAdmin) base.push({ to: "/staff/users", labelKey: "nav.users" });
  if (isAdmin) base.push({ to: "/staff/year", labelKey: "nav.academic_year" });

  base.push({ to: "/staff/export", labelKey: "nav.export" });
  return base;
}
