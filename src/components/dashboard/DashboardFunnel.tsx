import { useState, useRef, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const stageTooltips: Record<string, string> = {
  "Impressões": "Total de vezes que seus anúncios foram exibidos. Base do funil — quanto maior, mais alcance.",
  "Cliques": "Pessoas que clicaram no anúncio. A taxa (CTR) indica se o criativo está atrativo o suficiente.",
  "LP View": "Visitantes que efetivamente carregaram a landing page. Perdas aqui indicam problemas de velocidade ou link quebrado.",
  "Plays": "Quantos visitantes deram play no vídeo. Taxa baixa pode indicar headline fraca ou player mal posicionado.",
  "Pitch": "Audiência que assistiu até o pitch de vendas. Baseado na retenção média × plays. Indica se o hook do vídeo prende.",
  "IC": "Initiate Checkout — visitantes que iniciaram o processo de compra. Mede a força da oferta e do CTA.",
  "Vendas": "Conversões finalizadas. A taxa (Conv. Rate) indica eficiência do checkout e do gateway de pagamento.",
};

const stageCostLabels: Record<string, string> = {
  "Impressões": "CPM",
  "Cliques": "CPC",
  "LP View": "C/LP View",
  "Plays": "C/Play",
  "Pitch": "C/Pitch",
  "IC": "C/IC",
  "Vendas": "CPA",
};

interface FunnelStage {
  label: string;
  volume: number;
  costPer: number;
  revenuePer: number;
  rateLabel: string;
  ratePct: number;
}

interface Props {
  stages: FunnelStage[];
  bottleneck: { from: string; to: string; drop: number; insight: string } | null;
  /** Daily rate values per stage label, for sparkline rendering */
  dailyRates?: Record<string, number[]>;
  /** Day labels for sparkline tooltips (e.g. "03/04") */
  dailyLabels?: string[];
}

function Sparkline({ data, labels }: { data: number[]; labels?: string[] }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const handleMouseLeave = useCallback(() => setHoverIdx(null), []);

  if (!data || data.length < 2) return null;

  const w = 80;
  const h = 24;
  const padX = 4;
  const padY = 3;
  const innerW = w - padX * 2;
  const innerH = h - padY * 2;
  const max = Math.max(...data, 0.01);
  const min = Math.min(...data, 0);
  const range = max - min || 1;

  const coords = data.map((v, i) => ({
    x: padX + (i / (data.length - 1)) * innerW,
    y: padY + innerH - ((v - min) / range) * innerH,
    value: v,
    label: labels?.[i] ?? `D${i + 1}`,
  }));

  const points = coords.map((c) => `${c.x},${c.y}`).join(" ");
  const last = data[data.length - 1];
  const first = data[0];
  const color = last >= first ? "hsl(var(--success))" : "hsl(var(--red))";

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    let closest = 0;
    let closestDist = Infinity;
    for (let i = 0; i < coords.length; i++) {
      const dist = Math.abs(coords[i].x - mouseX);
      if (dist < closestDist) {
        closestDist = dist;
        closest = i;
      }
    }
    setHoverIdx(closest);
  };

  const hovered = hoverIdx !== null ? coords[hoverIdx] : null;

  return (
    <div className="relative flex justify-center">
      <svg
        ref={svgRef}
        width={w}
        height={h}
        className="mt-1.5 opacity-80 cursor-crosshair"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {hovered && (
          <>
            <circle cx={hovered.x} cy={hovered.y} r="3" fill={color} />
            <line
              x1={hovered.x}
              y1={padY}
              x2={hovered.x}
              y2={h - padY}
              stroke={color}
              strokeWidth="0.5"
              opacity="0.4"
            />
          </>
        )}
      </svg>
      {hovered && (
        <div
          className="absolute -top-8 pointer-events-none z-50 bg-popover border border-border rounded px-1.5 py-0.5 shadow-md whitespace-nowrap"
          style={{ left: `calc(50% + ${hovered.x - w / 2}px)`, transform: "translateX(-50%)" }}
        >
          <span className="text-[9px] font-data font-semibold text-foreground">
            {hovered.label}: {hovered.value.toFixed(1)}%
          </span>
        </div>
      )}
    </div>
  );
}

function fmt(v: number, type: "currency" | "number" | "percent") {
  if (type === "currency")
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
  if (type === "number") return new Intl.NumberFormat("pt-BR").format(Math.round(v));
  if (type === "percent") return `${v.toFixed(1)}%`;
  return String(v);
}

export function DashboardFunnel({ stages, bottleneck, dailyRates, dailyLabels }: Props) {
  const maxVolume = stages.length > 0 ? Math.max(...stages.map((s) => s.volume), 1) : 1;

  return (
    <TooltipProvider delayDuration={200}>
    <div className="space-y-4">
      <Card className="bg-card border border-border">
        <CardContent className="p-5">
          <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-4">
            Funil Completo de Conversão
          </h3>

          {/* Horizontal funnel */}
          <div className="overflow-x-auto">
            <div className="flex items-stretch gap-0 min-w-[900px]">
              {stages.map((stage, i) => {
                const widthPct = Math.max(12, (stage.volume / maxVolume) * 100);
                const isBottleneckTo = bottleneck && stage.label === bottleneck.to;

                return (
                  <div key={stage.label} className="flex items-stretch flex-1 min-w-0">
                    {/* Stage block */}
                    <div
                      className={`flex-1 flex flex-col p-4 rounded-lg border transition-all ${
                        isBottleneckTo
                          ? "border-destructive/40 bg-destructive/5"
                          : "border-border bg-secondary/20"
                      }`}
                    >
                      {/* Top row: label + cost badge */}
                      <div className="flex items-start justify-between gap-2">
                        {/* Label with tooltip */}
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider leading-tight">
                            {stage.label}
                          </span>
                          {stageTooltips[stage.label] && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Info className="h-3 w-3 text-muted-foreground/50 cursor-help shrink-0" />
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-[220px] text-xs">
                                {stageTooltips[stage.label]}
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </div>

                        {/* Cost badge */}
                        <div className="flex flex-col items-end">
                          <span className="text-[8px] font-semibold text-muted-foreground/70 uppercase tracking-wider">
                            {stageCostLabels[stage.label] ?? "Custo"}
                          </span>
                          <span className="text-[13px] font-bold font-data text-amber-400">
                            {stage.label === "Impressões"
                              ? fmt(stage.costPer * 1000, "currency")
                              : fmt(stage.costPer, "currency")}
                          </span>
                        </div>
                      </div>

                      {/* Volume */}
                      <p className="text-xl font-bold font-data text-foreground mt-1.5 text-center">
                        {fmt(stage.volume, "number")}
                      </p>

                      {/* Rate bar */}
                      <div className="w-full mt-3 space-y-1.5">
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="text-muted-foreground">{stage.rateLabel}</span>
                          <span className={`font-semibold font-data ${
                            stage.ratePct >= 5 ? "text-success" : stage.ratePct >= 1 ? "text-foreground" : "text-red"
                          }`}>
                            {fmt(stage.ratePct, "percent")}
                          </span>
                        </div>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full bg-primary transition-all"
                            style={{ width: `${Math.min(stage.ratePct, 100)}%` }}
                          />
                        </div>
                      </div>

                      {/* Sparkline */}
                      {i > 0 && dailyRates?.[stage.label] && (
                        <div className="flex justify-center">
                          <Sparkline data={dailyRates[stage.label]} labels={dailyLabels} />
                        </div>
                      )}
                    </div>

                    {/* Arrow connector */}
                    {i < stages.length - 1 && (
                      <div className="flex items-center justify-center w-4 shrink-0">
                        <svg width="10" height="16" viewBox="0 0 10 16" className="text-muted-foreground/40">
                          <path d="M2 1 L8 8 L2 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bottleneck Diagnostic */}
      {bottleneck && (
        <Card className="border border-destructive/20 bg-destructive/5">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="h-8 w-8 rounded-full flex items-center justify-center bg-destructive/10 shrink-0">
                <AlertTriangle className="h-4 w-4 text-destructive" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-foreground">⚠ Gargalo Atual:</span>
                  <span className="text-xs font-bold text-destructive">
                    {bottleneck.from} → {bottleneck.to}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Queda: <span className="font-semibold text-destructive font-data">-{bottleneck.drop.toFixed(1)}%</span>
                </p>
                <p className="text-xs text-foreground/80 mt-1">{bottleneck.insight}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
    </TooltipProvider>
  );
}
