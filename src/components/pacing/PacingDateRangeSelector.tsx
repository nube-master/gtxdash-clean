import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarUI } from "@/components/ui/calendar";
import { usePacingDateRange, type PacingDateRangeKey } from "@/contexts/PacingDateRangeContext";
import { Calendar, Clock, CalendarRange } from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type { DateRange } from "react-day-picker";

const OPTIONS: { value: PacingDateRangeKey; label: string }[] = [
  { value: "today", label: "Hoje" },
  { value: "yesterday", label: "Ontem" },
  { value: "3d", label: "3d" },
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
];

function fmtBRTTime(d: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

function isoToDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function dateToISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export function PacingDateRangeSelector() {
  const { range, setRange, setCustomRange, startDate, endDate } = usePacingDateRange();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange | undefined>(() =>
    range === "custom" ? { from: isoToDate(startDate), to: isoToDate(endDate) } : undefined,
  );

  const cutLabel = useMemo(() => {
    if (range === "today") {
      return `Hoje: 00:00 – ${fmtBRTTime(new Date())} BRT`;
    }
    if (range === "yesterday") {
      return `${startDate} 00:00 – 23:59 BRT`;
    }
    return `${startDate} 00:00 – ${endDate} 23:59 BRT`;
  }, [range, startDate, endDate]);

  const applyDraft = () => {
    if (draft?.from && draft?.to) {
      setCustomRange(dateToISO(draft.from), dateToISO(draft.to));
      setOpen(false);
    } else if (draft?.from) {
      setCustomRange(dateToISO(draft.from), dateToISO(draft.from));
      setOpen(false);
    }
  };

  return (
    <div className="flex flex-col items-stretch">
      <div className="inline-flex items-center gap-1.5">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant={range === "custom" ? "default" : "outline"}
              size="sm"
              className={cn("h-7 px-2 text-[10px] gap-1")}
              title="Selecionar intervalo no calendário"
            >
              <CalendarRange className="size-3" />
              {range === "custom" ? `${startDate} → ${endDate}` : "Calendário"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0 pointer-events-auto" align="start">
            <CalendarUI
              mode="range"
              numberOfMonths={2}
              selected={draft}
              onSelect={setDraft}
              initialFocus
              className={cn("p-3 pointer-events-auto")}
            />
            <div className="flex items-center justify-between gap-2 border-t border-border p-2">
              <span className="text-[11px] text-muted-foreground">
                {draft?.from ? dateToISO(draft.from) : "—"} → {draft?.to ? dateToISO(draft.to) : "—"}
              </span>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setDraft(undefined)}>
                  Limpar
                </Button>
                <Button size="sm" className="h-7 text-xs" onClick={applyDraft} disabled={!draft?.from}>
                  Aplicar
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
        <Calendar className="size-3.5 text-muted-foreground" />
        <Tabs value={range === "custom" ? "" : range} onValueChange={(v) => setRange(v as PacingDateRangeKey)}>
          <TabsList className="h-8 p-0.5">
            {OPTIONS.map((o) => (
              <TabsTrigger key={o.value} value={o.value} className="h-7 px-2.5 text-[11px]">
                {o.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>
      <div className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground">
        <Clock className="size-2.5" />
        <span className="font-medium">BRT (UTC-3)</span>
        <span>·</span>
        <span>{cutLabel}</span>
      </div>
    </div>
  );
}
