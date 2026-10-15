import type { Offer } from "@/types/offers";
import type { OfferPerformanceStats } from "@/hooks/useOffersTraffic";
import { differenceInDays, parseISO } from "date-fns";

/**
 * Health Score 0-100 — triagem rápida em portfólio grande.
 * Pesos:
 *   ROI 7d           40%  (1.0x = 50pts, 1.2x = 75pts, 1.5x+ = 100pts)
 *   Vendas hoje vs média 7d  30%  (≥média = 100pts, 0 = 0pts)
 *   Lifetime sem morrer      15%  (60d+ = 100pts, escala linear)
 *   CPA real / target        15%  (CPA<=target = 100pts, 1.5x = 0pts)
 */
export function calcOfferHealth(offer: Offer, traffic: OfferPerformanceStats | undefined): {
  score: number;
  tone: "good" | "warn" | "bad" | "neutral";
  reasons: string[];
} {
  const reasons: string[] = [];

  // sem dados de tráfego ou status morto/arquivado → neutro
  if (!traffic || ["morta", "arquivada"].includes(offer.status)) {
    return { score: 0, tone: "neutral", reasons: ["Sem tráfego ativo"] };
  }
  if ((traffic.spend_7d_brl ?? 0) === 0 && (traffic.sales_7d ?? 0) === 0) {
    return { score: 0, tone: "neutral", reasons: ["Sem dados 7d"] };
  }

  // 1) ROI 7d (40%)
  const roi = traffic.roi_7d ?? 0;
  let roiPts = 0;
  if (roi >= 1.5) roiPts = 100;
  else if (roi >= 1.2) roiPts = 75 + ((roi - 1.2) / 0.3) * 25;
  else if (roi >= 1.0) roiPts = 50 + ((roi - 1.0) / 0.2) * 25;
  else if (roi >= 0.7) roiPts = (roi - 0.7) / 0.3 * 50;
  else roiPts = 0;
  if (roi < 1.0 && (traffic.spend_7d_brl ?? 0) > 0) reasons.push(`ROI 7d ${roi.toFixed(2)}x abaixo do break-even`);

  // 2) vendas hoje vs média (30%)
  const avgSalesPerDay = (traffic.sales_7d ?? 0) / 7;
  let momentumPts = 0;
  if (avgSalesPerDay === 0) {
    momentumPts = (traffic.sales_today ?? 0) > 0 ? 60 : 30;
  } else {
    const ratio = (traffic.sales_today ?? 0) / avgSalesPerDay;
    momentumPts = Math.max(0, Math.min(100, ratio * 100));
    if (ratio < 0.5 && avgSalesPerDay >= 1) reasons.push("Vendas hoje abaixo da média 7d");
  }

  // 3) lifetime (15%)
  let lifetimePts = 50;
  if (offer.data_inicio) {
    const days = differenceInDays(new Date(), parseISO(offer.data_inicio));
    lifetimePts = Math.min(100, (days / 60) * 100);
  }

  // 4) CPA real / target (15%)
  let cpaPts = 50;
  if (offer.cpa_target_brl && offer.cpa_target_brl > 0 && (traffic.sales_7d ?? 0) > 0) {
    const realCpa = (traffic.spend_7d_brl ?? 0) / traffic.sales_7d;
    const ratio = realCpa / offer.cpa_target_brl;
    if (ratio <= 1.0) cpaPts = 100;
    else if (ratio <= 1.5) cpaPts = 100 - ((ratio - 1.0) / 0.5) * 100;
    else cpaPts = 0;
    if (ratio > 1.2) reasons.push(`CPA real ${(ratio * 100 - 100).toFixed(0)}% acima do target`);
  }

  const score = Math.round(roiPts * 0.4 + momentumPts * 0.3 + lifetimePts * 0.15 + cpaPts * 0.15);
  const tone: "good" | "warn" | "bad" =
    score >= 70 ? "good" : score >= 40 ? "warn" : "bad";

  if (reasons.length === 0 && tone === "good") reasons.push("Saudável em todas as métricas");
  return { score, tone, reasons };
}
