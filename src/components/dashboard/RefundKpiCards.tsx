import { motion } from "framer-motion";
import { Undo2, PercentCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Tooltip as RadixTooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";
import { useRefundStats } from "@/hooks/useRefundStats";

const cardVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] as const, delay: i * 0.04 },
  }),
};

function RefundCard({
  label,
  display,
  tooltip,
  icon: Icon,
  danger,
  index,
  footer,
  loading,
}: {
  label: string;
  display: string;
  tooltip: string;
  icon: React.ElementType;
  danger: boolean;
  index: number;
  footer: string;
  loading: boolean;
}) {
  return (
    <motion.div custom={index} variants={cardVariants} initial="hidden" animate="visible">
      <Card
        className={`mobile-kpi-card h-full transition-colors duration-200 ${
          danger
            ? "bg-destructive/5 border border-destructive/30 hover:border-destructive/50"
            : "bg-card border border-border/50 hover:border-primary/20"
        }`}
      >
        <CardContent className="px-3 py-2.5 md:px-4 md:py-3.5 flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-1.5 min-w-0">
            <TooltipProvider delayDuration={200}>
              <RadixTooltip>
                <TooltipTrigger asChild>
                  <span className="text-[11px] leading-tight font-medium text-muted-foreground uppercase tracking-wide truncate cursor-help">
                    {label}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[240px] text-[11px] whitespace-pre-line">
                  {tooltip}
                </TooltipContent>
              </RadixTooltip>
            </TooltipProvider>
            <Icon
              className={`h-3.5 w-3.5 md:h-4 md:w-4 shrink-0 ${
                danger ? "text-destructive/70" : "text-muted-foreground/40"
              }`}
            />
          </div>

          <p
            className={`text-[17px] md:text-2xl font-bold font-data tabular-nums leading-none truncate ${
              danger ? "text-destructive" : "text-foreground"
            }`}
          >
            {loading ? (
              <span className="inline-block h-5 md:h-6 w-20 rounded bg-muted/40 animate-pulse align-middle" />
            ) : (
              display
            )}
          </p>

          <span className="text-[9px] md:text-[10px] text-muted-foreground truncate">{footer}</span>
        </CardContent>
      </Card>
    </motion.div>
  );
}

/**
 * Cards de reembolso (somente Escola do Dólar — operação de produtor).
 * Fonte: clickbank_audit (webhook Hotmart grava RFND/CGBK).
 * Ficam vermelhos quando há reembolso no período; zerados ficam neutros.
 */
export function RefundKpiCards({
  operationId,
  startDate,
  endDate,
  startIndex = 11,
}: {
  operationId: string | null;
  startDate: string;
  endDate: string;
  startIndex?: number;
}) {
  const { stats, loading } = useRefundStats(operationId, startDate, endDate);
  const total = stats.refunds + stats.chargebacks;
  const danger = false; // Removido per user rebranding: reembolsos não devem mais ser vermelhos no Dash

  return (
    <>
      <RefundCard
        label="Reembolsos"
        display={String(total)}
        icon={Undo2}
        danger={danger}
        index={startIndex}
        loading={loading}
        footer={
          stats.chargebacks > 0
            ? `${stats.refunds} reemb. · ${stats.chargebacks} chargeback`
            : "de vendas do período"
        }
        tooltip={`Reembolsos e chargebacks de vendas realizadas no período (o estorno é contado no dia da VENDA original).\n${stats.refunds} reembolso(s) · ${stats.chargebacks} chargeback(s).`}
      />
      <RefundCard
        label="Taxa de Reembolso"
        display={`${stats.rate.toFixed(1)}%`}
        icon={PercentCircle}
        danger={danger}
        index={startIndex + 1}
        loading={loading}
        footer={`${total} de ${stats.sales} vendas`}
        tooltip={`Estornos de vendas do período ÷ vendas aprovadas do mesmo período.\n${total} ÷ ${stats.sales} vendas.`}
      />

      <RefundCard
        label="Valor Estornado"
        display={`R$ ${stats.amountBrl.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
        icon={Undo2}
        danger={danger}
        index={startIndex + 2}
        loading={loading}
        footer={
          stats.grossBrl > 0
            ? `bruto Hotmart R$ ${stats.grossBrl.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
            : stats.byProduct.length > 0
              ? `${stats.byProduct.length} produto(s) do funil`
              : "sem estornos no período"
        }
        tooltip={
          stats.byProduct.length > 0
            ? `Comissão estornada no período (o que sai do seu caixa):\n` +
              stats.byProduct
                .map(
                  (p) =>
                    `• ${p.product} — ${p.count}x · R$ ${p.amountBrl.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                )
                .join("\n") +
              (stats.grossBrl > 0
                ? `\n\nPreço cheio dos produtos (valor que a Hotmart mostra em "Vendas Reembolsadas"): R$ ${stats.grossBrl.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                : `\n\nPreço cheio (bruto Hotmart) só é registrado nos estornos a partir de agora.`)
            : "Nenhum estorno efetuado no período."
        }
      />
    </>
  );
}

export default RefundKpiCards;
