import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { GtxCampaignRow, GtxDecision } from "@/hooks/useGtxMetaData";
import { GTX_DECISION_CONFIG } from "@/hooks/useGtxMetaData";

function fmt(v: number, type: "currency" | "number" | "percent" | "roas") {
  if (type === "currency") return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
  if (type === "number") return new Intl.NumberFormat("pt-BR").format(Math.round(v));
  if (type === "percent") return `${v.toFixed(2).replace(".", ",")}%`;
  if (type === "roas") return `${v.toFixed(2).replace(".", ",")}x`;
  return String(v);
}

interface Props {
  row: GtxCampaignRow | null;
  decision: GtxDecision | null;
  reason: string;
  action: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function GtxCampaignDrawer({ row, decision, reason, action, open, onOpenChange }: Props) {
  if (!row) return null;

  const dec = decision ?? "OBSERVAR";
  const cfg = GTX_DECISION_CONFIG[dec];

  const metrics = [
    { label: "Gasto", value: fmt(row.spend, "currency") },
    { label: "Faturamento", value: fmt(row.revenue, "currency") },
    { label: "Lucro", value: fmt(row.profit, "currency"), color: row.profit > 0 ? "text-[#00c27a]" : row.profit < 0 ? "text-[#c0392b]" : "" },
    { label: "ROAS", value: fmt(row.roas, "roas") },
    { label: "ROI", value: fmt(row.roi, "percent") },
    { label: "Margem", value: fmt(row.margin, "percent") },
    { label: "Vendas", value: String(row.salesConfirmed) },
    { label: "CPA", value: row.cpaPaid > 0 ? fmt(row.cpaPaid, "currency") : "—" },
    { label: "CPM", value: fmt(row.cpm, "currency") },
    { label: "CTR", value: fmt(row.ctr, "percent") },
    { label: "CPC", value: fmt(row.cpc, "currency") },
    { label: "Cliques", value: fmt(row.clicks, "number") },
    { label: "Impressões", value: fmt(row.impressions, "number") },
    { label: "Orçamento", value: row.budget > 0 ? fmt(row.budget, "currency") : "—" },
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[380px] sm:w-[420px] overflow-y-auto" side="right">
        <SheetHeader className="pb-4 border-b border-border/20">
          <SheetTitle className="text-sm font-mono leading-tight">{row.displayName}</SheetTitle>
          <p className="text-[10px] text-muted-foreground font-mono break-all">{row.fullName}</p>
        </SheetHeader>

        <div className="space-y-5 pt-4">
          {/* Identity */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="text-[9px] uppercase tracking-wider text-muted-foreground/60">Fase</span>
              <p className="text-xs font-mono font-medium">{row.phase}</p>
            </div>
            <div>
              <span className="text-[9px] uppercase tracking-wider text-muted-foreground/60">Status</span>
              <p className="text-xs font-mono font-medium flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${row.status === "ACTIVE" ? "bg-emerald-400" : "bg-muted-foreground/30"}`} />
                {row.status}
              </p>
            </div>
            <div>
              <span className="text-[9px] uppercase tracking-wider text-muted-foreground/60">Conta</span>
              <p className="text-xs font-mono text-muted-foreground">{row.accountName}</p>
            </div>
            <div>
              <span className="text-[9px] uppercase tracking-wider text-muted-foreground/60">Criativo</span>
              <p className="text-xs font-mono text-muted-foreground">{row.creativeId}</p>
            </div>
            <div>
              <span className="text-[9px] uppercase tracking-wider text-muted-foreground/60">Projeto</span>
              <p className="text-xs font-mono text-muted-foreground">{row.project || "—"}</p>
            </div>
            <div>
              <span className="text-[9px] uppercase tracking-wider text-muted-foreground/60">Score</span>
              <p className="text-xs font-mono font-bold">{row.scoreGtx}</p>
            </div>
          </div>

          {/* Decision */}
          <div className="p-3 rounded-lg border border-border/20 bg-card/50">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">{cfg.emoji}</span>
              <span className="text-sm font-mono font-bold">{cfg.label}</span>
            </div>
            {reason && <p className="text-[11px] text-muted-foreground mb-1">{reason}</p>}
            {action && <p className="text-[11px] font-medium text-foreground/80">→ {action}</p>}
          </div>

          {/* Metrics — Period */}
          <div>
            <h3 className="text-[9px] uppercase tracking-widest text-muted-foreground/60 mb-2">Métricas — Período Selecionado</h3>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              {metrics.map((m) => (
                <div key={m.label} className="flex justify-between items-baseline">
                  <span className="text-[10px] text-muted-foreground/60">{m.label}</span>
                  <span className={`text-[11px] font-mono font-medium ${m.color || "text-foreground/80"}`}>{m.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Metrics — Last 3 Days */}
          <div>
            <h3 className="text-[9px] uppercase tracking-widest text-muted-foreground/60 mb-2">Métricas — Últimos 3 Dias</h3>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 mb-3">
              {[
                { label: "Gasto 3D", value: fmt(row.spend3DTotal, "currency") },
                { label: "Faturamento 3D", value: fmt(row.revenue3DTotal, "currency") },
                { label: "Lucro 3D", value: fmt(row.profit3DTotal, "currency"), color: row.profit3DTotal > 0 ? "text-[#00c27a]" : row.profit3DTotal < 0 ? "text-[#c0392b]" : "" },
                { label: "ROAS 3D", value: fmt(row.roas3D, "roas") },
                { label: "ROI 3D", value: fmt(row.roi3D, "percent") },
                { label: "Margem 3D", value: fmt(row.margin3D, "percent") },
                { label: "Vendas 3D", value: String(row.sales3D.reduce((a: number, b: number) => a + b, 0)) },
                { label: "CPA 3D", value: row.cpa3D > 0 ? fmt(row.cpa3D, "currency") : "—" },
              ].map((m) => (
                <div key={m.label} className="flex justify-between items-baseline">
                  <span className="text-[10px] text-muted-foreground/60">{m.label}</span>
                  <span className={`text-[11px] font-mono font-medium ${m.color || "text-foreground/80"}`}>{m.value}</span>
                </div>
              ))}
            </div>

            {/* Daily Breakdown */}
            <div className="grid grid-cols-3 gap-2">
              {row.profit3D.map((p, i) => {
                const d = new Date();
                d.setDate(d.getDate() - i);
                const dateLabel = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
                const weekday = d.toLocaleDateString("pt-BR", { weekday: "long" });
                const weekdayCapitalized = weekday.charAt(0).toUpperCase() + weekday.slice(1);
                return (
                  <Tooltip key={i}>
                    <TooltipTrigger asChild>
                      <div className={`p-2 rounded border text-center cursor-default ${p > 0 ? "border-[#00c27a]/20 bg-[#00c27a]/5" : p < 0 ? "border-[#c0392b]/20 bg-[#c0392b]/5" : "border-border/20"}`}>
                        <span className="text-[8px] uppercase text-muted-foreground/50 block">D{i} · {dateLabel}</span>
                        <span className={`text-[11px] font-mono font-bold ${p > 0 ? "text-[#00c27a]" : p < 0 ? "text-[#c0392b]" : "text-muted-foreground/40"}`}>
                          {fmt(p, "currency")}
                        </span>
                        <span className="text-[8px] text-muted-foreground/40 block">{row.sales3D[i]} venda(s)</span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs">{weekdayCapitalized}</TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
            <div className="flex items-center gap-2 text-[10px] mt-2">
              <span className="text-muted-foreground/60">Consistência:</span>
              <span className="font-mono font-medium">{row.consistency3D}</span>
              <span className="text-muted-foreground/40">({row.daysWithSale}/3 dias com venda)</span>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
