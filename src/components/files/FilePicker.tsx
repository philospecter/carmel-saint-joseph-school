import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ALLOWED_FILE_TYPES, formatBytes, validateFile } from "@/lib/files";
import { toast } from "sonner";

type Props = {
  label?: string;
  file: File | null;
  onChange: (file: File | null) => void;
  disabled?: boolean;
};

export function FilePicker({ label = "Attachment (optional)", file, onChange, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [key, setKey] = useState(0);

  return (
    <div>
      <Label>{label}</Label>
      <div className="flex flex-wrap items-center gap-2 mt-1">
        <input
          key={key}
          ref={inputRef}
          type="file"
          accept={ALLOWED_FILE_TYPES.join(",")}
          disabled={disabled}
          className="text-sm file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm file:text-foreground"
          onChange={(e) => {
            const picked = e.target.files?.[0] ?? null;
            if (!picked) return onChange(null);
            const err = validateFile(picked);
            if (err) {
              toast.error(err);
              setKey((k) => k + 1);
              return onChange(null);
            }
            onChange(picked);
          }}
        />
        {file && (
          <>
            <span className="text-xs text-muted-foreground">{formatBytes(file.size)}</span>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={disabled}
              onClick={() => {
                onChange(null);
                setKey((k) => k + 1);
              }}
            >
              Remove
            </Button>
          </>
        )}
      </div>
      <p className="text-xs text-muted-foreground mt-1">PDF, PNG, JPEG or WebP — up to 10 MB.</p>
    </div>
  );
}
