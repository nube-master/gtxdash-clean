import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw, Copy } from "lucide-react";
import { toast } from "sonner";

type OrphanRow = {
  id: string;
  clickid: string;
  sale_status: string;
  sale_value_usd: number;
  sale_at: string;
  product: string | null;
  offer_name: string | null;
  sale_source: string | null;
  is_orphan: boolean;
  matched_player_name: string | null;
};

type WindowOpt = "24h" | "7d" | "30d";

const WINDOW_HOURS: Record<WindowOpt, number> = { "24h": 24, "7d": 24 * 7, "30d": 24 * 30 };

export function OrphanSalesTab() {
  const [rows, setRows] = useState<OrphanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [windowOpt, setWindowOpt] = useState<WindowOpt>("24h");
  const [onlyOrphans, setOnlyOrphans] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    const sinceIso = new Date(Date.now() - WINDOW_HOURS[windowOpt] * 3600 * 1000).toISOString();
    let q = supabase
      .from("live_sale_attribution")
      .select("id,clickid,sale_status,sale_value_usd,sale_at,product,offer_name,sale_source,is_orphan,matched_player_name")
      .gte("sale_at", sinceIso)
      .order("sale_at", { ascending: false })
      .limit(500);
    if (onlyOrphans) q = q.eq("is_orphan", true);
    const { data, error } = await q;
    if (error) {
      toast.error("Erro ao carregar vendas atribuídas");
      setLoading(false);
      return;
    }
    setRows((data ?? []) as OrphanRow[]);
    setLoading(false);
  };

  useEffect(() => { fetchData(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [windowOpt, onlyOrphans]);

  const totalUsd = rows.reduce((s, r) => s + Number(r.sale_value_usd || 0), 0);
  const orphanCount = rows.filter((r) => r.is_orphan).length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center justify-between flex-wrap gap-2">
          <span className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Vendas órfãs · sem sessão Live correspondente
          </span>
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-md border bg-background p-0.5">
              {(["24h", "7d", "30d"] as WindowOpt[]).map((w) => (
                <button
                  key={w}
                  onClick={() => setWindowOpt(w)}
                  className={`px-2.5 py-1 text-xs rounded transition-colors ${windowOpt === w ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {w}
                </button>
              ))}
            </div>
            <button
              onClick={() => setOnlyOrphans((v) => !v)}
              className={`px-2.5 py-1 text-xs rounded border transition-colors ${onlyOrphans ? "bg-amber-500/10 border-amber-500/40 text-amber-600" : "bg-background text-muted-foreground"}`}
              title="Alternar entre apenas órfãs e todas as atribuições"
            >
              {onlyOrphans ? "Apenas órfãs" : "Todas atribuições"}
            </button>
            <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </CardTitle>
        <p className="text-[11px] text-muted-foreground mt-1">
          {rows.length} {rows.length === 1 ? "venda" : "vendas"} · {orphanCount} órfã{orphanCount === 1 ? "" : "s"} · Total ${totalUsd.toLocaleString("en-US", { maximumFractionDigits: 0 })}
        </p>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            {loading ? "Carregando…" : onlyOrphans ? "Nenhuma venda órfã na janela — todas estão atribuídas a sessões ao vivo." : "Nenhuma venda atribuída na janela."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Quando</th>
                  <th className="text-left px-3 py-2 font-medium">Status</th>
                  <th className="text-right px-3 py-2 font-medium">USD</th>
                  <th className="text-left px-3 py-2 font-medium">Produto</th>
                  <th className="text-left px-3 py-2 font-medium">Oferta</th>
                  <th className="text-left px-3 py-2 font-medium">Fonte</th>
                  <th className="text-left px-3 py-2 font-medium">VSL</th>
                  <th className="text-left px-3 py-2 font-medium">Clickid</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r) => (
                  <tr key={r.id} className={r.is_orphan ? "bg-amber-500/[0.04]" : ""}>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {new Date(r.sale_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant={r.sale_status === "CONVERTED" ? "default" : "destructive"} className="text-[10px]">
                        {r.sale_status}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-right font-mono">${Number(r.sale_value_usd).toFixed(2)}</td>
                    <td className="px-3 py-2">{r.product || "—"}</td>
                    <td className="px-3 py-2 max-w-[220px] truncate" title={r.offer_name ?? undefined}>{r.offer_name || "—"}</td>
                    <td className="px-3 py-2">{r.sale_source || "—"}</td>
                    <td className="px-3 py-2">
                      {r.is_orphan ? (
                        <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-600">Órfã</Badge>
                      ) : (
                        <span className="text-muted-foreground">{r.matched_player_name || "—"}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-[10px]">
                      <button
                        onClick={() => { navigator.clipboard.writeText(r.clickid); toast.success("Clickid copiado"); }}
                        className="inline-flex items-center gap-1 hover:text-foreground text-muted-foreground"
                        title={r.clickid}
                      >
                        …{r.clickid.slice(-12)} <Copy className="h-3 w-3" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
