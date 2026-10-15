import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOperationId } from "@/contexts/OperationContext";

export interface MetaAdPagesStats {
  activeAds: number;
  activePages: number;
  adsWithoutPage: number;
  lastSyncedAt: string | null;
}

/**
 * Conta anúncios ATIVOS (effective_status=ACTIVE) e fanpages distintas em uso,
 * a partir de meta_ad_pages (sincronizado via sync-meta-ad-pages).
 */
export function useMetaAdPagesStats() {
  const opId = useOperationId();
  return useQuery<MetaAdPagesStats>({
    queryKey: ["meta-ad-pages-stats", opId],
    queryFn: async () => {
      const PAGE = 1000;
      let all: any[] = [];
      let from = 0;
      let hasMore = true;
      while (hasMore) {
        let q = supabase
          .from("meta_ad_pages")
          .select("ad_id,page_id,effective_status,last_synced_at")
          .eq("effective_status", "ACTIVE")
          .range(from, from + PAGE - 1);
        if (opId) q = q.eq("operation_id", opId);
        const { data, error } = await q;
        if (error) throw error;
        all = all.concat(data || []);
        hasMore = (data?.length || 0) === PAGE;
        from += PAGE;
      }
      const ads = new Set<string>();
      const pages = new Set<string>();
      let noPage = 0;
      let last: string | null = null;
      for (const r of all) {
        ads.add(r.ad_id);
        if (r.page_id) pages.add(r.page_id);
        else noPage++;
        if (!last || (r.last_synced_at && r.last_synced_at > last)) last = r.last_synced_at;
      }
      return {
        activeAds: ads.size,
        activePages: pages.size,
        adsWithoutPage: noPage,
        lastSyncedAt: last,
      };
    },
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });
}
