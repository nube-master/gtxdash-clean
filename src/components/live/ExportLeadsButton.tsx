import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

type Filters = { player_id?: string; product?: string; ad_id?: string };

const PERIODS: { label: string; minutes: number }[] = [
  { label: "Últimos 5 min", minutes: 5 },
  { label: "Últimos 15 min", minutes: 15 },
  { label: "Última 1h", minutes: 60 },
  { label: "Últimas 24h", minutes: 60 * 24 },
];

type Row = Record<string, unknown>;

function csvEscape(v: unknown) {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function rowsToCsv(rows: Row[]) {
  if (!rows.length) return "";
  const cols = [
    "started_at", "last_seen_at", "session_id", "player_name", "player_id", "product",
    "country", "state", "city", "device_type", "current_second_in_video",
    "pitch_reached", "cta_clicked", "exit_reason",
    "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term",
    "ad_id", "clickid", "account_id", "operation_id",
  ];
  const lines = [cols.join(",")];
  for (const r of rows) {
    lines.push(cols.map((c) => csvEscape(r[c])).join(","));
  }
  return lines.join("\n");
}

async function fetchAll(filters: Filters, minutes: number): Promise<Row[]> {
  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token ?? ANON_KEY;
  const all: Row[] = [];
  const pageSize = 1000;
  let page = 1;
  while (true) {
    const params = new URLSearchParams();
    if (filters.player_id && filters.player_id !== "all") params.set("player_id", filters.player_id);
    if (filters.product && filters.product !== "all") params.set("product", filters.product);
    if (filters.ad_id && filters.ad_id !== "all") params.set("ad_id", filters.ad_id);
    params.set("since_minutes", String(minutes));
    params.set("page", String(page));
    params.set("page_size", String(pageSize));
    const r = await fetch(`${SUPABASE_URL}/functions/v1/live-history?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}`, apikey: ANON_KEY },
    });
    if (!r.ok) throw new Error(`live-history ${r.status}`);
    const j = (await r.json()) as { rows: Row[]; total: number };
    all.push(...(j.rows ?? []));
    if (all.length >= j.total || (j.rows?.length ?? 0) < pageSize) break;
    page++;
    if (page > 50) break; // safety: máx 50k linhas
  }
  return all;
}

export function ExportLeadsButton({ filters }: { filters: Filters }) {
  const [busy, setBusy] = useState<number | null>(null);

  const handle = async (minutes: number, label: string) => {
    setBusy(minutes);
    try {
      const rows = await fetchAll(filters, minutes);
      if (!rows.length) {
        toast.warning("Nenhum lead no período selecionado.");
        return;
      }
      const csv = rowsToCsv(rows);
      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 16);
      a.href = url;
      a.download = `aovivo-leads-${minutes}min-${stamp}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`${rows.length.toLocaleString("pt-BR")} leads exportados (${label})`);
    } catch (e) {
      console.error(e);
      toast.error("Falha ao exportar CSV");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Download className="h-3.5 w-3.5" />
          Exportar CSV
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-2">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 py-1">
          Período
        </div>
        <div className="space-y-1">
          {PERIODS.map((p) => (
            <Button
              key={p.minutes}
              variant="ghost"
              size="sm"
              className="w-full justify-start text-xs"
              disabled={busy !== null}
              onClick={() => handle(p.minutes, p.label)}
            >
              {busy === p.minutes ? (
                <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5 mr-2" />
              )}
              {p.label}
            </Button>
          ))}
        </div>
        <div className="text-[10px] text-muted-foreground px-2 pt-2 mt-1 border-t">
          Respeita os filtros ativos (VSL, produto, ad_id).
        </div>
      </PopoverContent>
    </Popover>
  );
}
