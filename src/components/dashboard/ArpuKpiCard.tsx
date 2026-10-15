import { KpiCard } from "@/components/ui/kpi-card";
import { Receipt } from "lucide-react";
import { useUniqueBuyers } from "@/hooks/useUniqueBuyers";

interface Props {
  operationId: string | null | undefined;
  startDate: string;
  endDate: string;
  totalRevenue: number;
  prevTicketMedio: number;
}

/**
 * ARPU = Faturamento Bruto ÷ Compradores únicos (por buyer_email_hash).
 * Substitui o AOV clássico na operação Escola do Dólar (produtora),
 * onde um mesmo comprador costuma gerar frontend + order bump + upsell
 * e o AOV puxa o ticket pra baixo.
 */
export function ArpuKpiCard({ operationId, startDate, endDate, totalRevenue, prevTicketMedio }: Props) {
  const { data, isLoading } = useUniqueBuyers(operationId, startDate, endDate);
  const unique = data?.uniqueBuyers ?? 0;
  // Usa faturamento da mesma fonte (clickbank_audit) que gerou os compradores únicos,
  // pra não misturar numerador (skyTotals filtrado) com denominador (todas as transações).
  const auditRev = data?.totalRevenueBrl ?? 0;
  const arpu = unique > 0 ? auditRev / unique : 0;
  const hasEmailHash = (data?.totalTransactions ?? 0) > 0 && unique < (data?.totalTransactions ?? 0);
  return (
    <KpiCard
      label="ARPU"
      value={arpu}
      prevValue={prevTicketMedio}
      type="currency"
      icon={Receipt}
      index={6}
      colorBySign={false}
      isLoading={isLoading}
      tooltip={
        hasEmailHash
          ? `Receita por comprador único • ${unique} compradores no período (${data?.totalTransactions ?? 0} transações)`
          : `Ainda sem email hash nas vendas — mostrando ticket médio por transação (${data?.totalTransactions ?? 0}). Rode o backfill Hotmart pra ativar dedupe por comprador.`
      }
    />
  );
}
