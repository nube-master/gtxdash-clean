import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { setDynamicAffiliateMap } from "@/lib/productNames";
import { useEffect } from "react";

interface VendorConfig {
  id: string;
  label: string;
  nickname: string;
  secret_env: string;
  vendor_name?: string;
}

/**
 * Fetches clickbank_vendors from app_settings and hydrates the
 * dynamic affiliate→project mapping used by resolveProductName.
 * Mount this once near the app root (e.g. in DashboardLayout).
 */
export function useVendorMapping() {
  const { data: vendors } = useQuery({
    queryKey: ["clickbank-vendors"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "clickbank_vendors")
        .single();
      if (error) return [];
      return (data?.value as unknown as VendorConfig[]) || [];
    },
    staleTime: 5 * 60 * 1000, // 5 min cache
  });

  useEffect(() => {
    if (vendors && vendors.length > 0) {
      setDynamicAffiliateMap(vendors);
    }
  }, [vendors]);
}
