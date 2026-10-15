import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOperation } from "@/contexts/OperationContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Swords, TrendingUp, DollarSign, Flame, Trophy, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const CBO_TAG = "[CBO-BAIANO]";
const BID_TAG = "[BID-BAIANO]";

function fmtBRL(v: number) {
  return `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function brDate(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

function hasTag(name: string, tag: string) {
  return (name || "").toUpperCase().includes(tag.toUpperCase());
}

type Structure = "CBO" | "BID";

type CampaignRow = {
  campaign_name: string;
  spend: number;
  revenue: number;
  lucro: number;
  roas: number;
};

export function GuerraEstruturas02Live() {
  const { operation } = useOperation();
  const [structure, setStructure] = useState<Structure>("CBO");
  const today = brDate();

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["guerra-estruturas-02-live", today, operation?.id],
    queryFn: async () => {
      // Fetch traffic spend for today
      let trafficQ = supabase
        .from("traffic_data")
        .select("campaign_name, spend:spend_brl")
        .eq("date", today)
        .gt("spend", 0);
      if (operation?.id) trafficQ = trafficQ.eq("operation_id", operation.id);
      const { data: traffic } = await trafficQ;

      // Fetch RedTrack purchases for today (BR window)
      const startUtc = `${today}T03:00:00Z`;
      const nextDay = new Date(`${today}T12:00:00Z`);
      nextDay.setUTCDate(nextDay.getUTCDate() + 1);
      const endUtc = `${nextDay.toISOString().slice(0, 10)}T03:00:00Z`;

      let rtQ = supabase
        .from("redtrack_events")
        .select("utm_campaign, amount, currency, raw_payload")
        .eq("event_type", "purchase")
        .gte("occurred_at", startUtc)
        .lt("occurred_at", endUtc)
        .gt("amount", 0);
      if (operation?.id) rtQ = rtQ.eq("operation_id", operation.id);
      const { data: rt } = await rtQ;

      // ClickBank receipts → BRL map
      let cbQ = supabase
        .from("clickbank_audit")
        .select("receipt, amount_brl")
        .eq("date", today)
        .eq("transaction_type", "SALE");
      if (operation?.id) cbQ = cbQ.eq("operation_id", operation.id);
      const { data: cb } = await cbQ;

      const receiptMap = new Map<string, number>();
      for (const row of cb || []) {
        const r = String(row.receipt || "").trim();
        const amt = Number(row.amount_brl || 0);
        if (r && amt > 0 && !receiptMap.has(r)) receiptMap.set(r, amt);
      }

      // Get exchange rate fallback
      const usdToBrl = 5.15;

      // Aggregate by campaign_name
      const map = new Map<string, CampaignRow>();
      for (const row of traffic || []) {
        const name = row.campaign_name || "";
        if (!hasTag(name, CBO_TAG) && !hasTag(name, BID_TAG)) continue;
        const cur = map.get(name) || { campaign_name: name, spend: 0, revenue: 0, lucro: 0, roas: 0 };
        cur.spend += Number(row.spend || 0);
        map.set(name, cur);
      }
      for (const ev of rt || []) {
        const name = (ev as any).utm_campaign || "";
        if (!hasTag(name, CBO_TAG) && !hasTag(name, BID_TAG)) continue;
        const payload = (ev as any).raw_payload || {};
        const receipt = payload?.p_sub1 || payload?.receipt || null;
        const auditAmt = receipt ? receiptMap.get(String(receipt).trim()) : undefined;
        let revBrl: number;
        if (((ev as any).currency || "").toUpperCase() === "BRL") revBrl = Number((ev as any).amount || 0);
        else if (typeof auditAmt === "number" && auditAmt > 0) revBrl = auditAmt;
        else revBrl = Number((ev as any).amount || 0) * usdToBrl;
        const cur = map.get(name) || { campaign_name: name, spend: 0, revenue: 0, lucro: 0, roas: 0 };
        cur.revenue += revBrl;
        map.set(name, cur);
      }

      const rows = Array.from(map.values()).map((r) => ({
        ...r,
        lucro: r.revenue - r.spend,
        roas: r.spend > 0 ? r.revenue / r.spend : 0,
      }));
      return rows;
    },
    refetchInterval: 60_000, // auto-refresh every 60s, no page reload
  });

  const filtered = useMemo(() => {
    if (!data) return [] as CampaignRow[];
    const tag = structure === "CBO" ? CBO_TAG : BID_TAG;
    return data.filter((r) => hasTag(r.campaign_name, tag)).sort((a, b) => b.lucro - a.lucro);
  }, [data, structure]);

  const totals = useMemo(() => {
    const t = { spend: 0, revenue: 0, lucro: 0, roas: 0 };
    for (const r of filtered) {
      t.spend += r.spend;
      t.revenue += r.revenue;
    }
    t.lucro = t.revenue - t.spend;
    t.roas = t.spend > 0 ? t.revenue / t.spend : 0;
    return t;
  }, [filtered]);

  const winnerSide = useMemo(() => {
    if (!data) return null;
    const cboTotals = data.filter((r) => hasTag(r.campaign_name, CBO_TAG)).reduce((acc, r) => acc + r.lucro, 0);
    const bidTotals = data.filter((r) => hasTag(r.campaign_name, BID_TAG)).reduce((acc, r) => acc + r.lucro, 0);
    if (cboTotals === bidTotals) return null;
    return cboTotals > bidTotals ? "CBO" : "BID";
  }, [data]);

  const accent = structure === "CBO" ? "text-blue-400" : "text-rose-400";
  const accentBg = structure === "CBO" ? "bg-blue-500/10 border-blue-500/30" : "bg-rose-500/10 border-rose-500/30";

  return (
    <Card className="bg-card/50 border-border/30">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Swords className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm font-semibold">Guerra de Estruturas 02 — Ao Vivo</CardTitle>
            {winnerSide && (
              <Badge variant="outline" className="ml-2 gap-1 border-amber-500/40 text-amber-400 bg-amber-500/10">
                <Trophy className="h-3 w-3" />
                {winnerSide} BAIANO vencendo
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <ToggleGroup
              type="single"
              value={structure}
              onValueChange={(v) => v && setStructure(v as Structure)}
              className="bg-secondary/30 border border-border/30 rounded-md p-0.5"
            >
              <ToggleGroupItem value="CBO" className="text-xs h-7 px-3 data-[state=on]:bg-blue-500/20 data-[state=on]:text-blue-400">
                🔵 CBO BAIANO
              </ToggleGroupItem>
              <ToggleGroupItem value="BID" className="text-xs h-7 px-3 data-[state=on]:bg-rose-500/20 data-[state=on]:text-rose-400">
                🔴 BID BAIANO
              </ToggleGroupItem>
            </ToggleGroup>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className={cn("rounded-md border p-3", accentBg)}>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <DollarSign className="h-3 w-3" /> Lucro
            </div>
            <p className={cn("text-lg font-bold", totals.lucro >= 0 ? accent : "text-destructive")}>
              {fmtBRL(totals.lucro)}
            </p>
          </div>
          <div className="rounded-md border border-border/30 p-3 bg-secondary/20">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <TrendingUp className="h-3 w-3" /> ROAS
            </div>
            <p className="text-lg font-bold">{totals.roas.toFixed(2)}x</p>
          </div>
          <div className="rounded-md border border-border/30 p-3 bg-secondary/20">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <DollarSign className="h-3 w-3" /> Receita
            </div>
            <p className="text-lg font-bold text-wr-positive">{fmtBRL(totals.revenue)}</p>
          </div>
          <div className="rounded-md border border-border/30 p-3 bg-secondary/20">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <Flame className="h-3 w-3" /> Gasto
            </div>
            <p className="text-lg font-bold text-amber-400">{fmtBRL(totals.spend)}</p>
          </div>
        </div>

        {/* Campaigns Table */}
        <div className="border border-border/30 rounded-md overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-secondary/20 hover:bg-secondary/20">
                <TableHead className="text-xs">Campanha</TableHead>
                <TableHead className="text-xs text-right">Gasto</TableHead>
                <TableHead className="text-xs text-right">Receita</TableHead>
                <TableHead className="text-xs text-right">Lucro</TableHead>
                <TableHead className="text-xs text-right">ROAS</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-xs text-muted-foreground py-6">
                    Carregando…
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-xs text-muted-foreground py-6">
                    Nenhuma campanha {structure} BAIANO com gasto hoje.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((r) => (
                  <TableRow key={r.campaign_name} className="text-xs">
                    <TableCell className="font-mono text-[11px] max-w-[400px] truncate" title={r.campaign_name}>
                      {r.campaign_name}
                    </TableCell>
                    <TableCell className="text-right text-amber-400">{fmtBRL(r.spend)}</TableCell>
                    <TableCell className="text-right text-wr-positive">{fmtBRL(r.revenue)}</TableCell>
                    <TableCell className={cn("text-right font-semibold", r.lucro >= 0 ? "text-wr-positive" : "text-destructive")}>
                      {fmtBRL(r.lucro)}
                    </TableCell>
                    <TableCell className="text-right">{r.roas.toFixed(2)}x</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
