import { Card } from "@/components/ui/card";
import { Eye, Target, MousePointerClick, ShoppingCart, DollarSign, Percent, Play } from "lucide-react";

interface VslKpiCardsProps {
  uniqueViews: number;
  totalPlays: number;
  retentionAtPitch: number;
  audienceAtPitch: number;
  buttonClicks: number;
  ctrButton: number;
  conversions: number;
  conversionRate: number;
  revenue: number;
}

function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(v);
}

function fmtPct(v: number) {
  return `${v.toFixed(1)}%`;
}

function fmtCurrency(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 }).format(v);
}

interface KpiItemProps {
  label: string;
  value: string;
  icon: React.ReactNode;
  highlight?: boolean;
}

function KpiItem({ label, value, icon, highlight = false }: KpiItemProps) {
  return (
    <Card className="mobile-kpi-card wr-card px-5 py-4 md:p-4 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <div className="h-7 w-7 rounded-md bg-secondary flex items-center justify-center text-muted-foreground md:flex hidden">
          {icon}
        </div>
        <span className="text-[13px] md:text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
      </div>
      <p className={`text-[28px] md:text-xl font-bold font-data leading-tight ${highlight ? "text-[hsl(var(--wr-positive))]" : "text-foreground"}`}>
        {value}
      </p>
    </Card>
  );
}

export function VslKpiCards(props: VslKpiCardsProps) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5 md:gap-3">
        <KpiItem label="Visitantes Únicos" value={fmt(props.uniqueViews)} icon={<Eye className="h-3.5 w-3.5" />} />
        <KpiItem label="Total de Plays" value={fmt(props.totalPlays)} icon={<Play className="h-3.5 w-3.5" />} />
        <KpiItem label="Retenção no Pitch" value={fmtPct(props.retentionAtPitch)} icon={<Target className="h-3.5 w-3.5" />} highlight={props.retentionAtPitch >= 16} />
        <KpiItem label="Audiência no Pitch" value={fmt(props.audienceAtPitch)} icon={<Eye className="h-3.5 w-3.5" />} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-2.5 md:gap-3">
        <KpiItem label="Cliques no Botão" value={fmt(props.buttonClicks)} icon={<MousePointerClick className="h-3.5 w-3.5" />} />
        <KpiItem label="CTR Botão" value={fmtPct(props.ctrButton)} icon={<Percent className="h-3.5 w-3.5" />} />
        <KpiItem label="Conversões" value={fmt(props.conversions)} icon={<ShoppingCart className="h-3.5 w-3.5" />} />
        <KpiItem label="Taxa de Conversão" value={fmtPct(props.conversionRate)} icon={<Percent className="h-3.5 w-3.5" />} highlight={props.conversionRate >= 1} />
        <KpiItem label="Receita da VSL" value={fmtCurrency(props.revenue)} icon={<DollarSign className="h-3.5 w-3.5" />} highlight={true} />
      </div>
    </div>
  );
}
