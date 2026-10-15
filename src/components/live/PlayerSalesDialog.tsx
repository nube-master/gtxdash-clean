import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

type Sale = {
  clickid: string;
  sale_at: string;
  sale_value_usd: number;
  product: string | null;
  sale_source: string | null;
  time_to_sale_seconds: number | null;
  is_orphan: boolean;
  sale_status: string;
  matched_player_name: string | null;
  matched_via: string | null;
  sale_platform: string | null;
};

const MATCH_LABEL: Record<string, { label: string; className: string }> = {
  clickid: { label: "clickid", className: "border-emerald-500/40 text-emerald-600" },
  utm_content: { label: "utm_content", className: "border-blue-500/40 text-blue-600" },
  utm_campaign: { label: "utm_campaign", className: "border-indigo-500/40 text-indigo-600" },
  ip_fallback: { label: "ip", className: "border-amber-500/40 text-amber-600" },
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  playerId: string | null;
  playerName: string | null;
};

function formatTts(secs: number | null): string {
  if (!secs || secs <= 0) return "—";
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}m ${s}s`;
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

export function PlayerSalesDialog({ open, onOpenChange, playerId, playerName }: Props) {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !playerId) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const since = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
      const { data, error } = await supabase
        .from("live_sale_attribution")
        .select("clickid, sale_at, sale_value_usd, product, sale_source, time_to_sale_seconds, is_orphan, sale_status, matched_player_name, matched_via, sale_platform")
        .eq("matched_player_id", playerId)
        .gte("sale_at", since)
        .order("sale_at", { ascending: false })
        .limit(100);
      if (cancelled) return;
      if (error) {
        console.error("PlayerSalesDialog fetch error", error);
        setSales([]);
      } else {
        setSales((data as Sale[]) ?? []);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, playerId]);

  const totalRevenue = sales.reduce((s, x) => s + Number(x.sale_value_usd || 0), 0);
  const converted = sales.filter((s) => s.sale_status === "CONVERTED").length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Vendas atribuídas · {playerName || playerId}</DialogTitle>
          <DialogDescription>
            Últimas 7 dias · {converted} vendas · ${totalRevenue.toLocaleString("en-US", { maximumFractionDigits: 0 })}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando…
          </div>
        ) : sales.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            Nenhuma venda atribuída nos últimos 7 dias.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {sales.map((s) => (
              <div key={s.clickid} className="py-3 grid grid-cols-12 gap-2 text-sm items-center">
                <div className="col-span-3 text-xs text-muted-foreground tabular-nums">
                  {formatWhen(s.sale_at)}
                </div>
                <div className="col-span-2">
                  <span className="font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                    ${Math.round(Number(s.sale_value_usd) || 0)}
                  </span>
                </div>
                <div className="col-span-2 text-xs">
                  {s.product && (
                    <Badge variant="outline" className="text-[10px]">{s.product}</Badge>
                  )}
                </div>
                <div className="col-span-2 text-xs text-muted-foreground flex items-center gap-1">
                  <span>{s.sale_source || "—"}</span>
                  {s.matched_via && MATCH_LABEL[s.matched_via] && (
                    <Badge variant="outline" className={`text-[9px] ${MATCH_LABEL[s.matched_via].className}`}>
                      {MATCH_LABEL[s.matched_via].label}
                    </Badge>
                  )}
                </div>
                <div className="col-span-2 text-xs tabular-nums text-muted-foreground">
                  TTS {formatTts(s.time_to_sale_seconds)}
                </div>
                <div className="col-span-1 flex justify-end">
                  {s.sale_status !== "CONVERTED" ? (
                    <Badge variant="destructive" className="text-[10px]">{s.sale_status}</Badge>
                  ) : s.is_orphan ? (
                    <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-600">órfã</Badge>
                  ) : (
                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400">✓</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
