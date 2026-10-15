import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOperationId } from "@/contexts/OperationContext";
import { useAuth } from "@/contexts/AuthContext";
import {
  type SpyOffer,
  type SpyOfferFilters,
  SPY_PAGE_SIZE,
} from "@/types/spy";

interface UseSpyOffersOptions {
  filters: SpyOfferFilters;
  page: number; // 0-indexed
}

interface SpyOffersResult {
  rows: SpyOffer[];
  total: number;
  totalPages: number;
}

export function useSpyOffers({ filters, page }: UseSpyOffersOptions) {
  const operationId = useOperationId();
  const { user } = useAuth();

  return useQuery({
    queryKey: ["spy-offers", operationId, filters, page, user?.id],
    enabled: !!operationId,
    staleTime: 30_000,
    queryFn: async (): Promise<SpyOffersResult> => {
      // Favoritos: filtra por IDs de spy_favorites do user
      if (filters.tab === "favoritos") {
        if (!user) return { rows: [], total: 0, totalPages: 0 };
        const { data: favs } = await supabase
          .from("spy_favorites")
          .select("offer_id")
          .eq("user_id", user.id);
        const ids = (favs ?? []).map((f: any) => f.offer_id);
        if (!ids.length) return { rows: [], total: 0, totalPages: 0 };
        let q = supabase
          .from("spy_offers")
          .select("*", { count: "exact" })
          .eq("operation_id", operationId!)
          .in("id", ids);
        q = applyCommonFilters(q, filters);
        q = applyOrder(q, filters.order);
        const from = page * SPY_PAGE_SIZE;
        const to = from + SPY_PAGE_SIZE - 1;
        const { data, count, error } = await q.range(from, to);
        if (error) throw error;
        return {
          rows: (data ?? []) as SpyOffer[],
          total: count ?? 0,
          totalPages: Math.max(1, Math.ceil((count ?? 0) / SPY_PAGE_SIZE)),
        };
      }

      let q = supabase
        .from("spy_offers")
        .select("*", { count: "exact" })
        .eq("operation_id", operationId!);

      // Tab semantics
      if (filters.tab === "white") {
        q = q.eq("trafego", "White");
      }
      // inicio: sem filtro de category


      q = applyCommonFilters(q, filters);
      q = applyOrder(q, filters.order);

      const from = page * SPY_PAGE_SIZE;
      const to = from + SPY_PAGE_SIZE - 1;
      const { data, count, error } = await q.range(from, to);
      if (error) throw error;
      return {
        rows: (data ?? []) as SpyOffer[],
        total: count ?? 0,
        totalPages: Math.max(1, Math.ceil((count ?? 0) / SPY_PAGE_SIZE)),
      };
    },
  });
}

function applyCommonFilters(q: any, f: SpyOfferFilters) {
  if (f.search.trim()) {
    const s = f.search.trim();
    q = q.or(`offer_name.ilike.%${s}%,product_name.ilike.%${s}%,primary_advertiser.ilike.%${s}%`);
  }
  if (f.subnicho) q = q.eq("subnicho", f.subnicho);
  if (f.idioma) q = q.eq("idioma", f.idioma);
  if (f.trafego) q = q.eq("trafego", f.trafego);
  if (f.nicho) q = q.eq("nicho", f.nicho);
  if (f.status && f.status.length > 0) q = q.in("status", f.status);
  return q;
}

function applyOrder(q: any, order: SpyOfferFilters["order"]) {
  switch (order) {
    case "mais_ads":
      return q.order("active_ads_count", { ascending: false });
    case "menos_ads":
      return q.order("active_ads_count", { ascending: true, nullsFirst: false });
    case "popularidade":
      return q.order("saved_count", { ascending: false, nullsFirst: false });
    case "recentes":
    default:
      return q.order("last_updated_at", { ascending: false });
  }
}

export function useSpyCreateOffer() {
  const qc = useQueryClient();
  const operationId = useOperationId();
  return useMutation({
    mutationFn: async (payload: Partial<SpyOffer>) => {
      if (!operationId) throw new Error("Sem operação selecionada");
      const { data, error } = await supabase
        .from("spy_offers")
        .insert({ ...payload, operation_id: operationId } as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["spy-offers"] }),
  });
}

export function useSpyDeleteOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (offerId: string) => {
      const { error } = await supabase.from("spy_offers").delete().eq("id", offerId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["spy-offers"] }),
  });
}

export function useSpyUpdateOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<SpyOffer> }) => {
      const { data, error } = await supabase
        .from("spy_offers")
        .update(patch as any)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["spy-offers"] });
      qc.invalidateQueries({ queryKey: ["spy-offer-detail", vars.id] });
    },
  });
}

