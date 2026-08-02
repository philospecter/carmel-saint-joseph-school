export interface Env {
  FILES_BUCKET: R2Bucket;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  SUPABASE_ANON_KEY: string;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*", // tighten to your Lovable/Cloudflare Pages domain once live
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

async function verifySupabaseUser(req: Request, env: Env): Promise<boolean> {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return false;
  const token = auth.slice(7);

  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: env.SUPABASE_ANON_KEY,
    },
  });
  return res.ok;
}

function safeKey(category: string, filename: string): string {
  const cleanCategory = (category || "general").replace(/[^a-z0-9_-]/gi, "");
  const cleanName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const uuid = crypto.randomUUID();
  return `${cleanCategory}/${uuid}-${cleanName}`;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(req.url);

    if (req.method === "POST" && url.pathname === "/upload") {
      if (!(await verifySupabaseUser(req, env))) {
        return json({ error: "Unauthorized" }, 401);
      }

      const formData = await req.formData();
      const fileEntry = formData.get("file");
      const category = (formData.get("category") as string) || "general";

      if (!fileEntry || typeof fileEntry === "string") {
        return json({ error: "No file provided" }, 400);
      }
      const file = fileEntry as File;

      const MAX_BYTES = 10 * 1024 * 1024; // 10MB
      if (file.size > MAX_BYTES) {
        return json({ error: "File too large (25MB max)" }, 413);
      }
      const ALLOWED_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp"];
      if (!ALLOWED_TYPES.includes(file.type)) {
        return json({ error: `Unsupported file type: ${file.type}` }, 415);
      }

      const r2_key = safeKey(category, file.name);
      await env.FILES_BUCKET.put(r2_key, file.stream(), {
        httpMetadata: { contentType: file.type },
      });

      return json({
        r2_key,
        file_name: file.name,
        file_type: file.type,
        file_size_bytes: file.size,
      });
    }

    if (req.method === "DELETE" && url.pathname.startsWith("/file/")) {
      if (!(await verifySupabaseUser(req, env))) {
        return json({ error: "Unauthorized" }, 401);
      }
      const r2_key = decodeURIComponent(url.pathname.replace("/file/", ""));
      await env.FILES_BUCKET.delete(r2_key);
      return json({ deleted: r2_key });
    }

    if (req.method === "GET" && url.pathname.startsWith("/file/")) {
      const r2_key = decodeURIComponent(url.pathname.replace("/file/", ""));
      const obj = await env.FILES_BUCKET.get(r2_key);
      if (!obj) return json({ error: "Not found" }, 404);
      return new Response(obj.body, {
        headers: {
          "Content-Type": obj.httpMetadata?.contentType || "application/octet-stream",
          ...CORS_HEADERS,
        },
      });
    }

    return json({ error: "Not found" }, 404);
  },

  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(cleanupExpiredFiles(env));
  },
} satisfies ExportedHandler<Env>;

async function cleanupExpiredFiles(env: Env) {
  const nowIso = new Date().toISOString();
  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/files?expires_at=lt.${encodeURIComponent(nowIso)}&select=id,r2_key`,
    {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    }
  );
  if (!res.ok) {
    console.error("Failed to fetch expired files", await res.text());
    return;
  }
  const expired: { id: string; r2_key: string }[] = await res.json();

  for (const f of expired) {
    try {
      await env.FILES_BUCKET.delete(f.r2_key);
      await fetch(`${env.SUPABASE_URL}/rest/v1/files?id=eq.${f.id}`, {
        method: "DELETE",
        headers: {
          apikey: env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
      });
      console.log(`Cleaned up expired file: ${f.r2_key}`);
    } catch (err) {
      console.error(`Failed to clean up ${f.r2_key}`, err);
    }
  }
}
