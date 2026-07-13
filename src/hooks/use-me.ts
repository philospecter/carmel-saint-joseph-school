import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type Role = Database["public"]["Enums"] extends { app_role: infer R } ? R : "student" | "teacher" | "stage_manager" | "admin";
type Stage = "primary_1_2" | "primary_3_6" | "preparatory" | "secondary";
type Grade = "p1" | "p2" | "p3" | "p4" | "p5" | "p6" | "prep1" | "prep2" | "prep3" | "sec1" | "sec2" | "sec3";

export type Me = {
  userId: string;
  email: string | null;
  profile: {
    id: string;
    full_name: string;
    national_id: string | null;
    mobile: string | null;
    address: string | null;
    email: string | null;
    status: "pending" | "active";
  } | null;
  roles: Role[];
  stages: Stage[]; // stages this user manages (for SM)
  enrollment: { stage_group: Stage; grade_level: Grade } | null;
};

export async function fetchMe(): Promise<Me | null> {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;

  const [{ data: profile }, { data: roles }, { data: stages }, { data: enrollment }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", user.id),
    supabase.from("stage_manager_assignments").select("stage_group").eq("user_id", user.id),
    supabase.from("student_enrollments").select("stage_group,grade_level").eq("user_id", user.id).maybeSingle(),
  ]);

  return {
    userId: user.id,
    email: user.email ?? null,
    profile: (profile as Me["profile"]) ?? null,
    roles: (roles ?? []).map((r) => r.role as Role),
    stages: (stages ?? []).map((s) => s.stage_group as Stage),
    enrollment: (enrollment as Me["enrollment"]) ?? null,
  };
}

export function useMe() {
  return useQuery({ queryKey: ["me"], queryFn: fetchMe, staleTime: 30_000 });
}

export function primaryPortal(roles: Role[]): "/admin" | "/staff" | "/teacher" | "/student" | null {
  if (roles.includes("admin" as Role)) return "/staff"; // admin uses staff shell
  if (roles.includes("stage_manager" as Role)) return "/staff";
  if (roles.includes("teacher" as Role)) return "/teacher";
  if (roles.includes("student" as Role)) return "/student";
  return null;
}
