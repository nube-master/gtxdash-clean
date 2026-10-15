import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Store, Package, ShoppingCart, TrendingUp, TrendingDown } from "lucide-react";
import { fetchAllPaginated } from "@/lib/fetchAllPaginated";
import {
  useOffersSalesIntelligence,
  groupByNicho,
  groupByProduto,
  type SalesIntelGroup,
  type OfferSalesIntelRow,
} from "@/hooks/useOffersSalesIntelligence";


interface Props {
  startDate: string;
  endDate: string;
  operationId?: string | null;
}

const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 }).format(v);

const fmtNum = (v: number) =>
  new Intl.NumberFormat("pt-BR").format(Math.round(v));

const COLORS = [
  "hsl(0, 100%, 56%)",
  "hsl(38, 92%, 50%)",
  "hsl(210, 80%, 55%)",
  "hsl(160, 70%, 45%)",
  "hsl(340, 75%, 55%)",
  "hsl(185, 80%, 45%)",
  "hsl(280, 70%, 55%)",
  "hsl(220, 10%, 50%)",
];

function MiniProgress({ pct, color }: { pct: number; color: string }) {
  const radius = 9;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - pct / 100);
  return (
    <svg width="22" height="22" className="shrink-0">
      <circle cx="11" cy="11" r={radius} fill="none" stroke="hsl(220, 10%, 18%)" strokeWidth="2.5" />
      <circle
        cx="11" cy="11" r={radius} fill="none"
        stroke={color} strokeWidth="2.5"
        strokeDasharray={circumference}
        strokeDashoffset={dashOffset}
        strokeLinecap="round"
        transform="rotate(-90 11 11)"
      />
    </svg>
  );
}

function Row({ idx, item, valueText }: { idx: number; item: SalesIntelGroup; valueText: string }) {
  const color = COLORS[idx % COLORS.length];
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 border-b border-border/50 last:border-0">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: color }} />
        <span className="text-xs truncate">{item.label}</span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-xs font-semibold tabular-nums">{valueText}</span>
        <div className="flex items-center gap-1">
          <MiniProgress pct={item.sharePct} color={color} />
          <span className="text-[10px] text-muted-foreground tabular-nums w-10 text-right">
            {item.sharePct.toFixed(1)}%
          </span>
        </div>
      </div>
    </div>
  );
}

export function SalesIntelligenceV2({ startDate, endDate, operationId }: Props) {
  const { data: rows, isLoading } = useOffersSalesIntelligence(startDate, endDate, operationId);

  // Fallback FAHTO: RedTrack polling (redtrack_conversions) não passa por offers/sales_data
  const { data: rtcRows, isLoading: loadingRtc } = useQuery({
    queryKey: ["sales-intel-rtc", startDate, endDate, operationId ?? null],
    enabled: !!operationId && (rows?.length ?? 0) === 0,
    queryFn: async () => {
      const rtc = await fetchAllPaginated(
        "redtrack_conversions",
        "project, product, country, payout_brl",
        (q: any) =>
          q
            .eq("operation_id", operationId!)
            .eq("type", "Purchase")
            .eq("status", "approved")
            .gte("conv_time", `${startDate}T00:00:00-03:00`)
            .lte("conv_time", `${endDate}T23:59:59-03:00`),
        "conv_time",
        false,
      );
      return (rtc as any[]).map((r) => ({
        offer_id: null,
        apelido_interno: r.product || "Outros",
        produto_real: r.product || "Outros",
        nicho: r.project || "outros",
        geo: (r.country || "").toUpperCase(),
        sales_count: 1,
        revenue_brl: Number(r.payout_brl || 0),
      })) as OfferSalesIntelRow[];
    },
    refetchInterval: 120_000,
    staleTime: 60_000,
  });

  const intel = useMemo(() => {
    const source = rows && rows.length > 0 ? rows : rtcRows ?? [];
    if (source.length === 0) return null;
    return {
      byNicho: groupByNicho(source),
      byProductRev: groupByProduto(source, "revenue"),
      byProductQty: groupByProduto(source, "sales"),
      totalRevenue: source.reduce((s, r) => s + r.revenue_brl, 0),
      totalSales: source.reduce((s, r) => s + r.sales_count, 0),
    };
  }, [rows, rtcRows]);


  if (isLoading || !intel) {
    return (
      <div>
        <div className="flex items-center gap-3 mb-3">
          <h2 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Inteligência de Vendas</h2>
          <div className="flex-1 h-[1px]" style={{ background: "rgba(255,30,30,0.15)" }} />
        </div>
        <p className="text-[10px] text-muted-foreground mb-3 -mt-1">
          Análise consolidada por projeto e produto — período selecionado
        </p>
        {!intel && !isLoading && (
          <div className="text-[11px] text-muted-foreground">Nenhuma venda no período.</div>
        )}
      </div>
    );
  }

  const leaderProduct = intel.byProductRev[0];

  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <h2 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Inteligência de Vendas</h2>
        <div className="flex-1 h-[1px]" style={{ background: "rgba(255,30,30,0.15)" }} />
      </div>
      <p className="text-[10px] text-muted-foreground mb-3 -mt-1">
        Análise consolidada por nicho e produto — atribuição via offers cadastradas, sem duplicação
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Card 1 — Faturamento por Nicho */}
        <Card className="bg-card border border-border relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: COLORS[0] }} />
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-7 w-7 rounded-md bg-secondary flex items-center justify-center text-muted-foreground">
                <Store className="h-3.5 w-3.5" />
              </div>
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                Faturamento por Nicho
              </span>
            </div>
            <div>
              {intel.byNicho.map((item, idx) => (
                <Row key={item.key} idx={idx} item={item} valueText={fmtBRL(item.revenue)} />
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Card 2 — Faturamento por Produto */}
        <Card className="bg-card border border-border relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: COLORS[1] }} />
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-7 w-7 rounded-md bg-secondary flex items-center justify-center text-muted-foreground">
                <Package className="h-3.5 w-3.5" />
              </div>
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                Faturamento por Produto
              </span>
            </div>
            <div>
              {intel.byProductRev.map((item, idx) => (
                <Row key={item.key} idx={idx} item={item} valueText={fmtBRL(item.revenue)} />
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Card 3 — Vendas por Produto */}
        <Card className="bg-card border border-border relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: COLORS[2] }} />
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-7 w-7 rounded-md bg-secondary flex items-center justify-center text-muted-foreground">
                <ShoppingCart className="h-3.5 w-3.5" />
              </div>
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                Vendas por Produto
              </span>
            </div>
            <div>
              {intel.byProductQty.map((item, idx) => (
                <Row key={item.key} idx={idx} item={item} valueText={fmtNum(item.sales)} />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {leaderProduct && (
        <div className="mt-2 text-[10px] text-muted-foreground flex items-center gap-1.5">
          <TrendingUp className="h-3 w-3 text-wr-positive" />
          Líder: <span className="font-semibold text-foreground">{leaderProduct.label}</span> · {leaderProduct.sharePct.toFixed(1)}% do faturamento
        </div>
      )}
    </div>
  );
}
