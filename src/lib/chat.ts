import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type ChatKind = "teacher_student" | "sm_teacher" | "admin_user";

export type ChatMessage = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

// The generated types don't include the chat tables (they live on the
// external backend as well), so we use an untyped client for them.
const sb = () => supabase as unknown as {
  from: (t: string) => any;
  channel: (n: string) => any;
  removeChannel: (c: unknown) => void;
};

export type OpenConversationArgs = {
  kind: ChatKind;
  teacherId: string;
  otherId: string;
  subjectId?: string | null;
  yearId: string;
};

/**
 * Finds an existing conversation or creates it. We never gate on client-side
 * permission logic — the database RLS policy is the source of truth, so we
 * simply try the insert and surface the error if it's rejected.
 */
export async function openConversation(args: OpenConversationArgs): Promise<string> {
  const { kind, teacherId, otherId, subjectId, yearId } = args;
  let q = sb()
    .from("conversations")
    .select("id")
    .eq("kind", kind)
    .eq("teacher_id", teacherId)
    .eq("other_id", otherId)
    .eq("academic_year_id", yearId);
  q = kind === "teacher_student" ? q.eq("subject_id", subjectId) : q.is("subject_id", null);
  const { data: existing, error: findErr } = await q.maybeSingle();
  if (findErr) throw findErr;
  if (existing?.id) return existing.id as string;

  const { data, error } = await sb()
    .from("conversations")
    .insert({
      kind,
      teacher_id: teacherId,
      other_id: otherId,
      subject_id: kind === "teacher_student" ? subjectId : null,
      academic_year_id: yearId,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

export function useMessages(conversationId: string | null) {
  const qc = useQueryClient();
  const key = ["chat-messages", conversationId] as const;

  const query = useQuery({
    queryKey: key,
    enabled: !!conversationId,
    queryFn: async () => {
      const { data, error } = await sb()
        .from("messages")
        .select("id, conversation_id, sender_id, body, created_at")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ChatMessage[];
    },
  });

  useEffect(() => {
    if (!conversationId) return;
    const channel = sb()
      .channel(`messages:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload: { new: ChatMessage }) => {
          qc.setQueryData<ChatMessage[]>(key, (prev) => {
            const list = prev ?? [];
            if (list.some((m) => m.id === payload.new.id)) return list;
            return [...list, payload.new];
          });
        },
      )
      .subscribe();
    return () => { sb().removeChannel(channel); };
  }, [conversationId]); // eslint-disable-line react-hooks/exhaustive-deps

  return query;
}

export async function sendMessage(conversationId: string, senderId: string, body: string) {
  const text = body.trim();
  if (!text) throw new Error("Message is empty.");
  if (text.length > 4000) throw new Error("Message is too long (max 4000 characters).");
  const { error } = await sb().from("messages").insert({
    conversation_id: conversationId,
    sender_id: senderId,
    body: text,
  });
  if (error) throw error;
}

export type UnreadRow = {
  conversation_id: string;
  kind: ChatKind;
  teacher_id: string;
  other_id: string;
  subject_id: string | null;
  unread: number;
};

/** Unread message counts per conversation for the signed-in user. */
export function useUnread() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["chat-unread"],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("chat_unread");
      if (error) throw error;
      return (data ?? []) as UnreadRow[];
    },
  });

  useEffect(() => {
    const channel = sb()
      .channel("chat-unread-watch")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () => {
        qc.invalidateQueries({ queryKey: ["chat-unread"] });
      })
      .subscribe();
    return () => { sb().removeChannel(channel); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return query;
}

export function unreadKeyOf(r: { kind: string; teacher_id: string; other_id: string; subject_id: string | null }) {
  return `${r.kind}|${r.teacher_id}|${r.other_id}|${r.subject_id ?? ""}`;
}

export function useUnreadTotal() {
  const { data } = useUnread();
  return (data ?? []).reduce((n, r) => n + r.unread, 0);
}

export async function markConversationRead(conversationId: string) {
  await (supabase as any).rpc("mark_conversation_read", { _conversation: conversationId });
}

/** Admins who have opened a conversation with the signed-in user. */
export function useAdminChats(meId: string) {
  return useQuery({
    queryKey: ["chat-admin-threads", meId],
    enabled: !!meId,
    queryFn: async () => {
      const { data, error } = await sb()
        .from("conversations")
        .select("teacher_id")
        .eq("kind", "admin_user")
        .eq("other_id", meId);
      if (error) throw error;
      return Array.from(new Set(((data ?? []) as { teacher_id: string }[]).map((r) => r.teacher_id)));
    },
  });
}

/** Resolves display names for a set of user ids. */
export function useProfileNames(ids: string[]) {
  const unique = Array.from(new Set(ids.filter(Boolean))).sort();
  return useQuery({
    queryKey: ["chat-profile-names", unique.join(",")],
    enabled: unique.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const map = new Map<string, string>();
      // Students cannot read other profiles directly (RLS), so we resolve
      // names through a security-definer RPC scoped to valid chat peers.
      const { data: peers } = await (supabase as any).rpc("chat_peer_names");
      for (const p of (peers ?? []) as { id: string; full_name: string }[]) {
        if (unique.includes(p.id)) map.set(p.id, p.full_name);
      }
      const missing = unique.filter((id) => !map.has(id));
      if (missing.length > 0) {
        const { data } = await supabase.from("profiles").select("id, full_name").in("id", missing);
        for (const p of data ?? []) map.set(p.id, p.full_name);
      }
      return map;
    },
  });
}