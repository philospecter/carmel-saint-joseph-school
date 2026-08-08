import { auth, defineMcp } from "@lovable.dev/mcp-js";
import whoamiTool from "./tools/whoami";
import listAnnouncementsTool from "./tools/list-announcements";
import listMyGradesTool from "./tools/list-my-grades";
import listMyAttendanceTool from "./tools/list-my-attendance";
import listHomeworkTool from "./tools/list-homework";
import listSubjectsTool from "./tools/list-subjects";

// The OAuth issuer must be the direct Supabase host; the project ref is the only
// value that survives publish unchanged, and Vite inlines it at build time.
const projectRef = import.meta.env['VITE_SUPABASE_PROJECT_ID'] ?? "project-ref-unset";

export default defineMcp({
  name: "carmel-saint-joseph-school",
  title: "Carmel Saint Joseph School",
  version: "0.1.0",
  instructions:
    "Read-only tools for the Carmel Saint Joseph School portal. Use `whoami` to see the signed-in user's role and enrollment, `list_announcements` for school news, `list_homework` for assignments, `list_subjects` for the curriculum, and `list_my_grades` / `list_my_attendance` for the signed-in student's own records. All data access is scoped to the signed-in user's permissions.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [
    whoamiTool,
    listAnnouncementsTool,
    listHomeworkTool,
    listSubjectsTool,
    listMyGradesTool,
    listMyAttendanceTool,
  ],
});