import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOperationId } from "@/contexts/OperationContext";

export interface HotmartAllowlist {
  allowAll: boolean;
  names: string[]; // normalized lowercased trimmed
}

const norm = (s: string | null | undefined) => (s || "").toString().trim().toLowerCase();

export function useHotmartAllowlist() {
  const operationId = useOperationId();
  const q = useQuery<HotmartAllowlist>({
    queryKey: ["hotmart-allowlist", operationId],
    enabled: !!operationId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "hotmart_config")
        .eq("operation_id", operationId!)
        .maybeSingle();
      const list: string[] = Array.isArray((data?.value as any)?.allowed_products)
        ? (data!.value as any).allowed_products
        : [];
      return {
        allowAll: list.length === 0,
        names: list.map(norm).filter(Boolean),
      };
    },
  });
  const allow = q.data ?? { allowAll: true, names: [] };
  const isAllowed = (productName?: string | null, itemName?: string | null) => {
    if (allow.allowAll) return true;
    const a = norm(productName);
    const b = norm(itemName);
    if ((a && allow.names.includes(a)) || (b && allow.names.includes(b))) return true;

    // Fallback substring matching
    return allow.names.some(name => a.includes(name) || b.includes(name) || name.includes(a) || name.includes(b));
  };
  return { ...allow, isAllowed, loading: q.isLoading };
}
