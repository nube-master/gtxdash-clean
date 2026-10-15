import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOperation } from "@/contexts/OperationContext";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Radio } from "lucide-react";

interface Row {
  external_order_id: string;
  status: string;
  order_date: string;
  commission_value: number;
  created_at: string;
}

function relTime(iso: string) {
  const diffSec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (diffSec < 60) return `${diffSec}s atrás`;
  const min = Math.floor(diffSec / 60);
  if (min < 60) return `${min}min atrás`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h${min % 60 ? ` ${min % 60}min` : ""} atrás`;
  const d = Math.floor(h / 24);
  return `${d}d atrás`;
}

const STATUS_COLOR: Record<string, string> = {
  pending: "text-amber-500",
  delivered: "text-blue-500",
  commission_approved: "text-emerald-500",
  paid: "text-emerald-600",
  expired: "text-destructive",
  canceled: "text-muted-foreground",
  refused: "text-muted-foreground",
};

export function CODLastReceivedIndicator() {
  const { operationId } = useOperation();

  const { data } = useQuery({
    queryKey: ["cod-last-received", operationId],
    enabled: !!operationId,
    refetchInterval: 30_000,
    staleTime: 15_000,
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase
        .from("cod_orders")
        .select("external_order_id,status,order_date,commission_value,created_at")
        .order("created_at", { ascending: false })
        .limit(8);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const last = data?.[0];
  const lastAgeMin = last ? (Date.now() - new Date(last.created_at).getTime()) / 60_000 : Infinity;
  const isLive = lastAgeMin < 5;
  const isWarm = lastAgeMin < 60;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-[11px] transition-colors ${
            isLive
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20"
              : isWarm
                ? "border-amber-500/40 bg-amber-500/10 text-amber-500 hover:bg-amber-500/20"
                : "border-border/60 text-muted-foreground hover:bg-muted"
          }`}
          title="Últimos pedidos recebidos"
        >
          <Radio className={`h-3 w-3 ${isLive ? "animate-pulse" : ""}`} />
          <span className="font-mono">
            {last ? `último: ${relTime(last.created_at)}` : "sem pedidos"}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="px-3 py-2 border-b border-border/60">
          <div className="text-xs font-medium">Últimos recebidos</div>
          <div className="text-[10px] text-muted-foreground">
            Ordenado por <code>created_at</code> — timestamp de entrada no banco (webhook / import)
          </div>
        </div>
        <div className="max-h-80 overflow-y-auto divide-y divide-border/40">
          {(data ?? []).map((r) => (
            <div key={r.external_order_id + r.created_at} className="px-3 py-2 flex items-center justify-between text-[11px]">
              <div className="flex flex-col">
                <span className="font-mono">#{r.external_order_id}</span>
                <span className="text-[10px] text-muted-foreground">
                  pedido {r.order_date} • €{Number(r.commission_value).toFixed(0)}
                </span>
              </div>
              <div className="flex flex-col items-end">
                <span className={`font-medium ${STATUS_COLOR[r.status] ?? ""}`}>{r.status}</span>
                <span className="text-[10px] text-muted-foreground">{relTime(r.created_at)}</span>
              </div>
            </div>
          ))}
          {(!data || data.length === 0) && (
            <div className="px-3 py-6 text-center text-[11px] text-muted-foreground">Nenhum pedido no banco.</div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
