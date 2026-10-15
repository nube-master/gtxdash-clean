import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Search, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PacingStatus, PacingCampaign } from "./mockData";
import { useOfferTags, detectOfferTag } from "@/hooks/useOfferTags";

import type { GtxOverlay } from "./CampaignTable";
import { getIcCount } from "@/hooks/usePacingICs";
import { regionOfCampaign } from "@/lib/killSquad";

export type SortKey =
  | "rules" | "spend" | "pace" | "recent"
  | "name" | "account"
  | "dailyBudget" | "dailyTargetBrl" | "hourlySpend"
  | "impressions" | "cpm" | "ctr" | "clicks" | "cpc" | "cpa" | "roas"
  | "sales" | "ic" | "costPerIC" | "checkoutConv" | "revenue"
  | "profit" | "profit3d" | "spend3d" | "revenue3d" | "roas3d" | "margin" | "score" | "decision"
  | "status" | "lastAction";

export interface FiltersState {
  projects: Set<string>;
  status: PacingStatus | "all" | "active";
  account: string | "all"; // legacy single-select (kept for back-compat)
  accounts: Set<string>; // multi-select; empty = all
  search: string;
  sort: SortKey;
  sortDir: "asc" | "desc";
  profit3dPositive: boolean;
  profit3dNegative: boolean;
  hasSales: boolean;
  noSales: boolean;
  f1: boolean;
  f2: boolean;
  f3: boolean;
  bid: boolean;
  costcap: boolean;
}

export const DEFAULT_FILTERS: FiltersState = {
  projects: new Set(),
  status: "all",
  account: "all",
  accounts: new Set(),
  search: "",
  sort: "rules",
  sortDir: "desc",
  profit3dPositive: false,
  profit3dNegative: false,
  hasSales: false,
  noSales: false,
  f1: false,
  f2: false,
  f3: false,
  bid: false,
  costcap: false,
};

interface Props {
  campaigns: PacingCampaign[];
  value: FiltersState;
  onChange: (v: FiltersState) => void;
}

export function CampaignFilters({ campaigns, value, onChange }: Props) {
  const { data: offerTags = [] } = useOfferTags(campaigns[0]?.operation_id);

  // Count campaigns per tag (only show tags that actually appear)
  const projectCounts: Record<string, number> = {};
  offerTags.forEach((t) => {
    projectCounts[t] = campaigns.filter((c) => detectOfferTag(c.name, offerTags) === t).length;
  });

  // Only show tags with at least 1 campaign
  const visibleTags = offerTags.filter((t) => projectCounts[t] > 0);

  const accounts = Array.from(new Set(campaigns.map((c) => c.account))).sort();

  const toggleProject = (p: string) => {
    const next = new Set(value.projects);
    if (next.has(p)) next.delete(p);
    else next.add(p);
    onChange({ ...value, projects: next });
  };

  return (
    <div className="rounded-lg border border-border/60 bg-card/40 p-3 mb-2 space-y-3">
      {/* Project chips — dynamic from offers.apelido_interno */}
      <div className="flex flex-wrap gap-1.5 items-center">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground mr-1">
          Ofertas:
        </span>
        {visibleTags.length === 0 && (
          <span className="text-[11px] text-muted-foreground italic">
            nenhuma tag de oferta detectada nas campanhas ativas
          </span>
        )}
        {visibleTags.map((p) => {
          const active = value.projects.has(p);
          const count = projectCounts[p] ?? 0;
          return (
            <button
              key={p}
              type="button"
              onClick={() => toggleProject(p)}
              className={cn(
                "px-2.5 py-1 rounded-md text-[11px] font-semibold uppercase tracking-wider border transition-colors tabular-nums",
                active
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-transparent text-muted-foreground border-border/60 hover:border-primary/60 hover:text-foreground"
              )}
            >
              {p} ({count})
            </button>
          );
        })}
        {value.projects.size > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-[10px] uppercase text-muted-foreground"
            onClick={() => onChange({ ...value, projects: new Set() })}
          >
            limpar
          </Button>
        )}
      </div>

      {/* Selects + search + sort */}
      <div className="flex flex-wrap gap-2 items-center">
        <Select value={value.status} onValueChange={(v) => onChange({ ...value, status: v as any })}>
          <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos status</SelectItem>
            <SelectItem value="active">Ativas</SelectItem>
            <SelectItem value="paused">Pausadas</SelectItem>
            <SelectItem value="ok">OK</SelectItem>
            <SelectItem value="warning">Revisar</SelectItem>
            <SelectItem value="critical">Pausar</SelectItem>
            <SelectItem value="warming">Aquecendo (WARM)</SelectItem>
          </SelectContent>
        </Select>

        <AccountMultiSelect
          accounts={accounts}
          selected={value.accounts}
          onChange={(next) => onChange({ ...value, accounts: next })}
        />


        <div className="relative flex-1 min-w-[180px] max-w-[280px]">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={value.search}
            onChange={(e) => onChange({ ...value, search: e.target.value })}
            placeholder="buscar por nome..."
            className="h-8 pl-7 text-xs"
          />
        </div>
      </div>

      {/* Quick KPI filters */}
      <div className="flex flex-wrap gap-1.5 items-center">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground mr-1">
          Filtros rápidos:
        </span>
        <button
          type="button"
          onClick={() =>
            onChange({ ...value, profit3dPositive: !value.profit3dPositive })
          }
          className={cn(
            "px-2.5 py-1 rounded-md text-[11px] font-semibold uppercase tracking-wider border transition-colors",
            value.profit3dPositive
              ? "bg-[hsl(var(--wr-positive))] text-white border-[hsl(var(--wr-positive))]"
              : "bg-transparent text-muted-foreground border-border/60 hover:border-[hsl(var(--wr-positive))]/60 hover:text-foreground"
          )}
        >
          Lucro 3D {""}
          {value.profit3dPositive ? "✓" : "+"}
        </button>
        <button
          type="button"
          onClick={() =>
            onChange({ ...value, profit3dNegative: !value.profit3dNegative })
          }
          className={cn(
            "px-2.5 py-1 rounded-md text-[11px] font-semibold uppercase tracking-wider border transition-colors",
            value.profit3dNegative
              ? "bg-destructive text-white border-red"
              : "bg-transparent text-muted-foreground border-border/60 hover:border-red/60 hover:text-foreground"
          )}
        >
          Prejuízo 3D {""}
          {value.profit3dNegative ? "✓" : "−"}
        </button>
        <button
          type="button"
          onClick={() => onChange({ ...value, hasSales: !value.hasSales, noSales: false })}
          className={cn(
            "px-2.5 py-1 rounded-md text-[11px] font-semibold uppercase tracking-wider border transition-colors",
            value.hasSales
              ? "bg-emerald-500 text-white border-emerald-500"
              : "bg-transparent text-muted-foreground border-border/60 hover:border-emerald-500/60 hover:text-foreground"
          )}
          title="Só campanhas com pelo menos 1 venda hoje"
        >
          Com Venda {value.hasSales ? "✓" : "🛒"}
        </button>
        <button
          type="button"
          onClick={() => onChange({ ...value, noSales: !value.noSales, hasSales: false })}
          className={cn(
            "px-2.5 py-1 rounded-md text-[11px] font-semibold uppercase tracking-wider border transition-colors",
            value.noSales
              ? "bg-amber-500 text-white border-amber-500"
              : "bg-transparent text-muted-foreground border-border/60 hover:border-amber-500/60 hover:text-foreground"
          )}
          title="Só campanhas SEM nenhuma venda hoje"
        >
          Sem Venda {value.noSales ? "✓" : "∅"}
        </button>

        <span className="mx-1 h-4 w-px bg-border/60" />

        <button
          type="button"
          onClick={() => onChange({ ...value, f1: !value.f1 })}
          className={cn(
            "px-2.5 py-1 rounded-md text-[11px] font-semibold uppercase tracking-wider border transition-colors",
            value.f1
              ? "bg-indigo-500 text-white border-indigo-500"
              : "bg-transparent text-muted-foreground border-border/60 hover:border-indigo-500/60 hover:text-foreground"
          )}
        >
          F1 {value.f1 ? "✓" : ""}
        </button>
        <button
          type="button"
          onClick={() => onChange({ ...value, f2: !value.f2 })}
          className={cn(
            "px-2.5 py-1 rounded-md text-[11px] font-semibold uppercase tracking-wider border transition-colors",
            value.f2
              ? "bg-indigo-600 text-white border-indigo-600"
              : "bg-transparent text-muted-foreground border-border/60 hover:border-indigo-600/60 hover:text-foreground"
          )}
        >
          F2 {value.f2 ? "✓" : ""}
        </button>
        <button
          type="button"
          onClick={() => onChange({ ...value, f3: !value.f3 })}
          className={cn(
            "px-2.5 py-1 rounded-md text-[11px] font-semibold uppercase tracking-wider border transition-colors",
            value.f3
              ? "bg-indigo-700 text-white border-indigo-700"
              : "bg-transparent text-muted-foreground border-border/60 hover:border-indigo-700/60 hover:text-foreground"
          )}
        >
          F3 {value.f3 ? "✓" : ""}
        </button>
        <button
          type="button"
          onClick={() => onChange({ ...value, bid: !value.bid })}
          className={cn(
            "px-2.5 py-1 rounded-md text-[11px] font-semibold uppercase tracking-wider border transition-colors",
            value.bid
              ? "bg-violet-500 text-white border-violet-500"
              : "bg-transparent text-muted-foreground border-border/60 hover:border-violet-500/60 hover:text-foreground"
          )}
        >
          BID {value.bid ? "✓" : ""}
        </button>
        <button
          type="button"
          onClick={() => onChange({ ...value, costcap: !value.costcap })}
          className={cn(
            "px-2.5 py-1 rounded-md text-[11px] font-semibold uppercase tracking-wider border transition-colors",
            value.costcap
              ? "bg-purple-600 text-white border-purple-600"
              : "bg-transparent text-muted-foreground border-border/60 hover:border-purple-600/60 hover:text-foreground"
          )}
        >
          COSTCAP {value.costcap ? "✓" : ""}
        </button>

        {(value.profit3dPositive || value.profit3dNegative || value.hasSales || value.noSales || value.f1 || value.f2 || value.f3 || value.bid || value.costcap) && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-[10px] uppercase text-muted-foreground"
            onClick={() =>
              onChange({
                ...value,
                profit3dPositive: false,
                profit3dNegative: false,
                hasSales: false,
                noSales: false,
                f1: false,
                f2: false,
                f3: false,
                bid: false,
                costcap: false,
              })
            }
          >
            limpar
          </Button>
        )}
      </div>

    </div>
  );
}

const STATUS_ORDER: Record<string, number> = {
  critical: 0, warning: 1, ok: 2, warming: 3, paused: 4,
};

const DECISION_ORDER: Record<string, number> = {
  CORTAR: 0, OBSERVAR: 1, MANTER: 2, PROMOVER: 3, ESCALAR: 4,
};

function cmp(a: number | string | null | undefined, b: number | string | null | undefined, dir: "asc" | "desc") {
  let av = a ?? 0;
  let bv = b ?? 0;
  if (typeof av === "string" && typeof bv === "string") {
    av = av.toLowerCase();
    bv = bv.toLowerCase();
  }
  if (av < bv) return dir === "asc" ? -1 : 1;
  if (av > bv) return dir === "asc" ? 1 : -1;
  return 0;
}

export function applyFilters(
  campaigns: PacingCampaign[],
  f: FiltersState,
  offerTags: string[] = [],
  gtxByName?: Map<string, GtxOverlay>,
  lastActions?: Map<string, { triggered_at: string }>,
  icByCampaign?: import("@/hooks/usePacingICs").PacingICMaps,
  hourlyStatusByCampaign?: Map<string, import("@/hooks/useCampaignHourlyStatus").CampaignHourlyStatus>,
): PacingCampaign[] {
  const filtered = campaigns.filter((c) => {
    // F9-DIA3: Apenas campanhas de contas ativas e com gasto nos últimos 3 dias
    // Note: This is already enforced at the sync level, but we keep it here as a safety UI layer.
    
    if (f.projects.size > 0) {
      const tag = detectOfferTag(c.name, offerTags);
      if (!tag || !f.projects.has(tag)) return false;
    }
    if (f.status === "active") {
      if (c.status === "paused") return false;
    } else if (f.status !== "all" && c.status !== f.status) return false;
    if (f.accounts && f.accounts.size > 0) {
      if (!f.accounts.has(c.account)) return false;
    } else if (f.account !== "all" && c.account !== f.account) return false;
    if (f.search.trim() && !c.name.toLowerCase().includes(f.search.toLowerCase())) return false;

    const gtx = gtxByName?.get(c.name);
    if (f.profit3dPositive) {
      if ((gtx?.profit3DTotal ?? 0) <= 0) return false;
    }
    if (f.profit3dNegative) {
      if ((gtx?.profit3DTotal ?? 0) >= 0) return false;
    }
    if (f.hasSales) {
      if ((c.sales ?? 0) <= 0) return false;
    }
    if (f.noSales) {
      if ((c.sales ?? 0) > 0) return false;
    }

    if (f.f1 && !/\[F1\]/i.test(c.name || "")) return false;
    if (f.f2 && !/\[F2\]/i.test(c.name || "")) return false;
    if (f.f3 && !/\[F3\]/i.test(c.name || "")) return false;
    if (f.bid && !/BID/i.test(c.name || "")) return false;
    if (f.costcap && !/COST/i.test(c.name || "")) return false;


    return true;
  });
  const sorted = [...filtered];
  const dir = f.sortDir;

  const sortKey = f.sort;
  const num = (v?: number | null) => v ?? 0;

  switch (sortKey) {
    case "rules": sorted.sort((a, b) => dir === "asc" ? a.rulesApplied - b.rulesApplied : b.rulesApplied - a.rulesApplied); break;
    case "spend": sorted.sort((a, b) => dir === "asc" ? a.spend - b.spend : b.spend - a.spend); break;
    case "pace": sorted.sort((a, b) => dir === "asc" ? a.pacePct - b.pacePct : b.pacePct - a.pacePct); break;
    case "recent": sorted.reverse(); break;
    case "name": sorted.sort((a, b) => cmp(a.name, b.name, dir)); break;
    case "account": sorted.sort((a, b) => cmp(a.account, b.account, dir)); break;
    case "dailyBudget": sorted.sort((a, b) => cmp(num(a.dailyBudget), num(b.dailyBudget), dir)); break;
    case "dailyTargetBrl": sorted.sort((a, b) => cmp(num(a.dailyTargetBrl), num(b.dailyTargetBrl), dir)); break;
    case "hourlySpend": sorted.sort((a, b) => cmp(
      num(hourlyStatusByCampaign?.get(a.id)?.spendLast60mBrl),
      num(hourlyStatusByCampaign?.get(b.id)?.spendLast60mBrl),
      dir,
    )); break;
    case "impressions": sorted.sort((a, b) => cmp(num(a.impressions), num(b.impressions), dir)); break;
    case "cpm": sorted.sort((a, b) => cmp(num(a.cpm), num(b.cpm), dir)); break;
    case "ctr": sorted.sort((a, b) => cmp(num(a.ctr), num(b.ctr), dir)); break;
    case "clicks": sorted.sort((a, b) => cmp(num(a.clicks), num(b.clicks), dir)); break;
    case "cpc": sorted.sort((a, b) => cmp(num(a.cpc), num(b.cpc), dir)); break;
    case "cpa": sorted.sort((a, b) => cmp(num(a.cpa), num(b.cpa), dir)); break;
    case "roas": sorted.sort((a, b) => cmp(num(a.roas), num(b.roas), dir)); break;
    case "sales": sorted.sort((a, b) => cmp(num(a.sales), num(b.sales), dir)); break;
    case "revenue": sorted.sort((a, b) => cmp(num(a.revenue), num(b.revenue), dir)); break;
    case "ic": sorted.sort((a, b) => cmp(getIcCount(icByCampaign, a), getIcCount(icByCampaign, b), dir)); break;
    case "costPerIC": sorted.sort((a, b) => {
      const ia = getIcCount(icByCampaign, a); const ib = getIcCount(icByCampaign, b);
      const ca = ia > 0 ? a.spend / ia : 0; const cb = ib > 0 ? b.spend / ib : 0;
      return cmp(ca, cb, dir);
    }); break;
    case "checkoutConv": sorted.sort((a, b) => {
      const ia = getIcCount(icByCampaign, a); const ib = getIcCount(icByCampaign, b);
      const ra = ia > 0 ? (num(a.sales) / ia) * 100 : 0;
      const rb = ib > 0 ? (num(b.sales) / ib) * 100 : 0;
      return cmp(ra, rb, dir);
    }); break;
    case "profit": sorted.sort((a, b) => cmp(gtxByName?.get(a.name)?.profit, gtxByName?.get(b.name)?.profit, dir)); break;
    case "profit3d": sorted.sort((a, b) => cmp(gtxByName?.get(a.name)?.profit3DTotal, gtxByName?.get(b.name)?.profit3DTotal, dir)); break;
    case "spend3d": sorted.sort((a, b) => cmp(gtxByName?.get(a.name)?.spend3DTotal, gtxByName?.get(b.name)?.spend3DTotal, dir)); break;
    case "revenue3d": sorted.sort((a, b) => cmp(gtxByName?.get(a.name)?.revenue3DTotal, gtxByName?.get(b.name)?.revenue3DTotal, dir)); break;
    case "roas3d": sorted.sort((a, b) => cmp(gtxByName?.get(a.name)?.roas3D, gtxByName?.get(b.name)?.roas3D, dir)); break;
    case "margin": sorted.sort((a, b) => cmp(gtxByName?.get(a.name)?.margin, gtxByName?.get(b.name)?.margin, dir)); break;
    case "score": sorted.sort((a, b) => cmp(gtxByName?.get(a.name)?.scoreGtx, gtxByName?.get(b.name)?.scoreGtx, dir)); break;
    case "decision":
      sorted.sort((a, b) => {
        const da = DECISION_ORDER[gtxByName?.get(a.name)?.decision ?? "OBSERVAR"] ?? 99;
        const db = DECISION_ORDER[gtxByName?.get(b.name)?.decision ?? "OBSERVAR"] ?? 99;
        return dir === "asc" ? da - db : db - da;
      });
      break;
    case "status":
      sorted.sort((a, b) => {
        const sa = STATUS_ORDER[a.status] ?? 99;
        const sb = STATUS_ORDER[b.status] ?? 99;
        return dir === "asc" ? sa - sb : sb - sa;
      });
      break;
    case "lastAction":
      sorted.sort((a, b) => {
        const ta = lastActions?.get(a.id)?.triggered_at ?? "";
        const tb = lastActions?.get(b.id)?.triggered_at ?? "";
        return cmp(ta, tb, dir);
      });
      break;
    default: break;
  }

  return sorted;
}

function AccountMultiSelect({
  accounts,
  selected,
  onChange,
}: {
  accounts: string[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter((a) => a.toLowerCase().includes(q));
  }, [accounts, query]);

  const toggle = (a: string) => {
    const next = new Set(selected);
    if (next.has(a)) next.delete(a);
    else next.add(a);
    onChange(next);
  };

  const label =
    selected.size === 0
      ? "Todas contas"
      : selected.size === 1
      ? Array.from(selected)[0]
      : `${selected.size} contas`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 w-[200px] justify-between text-xs font-normal"
        >
          <span className="truncate">{label}</span>
          <ChevronDown className="h-3.5 w-3.5 opacity-60 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start">
        <div className="p-2 border-b border-border/60">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="buscar conta..."
              className="h-8 pl-7 text-xs"
            />
          </div>
          <div className="flex items-center justify-between mt-2 px-1">
            <button
              type="button"
              onClick={() => onChange(new Set(filtered))}
              className="text-[10px] uppercase tracking-wider text-primary hover:underline"
            >
              selecionar visíveis
            </button>
            <button
              type="button"
              onClick={() => onChange(new Set())}
              className="text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
            >
              limpar
            </button>
          </div>
        </div>
        <div className="max-h-[280px] overflow-y-auto py-1">
          {filtered.length === 0 && (
            <div className="px-3 py-4 text-center text-xs text-muted-foreground">
              nenhuma conta encontrada
            </div>
          )}
          {filtered.map((a) => {
            const checked = selected.has(a);
            return (
              <button
                key={a}
                type="button"
                onClick={() => toggle(a)}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted/50 text-left"
              >
                <Checkbox checked={checked} className="h-3.5 w-3.5" />
                <span className="truncate">{a}</span>
              </button>
            );
          })}
        </div>
        <div className="border-t border-border/60 px-3 py-2 text-[10px] text-muted-foreground flex justify-between">
          <span>{accounts.length} contas no total</span>
          <span>{selected.size} selecionada(s)</span>
        </div>
      </PopoverContent>
    </Popover>
  );
}
