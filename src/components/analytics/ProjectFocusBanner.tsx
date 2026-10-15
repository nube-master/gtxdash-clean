import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import {
  X,
  Target,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Zap,
  Activity,
  ShoppingCart,
  Truck,
  RotateCcw,
} from "lucide-react";

interface Props {
  code: string;
  label?: string;
  revenue: number;
  spend: number;
  profit: number;
  margin: number;
  roas: number;
  cac: number;
  sales: number;
  ics: number;
  prev?: { revenue: number; spend: number; profit: number; roas: number; cac: number; sales: number };
  onClear: () => void;
  showCod?: boolean;
}

const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v).replace("R$", "R$ ");

const fmtNum = (v: number) =>
  new Intl.NumberFormat("pt-BR").format(Math.round(v));

function Delta({ cur, prev, invert }: { cur: number; prev?: number; invert?: boolean }) {
  if (prev === undefined || prev === 0) return <span className="text-[10px] text-muted-foreground">—</span>;
  const pct = ((cur - prev) / Math.abs(prev)) * 100;
  const up = pct >= 0;
  const positive = invert ? !up : up;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-medium tabular-nums ${positive ? "text-emerald-400" : "text-rose-400"}`}>
      <Icon className="w-2.5 h-2.5 shrink-0" />
      {Math.abs(pct).toFixed(0)}%
    </span>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  prev,
  accent,
}: {
  icon: typeof Target;
  label: string;
  value: string;
  prev?: { cur: number; prev: number; invert?: boolean };
  accent?: "good" | "bad" | "neutral";
}) {
  const color = accent === "good" ? "text-success" : accent === "bad" ? "text-destructive" : "text-foreground";
  return (
    <div className={`rounded-lg border bg-card p-4 transition-all duration-300 hover:bg-accent/5 ${
      accent === "good" ? "border-success/20 shadow-sm" : 
      accent === "bad" ? "border-destructive/20 shadow-sm" : 
      "border-border shadow-sm"
    }`}>
      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
        <div className={`w-1 h-3 rounded-full ${accent === "good" ? "bg-success" : accent === "bad" ? "bg-destructive" : "bg-muted"}`} />
        <span className="truncate" title={label}>{label}</span>
      </div>
      <div className={`text-2xl font-bold tabular-nums tracking-tight ${color}`}>{value}</div>
      {prev && (
        <div className="mt-1 flex items-center gap-1.5">
          <Delta cur={prev.cur} prev={prev.prev} invert={prev.invert} />
          <span className="text-[10px] text-muted-foreground">vs anterior</span>
        </div>
      )}
    </div>
  );
}

const DEFAULT_RATE = 50;
const storageKey = (code: string) => `cod-delivery-rate:${code}`;

export function ProjectFocusBanner({
  code,
  label,
  revenue,
  spend,
  profit,
  margin,
  roas,
  cac,
  sales,
  ics,
  prev,
  onClear,
  showCod = true,
}: Props) {
  // Persist per-project delivery rate
  const [rate, setRate] = useState<number>(() => {
    if (typeof window === "undefined") return DEFAULT_RATE;
    const raw = window.localStorage.getItem(storageKey(code));
    const v = raw ? Number(raw) : NaN;
    return Number.isFinite(v) && v >= 0 && v <= 100 ? v : DEFAULT_RATE;
  });

  useEffect(() => {
    const raw = window.localStorage.getItem(storageKey(code));
    const v = raw ? Number(raw) : NaN;
    setRate(Number.isFinite(v) && v >= 0 && v <= 100 ? v : DEFAULT_RATE);
  }, [code]);

  useEffect(() => {
    window.localStorage.setItem(storageKey(code), String(rate));
  }, [code, rate]);

  // Derived metrics with actual simulation logic
  const proj = useMemo(() => {
    const r = rate / 100;
    const deliveredSales = Math.round(sales * r);
    const realRevenue = revenue * r; // Simulador: Receita Real = Bruta (estimada) * Taxa de Entrega
    const realProfit = realRevenue - spend;
    const realMargin = realRevenue > 0 ? (realProfit / realRevenue) * 100 : 0;
    const realRoas = spend > 0 ? realRevenue / spend : 0;
    const realCac = deliveredSales > 0 ? spend / deliveredSales : 0;
    return { deliveredSales, realRevenue, realProfit, realMargin, realRoas, realCac };
  }, [rate, sales, revenue, spend]);

  const profitAccent = profit > 0 ? "good" : profit < 0 ? "bad" : "neutral";
  const roasAccent = roas >= 1.5 ? "good" : roas >= 1.1 ? "neutral" : "bad";
  
  const realProfitAccent = proj.realProfit > 0 ? "good" : proj.realProfit < 0 ? "bad" : "neutral";
  const realRoasAccent = proj.realRoas >= 1.5 ? "good" : proj.realRoas >= 1.1 ? "neutral" : "bad";

  return (
    <Card className="border-none bg-card ring-1 ring-white/5 shadow-2xl overflow-hidden relative rounded-[3px]">
      {/* Decorative background glow */}
      <div className="absolute inset-0 bg-gradient-to-br from-red/10 via-transparent to-transparent opacity-50 pointer-events-none" />
      
      <CardContent className="p-6 space-y-6 relative z-10">
        <div className="flex items-start justify-between flex-wrap gap-2">
          <div className="flex items-center gap-4">
            <div className="flex flex-col">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-1.5 h-8 bg-primary rounded-full" />
                <h2 className="text-3xl font-bold tracking-tight text-foreground uppercase leading-none">
                  {label || code.replace("[", "").replace("]", "")}
                </h2>
                <Badge className="bg-primary text-primary-foreground border-none text-[10px] font-bold px-2 py-0.5 rounded ml-3">MODO FOCO</Badge>
              </div>
              <span className="text-[11px] text-muted-foreground font-mono ml-4">{code}</span>
            </div>
          </div>
          <button
            onClick={onClear}
            className="h-9 px-4 inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground hover:bg-accent border border-border rounded-md transition-all group"
          >
            <X className="w-4 h-4 group-hover:rotate-90 transition-transform duration-300" /> Sair do foco
          </button>
        </div>

        {/* ── LINHA 1: MÉTRICAS BRUTAS (pedidos gerados) ── */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-widest">
              Performance Geral
            </h3>
            <div className="flex-1 h-px bg-border/50" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
            <StatCard icon={DollarSign} label="Receita" value={fmtBRL(revenue)}
              prev={prev ? { cur: revenue, prev: prev.revenue } : undefined} />
            <StatCard icon={Target} label="Investido" value={fmtBRL(spend)}
              prev={prev ? { cur: spend, prev: prev.spend, invert: true } : undefined} />
            <StatCard icon={Zap} label="Lucro" value={fmtBRL(profit)} accent={profitAccent}
              prev={prev ? { cur: profit, prev: prev.profit } : undefined} />
            <StatCard icon={Activity} label="Margem" value={`${margin.toFixed(1)}%`} accent={profitAccent} />
            <StatCard icon={TrendingUp} label="ROAS" value={`${roas.toFixed(2)}x`} accent={roasAccent}
              prev={prev ? { cur: roas, prev: prev.roas } : undefined} />
            <StatCard icon={Target} label="CAC" value={sales > 0 ? fmtBRL(cac) : "—"}
              prev={prev ? { cur: cac, prev: prev.cac, invert: true } : undefined} />
            <StatCard icon={ShoppingCart} label="Vendas" value={fmtNum(sales)}
              prev={prev ? { cur: sales, prev: prev.sales } : undefined} />
            <StatCard icon={Activity} label="ICs" value={fmtNum(ics)} />
          </div>
        </div>

        {/* ── LINHA 2: PROJEÇÃO COD (baseada na taxa de entrega) — só para operações COD ── */}
        {showCod && (
        <div className="rounded-xl border border-[#e21d48]/20 bg-card p-5 space-y-6 shadow-2xl relative overflow-hidden group">
          {/* Subtle amber gradient for projection feeling */}
          <div className="absolute inset-0 bg-gradient-to-r from-amber-500/10 to-transparent opacity-30" />
          
          {/* Header: título + big rate badge */}
          <div className="flex items-center justify-between gap-3 relative z-10">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex items-center justify-center size-10 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-500 shadow-[0_0_15px_-5px_rgba(245,158,11,0.3)]">
                <Truck className="size-5" />
              </div>
              <div className="flex flex-col min-w-0">
                <h3 className="text-sm font-black text-white uppercase tracking-[0.2em] italic">
                  PROJEÇÃO COD
                </h3>
                <span className="text-[10px] text-white/30 font-bold uppercase tracking-widest mt-0.5">
                  Simulador de taxa de entrega
                </span>
              </div>
            </div>
            
            <div className="flex items-center gap-2 shrink-0">
              <div className="flex items-center gap-2 bg-black/40 border border-white/5 rounded-lg px-3 py-1.5 shadow-inner">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={rate}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (Number.isFinite(v)) setRate(Math.max(0, Math.min(100, v)));
                  }}
                  className="w-12 h-7 text-xl font-black text-amber-500 text-right border-0 bg-transparent focus-visible:ring-0 tabular-nums p-0 italic"
                />
                <span className="text-sm text-amber-500/60 font-black italic">%</span>
              </div>
              <button
                onClick={() => setRate(DEFAULT_RATE)}
                className="flex items-center justify-center size-10 rounded-lg border border-white/5 text-white/40 hover:text-white hover:bg-white/5 transition-all active:scale-95"
                title="Resetar para 50%"
              >
                <RotateCcw className="size-4" />
              </button>
            </div>
          </div>

          {/* Slider with better styling */}
          <div className="px-1 relative z-10">
            <Slider
              value={[rate]}
              onValueChange={(v) => setRate(v[0] ?? DEFAULT_RATE)}
              min={0}
              max={100}
              step={1}
              className="py-4 [&_[role=slider]]:h-5 [&_[role=slider]]:w-5 [&_[role=slider]]:border-2 [&_[role=slider]]:border-amber-500 [&_[role=slider]]:bg-[#0a0a0a] [&_[role=slider]]:shadow-[0_0_10px_rgba(245,158,11,0.5)] [&_.relative]:h-1.5 [&_.relative]:bg-white/5 [&_[data-orientation=horizontal]]:h-1.5 [&_.bg-primary]:bg-amber-500"
            />
            <div className="flex justify-between text-[9px] text-white/20 font-black uppercase tracking-[0.2em] mt-1">
              <span>0%</span>
              <span>25%</span>
              <span>50%</span>
              <span>75%</span>
              <span>100%</span>
            </div>
          </div>

          {/* KPIs compactos — Grid robusto */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 relative z-10">
            <CodStat
              icon={ShoppingCart}
              label="Entregues"
              value={`${proj.deliveredSales}/${sales}`}
            />
            <CodStat icon={DollarSign} label="Receita Real" value={fmtBRL(proj.realRevenue)} />
            <CodStat
              icon={Zap}
              label="Lucro Real"
              value={fmtBRL(proj.realProfit)}
              accent={realProfitAccent}
            />
            <CodStat
              icon={Activity}
              label="Margem Real"
              value={`${proj.realMargin.toFixed(1)}%`}
              accent={realProfitAccent}
            />
            <CodStat
              icon={TrendingUp}
              label="ROAS Real"
              value={`${proj.realRoas.toFixed(2)}x`}
              accent={realRoasAccent}
            />
            <CodStat
              icon={Target}
              label="CAC Real"
              value={proj.deliveredSales > 0 ? fmtBRL(proj.realCac) : "R$ 0"}
            />
          </div>
          
          <div className="pt-2 border-t border-white/5 flex items-center justify-between relative z-10">
            <p className="text-[9px] text-white/20 font-bold uppercase tracking-widest leading-relaxed max-w-[80%]">
              Projeção baseada na taxa de entrega informada. Fórmulas: [Receita Real = Bruta × Taxa] · [Lucro Real = Rec. Real - Investido]
            </p>
            <div className="px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-[9px] text-amber-500 font-black uppercase tracking-widest italic">
              Live Preview
            </div>
          </div>
        </div>
        )}
      </CardContent>
    </Card>
  );
}

function CodStat({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof Target;
  label: string;
  value: string;
  accent?: "good" | "bad" | "neutral";
}) {
  const color =
    accent === "good"
      ? "text-success"
      : accent === "bad"
      ? "text-destructive"
      : "text-foreground";
  return (
    <div className={`rounded-lg border bg-card p-4 transition-all duration-300 hover:bg-accent/5 ${
      accent === "good" ? "border-success/20 shadow-sm" : 
      accent === "bad" ? "border-destructive/20 shadow-sm" : 
      "border-border shadow-sm"
    }`}>
      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
        <div className={`w-1 h-3 rounded-full ${accent === "good" ? "bg-success" : accent === "bad" ? "bg-destructive" : "bg-muted"}`} />
        <span className="truncate" title={label}>{label}</span>
      </div>
      <div className={`text-2xl font-bold tabular-nums tracking-tight ${color}`}>{value}</div>
    </div>
  );
}
