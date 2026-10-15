// Frase única de status do dia para pushes OP GERAL / STATUS OPERAÇÃO.
// Regra do Gabriel: body do push = SÓ esta frase (sem vendas/fat/lucro/roas).

const GRANDE = 3000; // R$ — limite entre "leve" e "grande"

export function fraseStatusDia(netProfit: number, totalSales: number): string {
  if (!totalSales || totalSales <= 0) return "🔴 Nenhuma venda gravada hoje — investigar.";
  if (netProfit > 0) {
    return netProfit >= GRANDE
      ? "📊 A operação segue performando bem."
      : "🟢 Operação no positivo, seguir monitorando.";
  }
  if (netProfit < 0) {
    return Math.abs(netProfit) >= GRANDE
      ? "⚠️ O dia pede atenção na operação."
      : "🔥 Orçamento sendo consumido sem retorno esperado.";
  }
  return "🟢 Operação no positivo, seguir monitorando.";
}

/** Sinal +/- prefixado no valor: +R$ 1.234,56 / -R$ 1.234,56 / R$ 0,00 (zero sem sinal). */
export function lucroSinalValor(net: number): string {
  const abs = Math.abs(net).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (net > 0) return `+R$ ${abs}`;
  if (net < 0) return `-R$ ${abs}`;
  return "R$ 0,00";
}
