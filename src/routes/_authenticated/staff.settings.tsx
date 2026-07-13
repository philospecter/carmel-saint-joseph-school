import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMe } from "@/hooks/use-me";
import { useI18n } from "@/lib/i18n";
import { Section } from "@/components/portal/PortalShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { X, Plus } from "lucide-react";
import { formatSupabaseError } from "@/lib/errors";
import { listTermMonths, setTermMonths } from "@/lib/settings.functions";

export const Route = createFileRoute("/_authenticated/staff/settings")({ component: Page });

const MONTH_LABEL = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function Page() {
  const { t } = useI18n();
  const { data: me } = useMe();
  const isAdmin = !!me?.roles.includes("admin");
  const qc = useQueryClient();
  const listFn = useServerFn(listTermMonths);
  const { data } = useQuery({
    queryKey: ["term-months"],
    queryFn: () => listFn(),
    enabled: isAdmin,
  });

  if (!isAdmin) return <div className="p-8">Not authorized.</div>;

  return (
    <Section title={t("nav.settings")}>
      <div className="space-y-6">
        <div>
          <h3 className="font-serif text-lg mb-1">{t("settings.term_months")}</h3>
          <p className="text-sm text-muted-foreground mb-4">{t("settings.term_months_hint")}</p>
          <div className="space-y-4">
            <TermMonthRow
              term="term_1"
              label={t("term.term_1")}
              months={data?.term_1 ?? []}
              onSaved={() => qc.invalidateQueries({ queryKey: ["term-months"] })}
            />
            <TermMonthRow
              term="term_2"
              label={t("term.term_2")}
              months={data?.term_2 ?? []}
              onSaved={() => qc.invalidateQueries({ queryKey: ["term-months"] })}
            />
          </div>
        </div>
      </div>
    </Section>
  );
}

function TermMonthRow({ term, label, months, onSaved }: { term: "term_1" | "term_2"; label: string; months: number[]; onSaved: () => void }) {
  const { t } = useI18n();
  const [addValue, setAddValue] = useState<string>("");
  const saveFn = useServerFn(setTermMonths);
  const saveM = useMutation({
    mutationFn: (next: number[]) => saveFn({ data: { term, months: next } }),
    onSuccess: () => { toast.success(t("common.save")); onSaved(); },
    onError: (e) => toast.error(formatSupabaseError(e)),
  });
  const unused = useMemo(
    () => Array.from({ length: 12 }, (_, i) => i + 1).filter((m) => !months.includes(m)),
    [months],
  );

  function remove(m: number) {
    const next = months.filter((x) => x !== m);
    if (next.length === 0) { toast.error("Keep at least one month."); return; }
    saveM.mutate(next);
  }
  function add() {
    const n = Number(addValue);
    if (!n) return;
    const next = [...months, n].sort((a, b) => a - b);
    setAddValue("");
    saveM.mutate(next);
  }

  return (
    <div className="rounded-lg border p-3">
      <div className="font-medium mb-2">{label}</div>
      <div className="flex flex-wrap items-center gap-2">
        {months.length === 0 ? (
          <span className="text-sm text-muted-foreground">{t("settings.no_months")}</span>
        ) : (
          months.map((m) => (
            <Badge key={m} variant="secondary" className="gap-1 pl-3 pr-1 py-1">
              {MONTH_LABEL[m]}
              <button
                type="button"
                className="p-0.5 rounded hover:bg-destructive/20"
                onClick={() => remove(m)}
                aria-label={`Remove ${MONTH_LABEL[m]}`}
                disabled={saveM.isPending}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))
        )}
        {unused.length > 0 && (
          <div className="flex items-center gap-1 ms-auto">
            <Select value={addValue} onValueChange={setAddValue}>
              <SelectTrigger className="w-32"><SelectValue placeholder={t("settings.add_month")} /></SelectTrigger>
              <SelectContent>
                {unused.map((m) => <SelectItem key={m} value={String(m)}>{MONTH_LABEL[m]}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button size="sm" onClick={add} disabled={!addValue || saveM.isPending}>
              <Plus className="h-3 w-3 mr-1" />{t("settings.add_month")}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
