/**
 * Performance dos Últimos 7 Dias — Painel de Reunião de Criação
 */
import { useState, useMemo } from "react";
import { format, subDays, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronDown, ChevronUp, CalendarIcon, FlaskConical, TrendingUp, Rocket, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCreativeWeeklyReport } from "@/hooks/useCreativeWeeklyReport";
import type { CreativeRow } from "@/lib/creativeUtils";
import type { WeeklyCreativeSummary } from "@/hooks/useCreativeWeeklyReport";

function fmtBRL(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);
}
function fmtPct(v: number) { return `${v.toFixed(1)}%`; }

interface Props {
  creatives: CreativeRow[];
  isAdmin: boolean;
}

// ── Mini row ──────────────────────────────────────────────────────────────────
function CreativeRowItem({ c, isAdmin, rank }: { c: WeeklyCreativeSummary; isAdmin: boolean; rank?: number }) {
  const tierColor =
    c.tier === "ESCALAVEL" ? "text-wr-positive" :
    c.tier === "PROMISSOR" ? "text-wr-warning" :
    c.tier === "CRITICO" ? "text-destructive" :
    "text-muted-foreground";

  const tierEmoji =
    c.tier === "ESCALAVEL" ? "🟢" :
    c.tier === "PROMISSOR" ? "🟡" :
    c.tier === "CRITICO" ? "🔴" : "⚫";

  return (
    <div className="flex items-center gap-3 py-2 border-b border-border/40 last:border-0 text-xs">
      {rank !== undefined && (
        <span className="text-muted-foreground w-4 text-right flex-shrink-0 font-data">{rank}.</span>
      )}
      <span className={`font-bold font-data ${tierColor} min-w-[90px]`}>
        {tierEmoji} {c.creativeId}
      </span>
      <span className="text-muted-foreground flex-1 hidden sm:block truncate text-[11px]">
        {c.campaignDateTag ? `Lançado ${c.campaignDateTag}` : "—"}
      </span>
      <span className="text-muted-foreground min-w-[50px] text-right font-data">
        {fmtPct(c.hookRate)} <span className="text-[9px]">hook</span>
      </span>
      <span className="text-muted-foreground min-w-[40px] text-right font-data">
        {c.sales} <span className="text-[9px]">v</span>
      </span>
      {isAdmin && (
        <span className={`min-w-[42px] text-right font-semibold font-data ${c.roi >= 1.3 ? "text-wr-positive" : c.roi >= 1 ? "text-wr-warning" : c.roi > 0 ? "text-destructive" : "text-muted-foreground"}`}>
          {c.roi > 0 ? `${c.roi.toFixed(2)}x` : "—"}
        </span>
      )}
      <span className={`min-w-[42px] text-right font-medium text-[11px] ${c.isActive ? "text-wr-positive" : "text-muted-foreground"}`}>
        {c.isActive ? "ativo" : "pause"}
      </span>
    </div>
  );
}

// ── Collapsible section ───────────────────────────────────────────────────────
function Section({
  icon: Icon, title, count, children, defaultOpen = true,
}: {
  icon: React.ElementType;
  title: string;
  count: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card className="bg-card border-border">
      <CardContent className="p-0">
        <button
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center gap-3 p-4 hover:bg-secondary/20 transition-colors rounded-lg"
        >
          <Icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <span className="font-mono text-sm font-semibold text-foreground flex-1 text-left">{title}</span>
          <span className="font-mono text-lg font-bold text-foreground">{count}</span>
          {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </button>
        {open && count > 0 && (
          <div className="px-4 pb-4">
            <div className="flex items-center gap-3 py-1 border-b border-border text-[9px] font-mono text-muted-foreground uppercase tracking-wider mb-1">
              <span className="w-4" />
              <span className="min-w-[90px]">ID Criativo</span>
              <span className="flex-1 hidden sm:block">Lançamento</span>
              <span className="min-w-[50px] text-right">Hook</span>
              <span className="min-w-[40px] text-right">Vendas</span>
              <span className="min-w-[42px] text-right">ROI</span>
              <span className="min-w-[42px] text-right">Status</span>
            </div>
            {children}
          </div>
        )}
        {open && count === 0 && (
          <div className="px-4 pb-4 text-[11px] font-mono text-muted-foreground">
            Nenhum criativo nesse período.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export function CreativeWeeklyReport({ creatives, isAdmin }: Props) {
  // Período selecionado (padrão: últimos 7 dias)
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(subDays(new Date(), 7));
  const [calOpen, setCalOpen] = useState(false);

  const cutoff = useMemo(() =>
    selectedDate ? startOfDay(selectedDate) : null,
  [selectedDate]);

  const report = useCreativeWeeklyReport(creatives, cutoff);

  const periodLabel = selectedDate
    ? `De ${format(selectedDate, "dd/MM", { locale: ptBR })} até hoje`
    : "Todo o período";

  return (
    <div className="space-y-4">
      {/* Seletor de período */}
      <div className="flex items-center gap-3 flex-wrap">
        <p className="text-sm font-mono text-muted-foreground">Período de análise:</p>
        <Popover open={calOpen} onOpenChange={setCalOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="font-mono text-xs h-8 gap-2">
              <CalendarIcon className="h-3.5 w-3.5" />
              {selectedDate ? format(selectedDate, "dd 'de' MMM, yyyy", { locale: ptBR }) : "Todo o período"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={(d) => { setSelectedDate(d); setCalOpen(false); }}
              disabled={(d) => d > new Date()}
              initialFocus
              className={cn("p-3 pointer-events-auto")}
            />
            <div className="p-2 border-t border-border flex gap-2">
              {[7, 14, 30].map((days) => (
                <Button
                  key={days}
                  variant="ghost"
                  size="sm"
                  className="font-mono text-[11px] h-7 flex-1"
                  onClick={() => { setSelectedDate(subDays(new Date(), days)); setCalOpen(false); }}
                >
                  {days}d
                </Button>
              ))}
              <Button
                variant="ghost"
                size="sm"
                className="font-mono text-[11px] h-7 flex-1"
                onClick={() => { setSelectedDate(undefined); setCalOpen(false); }}
              >
                Tudo
              </Button>
            </div>
          </PopoverContent>
        </Popover>
        <span className="text-[11px] font-mono text-muted-foreground">{periodLabel}</span>
      </div>

      {/* Cards de resumo */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* Total all-time únicos */}
        <div className="wr-card p-4 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <FlaskConical className="h-3.5 w-3.5 text-muted-foreground" />
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Testados (Total)</p>
          </div>
          <p className="text-2xl font-bold font-data text-foreground">{report.allTimeUniqueTestIds.size}</p>
          <p className="text-[11px] text-muted-foreground">IDs únicos — todo o histórico</p>
        </div>

        {/* Testados no período selecionado */}
        <div className="wr-card p-4 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <FlaskConical className="h-3.5 w-3.5 text-muted-foreground" />
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Testados (Período)</p>
          </div>
          <p className="text-2xl font-bold font-data text-foreground">{report.testLaunchedInPeriod.length}</p>
          <p className="text-[11px] text-muted-foreground">{report.periodUniqueTestIds.size} IDs únicos</p>
        </div>

        {/* Em teste ativos agora */}
        <div className="wr-card p-4 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Em Teste Agora</p>
          </div>
          <p className="text-2xl font-bold font-data text-foreground">{report.testActiveToday.length}</p>
          <p className="text-[11px] text-muted-foreground">campanhas ativas</p>
        </div>

        {/* Validados para pré-escala no período */}
        <div className="wr-card p-4 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground" />
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Validados</p>
          </div>
          <p className="text-2xl font-bold font-data text-wr-positive">{report.validatedInPeriod.length}</p>
          <p className="text-[11px] text-muted-foreground">passaram para pré-escala</p>
        </div>
      </div>

      {/* Seção: Testes no período */}
      <Section icon={FlaskConical} title="Criativos Testados no Período" count={report.testLaunchedInPeriod.length} defaultOpen={true}>
        {report.testLaunchedInPeriod.map((c, i) => (
          <CreativeRowItem key={`${c.creativeId}-test`} c={c} isAdmin={isAdmin} rank={i + 1} />
        ))}
      </Section>

      {/* Seção: Validados */}
      <Section icon={CheckCircle2} title="Validados — Passaram para Pré-Escala" count={report.validatedInPeriod.length} defaultOpen={true}>
        {report.validatedInPeriod.map((c, i) => (
          <CreativeRowItem key={`${c.creativeId}-val`} c={c} isAdmin={isAdmin} rank={i + 1} />
        ))}
      </Section>

      {/* Seção: Em teste agora */}
      <Section icon={TrendingUp} title="Em Teste Agora (Ativos)" count={report.testActiveToday.length} defaultOpen={false}>
        {report.testActiveToday.map((c, i) => (
          <CreativeRowItem key={`${c.creativeId}-active`} c={c} isAdmin={isAdmin} rank={i + 1} />
        ))}
      </Section>

      {/* Seção: Em escala */}
      {report.inScale.length > 0 && (
        <Section icon={Rocket} title="Em Escala" count={report.inScale.length} defaultOpen={false}>
          {report.inScale.map((c, i) => (
            <CreativeRowItem key={`${c.creativeId}-scale`} c={c} isAdmin={isAdmin} rank={i + 1} />
          ))}
        </Section>
      )}
    </div>
  );
}
