import { useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSpyOffers } from "@/hooks/useSpyOffers";
import {
  DEFAULT_SPY_FILTERS,
  SPY_CATEGORY_LABELS,
  SPY_CATEGORY_TABS,
  SPY_PAGE_SIZE,
  type SpyCategoryTab,
  type SpyOfferFilters,
} from "@/types/spy";
import { SpyFiltersBar } from "@/components/spy/SpyFiltersBar";
import { SpyOfferCard, SpyOfferCardSkeleton } from "@/components/spy/SpyOfferCard";
import { NewOfferDialog } from "@/components/spy/NewOfferDialog";
import { SpyAlertsBell } from "@/components/spy/SpyAlertsBell";
import { SpyWeeklyPulse } from "@/components/spy/SpyWeeklyPulse";

const LS_KEY = "spy_v2_filters";

export default function Spy() {
  const [filters, setFilters] = useState<SpyOfferFilters>(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) return { ...DEFAULT_SPY_FILTERS, ...JSON.parse(raw) };
    } catch {}
    return DEFAULT_SPY_FILTERS;
  });
  const [page, setPage] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem(LS_KEY, JSON.stringify(filters));
  }, [filters]);

  // Reset page on filter/tab change
  useEffect(() => {
    setPage(0);
  }, [filters.tab, filters.search, filters.subnicho, filters.idioma, filters.trafego, filters.nicho, filters.order]);

  const { data, isLoading, isFetching, refetch } = useSpyOffers({ filters, page });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;

  const setTab = (t: SpyCategoryTab) => setFilters((f) => ({ ...f, tab: t }));

  const countLabel = useMemo(() => {
    if (isLoading) return "carregando…";
    if (total === 0) return "0 ofertas";
    const from = page * SPY_PAGE_SIZE + 1;
    const to = Math.min(from + rows.length - 1, total);
    return `${from}–${to} de ${total}`;
  }, [isLoading, total, page, rows.length]);

  return (
    <div className="space-y-4 p-3 md:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">🕵️ GTX Spy</h1>
          <p className="text-xs md:text-sm text-muted-foreground hidden sm:block">
            Swipe File de ofertas. Inspire-se, organize ângulos vencedores e monte seu arsenal.
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <SpyAlertsBell />
          <Button
            size="sm"
            variant="outline"
            onClick={() => refetch()}
            disabled={isFetching}
            className="h-9 px-2 md:px-3 rounded-lg"
          >
            <RefreshCw className={`h-3.5 w-3.5 md:mr-1.5 ${isFetching ? "animate-spin" : ""}`} />
            <span className="hidden md:inline">Atualizar</span>
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)} className="h-9 px-2.5 md:px-3 rounded-lg">
            <Plus className="h-3.5 w-3.5 md:mr-1.5" />
            <span className="hidden md:inline">Adicionar Oferta</span>
            <span className="md:hidden">Nova</span>
          </Button>
        </div>
      </div>

      {/* Pulse 7d do mercado */}
      <SpyWeeklyPulse />


      {/* Tabs — scrollable horizontal em mobile */}
      <Tabs value={filters.tab} onValueChange={(v) => setTab(v as SpyCategoryTab)}>
        <div className="-mx-3 md:mx-0 overflow-x-auto scrollbar-none">
          <TabsList className="bg-card border border-border h-auto p-1 flex w-max md:w-auto md:flex-wrap mx-3 md:mx-0 rounded-lg">
            {SPY_CATEGORY_TABS.map((t) => (
              <TabsTrigger key={t} value={t} className="text-xs px-3 py-1.5 whitespace-nowrap data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-md">
                {SPY_CATEGORY_LABELS[t]}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
      </Tabs>

      {/* Filters */}
      <SpyFiltersBar filters={filters} onChange={setFilters} />

      {/* Count */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{countLabel}</p>
        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <Button size="icon" variant="ghost" className="h-7 w-7" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span className="text-xs text-muted-foreground tabular-nums px-2">
              {page + 1} / {totalPages}
            </span>
            <Button size="icon" variant="ghost" className="h-7 w-7" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
          {Array.from({ length: 12 }).map((_, i) => <SpyOfferCardSkeleton key={i} />)}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState onAdd={() => setCreateOpen(true)} tab={filters.tab} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
          {rows.map((o) => <SpyOfferCard key={o.id} offer={o} />)}
        </div>
      )}

      <NewOfferDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

function EmptyState({ onAdd, tab }: { onAdd: () => void; tab: SpyCategoryTab }) {
  const msg =
    tab === "favoritos"
      ? "Você ainda não favoritou nenhuma oferta. Clique no ♥ no canto das ofertas para começar seu swipe."
      : "Nenhuma oferta encontrada com esses filtros. Limpe os filtros ou adicione uma nova oferta.";
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-3 border border-dashed border-border rounded-xl bg-card/50">
      <div className="text-4xl opacity-30">🕵️</div>
      <p className="text-sm text-muted-foreground max-w-md text-center">{msg}</p>
      {tab !== "favoritos" && (
        <Button size="sm" onClick={onAdd} className="rounded-lg">
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Adicionar Oferta
        </Button>
      )}
    </div>
  );
}
