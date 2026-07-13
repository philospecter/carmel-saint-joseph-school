import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/student/subjects")({ component: SubjectsLayout });

function SubjectsLayout() {
  return <Outlet />;
}
