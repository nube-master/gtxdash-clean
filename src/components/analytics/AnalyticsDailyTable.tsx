import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowUpDown } from "lucide-react";

export interface AnalyticsDailyRow {
  date: string;
  spend: number;
  revenue: number;
  sales: number;
  frontSales: number;
  arpu: number;
  impressions: number;
  clicks: number;
  linkClicks: number;
  lpViews: number;
  plays: number;
  pitch: number;
  retention: number;
  ics: number;
  icr: number;
  cpm: number;
  cpc: number;
  costPerIc: number;
  costPerPitch: number;
  ticket: number;
  cac: number;
  roas: number;
  profit: number;
  margin: number;
  connectRate: number;
  costPerLpView: number;
  rowColorClass?: string;
}

const fmtBRL = (v: number) =>
  `R$ ${Math.round(v).toLocaleString("pt-BR")}`;
const fmtBRL2 = (v: number) =>
  `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtInt = (v: number) => Math.round(v).toLocaleString("pt-BR");
const fmtPct = (v: number) => `${v.toFixed(1)}%`;
const fmtDate = (d: string) => {
  const [y, m, dd] = d.split("-");
  return `${dd}/${m}/${y.slice(2)}`;
};

type SortKey = keyof AnalyticsDailyRow;

function SortableTh({
  label, k, sortKey, sortDir, onSort, align = "right", title, className = "",
}: {
  label: string; k: SortKey; sortKey: SortKey; sortDir: "asc" | "desc";
  onSort: (k: SortKey) => void; align?: "left" | "right"; title?: string; className?: string;
}) {
  const active = sortKey === k;
  return (
    <th
      title={title}
      onClick={() => onSort(k)}
      className={`px-3 py-2 font-medium cursor-pointer select-none whitespace-nowrap ${align === "left" ? "text-left" : "text-right"} ${active ? "text-foreground" : ""} ${className}`}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <ArrowUpDown className={`h-3 w-3 ${active ? "opacity-100" : "opacity-30"}`} />
      </span>
    </th>
  );
}

export function AnalyticsDailyTable({ rows }: { rows: AnalyticsDailyRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const toggleSort = (k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("desc"); }
  };

  const sorted = useMemo(() => {
    const arr = [...rows];
    arr.sort((a, b) => {
      const va = a[sortKey] as any;
      const vb = b[sortKey] as any;
      if (typeof va === "string" || typeof vb === "string") {
        return sortDir === "asc" ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
      }
      return sortDir === "asc" ? Number(va) - Number(vb) : Number(vb) - Number(va);
    });
    return arr;
  }, [rows, sortKey, sortDir]);

  const totals = useMemo(() => {
    const t = rows.reduce(
      (acc, r) => {
        acc.spend += r.spend; acc.revenue += r.revenue; acc.sales += r.sales;
        acc.frontSales += (r.frontSales || 0);
        acc.impressions += r.impressions; acc.clicks += r.clicks; acc.linkClicks += r.linkClicks;
        acc.lpViews += r.lpViews; acc.plays += r.plays; acc.pitch += r.pitch; acc.ics += r.ics;
        acc.retWeight += (r.plays * r.retention);
        return acc;
      },
      { spend: 0, revenue: 0, sales: 0, frontSales: 0, impressions: 0, clicks: 0, linkClicks: 0, lpViews: 0, plays: 0, pitch: 0, ics: 0, retWeight: 0 },
    );
    return {
      ...t,
      retention: t.plays > 0 ? t.retWeight / t.plays : 0,
      cpm: t.impressions > 0 ? (t.spend / t.impressions) * 1000 : 0,
      cpc: t.linkClicks > 0 ? t.spend / t.linkClicks : 0,
      costPerIc: t.ics > 0 ? t.spend / t.ics : 0,
      costPerPitch: t.pitch > 0 ? t.spend / t.pitch : 0,
      icr: t.lpViews > 0 ? (t.ics / t.lpViews) * 100 : 0,
      ticket: t.sales > 0 ? t.revenue / t.sales : 0,
      arpu: t.frontSales > 0 ? t.revenue / t.frontSales : 0,
      cac: t.frontSales > 0 ? t.spend / t.frontSales : 0,
      roas: t.spend > 0 ? t.revenue / t.spend : 0,
      profit: t.revenue - t.spend,
      margin: t.revenue > 0 ? ((t.revenue - t.spend) / t.revenue) * 100 : 0,
      connectRate: t.linkClicks > 0 ? (t.lpViews / t.linkClicks) * 100 : 0,
      costPerLpView: t.lpViews > 0 ? t.spend / t.lpViews : 0,
    };
  }, [rows]);

  if (rows.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Detalhamento diário</h3>
        <span className="text-[11px] text-muted-foreground">
          {rows.length} dia(s) no período • segue os filtros aplicados acima
        </span>
      </div>

      {/* Mobile: cards */}
      <div className="grid grid-cols-1 gap-2 md:hidden">
        {sorted.map((r) => (
          <Card key={r.date} className="p-3">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs text-primary">{fmtDate(r.date)}</span>
              <Badge variant="outline" className={`text-[10px] font-mono ${r.profit > 0 ? "border-success/40 text-success" : r.profit < 0 ? "border-red/40 text-red" : "border-border/40 text-muted-foreground"}`}>
                {r.roas > 0 ? `${r.roas.toFixed(2)}x` : "—"}
              </Badge>
            </div>
            <div className="mt-2 grid grid-cols-4 gap-1 text-center">
              <div className="rounded bg-spend/[0.06] py-1.5">
                <div className="text-[9px] uppercase text-spend/70 font-semibold">Invest</div>
                <div className="text-[12px] font-semibold tabular-nums">{fmtBRL(r.spend)}</div>
              </div>
              <div className="rounded bg-success/[0.06] py-1.5">
                <div className="text-[9px] uppercase text-success/70 font-semibold">Receita</div>
                <div className="text-[12px] font-semibold tabular-nums">{fmtBRL(r.revenue)}</div>
              </div>
              <div className="rounded bg-muted/60 py-1.5">
                <div className="text-[9px] uppercase text-muted-foreground font-semibold">Vendas</div>
                <div className="text-[12px] font-semibold tabular-nums">{fmtInt(r.sales)}</div>
              </div>
              <div className="rounded bg-muted/60 py-1.5">
                <div className="text-[9px] uppercase text-muted-foreground font-semibold">Lucro</div>
                <div className={`text-[12px] font-semibold tabular-nums ${r.profit > 0 ? "text-success" : r.profit < 0 ? "text-red" : "text-foreground"}`}>{fmtBRL(r.profit)}</div>
              </div>
            </div>
            <div className="mt-2 grid grid-cols-4 gap-1 text-[10px]">
              <div><div className="text-muted-foreground uppercase text-[9px]">CPC</div><div className="tabular-nums">{r.cpc > 0 ? fmtBRL2(r.cpc) : "—"}</div></div>
              <div><div className="text-muted-foreground uppercase text-[9px]">CPM</div><div className="tabular-nums">{r.cpm > 0 ? fmtBRL2(r.cpm) : "—"}</div></div>
              <div><div className="text-muted-foreground uppercase text-[9px]">Pitch</div><div className="tabular-nums">{fmtInt(r.pitch)}</div></div>
              <div><div className="text-muted-foreground uppercase text-[9px]">ICs</div><div className="tabular-nums">{fmtInt(r.ics)}</div></div>
              <div className="text-right"><div className="text-muted-foreground uppercase text-[9px]">CAC</div><div className="tabular-nums">{r.cac > 0 ? fmtBRL2(r.cac) : "—"}</div></div>
            </div>
          </Card>
        ))}
      </div>

      {/* Desktop: full table */}
      <Card className="overflow-hidden hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr className="border-b border-border/60">
                <th className="px-3 py-1.5 text-left text-[10px] font-semibold text-muted-foreground/70">Dia</th>
                <th colSpan={8} className="px-3 py-1.5 text-center text-[10px] font-semibold text-spend/80 bg-spend/[0.04] border-l border-border/60">🎯 Tráfego</th>
                <th colSpan={6} className="px-3 py-1.5 text-center text-[10px] font-semibold text-violet-400/80 bg-violet-500/[0.04] border-l border-border/60">🔎 Funil</th>
                <th colSpan={6} className="px-3 py-1.5 text-center text-[10px] font-semibold text-success/80 bg-success/[0.04] border-l border-border/60">💰 Vendas</th>
                <th colSpan={3} className="px-3 py-1.5 text-center text-[10px] font-semibold text-foreground/70 bg-muted/60 border-l border-border/60">📊 Resultado</th>
              </tr>
              <tr>
                <SortableTh label="Data" k="date" align="left" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                {/* Tráfego */}
                <SortableTh label="Invest" k="spend" title="Investimento em mídia no dia (BRL)" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="border-l border-border/60" />
                <SortableTh label="Impressões" k="impressions" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh label="Cliques" k="linkClicks" title="Cliques no link (inline_link_clicks)" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh label="CPC" k="cpc" title="Investimento ÷ cliques no link" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh label="CPM" k="cpm" title="Custo por mil impressões" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh label="LP Views" k="lpViews" title="Visualizações da Landing Page" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh label="Custo/LPV" k="costPerLpView" title="Custo por LP View" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh label="CR%" k="connectRate" title="Connect Rate (Passagem) = LP Views ÷ Cliques" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh label="Plays" k="plays" title="Plays únicos da VSL (unique_views)" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="border-l border-border/60" />
                <SortableTh label="Audiência Pitch" k="pitch" title="Audiência absoluta que chegou ao Pitch" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh label="Custo/Pitch" k="costPerPitch" title="Custo por pessoa que chegou ao Pitch" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh label="Pitch %" k="retention" title="Retenção média no Pitch" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh label="ICs" k="ics" title="Inícios de checkout" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh label="Custo/IC" k="costPerIc" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh label="IC%" k="icr" title="IC Rate = ICs ÷ LP Views" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                {/* Vendas */}
                <SortableTh label="Vendas Totais" k="sales" title="Total de vendas aprovadas no dia" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="border-l border-border/60" />
                <SortableTh label="Vendas Front" k="frontSales" title="Vendas do produto principal (front-end)" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh label="CAC" k="cac" title="Investimento ÷ Vendas front-end" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh label="Ticket" k="ticket" title="Ticket médio = Faturamento ÷ Vendas totais" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh label="ARPU" k="arpu" title="Receita por usuário = Faturamento ÷ Vendas front-end" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh label="Faturamento" k="revenue" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                {/* Resultado */}
                <SortableTh label="Lucro" k="profit" title="Faturamento − Investimento (bruto)" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="border-l border-border/60" />
                <SortableTh label="Margem" k="margin" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh label="ROAS" k="roas" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr
                  key={r.date}
                  className={`border-t border-border/40 ${r.rowColorClass || ""} ${r.profit < 0 ? "bg-destructive/[0.03]" : "hover:bg-muted/30"}`}
                >
                  <td className="px-3 py-2 font-mono text-xs text-primary">{fmtDate(r.date)}</td>
                  {/* Tráfego */}
                  <td className="px-3 py-2 text-right tabular-nums border-l border-border/60">{fmtBRL(r.spend)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{fmtInt(r.impressions)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtInt(r.linkClicks)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.cpc > 0 ? fmtBRL2(r.cpc) : "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{r.cpm > 0 ? fmtBRL2(r.cpm) : "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtInt(r.lpViews)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{r.costPerLpView > 0 ? fmtBRL2(r.costPerLpView) : "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium text-[#24D67E]">{r.connectRate > 0 ? fmtPct(r.connectRate) : "—"}</td>
                  {/* Funil */}
                  <td className="px-3 py-2 text-right tabular-nums border-l border-border/60">{fmtInt(r.plays)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtInt(r.pitch)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{r.costPerPitch > 0 ? fmtBRL2(r.costPerPitch) : "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{r.retention > 0 ? fmtPct(r.retention) : "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtInt(r.ics)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{r.costPerIc > 0 ? fmtBRL2(r.costPerIc) : "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium text-[#24D67E]">{r.icr > 0 ? fmtPct(r.icr) : "—"}</td>
                  {/* Vendas */}
                  <td className="px-3 py-2 text-right tabular-nums border-l border-border/60">{fmtInt(r.sales)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtInt(r.frontSales || 0)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.cac > 0 ? fmtBRL2(r.cac) : "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{r.ticket > 0 ? fmtBRL(r.ticket) : "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{r.arpu > 0 ? fmtBRL(r.arpu) : "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-[#24D67E] font-medium">{fmtBRL(r.revenue)}</td>
                  {/* Resultado */}
                  <td className={`px-3 py-2 text-right tabular-nums font-medium border-l border-border/60 ${r.profit > 0 ? "text-[#24D67E]" : r.profit < 0 ? "text-[#F2354A]" : "text-foreground"}`}>{fmtBRL(r.profit)}</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${r.margin >= 0 ? "text-[#24D67E]" : "text-[#F2354A]"}`}>{r.margin !== 0 ? fmtPct(r.margin) : "—"}</td>
                  <td className={`px-3 py-2 text-right tabular-nums font-medium ${r.roas >= 1 ? "text-[#24D67E]" : "text-[#F2354A]"}`}>{r.roas > 0 ? `${r.roas.toFixed(2)}x` : "—"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-muted/40 font-medium">
              <tr>
                <td className="px-3 py-2 text-xs uppercase">Total</td>
                <td className="px-3 py-2 text-right tabular-nums border-l border-border/60">{fmtBRL(totals.spend)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{fmtInt(totals.impressions)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtInt(totals.linkClicks)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{totals.cpc > 0 ? fmtBRL2(totals.cpc) : "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{totals.cpm > 0 ? fmtBRL2(totals.cpm) : "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtInt(totals.lpViews)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{totals.costPerLpView > 0 ? fmtBRL2(totals.costPerLpView) : "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums font-medium text-spend">{totals.connectRate > 0 ? fmtPct(totals.connectRate) : "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums border-l border-border/60">{fmtInt(totals.plays)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtInt(totals.pitch)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{totals.costPerPitch > 0 ? fmtBRL2(totals.costPerPitch) : "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{totals.retention > 0 ? fmtPct(totals.retention) : "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtInt(totals.ics)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{totals.costPerIc > 0 ? fmtBRL2(totals.costPerIc) : "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums font-medium text-violet-400">{totals.icr > 0 ? fmtPct(totals.icr) : "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums border-l border-border/60">{fmtInt(totals.sales)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtInt(totals.frontSales)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{totals.cac > 0 ? fmtBRL2(totals.cac) : "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{totals.ticket > 0 ? fmtBRL(totals.ticket) : "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{totals.arpu > 0 ? fmtBRL(totals.arpu) : "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums text-success">{fmtBRL(totals.revenue)}</td>
                <td className={`px-3 py-2 text-right tabular-nums border-l border-border/60 ${totals.profit >= 0 ? "text-success" : "text-red"}`}>{fmtBRL(totals.profit)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{totals.margin !== 0 ? fmtPct(totals.margin) : "—"}</td>
                <td className={`px-3 py-2 text-right tabular-nums ${totals.roas >= 1 ? "text-success" : "text-red"}`}>{totals.roas > 0 ? `${totals.roas.toFixed(2)}x` : "—"}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
    </div>
  );
}
