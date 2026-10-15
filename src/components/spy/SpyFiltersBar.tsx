import { Search, Tag, X, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  SPY_IDIOMAS,
  SPY_NICHOS,
  SPY_ORDER,
  SPY_STATUS,
  SPY_STATUS_LABELS,
  SPY_SUBNICHOS,
  SPY_TRAFFIC,
  type SpyOfferFilters,
  type SpyStatus,
} from "@/types/spy";

interface Props {
  filters: SpyOfferFilters;
  onChange: (next: SpyOfferFilters) => void;
}

const ANY = "__any__";

export function SpyFiltersBar({ filters, onChange }: Props) {
  const set = <K extends keyof SpyOfferFilters>(k: K, v: SpyOfferFilters[K]) =>
    onChange({ ...filters, [k]: v });

  const hasActive =
    filters.search.trim() || filters.subnicho || filters.idioma || filters.trafego || filters.nicho || (filters.status?.length ?? 0) > 0;

  const toggleStatus = (s: SpyStatus) => {
    const cur = filters.status ?? [];
    const next = cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s];
    set("status", next);
  };

  return (
    <div className="space-y-2">
      {/* Linha 1: Search + Tag */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={filters.search}
            onChange={(e) => set("search", e.target.value)}
            placeholder="Procure pelas melhores ofertas"
            className="pl-9 h-10 text-sm"
          />
        </div>
        <Button variant="outline" size="icon" className="h-10 w-10 shrink-0" aria-label="Tags">
          <Tag className="h-4 w-4" />
        </Button>
      </div>

      {/* Linha 2: Dropdowns */}
      <div className="flex flex-wrap items-center gap-2">
        <FilterSelect
          value={filters.subnicho}
          label="Tipo"
          allLabel="Todos"
          options={SPY_SUBNICHOS as readonly string[]}
          onChange={(v) => set("subnicho", v)}
        />
        <FilterSelect
          value={filters.idioma}
          label="Idioma"
          allLabel="Todos"
          options={SPY_IDIOMAS as readonly string[]}
          onChange={(v) => set("idioma", v)}
          showSelectedOnly
        />
        <FilterSelect
          value={filters.trafego}
          label="Tráfego"
          allLabel="Todas"
          options={SPY_TRAFFIC as readonly string[]}
          onChange={(v) => set("trafego", v as any)}
        />
        <FilterSelect
          value={filters.nicho}
          label="Nicho"
          allLabel="Todos"
          options={SPY_NICHOS as readonly string[]}
          onChange={(v) => set("nicho", v)}
        />

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 px-3 text-xs gap-1.5">
              Status{filters.status?.length ? `: ${filters.status.length}` : ": Todos"}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-48 p-1">
            {SPY_STATUS.map((s) => {
              const active = filters.status?.includes(s);
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggleStatus(s)}
                  className="w-full flex items-center justify-between px-2 py-1.5 text-xs rounded-sm hover:bg-accent"
                >
                  <span>{SPY_STATUS_LABELS[s]}</span>
                  {active && <Check className="h-3.5 w-3.5 text-primary" />}
                </button>
              );
            })}
          </PopoverContent>
        </Popover>

        <Select value={filters.order} onValueChange={(v) => set("order", v as any)}>
          <SelectTrigger className="h-9 w-auto min-w-0 gap-1.5 px-3 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SPY_ORDER.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>


        {hasActive && (
          <Button
            variant="ghost"
            size="sm"
            className="h-10 text-xs"
            onClick={() =>
              onChange({
                ...filters,
                search: "",
                subnicho: null,
                idioma: null,
                trafego: null,
                nicho: null,
                status: [],
              })
            }
          >
            <X className="h-3 w-3 mr-1" />
            Limpar
          </Button>
        )}
      </div>
    </div>
  );
}

function FilterSelect({
  value,
  label,
  allLabel,
  options,
  onChange,
  showSelectedOnly,
}: {
  value: string | null;
  label: string;
  allLabel: string;
  options: readonly string[];
  onChange: (v: string | null) => void;
  /** Quando true, o trigger mostra só o valor selecionado (sem "Label: …") — ex.: Idioma → "Inglês". */
  showSelectedOnly?: boolean;
}) {
  const display = value
    ? (showSelectedOnly ? value : `${label}: ${value}`)
    : `${label}: ${allLabel}`;

  return (
    <Select
      value={value ?? ANY}
      onValueChange={(v) => onChange(v === ANY ? null : v)}
    >
      <SelectTrigger className="h-9 w-auto min-w-0 gap-1.5 px-3 text-xs">
        <span className="truncate">{display}</span>
      </SelectTrigger>

      <SelectContent className="max-h-[400px]">
        <SelectItem value={ANY}>{`${label}: ${allLabel}`}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o} value={o}>
            {o}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
