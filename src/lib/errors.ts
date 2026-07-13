export function formatSupabaseError(err: unknown, fallback = "Something went wrong. Please try again."): string {
  if (!err) return fallback;
  const anyErr = err as { code?: string; message?: string; error_description?: string; name?: string };
  const msg = anyErr.message || anyErr.error_description || "";
  const lower = msg.toLowerCase();

  if (anyErr.code === "23505" || lower.includes("duplicate key")) {
    if (lower.includes("national_id")) return "This national ID is already registered.";
    if (lower.includes("email")) return "An account with this email already exists.";
    return "This record already exists.";
  }
  if (anyErr.code === "42501" || lower.includes("row-level security") || lower.includes("permission denied")) {
    return "You don't have permission to perform this action.";
  }
  if (anyErr.code === "23503" || lower.includes("foreign key")) {
    return "This record is linked to something else and can't be changed right now.";
  }
  if (lower.includes("invalid login credentials")) return "Wrong national ID/email or password.";
  if (lower.includes("email not confirmed")) return "Your account isn't active yet. Please contact your school administrator.";
  if (lower.includes("user already registered")) return "An account with this national ID or email already exists.";
  if (msg) return msg;
  return fallback;
}
