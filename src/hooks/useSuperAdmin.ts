import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export function useSuperAdmin() {
  const { user, loading } = useAuth();
  return useQuery({
    queryKey: ["is-super-admin", user?.id],
    queryFn: async () => {
      if (!user?.id) return false;
      const { data, error } = await supabase
        .from("super_admins")
        .select("user_id, is_restricted")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) {
        console.error("[useSuperAdmin] Query error:", error.message);
        return false;
      }
      return data ? !data.is_restricted : false;
    },
    enabled: !!user?.id && !loading,
    staleTime: 300_000,
    retry: 2,
  });
}
