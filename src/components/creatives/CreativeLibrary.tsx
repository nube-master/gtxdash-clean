import { useState, useMemo, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Search } from "lucide-react";
import { type CreativeRow } from "@/lib/creativeUtils";
import { CreativeLibraryCard } from "./CreativeLibraryCard";
import { CreativeDetailModal } from "./CreativeDetailModal";

interface Props {
  creatives: CreativeRow[];
  sharedCreativeId?: string | null;
  onSharedCreativeConsumed?: () => void;
}

type StructureFilter = "all" | "testing" | "scale";

function getStructurePriority(c: CreativeRow): number {
  if (c.isScaleStructure || c.isF3) return 0;
  if (c.isTestStructure) return 1;
  if (c.sales === 0 && c.spend > 0) return 3;
  return 2;
}

export function CreativeLibrary({ creatives, sharedCreativeId, onSharedCreativeConsumed }: Props) {
  const [search, setSearch] = useState("");
  const [filterCopy, setFilterCopy] = useState("all");
  const [filterEditor, setFilterEditor] = useState("all");
  const [filterStructure, setFilterStructure] = useState<StructureFilter>("all");
  const [filterRoi, setFilterRoi] = useState("all");
  const [filterHook, setFilterHook] = useState("all");
  const [visibleCount, setVisibleCount] = useState(24);
  const [selectedCreativeId, setSelectedCreativeId] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Derive the selected creative from the latest data so metrics stay fresh
  const selectedCreative = useMemo(
    () => (selectedCreativeId ? creatives.find(c => c.creativeId === selectedCreativeId) ?? null : null),
    [selectedCreativeId, creatives]
  );

  // Auto-open shared creative
  useEffect(() => {
    if (sharedCreativeId && creatives.length > 0 && !selectedCreativeId) {
      const found = creatives.find(c => c.creativeId === sharedCreativeId);
      if (found) {
        setSelectedCreativeId(found.creativeId);
        onSharedCreativeConsumed?.();
      }
    }
  }, [sharedCreativeId, creatives]);

  const uniqueCopys = useMemo(() => {
    const set = new Set<string>();
    creatives.forEach((c) => { if (c.copyWriter) set.add(c.copyWriter); });
    return Array.from(set).sort();
  }, [creatives]);

  const uniqueEditors = useMemo(() => {
    const set = new Set<string>();
    creatives.forEach((c) => { if (c.editor) set.add(c.editor); });
    return Array.from(set).sort();
  }, [creatives]);

  const { topProfitId, topSalesId } = useMemo(() => {
    let topProfit = -Infinity, tpId = "";
    let topSales = -1, tsId = "";
    creatives.forEach((c) => {
      if (c.profit > topProfit) { topProfit = c.profit; tpId = c.creativeId; }
      if (c.sales > topSales) { topSales = c.sales; tsId = c.creativeId; }
    });
    return { topProfitId: tpId, topSalesId: tsId };
  }, [creatives]);

  const filtered = useMemo(() => {
    let data = creatives;
    if (search) {
      const q = search.toLowerCase();
      data = data.filter((c) =>
        c.creativeId.toLowerCase().includes(q) ||
        c.adNames.some((n) => n.toLowerCase().includes(q)) ||
        (c.copyWriter && c.copyWriter.toLowerCase().includes(q)) ||
        (c.editor && c.editor.toLowerCase().includes(q))
      );
    }
    if (filterCopy !== "all") data = data.filter((c) => c.copyWriter === filterCopy);
    if (filterEditor !== "all") data = data.filter((c) => c.editor === filterEditor);
    if (filterStructure === "testing") data = data.filter((c) => c.isTestStructure);
    if (filterStructure === "scale") data = data.filter((c) => c.isScaleStructure || c.isF3);
    if (filterRoi === "positive") data = data.filter((c) => c.roi >= 1);
    if (filterRoi === "negative") data = data.filter((c) => c.roi < 1 && c.spend > 0);
    if (filterHook === "high") data = data.filter((c) => c.hookRate >= 40);
    if (filterHook === "low") data = data.filter((c) => c.hookRate < 40 && c.hookRate > 0);

    // Smart sort: structure priority, then ROI DESC
    return [...data].sort((a, b) => {
      const pa = getStructurePriority(a);
      const pb = getStructurePriority(b);
      if (pa !== pb) return pa - pb;
      return b.roi - a.roi;
    });
  }, [creatives, search, filterCopy, filterEditor, filterStructure, filterRoi, filterHook]);

  useEffect(() => { setVisibleCount(24); }, [search, filterCopy, filterEditor, filterStructure, filterRoi, filterHook]);

  useEffect(() => {
    if (!sentinelRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && visibleCount < filtered.length) {
          setVisibleCount((v) => Math.min(v + 12, filtered.length));
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [visibleCount, filtered.length]);

  const visible = filtered.slice(0, visibleCount);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input placeholder="Buscar criativo..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-8 text-xs" />
        </div>
        <Select value={filterCopy} onValueChange={setFilterCopy}>
          <SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue placeholder="Copy" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos Copys</SelectItem>
            {uniqueCopys.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterEditor} onValueChange={setFilterEditor}>
          <SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue placeholder="Editor" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos Editores</SelectItem>
            {uniqueEditors.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterStructure} onValueChange={(v) => setFilterStructure(v as StructureFilter)}>
          <SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos Status</SelectItem>
            <SelectItem value="testing">Teste</SelectItem>
            <SelectItem value="scale">Escala</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterRoi} onValueChange={setFilterRoi}>
          <SelectTrigger className="h-8 w-[120px] text-xs"><SelectValue placeholder="ROI" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todo ROI</SelectItem>
            <SelectItem value="positive">ROI ≥ 1</SelectItem>
            <SelectItem value="negative">ROI &lt; 1</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterHook} onValueChange={setFilterHook}>
          <SelectTrigger className="h-8 w-[120px] text-xs"><SelectValue placeholder="Hook" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todo Hook</SelectItem>
            <SelectItem value="high">Hook ≥ 40%</SelectItem>
            <SelectItem value="low">Hook &lt; 40%</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <p className="text-xs text-muted-foreground font-mono">
        {filtered.length} criativo(s) • Ordenado por: Escala → Teste → ROI
      </p>

      {/* Card Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {visible.map((c) => (
          <CreativeLibraryCard
            key={c.creativeId}
            creative={c}
            isMostProfit={c.creativeId === topProfitId && c.profit > 0}
            isTopSales={c.creativeId === topSalesId && c.sales > 0}
            onClick={() => setSelectedCreativeId(c.creativeId)}
          />
        ))}
      </div>

      {visibleCount < filtered.length && (
        <div ref={sentinelRef} className="h-10 flex items-center justify-center">
          <span className="text-xs text-muted-foreground font-mono">Carregando mais...</span>
        </div>
      )}

      {filtered.length === 0 && (
        <div className="text-center py-12 text-muted-foreground text-sm">
          Nenhum criativo encontrado com os filtros selecionados.
        </div>
      )}

      {/* Detail Modal */}
      <CreativeDetailModal
        creative={selectedCreative}
        open={!!selectedCreative}
        onClose={() => setSelectedCreativeId(null)}
      />
    </div>
  );
}
