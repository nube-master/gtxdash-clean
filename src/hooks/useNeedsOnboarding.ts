import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Returns true if the current user does NOT belong to any operation.
 * Used to redirect to /onboarding.
 */
export function useNeedsOnboarding() {
  const { user, loading: authLoading } = useAuth();
  return useQuery({
    queryKey: ["needs-onboarding", user?.id],
    queryFn: async () => {
      if (!user?.id) return false;
      const { data, error } = await supabase
        .from("operation_members")
        .select("id")
        .eq("user_id", user.id)
        .limit(1);
      if (error) return false; // fail-safe: don't block access
      return !data || data.length === 0;
    },
    enabled: !!user?.id && !authLoading,
    staleTime: 60_000,
  });
}
