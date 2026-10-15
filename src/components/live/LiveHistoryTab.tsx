import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOperationId } from "@/contexts/OperationContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, History, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { resolveGeo, flagEmoji } from "@/lib/geoCoords";
import { cn } from "@/lib/utils";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

export type HistoryRow = {
  session_id: string;
  player_id: string;
  player_name: string | null;
  product: string | null;
  country: string | null;
  state: string | null;
  city: string | null;
  device_type: string | null;
  current_second_in_video: number | null;
  pitch_reached: boolean;
  cta_clicked: boolean;
  exit_reason: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  ad_id: string | null;
  clickid: string | null;
  started_at: string;
  last_seen_at: string;
};

type Filters = { player_id?: string; product?: string; ad_id?: string };

async function fetchHistory(
  filters: Filters,
  page: number,
  pageSize: number,
  status: string,
  search: string,
  operationId: string,
) {
  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token ?? ANON_KEY;
  const params = new URLSearchParams();
  if (filters.player_id && filters.player_id !== "all") params.set("player_id", filters.player_id);
  if (filters.product && filters.product !== "all") params.set("product", filters.product);
  if (filters.ad_id && filters.ad_id !== "all") params.set("ad_id", filters.ad_id);
  params.set("operation_id", operationId);
  params.set("page", String(page));
  params.set("page_size", String(pageSize));
  if (status && status !== "all") params.set("status", status);
  if (search) params.set("search", search);
  const r = await fetch(`${SUPABASE_URL}/functions/v1/live-history?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}`, apikey: ANON_KEY },
  });
  if (!r.ok) throw new Error(`live-history ${r.status}`);
  return r.json() as Promise<{ rows: HistoryRow[]; total: number; page: number; page_size: number }>;
}

function fmtClock(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", hour12: false });
}
function fmtVideoTime(s: number | null | undefined) {
  if (!s || s <= 0) return "00:00";
  const t = Math.floor(s);
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}
function statusOf(r: HistoryRow) {
  if (r.cta_clicked) return { label: "CTA", cls: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30" };
  if (r.pitch_reached) return { label: "Pitch", cls: "bg-amber-500/15 text-amber-600 border-amber-500/30" };
  if (r.exit_reason === "exited" || r.exit_reason === "timeout") return { label: "Saiu", cls: "bg-muted text-muted-foreground border-border" };
  return { label: "Started", cls: "bg-primary/15 text-primary border-primary/30" };
}

function toCsv(rows: HistoryRow[]) {
  const headers = [
    "started_at", "last_seen_at", "session_id", "player_name", "product", "country", "state", "city",
    "device_type", "current_second", "status", "exit_reason", "utm_campaign", "ad_id", "utm_term",
    "utm_content", "clickid",
  ];
  const lines = [headers.join(",")];
  for (const r of rows) {
    const status = r.cta_clicked ? "cta" : r.pitch_reached ? "pitch" : (r.exit_reason ?? "started");
    const row = [
      r.started_at, r.last_seen_at, r.session_id, r.player_name ?? "", r.product ?? "",
      r.country ?? "", r.state ?? "", r.city ?? "", r.device_type ?? "", r.current_second_in_video ?? "",
      status, r.exit_reason ?? "", r.utm_campaign ?? "", r.ad_id ?? "", r.utm_term ?? "",
      r.utm_content ?? "", r.clickid ?? "",
    ].map((v) => {
      const s = String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    });
    lines.push(row.join(","));
  }
  return lines.join("\n");
}

export function LiveHistoryTab({ filters }: { filters: Filters }) {
  const operationId = useOperationId();
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [data, setData] = useState<{ rows: HistoryRow[]; total: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => { setPage(1); }, [filters.player_id, filters.product, filters.ad_id, status, search]);

  useEffect(() => {
    if (!operationId) { setData({ rows: [], total: 0 }); return; }
    setLoading(true);
    fetchHistory(filters, page, pageSize, status, search, operationId)
      .then(setData)
      .catch(() => setData({ rows: [], total: 0 }))
      .finally(() => setLoading(false));
  }, [filters, page, pageSize, status, search, operationId]);

  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / pageSize));

  const handleExport = async () => {
    if (!operationId) return;
    setExporting(true);
    try {
      // Exporta até 1000 sessões
      const r = await fetchHistory(filters, 1, 1000, status, search, operationId);
      const csv = toCsv(r.rows);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `historico-aovivo-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-sm flex items-center gap-2">
          <History className="h-4 w-4" />
          Histórico das últimas 24h
          <Badge variant="outline" className="text-[10px]">{(data?.total ?? 0).toLocaleString("pt-BR")}</Badge>
          {loading && <span className="text-xs text-muted-foreground font-normal">· carregando…</span>}
        </CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Buscar campanha, ad_id, país, clickid…"
              className="h-8 w-[260px] pl-7 text-xs"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") setSearch(searchInput.trim()); }}
            />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos status</SelectItem>
              <SelectItem value="started">Started</SelectItem>
              <SelectItem value="pitch">Pitch (sem CTA)</SelectItem>
              <SelectItem value="cta">CTA clicado</SelectItem>
              <SelectItem value="exited">Saiu / Timeout</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={handleExport} disabled={exporting || !(data?.rows.length)}>
            <Download className="h-3.5 w-3.5 mr-1" /> {exporting ? "Exportando…" : "CSV"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {!data || data.rows.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            {loading ? "Carregando…" : "Nenhuma sessão encontrada."}
          </div>
        ) : (
          <div className="overflow-auto max-h-[680px]">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-card z-10 border-b">
                <tr className="text-left text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Hora</th>
                  <th className="px-3 py-2 font-medium">VSL / Produto</th>
                  <th className="px-3 py-2 font-medium">Geo</th>
                  <th className="px-3 py-2 font-medium">Device</th>
                  <th className="px-3 py-2 font-medium">Tempo</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Campanha</th>
                  <th className="px-3 py-2 font-medium">Ad</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.rows.map((r) => {
                  const geo = resolveGeo(r.country, r.state);
                  const st = statusOf(r);
                  return (
                    <tr key={r.session_id} className="hover:bg-muted/40">
                      <td className="px-3 py-1.5 font-mono tabular-nums whitespace-nowrap">{fmtClock(r.started_at)}</td>
                      <td className="px-3 py-1.5">
                        <div className="font-medium truncate max-w-[180px]">{r.player_name || r.player_id}</div>
                        <div className="text-[10px] text-muted-foreground">{r.product ?? "—"}</div>
                      </td>
                      <td className="px-3 py-1.5">
                        <span className="mr-1">{flagEmoji(geo?.iso2)}</span>
                        {[r.city, r.state || r.country].filter(Boolean).join(", ") || "—"}
                      </td>
                      <td className="px-3 py-1.5">{r.device_type ?? "—"}</td>
                      <td className="px-3 py-1.5 font-mono tabular-nums">{fmtVideoTime(r.current_second_in_video)}</td>
                      <td className="px-3 py-1.5">
                        <span className={cn("px-1.5 py-0.5 rounded border text-[10px] font-medium", st.cls)}>{st.label}</span>
                      </td>
                      <td className="px-3 py-1.5">
                        <span className="font-mono text-[10px] truncate block max-w-[200px]" title={r.utm_campaign ?? ""}>
                          {r.utm_campaign ?? "—"}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 font-mono text-[10px]" title={r.ad_id ?? ""}>
                        {r.ad_id ? `…${r.ad_id.slice(-8)}` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Paginação */}
        <div className="flex items-center justify-between px-3 py-2 border-t text-xs">
          <span className="text-muted-foreground">
            Página {page} de {totalPages} · {(data?.total ?? 0).toLocaleString("pt-BR")} registros
          </span>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="outline" disabled={page <= 1 || loading} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant="outline" disabled={page >= totalPages || loading} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
