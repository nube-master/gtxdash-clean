import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PacingCampaign } from "./mockData";

interface Props {
  open: boolean;
  onClose: () => void;
  campaigns: PacingCampaign[];
}

const fmtBRL = (v: number | null | undefined) =>
  v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });
const fmtNum = (v: number | null | undefined, d = 2) =>
  v == null ? "—" : v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtInt = (v: number | null | undefined) =>
  v == null ? "—" : v.toLocaleString("pt-BR");
const fmtPct = (v: number | null | undefined) =>
  v == null ? "—" : `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

type MetricSpec = {
  key: string;
  label: string;
  get: (c: PacingCampaign) => number | null | undefined;
  fmt: (v: number | null | undefined) => string;
  /** "high" = maior é melhor; "low" = menor é melhor; "none" = não destacar */
  better: "high" | "low" | "none";
};

const METRICS: MetricSpec[] = [
  { key: "spend", label: "Gasto", get: (c) => c.spend, fmt: fmtBRL, better: "none" },
  { key: "revenue", label: "Receita", get: (c) => c.revenue, fmt: fmtBRL, better: "high" },
  { key: "sales", label: "Vendas", get: (c) => c.sales, fmt: fmtInt, better: "high" },
  { key: "cpa", label: "CPA", get: (c) => c.cpa, fmt: fmtBRL, better: "low" },
  { key: "roas", label: "ROAS", get: (c) => c.roas, fmt: (v) => (v == null ? "—" : `${fmtNum(v, 2)}x`), better: "high" },
  { key: "pace", label: "Pace %", get: (c) => c.pacePct, fmt: fmtPct, better: "none" },
  { key: "cpm", label: "CPM", get: (c) => c.cpm, fmt: fmtBRL, better: "low" },
  { key: "cpc", label: "CPC", get: (c) => c.cpc, fmt: fmtBRL, better: "low" },
  { key: "ctr", label: "CTR", get: (c) => c.ctr, fmt: fmtPct, better: "high" },
  { key: "impressions", label: "Impressões", get: (c) => c.impressions, fmt: fmtInt, better: "none" },
  { key: "clicks", label: "Cliques", get: (c) => c.clicks, fmt: fmtInt, better: "none" },
  { key: "dailyBudget", label: "Orçam. CBO", get: (c) => c.dailyBudget, fmt: fmtBRL, better: "none" },
  { key: "dailyTargetBrl", label: "Teto diário", get: (c) => c.dailyTargetBrl, fmt: fmtBRL, better: "none" },
  { key: "spendYesterday", label: "Gasto ontem", get: (c) => c.spendYesterday, fmt: fmtBRL, better: "none" },
  { key: "revenueYesterday", label: "Receita ontem", get: (c) => c.revenueYesterday, fmt: fmtBRL, better: "high" },
  { key: "salesYesterday", label: "Vendas ontem", get: (c) => c.salesYesterday, fmt: fmtInt, better: "high" },
];

function rankClass(value: number | null | undefined, all: (number | null | undefined)[], better: MetricSpec["better"]) {
  if (better === "none" || value == null || !isFinite(value)) return "";
  const nums = all.filter((v): v is number => v != null && isFinite(v));
  if (nums.length < 2) return "";
  const best = better === "high" ? Math.max(...nums) : Math.min(...nums);
  const worst = better === "high" ? Math.min(...nums) : Math.max(...nums);
  if (value === best && best !== worst) return "text-emerald-400 font-semibold";
  if (value === worst && best !== worst) return "text-rose-400";
  return "";
}

function trendIcon(value: number | null | undefined, all: (number | null | undefined)[], better: MetricSpec["better"]) {
  if (better === "none" || value == null || !isFinite(value)) return null;
  const nums = all.filter((v): v is number => v != null && isFinite(v));
  if (nums.length < 2) return null;
  const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
  if (Math.abs(value - avg) < avg * 0.02) return <Minus className="size-3 text-muted-foreground/60 inline" />;
  const above = value > avg;
  const good = (better === "high" && above) || (better === "low" && !above);
  const Icon = above ? TrendingUp : TrendingDown;
  return <Icon className={cn("size-3 inline", good ? "text-emerald-400" : "text-rose-400")} />;
}

export function CampaignCompareDialog({ open, onClose, campaigns }: Props) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[min(95vw,1100px)]">
        <DialogHeader>
          <DialogTitle>Comparar campanhas</DialogTitle>
          <DialogDescription className="text-xs">
            Comparando <b className="text-foreground">{campaigns.length}</b> campanha(s). Verde = melhor · Vermelho = pior na linha.
          </DialogDescription>
        </DialogHeader>

        {campaigns.length < 2 ? (
          <div className="text-sm text-muted-foreground py-6 text-center">
            Selecione pelo menos 2 campanhas para comparar.
          </div>
        ) : (
          <ScrollArea className="max-h-[70vh]">
            <Table className="text-xs tabular-nums">
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 bg-card z-10 min-w-[140px]">Métrica</TableHead>
                  {campaigns.map((c) => (
                    <TableHead key={c.id} className="min-w-[180px] max-w-[240px]">
                      <div className="truncate font-medium text-foreground" title={c.name}>{c.name}</div>
                      <div className="text-[10px] font-normal text-muted-foreground truncate">{c.account}</div>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {METRICS.map((m) => {
                  const values = campaigns.map((c) => m.get(c));
                  return (
                    <TableRow key={m.key} className="hover:bg-muted/30">
                      <TableCell className="sticky left-0 bg-card z-10 font-medium text-muted-foreground">
                        {m.label}
                      </TableCell>
                      {campaigns.map((c, i) => {
                        const v = values[i];
                        return (
                          <TableCell key={c.id} className={cn("text-right", rankClass(v, values, m.better))}>
                            <span className="inline-flex items-center gap-1 justify-end">
                              {m.fmt(v)}
                              {trendIcon(v, values, m.better)}
                            </span>
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </ScrollArea>
        )}

        <div className="flex justify-end pt-2">
          <Button size="sm" variant="outline" onClick={onClose}>Fechar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
