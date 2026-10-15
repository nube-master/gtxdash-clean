import { useState, useMemo, useCallback } from "react";
import { CalendarIcon, Clock } from "lucide-react";
import { useDateRange, type DateRangeKey } from "@/contexts/DateRangeContext";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Drawer,
  DrawerContent,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import type { DateRange } from "react-day-picker";

const PRESETS: { value: DateRangeKey; label: string }[] = [
  { value: "today", label: "Hoje" },
  { value: "yesterday", label: "Ontem" },
  { value: "7", label: "7 dias" },
  { value: "14", label: "14 dias" },
  { value: "30", label: "30 dias" },
  { value: "this_month", label: "Mês" },
  { value: "last_month", label: "Mês Ant." },
  { value: "q_current", label: "Trim." },
  { value: "q_last", label: "Trim. Ant." },
];

function toBRDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function fmtDateBR(s: string): string {
  const [, m, d] = s.split("-");
  return `${d}/${m}`;
}

function fmtDateFull(s: string): string {
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
}

function daysBetween(start: string, end: string): number {
  const s = parseLocalDate(start);
  const e = parseLocalDate(end);
  return Math.max(1, Math.round((e.getTime() - s.getTime()) / 86400000) + 1);
}

function formatLabel(rangeKey: DateRangeKey, customStart: string, customEnd: string): string {
  if (rangeKey === "today") return "Hoje";
  if (rangeKey === "yesterday") return "Ontem";
  if (rangeKey === "7") return "7 dias";
  if (rangeKey === "14") return "14 dias";
  if (rangeKey === "30") return "30 dias";
  if (rangeKey === "this_month") return "Este Mês";
  if (rangeKey === "last_month") return "Mês Ant.";
  if (rangeKey === "q_current") return "Trimestre";
  if (rangeKey === "q_last") return "Trim. Ant.";
  if (customStart === customEnd) return fmtDateBR(customStart);
  return `${fmtDateBR(customStart)} – ${fmtDateBR(customEnd)}`;
}

/** Shared picker body used by both Popover (desktop) and Drawer (mobile) */
function PickerBody({
  rangeKey,
  tempStart,
  tempEnd,
  totalDays,
  calendarRange,
  vertical,
  onPreset,
  onCalendarSelect,
  onApply,
}: {
  rangeKey: DateRangeKey;
  tempStart: string;
  tempEnd: string;
  totalDays: number;
  calendarRange: DateRange | undefined;
  vertical: boolean;
  onPreset: (key: DateRangeKey) => void;
  onCalendarSelect: (range: DateRange | undefined) => void;
  onApply: () => void;
}) {
  if (vertical) {
    return (
      <div className="flex flex-col h-auto max-h-[70vh]">
        {/* Presets — horizontal scroll */}
        <div className="flex gap-1.5 px-3 pt-3 pb-2 overflow-x-auto shrink-0 no-scrollbar">
          {PRESETS.map((p) => (
            <button
              key={p.value}
              onClick={() => onPreset(p.value)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all",
                "min-h-[36px]",
                rangeKey === p.value
                  ? "bg-primary text-primary-foreground shadow-md"
                  : "text-muted-foreground bg-secondary/60"
              )}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Calendar — full width, proper table grid */}
        <div className="flex-1 flex items-start justify-center overflow-y-auto px-3 pt-1">
          <Calendar
            mode="range"
            selected={calendarRange}
            onSelect={onCalendarSelect}
            numberOfMonths={1}
            className={cn("p-1 pointer-events-auto w-full max-w-[344px]")}
            classNames={{
              months: "flex flex-col w-full",
              month: "space-y-2 w-full",
              caption: "flex justify-center pt-1 relative items-center h-9",
              caption_label: "text-sm font-bold",
              nav_button: cn(
                "h-9 w-9 bg-transparent p-0 opacity-60 hover:opacity-100",
                "hover:bg-accent rounded-xl transition-all inline-flex items-center justify-center"
              ),
              nav_button_previous: "absolute left-2",
              nav_button_next: "absolute right-2",
              table: "date-picker-table w-full border-collapse",
              head_row: "flex w-full justify-around",
              head_cell: "text-muted-foreground w-[14.28%] font-medium text-[11px] uppercase text-center py-0.5",
              row: "flex w-full justify-around mt-0.5",
              cell: cn(
                "w-[14.28%] text-center text-sm p-0 relative",
                "[&:has([aria-selected].day-range-end)]:rounded-r-xl",
                "[&:has([aria-selected].day-outside)]:bg-primary/10",
                "[&:has([aria-selected])]:bg-primary/10",
                "first:[&:has([aria-selected])]:rounded-l-xl",
                "last:[&:has([aria-selected])]:rounded-r-xl",
                "focus-within:relative focus-within:z-20"
              ),
              day: cn(
                "h-10 w-10 mx-auto p-0 text-sm font-normal rounded-xl transition-all",
                "hover:bg-accent hover:text-accent-foreground",
                "aria-selected:opacity-100",
                "inline-flex items-center justify-center"
              ),
              day_range_end: "day-range-end",
              day_selected: cn(
                "bg-primary text-primary-foreground",
                "hover:bg-primary/90 hover:text-primary-foreground",
                "focus:bg-primary focus:text-primary-foreground",
                "shadow-md"
              ),
              day_today: "ring-2 ring-primary/50 font-bold",
              day_outside: "day-outside text-muted-foreground/30 aria-selected:bg-primary/5 aria-selected:text-muted-foreground/50",
              day_disabled: "text-muted-foreground/20",
              day_range_middle: "aria-selected:bg-primary/10 aria-selected:text-foreground",
              day_hidden: "invisible",
            }}
          />
        </div>

        {/* Bottom bar — date summary + apply */}
        <div className="flex items-center gap-3 px-3 py-2.5 border-t border-border shrink-0 bg-background">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="text-xs font-semibold font-mono text-foreground">{fmtDateFull(tempStart)}</span>
            <span className="text-xs text-muted-foreground">→</span>
            <span className="text-xs font-semibold font-mono text-foreground">{fmtDateFull(tempEnd)}</span>
            <span className="text-xs text-muted-foreground ml-1">({totalDays}d)</span>
          </div>
          <Button onClick={onApply} className="h-10 px-5 text-sm font-bold rounded-xl" size="sm">
            Aplicar
          </Button>
        </div>
      </div>
    );
  }

  // Desktop: side-by-side
  return (
    <div className="flex">
      <div className="w-[120px] border-r border-border p-2 flex flex-col gap-0.5">
        {PRESETS.map((p) => (
          <button
            key={p.value}
            onClick={() => onPreset(p.value)}
            className={cn(
              "flex items-center justify-between px-2.5 py-1.5 rounded-md text-[11px] font-medium transition-all duration-100",
              "hover:bg-accent/80",
              rangeKey === p.value
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-foreground"
            )}
          >
            <span>{p.label}</span>
            {rangeKey === p.value && (
              <div className="h-1.5 w-1.5 rounded-full bg-primary-foreground/70" />
            )}
          </button>
        ))}

        <div className="h-px bg-border my-1.5" />
        <div className="px-2 space-y-2">
          <div>
            <span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground block mb-0.5">Início</span>
            <span className="text-[11px] font-semibold font-mono text-foreground">{fmtDateFull(tempStart)}</span>
          </div>
          <div>
            <span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground block mb-0.5">Fim</span>
            <span className="text-[11px] font-semibold font-mono text-foreground">{fmtDateFull(tempEnd)}</span>
          </div>
          <div className="flex items-center gap-1 text-muted-foreground">
            <Clock className="h-2.5 w-2.5" />
            <span className="text-[9px] font-mono">{totalDays}d · SP</span>
          </div>
        </div>
        <div className="mt-auto pt-2 px-1">
          <Button onClick={onApply} className="w-full h-7 text-[10px] font-semibold" size="sm">
            Aplicar
          </Button>
        </div>
      </div>

      <div className="p-1">
        <Calendar
          mode="range"
          selected={calendarRange}
          onSelect={onCalendarSelect}
          numberOfMonths={1}
          className={cn("p-2 pointer-events-auto")}
          classNames={{
            months: "flex flex-col",
            month: "space-y-2",
            caption: "flex justify-center pt-1 relative items-center",
            caption_label: "text-xs font-semibold",
            nav_button: cn(
              "h-7 w-7 bg-transparent p-0 opacity-60 hover:opacity-100 hover:bg-accent rounded-md transition-all inline-flex items-center justify-center"
            ),
            nav_button_previous: "absolute left-1",
            nav_button_next: "absolute right-1",
            table: "date-picker-table w-full border-collapse",
            head_row: "flex",
            head_cell: "text-muted-foreground rounded-md w-9 font-medium text-[10px] uppercase",
            row: "flex w-full mt-0.5",
            cell: cn(
              "h-9 w-9 text-center text-xs p-0 relative",
              "[&:has([aria-selected].day-range-end)]:rounded-r-lg",
              "[&:has([aria-selected].day-outside)]:bg-primary/10",
              "[&:has([aria-selected])]:bg-primary/10",
              "first:[&:has([aria-selected])]:rounded-l-lg",
              "last:[&:has([aria-selected])]:rounded-r-lg",
              "focus-within:relative focus-within:z-20"
            ),
            day: cn(
              "h-9 w-9 p-0 font-normal rounded-lg transition-all duration-100",
              "hover:bg-accent hover:text-accent-foreground",
              "aria-selected:opacity-100"
            ),
            day_range_end: "day-range-end",
            day_selected: cn(
              "bg-primary text-primary-foreground",
              "hover:bg-primary/90 hover:text-primary-foreground",
              "focus:bg-primary focus:text-primary-foreground",
              "shadow-sm"
            ),
            day_today: "ring-1 ring-primary/40 font-semibold",
            day_outside: "day-outside text-muted-foreground/40 aria-selected:bg-primary/5 aria-selected:text-muted-foreground/60",
            day_disabled: "text-muted-foreground/30",
            day_range_middle: "aria-selected:bg-primary/10 aria-selected:text-foreground",
            day_hidden: "invisible",
          }}
        />
      </div>
    </div>
  );
}

export function DateRangeSelector() {
  const { rangeKey, setRangeKey, customStart, customEnd, setCustomStart, setCustomEnd } = useDateRange();
  const [open, setOpen] = useState(false);
  const isMobile = useIsMobile();

  const [tempStart, setTempStart] = useState(customStart);
  const [tempEnd, setTempEnd] = useState(customEnd);

  const handlePreset = useCallback((key: DateRangeKey) => {
    setRangeKey(key);
    // Delay drawer close to ensure state update propagates before unmount
    requestAnimationFrame(() => setOpen(false));
  }, [setRangeKey]);

  const handleCalendarSelect = useCallback((range: DateRange | undefined) => {
    if (!range?.from) return;
    const from = toBRDate(range.from);
    const to = range.to ? toBRDate(range.to) : from;
    setTempStart(from);
    setTempEnd(to);
  }, []);

  const applyCustom = useCallback(() => {
    setCustomStart(tempStart);
    setCustomEnd(tempEnd);
    setRangeKey("custom");
    setOpen(false);
  }, [tempStart, tempEnd, setCustomStart, setCustomEnd, setRangeKey]);

  const calendarRange = useMemo<DateRange | undefined>(() => {
    return { from: parseLocalDate(tempStart), to: parseLocalDate(tempEnd) };
  }, [tempStart, tempEnd]);

  const handleOpenChange = useCallback((isOpen: boolean) => {
    if (isOpen) {
      setTempStart(customStart);
      setTempEnd(customEnd);
    }
    setOpen(isOpen);
  }, [customStart, customEnd]);

  const label = formatLabel(rangeKey, customStart, customEnd);
  const totalDays = daysBetween(tempStart, tempEnd);

  const triggerButton = (
    <button
      className={cn(
        "h-8 px-3 rounded-lg text-xs font-medium border border-border",
        "bg-secondary/50 text-foreground flex items-center gap-2",
        "hover:bg-secondary hover:border-primary/20 transition-all duration-150",
        rangeKey === "custom" && "border-primary/30 bg-primary/5"
      )}
    >
      <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="font-mono tracking-wide">{label}</span>
    </button>
  );

  const bodyProps = {
    rangeKey,
    tempStart,
    tempEnd,
    totalDays,
    calendarRange,
    onPreset: handlePreset,
    onCalendarSelect: handleCalendarSelect,
    onApply: applyCustom,
  };

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={handleOpenChange}>
        <DrawerTrigger asChild>
          {triggerButton}
        </DrawerTrigger>
        <DrawerContent className="p-0">
          <PickerBody {...bodyProps} vertical={true} />
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        {triggerButton}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="end" sideOffset={8}>
        <PickerBody {...bodyProps} vertical={false} />
      </PopoverContent>
    </Popover>
  );
}
