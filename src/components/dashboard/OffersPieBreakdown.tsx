import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Package, ShoppingBag, CreditCard, Globe } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RTooltip } from "recharts";
import { fetchAllPaginated } from "@/lib/fetchAllPaginated";
import { useExchangeRate } from "@/hooks/useExchangeRate";
import { resolveProductName } from "@/lib/productNames";
import { isUpsellItemName } from "@/lib/frontEndSale";
import { useHotmartAllowlist } from "@/hooks/useHotmartAllowlist";

interface Props {
  startDate: string;
  endDate: string;
  operationId?: string | null;
}

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

const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);

type Bucket = { name: string; value: number; count: number };

function aggregate(rows: Array<{ key: string | null; revenue: number }>): Bucket[] {
  const map = new Map<string, Bucket>();
  for (const r of rows) {
    const name = r.key && r.key.trim() ? r.key.trim() : "Sem dado";
    const cur = map.get(name) || { name, value: 0, count: 0 };
    cur.value += r.revenue;
    cur.count += 1;
    map.set(name, cur);
  }
  return Array.from(map.values()).sort((a, b) => b.value - a.value);
}

function parseSeg(offerName: string | null, idx: number): string | null {
  if (!offerName) return null;
  const parts = offerName.split("|").map((p) => p.trim()).filter(Boolean);
  return parts[idx] || null;
}

/**
 * Extrai o slug da landing do payload RedTrack.
 * Formato esperado: "Tráfego | Plataforma | Apelido | <slug-landing> | <domínio>"
 * Fallbacks:
 *  - sem 4º segmento → tenta domínio (5º) → string inteira → null
 *  - vazio/nulo → null (vira "Sem landing" no agregador)
 */
function parseLanding(landingRaw: unknown): string | null {
  if (typeof landingRaw !== "string") return null;
  const raw = landingRaw.trim();
  if (!raw) return null;
  if (!raw.includes("|")) return raw; // formato livre — usa como está
  const parts = raw.split("|").map((p) => p.trim()).filter(Boolean);
  return parts[3] || parts[4] || parts[parts.length - 1] || null;
}

/** Extrai domínio + path de uma landing (remove tags [FB] [COD], protocolo, www, query e barra final). */
function extractDomain(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let s = raw.replace(/\[[^\]]*\]/g, " ").trim();
  if (!s) return null;
  const withProto = s.match(/https?:\/\/([^\s?#]+)/i);
  let url = withProto?.[1] || s.match(/([a-z0-9-]+(?:\.[a-z0-9-]+)+[^\s?#]*)/i)?.[1] || null;
  if (!url) return null;
  url = url.replace(/^www\./i, "").replace(/\/+$/, "");
  if (url.length > 40) url = `${url.slice(0, 40)}...`;
  return url || null;
}


function normalizeCheckout(raw: string | null): string | null {
  if (!raw) return null;
  const r = raw.toLowerCase();
  if (r.includes("cartpanda")) return "CartPanda";
  if (r.includes("buygoods")) return "BuyGoods";
  if (r.includes("digistore")) return "Digistore24";
  if (r.includes("clickbank")) return "ClickBank";
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function PieCard({
  title,
  icon: Icon,
  data,
  accent,
  valueFmt,
}: {
  title: string;
  icon: typeof Package;
  data: Bucket[];
  accent: string;
  valueFmt: (b: Bucket) => string;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <Card className="bg-card border border-border relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: accent }} />
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="h-7 w-7 rounded-md bg-secondary flex items-center justify-center text-muted-foreground">
            <Icon className="h-3.5 w-3.5" />
          </div>
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            {title}
          </span>
        </div>
        {data.length === 0 ? (
          <div className="text-[11px] text-muted-foreground py-8 text-center">Sem dados no período.</div>
        ) : (
          <>
            <div className="h-[180px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={70}
                    innerRadius={42}
                    paddingAngle={2}
                  >
                    {data.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} stroke="hsl(var(--background))" strokeWidth={1} />
                    ))}
                  </Pie>
                  <RTooltip
                    contentStyle={{
                      background: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 6,
                      fontSize: 11,
                    }}
                    formatter={(_v: any, _n: any, p: any) => [
                      `${valueFmt(p.payload)} · ${total > 0 ? ((p.payload.value / total) * 100).toFixed(1) : "0"}%`,
                      p.payload.name,
                    ]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-1 mt-2">
              {data.slice(0, 10).map((d, i) => {
                const pct = total > 0 ? (d.value / total) * 100 : 0;
                return (
                  <div key={d.name} className="flex items-center justify-between gap-2 text-[11px]">
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                      <span className="truncate">{d.name}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 tabular-nums">
                      <span className="text-muted-foreground">{d.count}</span>
                      <span className="font-semibold">{valueFmt(d)}</span>
                      <span className="text-muted-foreground w-10 text-right">{pct.toFixed(1)}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function OffersPieBreakdown({ startDate, endDate, operationId }: Props) {
  const usdToBrl = useExchangeRate();
  const hotmartAllow = useHotmartAllowlist();

  const { data: events, isLoading } = useQuery({
    queryKey: ["offers-pie-breakdown", startDate, endDate, operationId ?? null],
    queryFn: async () => {
      const startIso = `${startDate}T00:00:00-03:00`;
      const endIso = `${endDate}T23:59:59-03:00`;
      const rows = await fetchAllPaginated(
        "redtrack_events",
        "offer_name, product_name, amount, currency, event_type, status, raw_payload",
        (q: any) => {
          q = q
            .gte("occurred_at", startIso)
            .lte("occurred_at", endIso)
            .eq("event_type", "purchase");
          if (operationId) q = q.eq("operation_id", operationId);
          return q;
        },
        "occurred_at",
        false,
      );
      return rows;
    },
    refetchInterval: 120_000,
    staleTime: 60_000,
  });

  // Hotmart: direct from clickbank_audit (não passa pelo RedTrack)
  const { data: hotmartRows } = useQuery({
    queryKey: ["offers-pie-hotmart", startDate, endDate, operationId ?? null],
    enabled: !!operationId,
    queryFn: async () => {
      const startIso = `${startDate}T00:00:00-03:00`;
      const endIso = `${endDate}T23:59:59-03:00`;
      const rows = await fetchAllPaginated(
        "clickbank_audit",
        "product_name, item_name, amount_brl, amount_usd, utm_source, utm_medium, utm_campaign, utm_content, sck",
        (q: any) => {
          q = q
            .eq("vendor", "hotmart")
            .eq("operation_id", operationId!)
            .gte("created_at", startIso)
            .lte("created_at", endIso);
          return q;
        },
        "created_at",
        false,
      );

      return rows;
    },
    refetchInterval: 120_000,
    staleTime: 60_000,
  });

  // FAHTO / operações que usam RedTrack via polling (tabela redtrack_conversions)
  const { data: rtcRows } = useQuery({
    queryKey: ["offers-pie-rtc", startDate, endDate, operationId ?? null],
    enabled: !!operationId,
    queryFn: async () => {
      const startIso = `${startDate}T00:00:00-03:00`;
      const endIso = `${endDate}T23:59:59-03:00`;
      const rows = await fetchAllPaginated(
        "redtrack_conversions",
        "offer, product, payout, payout_brl, raw_payload",
        (q: any) =>
          q
            .eq("operation_id", operationId!)
            .eq("type", "Purchase")
            .eq("status", "approved")
            .gte("conv_time", startIso)
            .lte("conv_time", endIso),
        "conv_time",
        false,
      );
      return rows;
    },
    refetchInterval: 120_000,
    staleTime: 60_000,
  });

  const rtcBuckets = useMemo(() => {
    const list = (rtcRows || []).map((r: any) => ({
      offerKey: (r.offer as string | null) || null,
      checkoutKey: (r.raw_payload?.network as string | null) || "Direto",
      productKey: (r.product as string | null) || "Outros",
      landingKey: extractDomain(r.raw_payload?.landing),
      revenueBrl: Number(r.payout_brl || 0),
      payoutUsd: Number(r.payout || 0),
    }));
    const impliedFx =
      list.reduce((s, r) => s + r.payoutUsd, 0) > 0
        ? list.reduce((s, r) => s + r.revenueBrl, 0) / list.reduce((s, r) => s + r.payoutUsd, 0)
        : 0;
    return {
      byOferta: aggregate(list.map((r) => ({ key: r.offerKey, revenue: r.revenueBrl }))).slice(0, 8),
      byCheckout: aggregate(list.map((r) => ({ key: r.checkoutKey, revenue: r.revenueBrl }))),
      byProduto: aggregate(list.map((r) => ({ key: r.productKey, revenue: r.revenueBrl }))).slice(0, 8),
      byLanding: aggregate(list.map((r) => ({ key: r.landingKey, revenue: r.revenueBrl }))).slice(0, 10),
      total: list.length,
      rtCount: list.length,
      htCount: 0,
      impliedFx,
    };
  }, [rtcRows]);

  const eventBuckets = useMemo(() => {

    const rtList = (events || [])
      .map((r: any) => {
        const amt = Number(r.amount || 0);
        const currency = (r.currency || "USD").toUpperCase();
        const amtUsd = currency === "BRL" ? (usdToBrl > 0 ? amt / usdToBrl : 0) : amt;
        const revenueBrl = currency === "BRL" ? amt : amt * usdToBrl;
        const landingRaw: string | null = r.raw_payload?.landing ?? null;
        const landingSlug = parseLanding(landingRaw);
        return {
          source: "redtrack" as const,
          offerKey: r.offer_name as string | null,
          checkoutKey: normalizeCheckout(parseSeg(r.offer_name, 1)),
          productKey: resolveProductName(r.offer_name, r.product_name, "Outros"),
          landingKey: landingSlug,
          offer_name: r.offer_name as string | null,
          product_name: r.product_name as string | null,
          amtUsd,
          revenueBrl,
        };
      })
      .filter(
        (r) =>
          r.revenueBrl > 0 &&
          r.amtUsd > 0 &&
          r.amtUsd <= 300 &&
          !isUpsellItemName(r.offer_name) &&
          !isUpsellItemName(r.product_name),
      );

    const htList = (hotmartRows || [])
      .map((r: any) => {
        const amtBrl = Number(r.amount_brl || 0);
        const amtUsdRaw = Number(r.amount_usd || 0);
        const amtUsd = amtUsdRaw > 0 ? amtUsdRaw : (usdToBrl > 0 ? amtBrl / usdToBrl : 0);
        const revenueBrl = amtBrl > 0 ? amtBrl : amtUsdRaw * usdToBrl;
        const productName: string | null = r.product_name || r.item_name || null;
        const itemId: string | null = r.item_name || null; // Hotmart product ID
        return {
          source: "hotmart" as const,
          offerKey: productName,          // Escola: usa product_name como oferta
          checkoutKey: "Hotmart",          // Sempre Hotmart
          productKey: productName,         // product_name direto
          landingKey: null,                // Hotmart não envia LP — fica em branco
          offer_name: productName,
          product_name: productName,
          item_id: itemId,                 // preserva ID p/ allowlist
          amtUsd,
          revenueBrl,
        };
      })
      .filter(
        (r) =>
          r.revenueBrl > 0 &&
          r.amtUsd > 0 &&
          r.amtUsd <= 300 &&
          !isUpsellItemName(r.product_name) &&
          hotmartAllow.isAllowed(r.item_id, r.product_name),
      );


    const list = [...rtList, ...htList];

    const byOferta = aggregate(list.map((r) => ({ key: r.offerKey, revenue: r.revenueBrl })));
    const byCheckout = aggregate(list.map((r) => ({ key: r.checkoutKey, revenue: r.revenueBrl })));
    const byProduto = aggregate(list.map((r) => ({ key: r.productKey, revenue: r.revenueBrl })));
    const byLanding = aggregate(list.map((r) => ({ key: r.landingKey, revenue: r.revenueBrl })));

    return {
      byOferta: byOferta.slice(0, 8),
      byCheckout,
      byProduto: byProduto.slice(0, 8),
      byLanding: byLanding.slice(0, 10),
      total: list.length,
      rtCount: rtList.length,
      htCount: htList.length,
    };
  }, [events, hotmartRows, usdToBrl, hotmartAllow]);

  // Fonte primária: redtrack_conversions quando houver (FAHTO); senão redtrack_events + Hotmart
  const buckets = rtcBuckets.total > 0 ? rtcBuckets : { ...eventBuckets, impliedFx: 0 };
  const fxLabel = buckets.impliedFx > 0 ? buckets.impliedFx : usdToBrl;

  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <h2 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
          Distribuição de Ofertas (RedTrack + Hotmart)
        </h2>
        <div className="flex-1 h-[1px]" style={{ background: "rgba(255,30,30,0.15)" }} />
      </div>
      <p className="text-[10px] text-muted-foreground mb-3 -mt-1">
        {isLoading
          ? "Carregando..."
          : `${buckets.total} vendas · RedTrack ${buckets.rtCount} · Hotmart ${buckets.htCount} · USD→BRL @ ${fxLabel.toFixed(2)}`}
      </p>



      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        <PieCard
          title="Por Oferta (Apelido)"
          icon={Package}
          data={buckets.byOferta}
          accent={COLORS[0]}
          valueFmt={(b) => fmtBRL(b.value)}
        />
        <PieCard
          title="Por Plataforma de Checkout"
          icon={CreditCard}
          data={buckets.byCheckout}
          accent={COLORS[2]}
          valueFmt={(b) => fmtBRL(b.value)}
        />
        <PieCard
          title="Por Produto"
          icon={ShoppingBag}
          data={buckets.byProduto}
          accent={COLORS[1]}
          valueFmt={(b) => fmtBRL(b.value)}
        />
        <PieCard
          title="Por Landing Page"
          icon={Globe}
          data={buckets.byLanding}
          accent={COLORS[3]}
          valueFmt={(b) => fmtBRL(b.value)}
        />
      </div>
    </div>
  );
}
