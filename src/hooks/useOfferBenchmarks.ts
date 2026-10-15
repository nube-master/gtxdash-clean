import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { OfferNicho } from "@/types/offers";

export interface OfferBenchmark {
  id: string;
  operation_id: string;
  nicho: OfferNicho;
  cpc_brl: number | null;
  cpm_brl: number | null;
  ctr_pct: number | null;
  cpi_brl: number | null;
  conversion_pct: number | null;
  pitch_retention_pct: number | null;
  notes: string | null;
}

export interface OfferKpiMetrics {
  offer_id: string;
  apelido_interno: string;
  spend_brl: number;
  impressions: number;
  link_clicks: number;
  ic_count: number;
  sales_count: number;
  pitch_retention_pct: number | null;
  cpc_brl: number | null;
  cpm_brl: number | null;
  ctr_pct: number | null;
  cpi_brl: number | null;
  conversion_pct: number | null;
}

const num = (v: any) => (v == null ? null : Number(v));

/** Lista benchmarks da operação atual (uma linha por nicho). */
export function useOfferBenchmarks(operationId?: string | null) {
  return useQuery({
    queryKey: ["offer-benchmarks", operationId ?? null],
    queryFn: async () => {
      let q = supabase.from("offer_benchmarks" as any).select("*");
      if (operationId) q = q.eq("operation_id", operationId);
      const { data, error } = await q;
      if (error) throw error;
      const map = new Map<OfferNicho, OfferBenchmark>();
      (data as any[] | null)?.forEach((r) => map.set(r.nicho as OfferNicho, r as OfferBenchmark));
      return map;
    },
    staleTime: 60_000,
  });
}

/** Métricas reais por oferta para comparar com benchmark.
 *  Se start/end forem passados, usa get_offers_kpi_metrics_range (período arbitrário).
 *  Caso contrário, usa get_offers_kpi_metrics (últimos 7d, retrocompatível).
 */
export function useOfferKpiMetrics(
  operationId?: string | null,
  start?: string,
  end?: string,
) {
  const useRange = !!(start && end);
  return useQuery({
    queryKey: ["offer-kpi-metrics", operationId ?? null, start ?? null, end ?? null],
    queryFn: async () => {
      const { data, error } = useRange
        ? await supabase.rpc("get_offers_kpi_metrics_range" as any, {
            p_start_date: start,
            p_end_date: end,
            p_operation_id: operationId ?? undefined,
          } as any)
        : await supabase.rpc("get_offers_kpi_metrics", {
            p_operation_id: operationId ?? undefined,
          } as any);
      if (error) throw error;
      const map = new Map<string, OfferKpiMetrics>();
      (data as any[] | null)?.forEach((r) => {
        map.set(r.offer_id, {
          offer_id: r.offer_id,
          apelido_interno: r.apelido_interno,
          spend_brl: Number(r.spend_brl ?? 0),
          impressions: Number(r.impressions ?? 0),
          link_clicks: Number(r.link_clicks ?? 0),
          ic_count: Number(r.ic_count ?? 0),
          sales_count: Number(r.sales_count ?? 0),
          pitch_retention_pct: num(r.pitch_retention_pct),
          cpc_brl: num(r.cpc_brl),
          cpm_brl: num(r.cpm_brl),
          ctr_pct: num(r.ctr_pct),
          cpi_brl: num(r.cpi_brl),
          conversion_pct: num(r.conversion_pct),
        });
      });
      return map;
    },
    refetchInterval: 120_000,
    staleTime: 60_000,
  });
}

export function useUpsertBenchmark(operationId?: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (b: Omit<OfferBenchmark, "id" | "operation_id">) => {
      if (!operationId) throw new Error("operation_id requerido");
      const { error } = await supabase
        .from("offer_benchmarks" as any)
        .upsert(
          { ...b, operation_id: operationId } as any,
          { onConflict: "operation_id,nicho" }
        );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["offer-benchmarks"] }),
  });
}

export function useDeleteBenchmark() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("offer_benchmarks" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["offer-benchmarks"] }),
  });
}

/* ─────────── Comparison helpers ─────────── */

/** Para CPC/CPM/CPI: menor = melhor. Para CTR/conv/retention: maior = melhor. */
const LOWER_IS_BETTER: Record<string, boolean> = {
  cpc_brl: true,
  cpm_brl: true,
  cpi_brl: true,
  ctr_pct: false,
  conversion_pct: false,
  pitch_retention_pct: false,
};

export type MetricStatus = "good" | "warn" | "bad" | "neutral";

/** Compara métrica real vs target. Tolerância de 10% (warn) e 25% (bad). */
export function compareMetric(
  metric: keyof typeof LOWER_IS_BETTER,
  actual: number | null | undefined,
  target: number | null | undefined
): MetricStatus {
  if (actual == null || target == null || target === 0) return "neutral";
  const lowerIsBetter = LOWER_IS_BETTER[metric];
  // ratio = actual / target. Se lowerIsBetter, queremos ratio <= 1.
  const ratio = actual / target;
  if (lowerIsBetter) {
    if (ratio <= 1.10) return "good";
    if (ratio <= 1.25) return "warn";
    return "bad";
  } else {
    if (ratio >= 0.90) return "good";
    if (ratio >= 0.75) return "warn";
    return "bad";
  }
}

/** Status agregado: pior status entre as 6 métricas comparadas. */
export function aggregateStatus(
  actual: OfferKpiMetrics | undefined,
  target: OfferBenchmark | undefined
): MetricStatus {
  if (!actual || !target) return "neutral";
  const metrics = ["cpc_brl", "cpm_brl", "ctr_pct", "cpi_brl", "conversion_pct", "pitch_retention_pct"] as const;
  const rank: Record<MetricStatus, number> = { neutral: -1, good: 0, warn: 1, bad: 2 };
  let worst: MetricStatus = "neutral";
  for (const m of metrics) {
    const s = compareMetric(m, actual[m], target[m]);
    if (rank[s] > rank[worst]) worst = s;
  }
  return worst;
}

export const NICHO_LABELS: Record<OfferNicho, string> = {
  brain_memory: "Cérebro & Memória",
  vision: "Visão",
  hearing: "Audição",
  blood_sugar: "Blood Sugar / Diabetes",
  glp1: "GLP-1",
  blood_sugar_glp1: "Blood Sugar / GLP-1 (legado)",
  weight_loss: "Emagrecimento",
  mens_health_ed: "Saúde do Homem / ED",
  womens_health: "Saúde da Mulher",
  heart_bp: "Coração & Pressão",
  prostate: "Próstata",
  tinnitus: "Zumbido",
  joint_pain: "Dor articular",
  skin_beauty: "Pele & Beleza",
  hair_loss: "Queda de cabelo",
  dental: "Dental",
  sleep: "Sono",
  energy: "Energia",
  immunity: "Imunidade",
  digestive: "Digestivo",
  kidney_liver: "Rim & Fígado",
  anti_aging: "Anti-Aging",
  muscle: "Ganho de massa",
  detox: "Detox",
  thyroid: "Tireoide",
  spiritual: "Espiritual",
  survival: "Survival / Prepper",
  pet: "Pet",
  financial: "Financeiro",
  outro: "Outro",
};
