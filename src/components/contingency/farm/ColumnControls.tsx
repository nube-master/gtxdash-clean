import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { ArrowUpDown, Filter, Check } from "lucide-react";
import {
  INACTIVE_REASON_META, SORT_OPTIONS,
  type InactiveReason, type SortMode,
} from "./farmHelpers";

/* Pills horizontais — usado só na coluna "Inativa" */
export function InactiveReasonPills({
  current, counts, onChange,
}: {
  current: InactiveReason;
  counts: Record<Exclude<InactiveReason, "all">, number>;
  onChange: (r: InactiveReason) => void;
}) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const reasons: InactiveReason[] = ["all", "bm_down", "limit", "policy", "no_ads", "other"];

  return (
    <div className="px-2 pt-2 pb-1 flex flex-wrap gap-1 border-b border-border/40">
      {reasons.map((r) => {
        const active = current === r;
        const isAll = r === "all";
        const meta = isAll ? null : INACTIVE_REASON_META[r as Exclude<InactiveReason, "all">];
        const count = isAll ? total : counts[r as Exclude<InactiveReason, "all">] || 0;
        if (!isAll && count === 0 && !active) return null;
        return (
          <button
            key={r}
            onClick={() => onChange(r)}
            className={`
              text-[9px] px-1.5 py-0.5 rounded-full border transition-all
              ${active
                ? meta
                  ? `${meta.tone} font-bold ring-1 ring-offset-0`
                  : "bg-foreground text-background border-foreground font-bold"
                : "border-border/40 text-muted-foreground hover:text-foreground hover:border-foreground/40"}
            `}
          >
            {isAll ? "Todas" : meta!.short} {count > 0 && <span className="font-mono ml-0.5 opacity-80">{count}</span>}
          </button>
        );
      })}
    </div>
  );
}

/* Botão pequeno de ordenação dentro do header */
export function ColumnSortMenu({
  current, onChange,
}: {
  current: SortMode;
  onChange: (m: SortMode) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm" variant="ghost"
          className="h-5 w-5 p-0 text-muted-foreground/60 hover:text-foreground"
          onClick={(e) => e.stopPropagation()}
          title="Ordenar"
        >
          <ArrowUpDown className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel className="text-[10px] uppercase tracking-wider">
          Ordenar por
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {SORT_OPTIONS.map((opt) => (
          <DropdownMenuItem
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className="text-xs gap-2"
          >
            {current === opt.value ? <Check className="h-3 w-3" /> : <span className="w-3" />}
            {opt.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
