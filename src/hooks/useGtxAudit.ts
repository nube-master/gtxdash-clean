import { useMemo } from "react";
import type { GtxCampaignRow, GtxDecision } from "@/hooks/useGtxMetaData";

export type AuditSeverity = "critical" | "warning" | "info";

export interface AuditWarning {
  tipo_erro: string;
  entidade: string;
  campaign_id: string;
  descricao: string;
  severity: AuditSeverity;
}

export interface AuditResult {
  warnings: AuditWarning[];
  criticalCount: number;
  warningCount: number;
  infoCount: number;
  status: "green" | "yellow" | "red";
  statusLabel: string;
}

/**
 * Runs all GTX data integrity audits on campaign rows.
 * Pure computation — no side effects.
 */
export function useGtxAudit(
  campaigns: GtxCampaignRow[],
  aiDecisions: Map<string, { decisao: GtxDecision; motivo_curto: string; acao_recomendada: string }>
): AuditResult {
  return useMemo(() => {
    const warnings: AuditWarning[] = [];

    for (const row of campaigns) {
      const dec = aiDecisions.get(row.fullName)?.decisao ?? row.gtxDecision ?? "MONITORAR";

      // ─── 1. CRUZAMENTO META ↔ VENDAS ───
      // Revenue = 0 but sales registered
      if (row.revenue === 0 && row.salesConfirmed > 0) {
        warnings.push({
          tipo_erro: "CRUZAMENTO_INVALIDO",
          entidade: "campanha",
          campaign_id: row.fullName,
          descricao: `${row.salesConfirmed} venda(s) registrada(s) mas receita = R$ 0`,
          severity: "critical",
        });
      }

      // Spend > 0 but no attribution attempt (no sales AND no revenue)
      if (row.spend > 50 && row.salesConfirmed === 0 && row.revenue === 0) {
        warnings.push({
          tipo_erro: "SEM_ATRIBUICAO",
          entidade: "campanha",
          campaign_id: row.fullName,
          descricao: `Gasto R$ ${Math.round(row.spend)} sem tentativa de atribuição de vendas`,
          severity: "info",
        });
      }

      // ─── 2. VALIDAÇÃO FINANCEIRA ───
      const expectedProfit3D = row.revenue3DTotal - row.spend3DTotal;
      if (Math.abs(row.profit3DTotal - expectedProfit3D) > 0.01) {
        warnings.push({
          tipo_erro: "CALCULO_FINANCEIRO",
          entidade: "campanha",
          campaign_id: row.fullName,
          descricao: `Lucro 3D divergente: exibido R$ ${row.profit3DTotal.toFixed(2)}, esperado R$ ${expectedProfit3D.toFixed(2)}`,
          severity: "critical",
        });
      }

      // ROAS with spend = 0 should be null/0, never positive
      if (row.spend3DTotal === 0 && row.roas3D > 0) {
        warnings.push({
          tipo_erro: "ROAS_SEM_GASTO",
          entidade: "campanha",
          campaign_id: row.fullName,
          descricao: `ROAS 3D = ${row.roas3D.toFixed(2)}x mas gasto 3D = R$ 0`,
          severity: "warning",
        });
      }

      // ─── 3. CONSISTÊNCIA 3D ───
      const sumSales3D = row.sales3D.reduce((a, b) => a + b, 0);
      const sumProfit3D = row.profit3D.reduce((a, b) => a + b, 0);
      if (Math.abs(sumProfit3D - row.profit3DTotal) > 0.01) {
        warnings.push({
          tipo_erro: "INCONSISTENCIA_3D",
          entidade: "campanha",
          campaign_id: row.fullName,
          descricao: `Soma lucro D0+D1+D2 (${sumProfit3D.toFixed(2)}) ≠ profit3DTotal (${row.profit3DTotal.toFixed(2)})`,
          severity: "critical",
        });
      }

      const sumSpend3D = row.spend3D.reduce((a, b) => a + b, 0);
      if (Math.abs(sumSpend3D - row.spend3DTotal) > 0.01) {
        warnings.push({
          tipo_erro: "INCONSISTENCIA_3D",
          entidade: "campanha",
          campaign_id: row.fullName,
          descricao: `Soma gasto D0+D1+D2 (${sumSpend3D.toFixed(2)}) ≠ spend3DTotal (${row.spend3DTotal.toFixed(2)})`,
          severity: "warning",
        });
      }

      // ─── 4. VALIDAÇÃO DE FASE ───
      if (row.phase === "OUTRO" || !row.phase) {
        warnings.push({
          tipo_erro: "FASE_INDEFINIDA",
          entidade: "campanha",
          campaign_id: row.fullName,
          descricao: `Fase não identificada no nome da campanha`,
          severity: "warning",
        });

        // FASE_INDEFINIDA + decision ESCALAR is forbidden
        if (dec === "ESCALAR" || dec === "PROMOVER") {
          warnings.push({
            tipo_erro: "DECISAO_INVALIDA",
            entidade: "campanha",
            campaign_id: row.fullName,
            descricao: `Decisão "${dec}" bloqueada: fase indefinida`,
            severity: "critical",
          });
        }
      }

      // ─── 5. VALIDAÇÃO DA DECISÃO GTX ───
      // Lucro 3D > 0 + ROAS >= 1.3 → bloquear CORTAR
      if (dec === "CORTAR" && row.profit3DTotal > 0 && row.roas3D >= 1.30) {
        warnings.push({
          tipo_erro: "DECISAO_INVALIDA",
          entidade: "campanha",
          campaign_id: row.fullName,
          descricao: `CORTAR bloqueado: lucro 3D positivo (R$ ${row.profit3DTotal.toFixed(2)}) + ROAS ${row.roas3D.toFixed(2)}x`,
          severity: "critical",
        });
      }

      // Venda nas últimas 24h → bloquear CORTAR
      if (dec === "CORTAR" && row.sales3D[0] > 0) {
        warnings.push({
          tipo_erro: "DECISAO_INVALIDA",
          entidade: "campanha",
          campaign_id: row.fullName,
          descricao: `CORTAR bloqueado: ${row.sales3D[0]} venda(s) nas últimas 24h`,
          severity: "critical",
        });
      }

      // Fase TESTE → bloquear ESCALAR
      if (dec === "ESCALAR" && row.phase === "TESTE") {
        warnings.push({
          tipo_erro: "DECISAO_INVALIDA",
          entidade: "campanha",
          campaign_id: row.fullName,
          descricao: `ESCALAR bloqueado: campanha em fase TESTE`,
          severity: "critical",
        });
      }

      // Dados incompletos → forçar MONITORAR
      if (row.spend === 0 && row.revenue === 0 && row.salesConfirmed === 0 && dec !== "MONITORAR") {
        warnings.push({
          tipo_erro: "DECISAO_INVALIDA",
          entidade: "campanha",
          campaign_id: row.fullName,
          descricao: `Dados incompletos: decisão deveria ser MONITORAR, não "${dec}"`,
          severity: "warning",
        });
      }

      // Lucro positivo marcado como CORTAR (general check)
      if (dec === "CORTAR" && row.profit > 0) {
        warnings.push({
          tipo_erro: "DECISAO_LUCRO_CORTAR",
          entidade: "campanha",
          campaign_id: row.fullName,
          descricao: `Campanha lucrativa (R$ ${row.profit.toFixed(2)}) marcada como CORTAR`,
          severity: "critical",
        });
      }

      // ESCALA com ROAS < 1
      if (dec === "ESCALAR" && row.roas3D < 1 && row.spend3DTotal > 0) {
        warnings.push({
          tipo_erro: "DECISAO_INVALIDA",
          entidade: "campanha",
          campaign_id: row.fullName,
          descricao: `ESCALAR com ROAS 3D < 1 (${row.roas3D.toFixed(2)}x)`,
          severity: "critical",
        });
      }
    }

    // ─── Orphan sales (sales without campaign match) ───
    // This is approximated: campaigns with revenue > 0 but no spend tracked
    const orphanCampaigns = campaigns.filter(
      (r) => r.revenue > 0 && r.spend === 0 && r.impressions === 0
    );
    for (const r of orphanCampaigns) {
      warnings.push({
        tipo_erro: "VENDA_ORFA",
        entidade: "venda",
        campaign_id: r.fullName,
        descricao: `Receita R$ ${r.revenue.toFixed(2)} sem dados de tráfego (possível venda órfã)`,
        severity: "warning",
      });
    }

    const criticalCount = warnings.filter((w) => w.severity === "critical").length;
    const warningCount = warnings.filter((w) => w.severity === "warning").length;
    const infoCount = warnings.filter((w) => w.severity === "info").length;

    const status: AuditResult["status"] =
      criticalCount > 0 ? "red" : warningCount > 0 ? "yellow" : "green";

    const statusLabel =
      status === "red"
        ? `${criticalCount} erro(s) crítico(s)`
        : status === "yellow"
        ? `${warningCount} inconsistência(s)`
        : "Dados consistentes";

    return { warnings, criticalCount, warningCount, infoCount, status, statusLabel };
  }, [campaigns, aiDecisions]);
}
