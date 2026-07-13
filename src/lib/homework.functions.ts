import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type AnswerInput = { question_id: string; mcq_choice?: number | null; written_text?: string | null };

export const submitHomework = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { homework_id: string; answers: AnswerInput[] }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Fetch homework (RLS: student can read via stage/grade policy)
    const { data: hw, error: hwErr } = await supabase
      .from("homework")
      .select("id, kind, locked, auto_lock, due_at, bank_id")
      .eq("id", data.homework_id)
      .maybeSingle();
    if (hwErr) throw new Error(hwErr.message);
    if (!hw) throw new Error("Homework not found.");
    if (hw.kind !== "bank") throw new Error("This homework has no questions to submit.");
    if (hw.locked) throw new Error("This homework is closed.");
    if (hw.auto_lock && hw.due_at && new Date(hw.due_at).getTime() < Date.now()) {
      throw new Error("This homework is past its due date.");
    }

    // Prevent duplicate submission (defense in depth; unique constraint enforces it)
    const { data: existing } = await supabase
      .from("homework_submissions")
      .select("id")
      .eq("homework_id", data.homework_id)
      .eq("student_id", userId)
      .maybeSingle();
    if (existing) throw new Error("You have already submitted this homework.");

    // Load full question rows via admin (student RLS on questions is restricted to bank owner).
    const { data: hqRows, error: hqErr } = await supabaseAdmin
      .from("homework_questions")
      .select("question_id, questions(id, type, correct_choice, points)")
      .eq("homework_id", data.homework_id);
    if (hqErr) throw new Error(hqErr.message);

    type Q = { id: string; type: "mcq" | "written"; correct_choice: number | null; points: number };
    const questions = (hqRows ?? [])
      .map((r) => (r as { questions: Q | null }).questions)
      .filter((q): q is Q => !!q);
    const qById = new Map(questions.map((q) => [q.id, q]));

    let autoScore = 0;
    let hasWritten = false;
    for (const q of questions) {
      const ans = data.answers.find((a) => a.question_id === q.id);
      if (q.type === "mcq") {
        if (ans && typeof ans.mcq_choice === "number" && ans.mcq_choice === q.correct_choice) {
          autoScore += q.points;
        }
      } else {
        hasWritten = true;
      }
    }

    const finalScore = hasWritten ? null : autoScore;

    const { data: sub, error: subErr } = await supabaseAdmin
      .from("homework_submissions")
      .insert({
        homework_id: data.homework_id,
        student_id: userId,
        submitted_at: new Date().toISOString(),
        auto_score: autoScore,
        manual_score: 0,
        final_score: finalScore,
        locked: false,
      } as never)
      .select("id")
      .single();
    if (subErr) {
      if (subErr.code === "23505") throw new Error("You have already submitted this homework.");
      throw new Error(subErr.message);
    }

    const rows = data.answers
      .filter((a) => qById.has(a.question_id))
      .map((a) => {
        const q = qById.get(a.question_id)!;
        if (q.type === "mcq") {
          return {
            submission_id: sub.id,
            question_id: a.question_id,
            mcq_choice: typeof a.mcq_choice === "number" ? a.mcq_choice : null,
            written_text: null,
            is_correct: typeof a.mcq_choice === "number" && a.mcq_choice === q.correct_choice,
            manual_score: null,
          };
        }
        return {
          submission_id: sub.id,
          question_id: a.question_id,
          mcq_choice: null,
          written_text: a.written_text ?? "",
          is_correct: null,
          manual_score: null,
        };
      });
    if (rows.length > 0) {
      const { error: ansErr } = await supabaseAdmin.from("homework_answers").insert(rows as never);
      if (ansErr) throw new Error(ansErr.message);
    }

    return { ok: true, submissionId: sub.id, autoScore, finalScore };
  });

export const gradeWrittenAnswer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { answer_id: string; manual_score: number }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Load the answer + submission + homework to authorize + recompute
    const { data: ans, error: ansErr } = await supabaseAdmin
      .from("homework_answers")
      .select("id, submission_id, question_id, questions(points, type)")
      .eq("id", data.answer_id)
      .maybeSingle();
    if (ansErr) throw new Error(ansErr.message);
    if (!ans) throw new Error("Answer not found.");
    const q = (ans as { questions: { points: number; type: string } | null }).questions;
    if (!q || q.type !== "written") throw new Error("Only written answers can be graded.");
    if (data.manual_score < 0 || data.manual_score > q.points) {
      throw new Error(`Score must be between 0 and ${q.points}.`);
    }

    const { data: sub, error: subErr } = await supabaseAdmin
      .from("homework_submissions")
      .select("id, homework_id, auto_score, homework:homework_id(teacher_assignment_id)")
      .eq("id", (ans as { submission_id: string }).submission_id)
      .maybeSingle();
    if (subErr) throw new Error(subErr.message);
    if (!sub) throw new Error("Submission not found.");

    const taId = (sub as { homework: { teacher_assignment_id: string } | null }).homework?.teacher_assignment_id;
    if (!taId) throw new Error("Homework not found.");

    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) {
      const { data: owns } = await supabase.rpc("teacher_owns_assignment", { _user_id: userId, _assignment: taId });
      if (!owns) throw new Error("Forbidden");
    }

    // Update this answer's manual_score
    const { error: updErr } = await supabaseAdmin
      .from("homework_answers")
      .update({ manual_score: data.manual_score } as never)
      .eq("id", data.answer_id);
    if (updErr) throw new Error(updErr.message);

    // Recompute submission totals
    const { data: allAns } = await supabaseAdmin
      .from("homework_answers")
      .select("manual_score, questions(type)")
      .eq("submission_id", (sub as { id: string }).id);

    let manualTotal = 0;
    let allGraded = true;
    for (const row of allAns ?? []) {
      const r = row as { manual_score: number | null; questions: { type: string } | null };
      if (r.questions?.type === "written") {
        if (r.manual_score === null) allGraded = false;
        else manualTotal += Number(r.manual_score);
      }
    }
    const autoScore = Number((sub as { auto_score: number | null }).auto_score ?? 0);
    const finalScore = allGraded ? autoScore + manualTotal : null;

    const { error: sUpdErr } = await supabaseAdmin
      .from("homework_submissions")
      .update({ manual_score: manualTotal, final_score: finalScore } as never)
      .eq("id", (sub as { id: string }).id);
    if (sUpdErr) throw new Error(sUpdErr.message);

    return { ok: true, manualTotal, finalScore };
  });
