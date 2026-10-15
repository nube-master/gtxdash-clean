import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Zap, CheckCircle2, DollarSign, TrendingUp } from "lucide-react";
import { useCODToday } from "@/hooks/useCODToday";
import { useCurrency } from "@/contexts/CurrencyContext";

export function CODTodayCashBlock({ historicalRate = 52.38, onOpenDeliveries }: { historicalRate?: number; onOpenDeliveries?: (date: string) => void } = {}) {
  const { data, isLoading } = useCODToday();
  const { currency, format: fmtCurrency } = useCurrency();

  const fmtValue = (v: number) => fmtCurrency(v, { decimals: 0 });

  if (isLoading || !data) {
    return <Skeleton className="h-48 w-full" />;
  }

  const invest = data.invest_today;
  const revenue = data.approved_brl;
  const profit = revenue - invest;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4 w-full">
      {/* BLOCO 1: HOJE (Tráfego) */}
      <Card className="p-2 md:p-4 border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
        <div className="flex items-center justify-between mb-2 md:mb-3 flex-wrap gap-1.5 md:gap-2">
          <div className="flex items-center gap-1.5 md:gap-2 min-w-0">
            <Zap className="h-3.5 w-3.5 md:h-4 md:w-4 text-primary shrink-0" />
            <h2 className="text-xs md:text-sm font-semibold truncate uppercase tracking-wider">Pedidos Gerados</h2>
            <Badge variant="outline" className="text-[9px] md:text-[10px] font-mono px-1.5 py-0 bg-background/50">
              Criação
            </Badge>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 md:gap-3">
          <Mini 
            label="PEDIDOS GERADOS" 
            value={String(data.approved_analytics_count)} 
            icon={<Zap className="h-3 w-3" />} 
            sub={`${data.generated_today} total`}
            tooltip="Vendas aprovadas hoje (bate com Dashboard Principal). O sub-valor reflete o total de leads (aprovados + pendentes)."
          />
          <Mini 
            label="Invest. Hoje" 
            value={fmtValue(invest)} 
            icon={<DollarSign className="h-3 w-3" />} 
          />
          <Mini 
            label="Lucro Real" 
            value={fmtValue(profit)} 
            highlight={profit >= 0 ? "positive" : "negative"}
            icon={<TrendingUp className="h-3 w-3" />}
            tooltip={
              <div className="space-y-1 text-[10px]">
                <p className="font-bold border-b border-white/10 pb-1 mb-1">MÉMORIA DE CÁLCULO:</p>
                <p>LUCRO REAL = comissão_aprovada_hoje - invest_hoje</p>
                <div className="bg-white/5 p-1 rounded font-mono mt-1 text-emerald-400">
                  {fmtValue(revenue)} - {fmtValue(invest)}
                  <br />
                  = {fmtValue(profit)}
                </div>
              </div>
            }
          />
          <Mini 
            label="ROAS Hoje" 
            value={(invest > 0 ? revenue / invest : 0).toFixed(2) + 'x'} 
            highlight={(invest > 0 ? revenue / invest : 0) >= 1 ? "positive" : "negative"}
            icon={<TrendingUp className="h-3.5 w-3.5" />}
            tooltip="ROAS real baseado no faturamento aprovado hoje vs investimento do dia."
          />
        </div>
      </Card>

      {/* BLOCO 2: ENTREGUES HOJE (Processamento) */}
      <Card className="p-2 md:p-4 border-emerald-500/30 bg-gradient-to-br from-emerald-500/5 to-transparent">
        <div className="flex items-center justify-between mb-2 md:mb-3 flex-wrap gap-1.5 md:gap-2">
          <div className="flex items-center gap-1.5 md:gap-2 min-w-0">
            <CheckCircle2 className="h-3.5 w-3.5 md:h-4 md:w-4 text-emerald-500 shrink-0" />
            <h2 className="text-xs md:text-sm font-semibold truncate uppercase tracking-wider">Entregues Hoje</h2>
            <Badge variant="outline" className="text-[9px] md:text-[10px] font-mono px-1.5 py-0 bg-background/50 border-emerald-500/30 text-emerald-500">
              Processado
            </Badge>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 md:gap-3">
          <Mini 
            label="Aprovados Hoje" 
            value={String(data.approved_count)} 
            icon={<CheckCircle2 className="h-3 w-3 text-emerald-500" />} 
            onClick={onOpenDeliveries ? () => onOpenDeliveries(data.today) : undefined}
            tooltip="Pedidos aprovados hoje, independente de quando foram criados"
          />
          <Mini 
            label="Comissão Aprovada" 
            value={fmtValue(data.approved_brl)} 
            icon={<DollarSign className="h-3 w-3 text-emerald-500" />} 
            sub="Recebida hoje"
            highlight="positive"
            tooltip="Comissão real aprovada hoje pelo Call Center."
          />
          <Mini 
            label="Expirados Hoje" 
            value={String(data.expired_today)} 
            icon={<TrendingUp className="h-3 w-3 text-destructive" rotate={180} />} 
            tooltip="Pedidos que completaram 10 dias e expiraram hoje"
          />
          <Mini 
            label="Eficiência 7d" 
            value={fmtPct(data.avg_approval_7d)} 
            highlight={data.avg_approval_7d > 0.5 ? "positive" : "negative"}
            icon={<TrendingUp className="h-3 w-3" />}
            sub="Média aprovação 7d"
            tooltip="Taxa média de aprovação últimos 7 dias. Fórmula: aprovados / (aprovados + expirados). Reflete a eficiência operacional real."
          />
        </div>
      </Card>
    </div>
  );
}

function fmtPct(v: number) {
  return `${((v || 0) * 100).toFixed(1)}%`;
}

function Mini({
  label,
  value,
  sub,
  icon,
  highlight,
  onClick,
  tooltip,
  rotate
}: {
  label: string;
  value: string;
  sub?: string;
  icon?: React.ReactNode;
  highlight?: "positive" | "negative";
  onClick?: () => void;
  tooltip?: string | React.ReactNode;
  rotate?: number;
}) {
  const valueClass =
    highlight === "positive" ? "text-emerald-500" : highlight === "negative" ? "text-destructive" : "";
  
  const content = (
    <div
      onClick={onClick}
      className={`rounded-md border border-border/60 bg-background/60 p-1.5 md:p-3 h-full ${onClick ? "cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors" : ""}`}
    >
      <div className="flex items-center gap-1 md:gap-1.5 text-[9px] md:text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
        {icon && <span style={rotate ? { transform: `rotate(${rotate}deg)` } : {}}>{icon}</span>}
        <span className="truncate">{label}</span>
      </div>
      <div className={`text-[15px] md:text-xl font-semibold mt-0.5 md:mt-1 tabular-nums truncate ${valueClass}`}>{value}</div>
      {sub && <div className="text-[9px] md:text-[10px] text-muted-foreground mt-0.5 truncate">{sub}</div>}
    </div>
  );

  if (tooltip) {
    return (
      <div className="h-full group relative">
        {content}
        <div className="absolute z-50 invisible group-hover:visible bg-popover text-popover-foreground text-[10px] p-2 rounded border border-border shadow-md -top-2 left-1/2 -translate-y-full -translate-x-1/2 w-48 pointer-events-none">
          {tooltip}
        </div>
      </div>
    );
  }

  return content;
}
