import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOperationId } from "@/contexts/OperationContext";

export function useSpyFavorites() {
  const { user } = useAuth();
  const opId = useOperationId();
  const qc = useQueryClient();

  const { data: favIds = new Set<string>() } = useQuery({
    queryKey: ["spy-favorites", user?.id],
    enabled: !!user,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("spy_favorites")
        .select("offer_id")
        .eq("user_id", user!.id);
      if (error) throw error;
      return new Set((data ?? []).map((r: any) => r.offer_id as string));
    },
  });

  const toggle = useMutation({
    mutationFn: async (offerId: string) => {
      if (!user) throw new Error("Faça login pra favoritar");
      const isFav = favIds.has(offerId);
      if (isFav) {
        const { error } = await supabase
          .from("spy_favorites")
          .delete()
          .eq("user_id", user.id)
          .eq("offer_id", offerId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("spy_favorites")
          .insert({ user_id: user.id, offer_id: offerId, operation_id: opId! });
        if (error) throw error;
      }
      return !isFav;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["spy-favorites"] });
      qc.invalidateQueries({ queryKey: ["spy-offers"] });
    },
  });

  return { favIds, toggle, isFavorite: (id: string) => favIds.has(id) };
}
