import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Trophy, AlertTriangle, TrendingUp, TrendingDown } from "lucide-react";

interface Props {
  traffic: any[];
  sales: any[];
}

function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 }).format(v);
}

// Creative ID = first [bracket] of ad_name / utm_content.
// Falls back to known patterns (Hxxx, IMG/VID/VSL) anywhere in the string.
function extractCreativeId(raw: string): string | null {
  if (!raw) return null;
  const s = raw.replace(/\[\[/g, "[").replace(/\]\]/g, "]");
  const brackets = Array.from(s.matchAll(/\[([^\]]+)\]/g)).map(m => m[1].trim());
  const looksLikeCreative = (t: string) =>
    /^(H\d+B\d+|IMG\d+|VID\d+|VSL\d+|TESTE\d+)/i.test(t);
  // Prefer first bracket that looks like a creative tag (skip account/campaign tags)
  for (const b of brackets) {
    const first = b.split(/\s+/)[0];
    if (looksLikeCreative(first)) return first.toUpperCase();
  }
  // Fallback: scan whole string
  const m = s.match(/\b(H\d+B\d+[A-Z0-9-]*|IMG\d+[A-Z0-9-]*|VID\d+[A-Z0-9-]*|VSL\d+[A-Z0-9-]*|TESTE\d+)/i);
  return m ? m[1].toUpperCase() : null;
}

function isFrontendSale(sale: any) {
  const store = String(sale?.store || "").toLowerCase();
  const eventType = String(sale?.event_type || "purchase").toLowerCase();
  if (store === "hotmart") {
    if (sale?.hotmart_categories_configured) {
      return Boolean(sale?.funnel_role_explicit) && eventType === "frontend";
    }
    return eventType === "frontend" || eventType === "purchase";
  }
  return eventType !== "upsell";
}

type SortKey = "winner" | "profit" | "roas" | "spend" | "revenue" | "sales";

export function CreativeRanking({ traffic, sales }: Props) {
  const [sortBy, setSortBy] = useState<SortKey>("winner");
  const [showBottom, setShowBottom] = useState(false);

  const rows = useMemo(() => {
    const map = new Map<string, { id: string; spend: number; clicks: number; impressions: number; revenue: number; sales: number }>();

    for (const t of traffic) {
      const cid = extractCreativeId(t.ad_name || t.campaign_name || "");
      if (!cid) continue;
      if (!map.has(cid)) map.set(cid, { id: cid, spend: 0, clicks: 0, impressions: 0, revenue: 0, sales: 0 });
      const m = map.get(cid)!;
      m.spend += Number(t.spend || 0);
      m.clicks += Number(t.clicks || 0);
      m.impressions += Number(t.impressions || 0);
    }

    for (const s of sales) {
      if (s.status !== "approved") continue;
      const cid =
        extractCreativeId(s.utm_content || "") ||
        extractCreativeId(s.utm_campaign || "");
      if (!cid || !map.has(cid)) continue;
      const m = map.get(cid)!;
      m.revenue += Number(s.revenue || 0);
      if (isFrontendSale(s)) m.sales++;
    }

    return Array.from(map.values())
      .filter(c => c.spend >= 30)
      .map(c => {
        const roas = c.spend > 0 ? c.revenue / c.spend : 0;
        return {
          ...c,
          profit: c.revenue - c.spend,
          roas,
          ctr: c.impressions > 0 ? (c.clicks / c.impressions) * 100 : 0,
          cac: c.sales > 0 ? c.spend / c.sales : 0,
          // Winner score = ROAS weighted by sales volume (sqrt dampens whales).
          // Requires at least 1 sale; otherwise it can't be a "winner".
          winner: c.sales > 0 ? roas * Math.sqrt(c.sales) : 0,
        };
      });
  }, [traffic, sales]);

  if (rows.length === 0) return null;

  const sorted = [...rows].sort((a, b) => {
    const va = (a as any)[sortBy];
    const vb = (b as any)[sortBy];
    return showBottom ? va - vb : vb - va;
  }).slice(0, 10);

  const SortBtn = ({ k, label }: { k: SortKey; label: string }) => (
    <Button
      size="sm"
      variant={sortBy === k ? "default" : "outline"}
      className="h-7 text-[10px] px-2"
      onClick={() => setSortBy(k)}
    >
      {label}
    </Button>
  );

  return (
    <Card className="bg-card border border-border">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
              Ranking de Criativos — {showBottom ? "Piores" : "Top 10"}
            </h3>
            <Badge variant="outline" className="text-[9px] text-muted-foreground">{rows.length} criativos</Badge>
          </div>
          <div className="flex items-center gap-1 flex-wrap">
            <SortBtn k="winner" label="Vencedores" />
            <SortBtn k="profit" label="Lucro" />
            <SortBtn k="roas" label="ROAS" />
            <SortBtn k="revenue" label="Receita" />
            <SortBtn k="spend" label="Gasto" />
            <SortBtn k="sales" label="Vendas" />
            <Button
              size="sm"
              variant={showBottom ? "destructive" : "outline"}
              className="h-7 text-[10px] px-2 ml-2"
              onClick={() => setShowBottom(v => !v)}
            >
              {showBottom ? "Ver Top" : "Ver Piores"}
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="text-[10px] uppercase text-muted-foreground font-medium">#</TableHead>
                <TableHead className="text-[10px] uppercase text-muted-foreground font-medium">Criativo</TableHead>
                <TableHead className="text-[10px] uppercase text-muted-foreground font-medium text-right">Gasto</TableHead>
                <TableHead className="text-[10px] uppercase text-muted-foreground font-medium text-right">Receita</TableHead>
                <TableHead className="text-[10px] uppercase text-muted-foreground font-medium text-right">Lucro</TableHead>
                <TableHead className="text-[10px] uppercase text-muted-foreground font-medium text-right">ROAS</TableHead>
                <TableHead className="text-[10px] uppercase text-muted-foreground font-medium text-right">CAC</TableHead>
                <TableHead className="text-[10px] uppercase text-muted-foreground font-medium text-right">CTR</TableHead>
                <TableHead className="text-[10px] uppercase text-muted-foreground font-medium text-right">Vendas</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((c, i) => {
                const good = c.profit > 0 && c.roas >= 1;
                return (
                  <TableRow key={c.id} className="border-border">
                    <TableCell className="text-xs font-mono text-muted-foreground">
                      <div className="flex items-center gap-1">
                        {i === 0 && !showBottom && <Trophy className="h-3 w-3 text-amber-400" />}
                        {i === 0 && showBottom && <AlertTriangle className="h-3 w-3 text-destructive" />}
                        {i + 1}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs font-mono font-semibold">{c.id}</TableCell>
                    <TableCell className="text-xs font-data text-right">{fmt(c.spend)}</TableCell>
                    <TableCell className="text-xs font-data text-right text-wr-positive">{fmt(c.revenue)}</TableCell>
                    <TableCell className={`text-xs font-data text-right font-semibold ${c.profit >= 0 ? "text-wr-positive" : "text-destructive"}`}>
                      {fmt(c.profit)}
                    </TableCell>
                    <TableCell className="text-xs font-data text-right">
                      <span className={`inline-flex items-center gap-0.5 ${c.roas >= 1.5 ? "text-wr-positive" : c.roas >= 1 ? "text-amber-400" : "text-destructive"}`}>
                        {good ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                        {c.roas.toFixed(2)}x
                      </span>
                    </TableCell>
                    <TableCell className="text-xs font-data text-right">{c.sales > 0 ? fmt(c.cac) : "—"}</TableCell>
                    <TableCell className="text-xs font-data text-right">{c.ctr.toFixed(2)}%</TableCell>
                    <TableCell className="text-xs font-data text-right">{c.sales}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
