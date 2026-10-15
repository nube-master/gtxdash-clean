import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOperationId } from "@/contexts/OperationContext";

export type ProductMarginRow = {
  product_key: string;
  margin_pct: number;     // 0..1
  be_buffer_pct: number;  // 0..1, default 0.10
};

export type ProductMarginMap = Record<string, ProductMarginRow>;

/** Fallback global thresholds (when product has no margin configured) */
export const FALLBACK_GREEN_AT = 1.2;
export const FALLBACK_BE = 1.0;

export type RoasColor = "positive" | "warning" | "destructive" | "muted";

export function computeRoasColor(
  roas: number,
  productKey: string | null | undefined,
  margins: ProductMarginMap,
): { color: RoasColor; be: number; greenAt: number } {
  if (!roas || roas <= 0) return { color: "muted", be: FALLBACK_BE, greenAt: FALLBACK_GREEN_AT };
  const cfg = productKey ? margins[productKey.toUpperCase()] : undefined;
  if (cfg && cfg.margin_pct > 0) {
    const be = 1 / cfg.margin_pct;
    const greenAt = be * (1 + (cfg.be_buffer_pct ?? 0.1));
    if (roas >= greenAt) return { color: "positive", be, greenAt };
    if (roas >= be) return { color: "warning", be, greenAt };
    return { color: "destructive", be, greenAt };
  }
  // Fallback
  if (roas >= FALLBACK_GREEN_AT) return { color: "positive", be: FALLBACK_BE, greenAt: FALLBACK_GREEN_AT };
  if (roas >= FALLBACK_BE) return { color: "warning", be: FALLBACK_BE, greenAt: FALLBACK_GREEN_AT };
  return { color: "destructive", be: FALLBACK_BE, greenAt: FALLBACK_GREEN_AT };
}

export function roasColorClass(color: RoasColor): string {
  switch (color) {
    case "positive": return "text-[hsl(var(--wr-positive))]";
    case "warning": return "text-[hsl(var(--wr-warning))]";
    case "destructive": return "text-destructive";
    default: return "text-muted-foreground/60";
  }
}

export function useProductMargins() {
  const operationId = useOperationId();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["product-margins", operationId],
    enabled: !!operationId,
    staleTime: 60_000,
    queryFn: async (): Promise<ProductMarginMap> => {
      const { data, error } = await (supabase as any)
        .from("product_margin_settings")
        .select("product_key, margin_pct, be_buffer_pct")
        .eq("operation_id", operationId);
      if (error) throw error;
      const map: ProductMarginMap = {};
      for (const r of (data ?? []) as ProductMarginRow[]) {
        map[r.product_key.toUpperCase()] = {
          product_key: r.product_key.toUpperCase(),
          margin_pct: Number(r.margin_pct) || 0,
          be_buffer_pct: Number(r.be_buffer_pct) || 0,
        };
      }
      return map;
    },
  });

  const upsert = useMutation({
    mutationFn: async (row: ProductMarginRow) => {
      if (!operationId) throw new Error("Sem operação");
      const payload = {
        operation_id: operationId,
        product_key: row.product_key.toUpperCase(),
        margin_pct: row.margin_pct,
        be_buffer_pct: row.be_buffer_pct,
      };
      const { error } = await (supabase as any)
        .from("product_margin_settings")
        .upsert(payload, { onConflict: "operation_id,product_key" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["product-margins", operationId] }),
  });

  const remove = useMutation({
    mutationFn: async (product_key: string) => {
      if (!operationId) throw new Error("Sem operação");
      const { error } = await (supabase as any)
        .from("product_margin_settings")
        .delete()
        .eq("operation_id", operationId)
        .eq("product_key", product_key.toUpperCase());
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["product-margins", operationId] }),
  });

  return {
    margins: query.data ?? {},
    isLoading: query.isLoading,
    upsert,
    remove,
  };
}
