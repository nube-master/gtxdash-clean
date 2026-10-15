import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOperationId } from "@/contexts/OperationContext";

export type FunnelRole = "frontend" | "order_bump" | "upsell" | "downsell";
export type FunnelRoleOrIgnore = FunnelRole | "ignore";

export const FUNNEL_ROLE_LABEL: Record<FunnelRole, string> = {
  frontend: "Frontend",
  order_bump: "Order Bump",
  upsell: "Upsell",
  downsell: "Downsell",
};

export const FUNNEL_ROLE_COLOR: Record<FunnelRole, string> = {
  frontend: "emerald",
  order_bump: "sky",
  upsell: "violet",
  downsell: "amber",
};

const norm = (s: string | null | undefined) =>
  (s || "").toString().trim().toLowerCase();

export interface HotmartCategoriesMap {
  categories: Record<string, FunnelRoleOrIgnore>;
  allowedSet: Set<string>;
  loading: boolean;
  roleOf: (productName?: string | null, itemName?: string | null) => FunnelRoleOrIgnore;
  isFrontend: (productName?: string | null, itemName?: string | null) => boolean;
  isIgnored: (productName?: string | null, itemName?: string | null) => boolean;
  isAllowed: (productName?: string | null, itemName?: string | null) => boolean;
}

/**
 * Lê `product_categories` e `allowed_products` de `app_settings.hotmart_config`.
 * - `allowed_products` = fonte da verdade dos produtos oficiais (usada no Dashboard/War Room).
 * - `product_categories` = papel no funil (frontend/order_bump/upsell/downsell/ignore).
 * - Produto na allowlist SEM categoria → tratado como "uncategorized" pelo consumidor.
 */
export function useHotmartCategories(operationIdOverride?: string | null): HotmartCategoriesMap {
  const ctxOperationId = useOperationId();
  const operationId = operationIdOverride ?? ctxOperationId;
  const q = useQuery({
    queryKey: ["hotmart-categories", operationId],
    enabled: !!operationId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "hotmart_config")
        .eq("operation_id", operationId!)
        .maybeSingle();
      const cfg = (data?.value as any) || {};
      const rawCats = cfg.product_categories || {};
      const rawAllowed = Array.isArray(cfg.allowed_products) ? cfg.allowed_products : [];
      const categories: Record<string, FunnelRoleOrIgnore> = {};
      Object.entries(rawCats).forEach(([k, v]) => {
        const key = norm(k);
        if (!key) return;
        if (v === "frontend" || v === "order_bump" || v === "upsell" || v === "downsell" || v === "ignore") {
          categories[key] = v;
        }
      });
      const allowedSet = new Set<string>(rawAllowed.map((s: string) => norm(s)).filter(Boolean));
      return { categories, allowedSet };
    },
  });

  const categories = q.data?.categories ?? {};
  const allowedSet = q.data?.allowedSet ?? new Set<string>();

  const isAllowed: HotmartCategoriesMap["isAllowed"] = (productName, itemName) => {
    if (allowedSet.size === 0) return true;
    const a = norm(productName);
    const b = norm(itemName);
    return (!!a && allowedSet.has(a)) || (!!b && allowedSet.has(b));
  };

  const roleOf: HotmartCategoriesMap["roleOf"] = (productName, itemName) => {
    const a = norm(productName);
    const b = norm(itemName);
    const role = categories[a] || categories[b];
    if (role) return role;
    
    // Fallback: search for substrings for dynamic names (e.g. "Mentoria" in "Mentoria Acelerador...")
    for (const [key, val] of Object.entries(categories)) {
      if (key.length > 3 && (a.includes(key) || b.includes(key) || key.includes(a) || key.includes(b))) {
        return val;
      }
    }
    return "ignore";
  };

  const isFrontend: HotmartCategoriesMap["isFrontend"] = (p, i) => roleOf(p, i) === "frontend";
  const isIgnored: HotmartCategoriesMap["isIgnored"] = (p, i) => roleOf(p, i) === "ignore";

  return { categories, allowedSet, loading: q.isLoading, roleOf, isFrontend, isIgnored, isAllowed };
}

