export interface PushTypeDef {
  type: string;
  label: string;
  description: string;
  group: string;
  /** Sugerido no onboarding de um usuário novo (apenas sugestão visual — admin decide). */
  recommended?: boolean;
}

export const PUSH_TYPE_GROUPS = ["Vendas", "Operação", "Relatórios", "Criativos", "Sistema"] as const;

export const PUSH_NOTIFICATION_TYPES: PushTypeDef[] = [
  {
    type: "sale_approved",
    label: "Venda aprovada",
    description: "Cada venda aprovada, em tempo real",
    group: "Vendas",
    recommended: true,
  },
  {
    type: "guerra_checkout",
    label: "Checkout iniciado",
    description: "Movimento de checkout no funil",
    group: "Vendas",
  },
  {
    type: "revenue_discrepancy",
    label: "Divergência de receita",
    description: "Faturamento sem paridade entre fontes",
    group: "Vendas",
  },
  {
    type: "account_status_change",
    label: "Conta caiu / voltou",
    description: "Mudança de status de conta de anúncio",
    group: "Operação",
    recommended: true,
  },
  {
    type: "meta_permission_alert",
    label: "Permissão Meta",
    description: "Token sem permissão ou expirado",
    group: "Operação",
    recommended: true,
  },
  {
    type: "unconfigured_accounts",
    label: "Contas não configuradas",
    description: "Conta ativa na Meta e ausente no sistema",
    group: "Operação",
  },
  {
    type: "status_operacao",
    label: "Status da operação",
    description: "Resumo do estado geral da operação",
    group: "Operação",
  },
  {
    type: "op_geral",
    label: "OP Geral",
    description: "Resumo consolidado diário com vendas, faturamento, lucro e ROAS",
    group: "Relatórios",
    recommended: true,
  },
  {
    type: "radar_operacao",
    label: "Radar da operação",
    description: "Anomalias detectadas no radar",
    group: "Operação",
  },
  { type: "pulse_1h", label: "Pulse 1h", description: "Pulso horário de performance", group: "Relatórios", recommended: true },
  {
    type: "status_lucro_diario",
    label: "Lucro diário",
    description: "Fechamento de lucro do dia",
    group: "Relatórios",
    recommended: true,
  },
  { type: "meta_dia", label: "Meta do dia", description: "Progresso da meta diária", group: "Relatórios" },
  { type: "ranking_contas", label: "Ranking de contas", description: "Melhores e piores contas", group: "Relatórios" },
  {
    type: "ranking_criativos",
    label: "Ranking de criativos",
    description: "Top criativos do período",
    group: "Relatórios",
  },
  {
    type: "data_health_report",
    label: "Saúde dos dados",
    description: "Falhas de sync e lacunas de dados",
    group: "Relatórios",
  },
  {
    type: "campanha_vencedora",
    label: "Campanha vencedora",
    description: "Campanha bateu critério de escala",
    group: "Criativos",
  },
  {
    type: "creative_scale_alert",
    label: "Criativo para escalar",
    description: "Criativo com sinal de escala",
    group: "Criativos",
  },
  {
    type: "creative_scale_up_alert",
    label: "Criativo escalando",
    description: "Confirmação de escala de criativo",
    group: "Criativos",
  },
  { type: "guerra_estruturas", label: "Guerra de estruturas", description: "Comparativo de estruturas", group: "Criativos" },
  { type: "guerra_fases", label: "Guerra de fases", description: "Pré / teste / escala", group: "Criativos" },
  {
    type: "reconciliation_alert",
    label: "Reconciliação",
    description: "Divergência em extrato de cartão",
    group: "Sistema",
  },
  {
    type: "reconciler_gap_alert",
    label: "Gap de reconciliação",
    description: "Lacuna entre cobrança e gasto",
    group: "Sistema",
  },
  {
    type: "test_notification",
    label: "Testes",
    description: "Notificações de teste enviadas manualmente",
    group: "Sistema",
  },
];

export const pushTypeLabel = (type?: string | null): string =>
  PUSH_NOTIFICATION_TYPES.find((t) => t.type === type)?.label ?? type ?? "—";

export const RECOMMENDED_PUSH_TYPES = PUSH_NOTIFICATION_TYPES.filter((t) => t.recommended).map(
  (t) => t.type,
);
