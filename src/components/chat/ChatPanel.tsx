import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Send, ArrowLeft, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/lib/i18n";
import { formatSupabaseError } from "@/lib/errors";
import { openConversation, sendMessage, useMessages, type ChatKind } from "@/lib/chat";

export type ChatPeer = {
  /** stable key for the list */
  key: string;
  name: string;
  subtitle?: string;
  kind: ChatKind;
  teacherId: string;
  otherId: string;
  subjectId?: string | null;
};

export function ChatPanel({
  peers,
  meId,
  yearId,
  loading,
  emptyText,
}: {
  peers: ChatPeer[];
  meId: string;
  yearId: string | null;
  loading?: boolean;
  emptyText: string;
}) {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [active, setActive] = useState<ChatPeer | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return peers;
    return peers.filter((p) => p.name.toLowerCase().includes(q) || (p.subtitle ?? "").toLowerCase().includes(q));
  }, [peers, search]);

  useEffect(() => {
    if (active && !peers.some((p) => p.key === active.key)) setActive(null);
  }, [peers, active]);

  return (
    <div className="rounded-lg border bg-card overflow-hidden grid md:grid-cols-[18rem_1fr] min-h-[28rem]">
      <div className={`border-e md:block ${active ? "hidden" : "block"}`}>
        <div className="p-3 border-b">
          <Input placeholder={t("chat.search_people")} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="max-h-[26rem] overflow-y-auto divide-y">
          {loading ? (
            <div className="p-4 text-sm text-muted-foreground">{t("common.loading")}</div>
          ) : filtered.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">{emptyText}</div>
          ) : (
            filtered.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => setActive(p)}
                className={`w-full text-start p-3 transition-colors hover:bg-secondary ${
                  active?.key === p.key ? "bg-secondary" : ""
                }`}
              >
                <div className="text-sm font-medium truncate">{p.name}</div>
                {p.subtitle && <div className="text-xs text-muted-foreground truncate">{p.subtitle}</div>}
              </button>
            ))
          )}
        </div>
      </div>

      <div className={`${active ? "flex" : "hidden md:flex"} flex-col min-w-0`}>
        {!active ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 text-muted-foreground p-8 text-center">
            <MessageSquare className="h-8 w-8 opacity-50" />
            <div className="text-sm">{t("chat.pick_person")}</div>
          </div>
        ) : (
          <Thread key={active.key} peer={active} meId={meId} yearId={yearId} onBack={() => setActive(null)} />
        )}
      </div>
    </div>
  );
}

function Thread({
  peer,
  meId,
  yearId,
  onBack,
}: {
  peer: ChatPeer;
  meId: string;
  yearId: string | null;
  onBack: () => void;
}) {
  const { t } = useI18n();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    setConversationId(null);
    setOpenError(null);
    if (!yearId) { setOpenError(t("chat.no_year")); return; }
    openConversation({
      kind: peer.kind,
      teacherId: peer.teacherId,
      otherId: peer.otherId,
      subjectId: peer.subjectId ?? null,
      yearId,
    })
      .then((id) => { if (!cancelled) setConversationId(id); })
      .catch((e) => { if (!cancelled) setOpenError(formatSupabaseError(e)); });
    return () => { cancelled = true; };
  }, [peer.key, yearId]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: messages, isLoading } = useMessages(conversationId);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages?.length, conversationId]);

  const sendM = useMutation({
    mutationFn: async () => {
      if (!conversationId) throw new Error(t("chat.not_ready"));
      await sendMessage(conversationId, meId, draft);
    },
    onSuccess: () => setDraft(""),
    onError: (e) => toast.error(formatSupabaseError(e)),
  });

  return (
    <>
      <div className="h-14 border-b flex items-center gap-2 px-3 shrink-0">
        <Button variant="ghost" size="icon" className="md:hidden" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0">
          <div className="text-sm font-medium truncate">{peer.name}</div>
          {peer.subtitle && <div className="text-xs text-muted-foreground truncate">{peer.subtitle}</div>}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2 max-h-[24rem]">
        {openError ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            {openError}
          </div>
        ) : !conversationId || isLoading ? (
          <div className="text-sm text-muted-foreground">{t("common.loading")}</div>
        ) : (messages ?? []).length === 0 ? (
          <div className="text-sm text-muted-foreground">{t("chat.empty_thread")}</div>
        ) : (
          (messages ?? []).map((m) => {
            const mine = m.sender_id === meId;
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[80%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap break-words ${
                    mine ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"
                  }`}
                >
                  {m.body}
                  <div className={`mt-1 text-[10px] ${mine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                    {new Date(m.created_at).toLocaleString()}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      <div className="border-t p-3 flex items-end gap-2 shrink-0">
        <Textarea
          rows={2}
          maxLength={4000}
          className="resize-none"
          placeholder={t("chat.placeholder")}
          value={draft}
          disabled={!conversationId || !!openError}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (draft.trim() && !sendM.isPending) sendM.mutate();
            }
          }}
        />
        <Button
          size="icon"
          onClick={() => sendM.mutate()}
          disabled={!conversationId || !!openError || !draft.trim() || sendM.isPending}
          aria-label={t("chat.send")}
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
      <div className="px-3 pb-2 text-[11px] text-muted-foreground">{t("chat.retention")}</div>
    </>
  );
}