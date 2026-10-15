import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { useCountUp } from "@/hooks/useCountUp";
import { Sparkline } from "@/components/ui/sparkline";
import {
  Tooltip as RadixTooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";
import { KPI_TOOLTIPS } from "@/lib/kpiTooltips";

export type KpiType = "currency" | "number" | "percent" | "roas";

/* ── Formatters ── */
export function fmtKpi(value: number, type: KpiType) {
  if (type === "currency")
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  if (type === "number") return new Intl.NumberFormat("pt-BR").format(Math.round(value));
  if (type === "percent") return `${value.toFixed(1)}%`;
  if (type === "roas") return `${value.toFixed(2)}x`;
  return String(value);
}

function AnimatedValue({ target, type }: { target: number; type: KpiType }) {
  const animated = useCountUp(target);
  return <>{fmtKpi(animated, type)}</>;
}

/* ── Variation Badge ── */
function VariationBadge({ current, previous, label, isPerformanceMetric }: { 
  current: number; 
  previous: number; 
  label: string;
  isPerformanceMetric?: boolean;
}) {
  if (previous === 0 && current === 0)
    return <span className="text-[10px] text-muted-foreground">—</span>;
  const pct =
    previous !== 0
      ? ((current - previous) / Math.abs(previous)) * 100
      : current > 0
      ? 100
      : 0;
  const isUp = pct > 0;
  const isDown = pct < 0;

  const isPositiveChange = pct > 0.001;
  const isNegativeChange = pct < -0.001;
  
  let textColor = "";
  if (isPerformanceMetric) {
    textColor = isPositiveChange ? "#24D67E" : isNegativeChange ? "#F2354A" : "";
  }

  const style = textColor ? { color: textColor } : {};

  return (
    <span
      style={style}
      className={cn(
        "inline-flex items-center gap-0.5 text-[10px] font-medium tabular-nums",
        !textColor && "text-muted-foreground"
      )}
    >
      {isUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {isUp ? "+" : ""}
      {pct.toFixed(1)}%
    </span>
  );
}

const cardVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.4,
      ease: [0.25, 0.46, 0.45, 0.94] as const,
      delay: i * 0.04,
    },
  }),
};

export interface KpiCardProps {
  label: string;
  value: number;
  prevValue: number;
  type: KpiType;
  icon: React.ElementType;
  colorBySign?: boolean;
  index?: number;
  costLabel?: string;
  costValue?: number;
  sparkData?: number[];
  isLoading?: boolean;
  /** Optional inline explanation override; falls back to KPI_TOOLTIPS[label]. */
  tooltip?: string | React.ReactNode;
}

/**
 * Unified KPI card used across the dashboard.
 */
export function KpiCard({
  label,
  value,
  prevValue,
  type,
  icon: Icon,
  colorBySign,
  index = 0,
  costLabel,
  costValue,
  sparkData,
  isLoading,
  tooltip,
}: KpiCardProps) {
  const labelLower = label.toLowerCase();
  
  const isPerformanceMetric = 
    labelLower.includes("lucro") || 
    labelLower.includes("roas") ||
    labelLower.includes("roi") || 
    labelLower.includes("margem");

  const isPacing = labelLower.includes("pacing");
  
  // As cores dinâmicas agora são restritas a métricas de lucro/margem/roi/roas.
  // Métricas de volume (Impressões, Cliques, Vendas, ICs, etc) devem permanecer brancas.
  const isColorable = colorBySign || isPerformanceMetric || isPacing;

  const valueColorStyle = isColorable
    ? { color: value > 0.0001 ? "#24D67E" : value < -0.0001 ? "#F2354A" : "inherit" }
    : {};

  const resolvedTooltip = tooltip ?? KPI_TOOLTIPS[label];

  return (
    <motion.div custom={index} variants={cardVariants} initial="hidden" animate="visible">
      <Card className="mobile-kpi-card bg-card border border-border/50 h-full hover:border-primary/20 transition-colors duration-200">
        <CardContent className="px-3 py-2.5 md:px-4 md:py-3.5 flex flex-col gap-1.5">
          {/* Header */}
          <div className="flex items-center justify-between gap-1.5 min-w-0">
            <div className="flex items-center gap-1 min-w-0 flex-1">
              <span className="text-[11px] leading-tight font-medium text-muted-foreground uppercase tracking-wide truncate">
                {label}
              </span>
              {resolvedTooltip && (
                <TooltipProvider delayDuration={200}>
                  <RadixTooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        aria-label={`Sobre ${label}`}
                        className="shrink-0 inline-flex"
                      >
                        <Info className="h-3 w-3 text-muted-foreground/40 hover:text-muted-foreground transition-colors" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[220px] text-[11px]">
                      {resolvedTooltip}
                    </TooltipContent>
                  </RadixTooltip>
                </TooltipProvider>
              )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {sparkData && sparkData.length >= 2 && (
                <Sparkline data={sparkData} width={48} height={16} />
              )}
              <Icon className="h-3.5 w-3.5 md:h-4 md:w-4 text-muted-foreground/40" />
            </div>
          </div>

          {/* Value */}
          <p
            style={valueColorStyle}
            className={cn(
              "text-[17px] md:text-2xl font-bold font-data tabular-nums leading-none truncate",
              !isColorable && "text-foreground"
            )}
            title={!isLoading ? fmtKpi(value, type) : undefined}
          >
            {isLoading ? (
              <span className="inline-block h-5 md:h-6 w-20 rounded bg-muted/40 animate-pulse align-middle" />
            ) : (
              <AnimatedValue target={value} type={type} />
            )}
          </p>

          {/* Footer */}
          <div className="flex items-center justify-between gap-1 min-w-0">
            <div className="min-w-0 truncate">
              {isLoading ? (
                <span className="inline-block h-3 w-14 rounded bg-muted/30 animate-pulse" />
              ) : (
                <>
                  <VariationBadge current={value} previous={prevValue} label={label} isPerformanceMetric={isPerformanceMetric || isPacing} />
                  <span className="text-[9px] text-muted-foreground ml-1 hidden md:inline">
                    vs anterior
                  </span>
                </>
              )}
            </div>
            {costLabel && costValue !== undefined && !isLoading && (
              <span className="text-[9px] md:text-[10px] font-data font-semibold tabular-nums text-amber-400/80 truncate">
                {costLabel} {fmtKpi(costValue, "currency")}
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

export default KpiCard;