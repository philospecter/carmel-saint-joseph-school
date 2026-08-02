import { supabase } from "@/integrations/supabase/client";

export const FILES_WORKER_URL = "https://carmel-files-worker.carmelsaintjoesph.workers.dev";

export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const ALLOWED_FILE_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

export type UploadedFile = {
  r2_key: string;
  file_name: string;
  file_type: string;
  file_size_bytes: number;
};

export function fileUrl(r2Key: string): string {
  return `${FILES_WORKER_URL}/file/${encodeURIComponent(r2Key)}`;
}

export function validateFile(file: File): string | null {
  if (!ALLOWED_FILE_TYPES.includes(file.type as (typeof ALLOWED_FILE_TYPES)[number])) {
    return "Only PDF, PNG, JPEG or WebP files are allowed.";
  }
  if (file.size > MAX_FILE_BYTES) return "File is too large (max 25 MB).";
  return null;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Uploads to the R2 worker and returns its metadata. Throws with a readable message. */
export async function uploadToWorker(file: File, category: string): Promise<UploadedFile> {
  const localError = validateFile(file);
  if (localError) throw new Error(localError);

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error("Your session expired — please sign in again.");

  const form = new FormData();
  form.append("file", file);
  form.append("category", category);

  const res = await fetch(`${FILES_WORKER_URL}/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });

  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    /* non-JSON response */
  }
  if (!res.ok) {
    const message = (payload as { error?: string } | null)?.error;
    throw new Error(message || `Upload failed (${res.status}).`);
  }
  const result = payload as UploadedFile | null;
  if (!result?.r2_key) throw new Error("Upload failed — no file key returned.");
  return result;
}
