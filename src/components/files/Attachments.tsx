import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fileUrl, formatBytes } from "@/lib/files";
import { Paperclip } from "lucide-react";

type Props = { homeworkId?: string; announcementId?: string; className?: string };

export function Attachments({ homeworkId, announcementId, className }: Props) {
  const key = homeworkId ? `hw:${homeworkId}` : `ann:${announcementId}`;
  const { data } = useQuery({
    queryKey: ["attachments", key],
    enabled: !!(homeworkId || announcementId),
    queryFn: async () => {
      let q = supabase.from("files").select("id, file_name, r2_key, file_size_bytes");
      q = homeworkId ? q.eq("homework_id", homeworkId) : q.eq("announcement_id", announcementId!);
      const { data } = await q.order("created_at", { ascending: true });
      return data ?? [];
    },
  });
  if (!data || data.length === 0) return null;
  return (
    <div className={className ?? "mt-2 space-y-1"}>
      {data.map((f) => (
        <a
          key={f.id}
          href={fileUrl(f.r2_key)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-sm text-primary underline"
        >
          <Paperclip className="h-3.5 w-3.5" />
          <span>{f.file_name}</span>
          <span className="text-xs text-muted-foreground no-underline">
            {formatBytes(Number(f.file_size_bytes ?? 0))}
          </span>
        </a>
      ))}
    </div>
  );
}
