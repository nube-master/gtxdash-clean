import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type PushOnboardingState = "loading" | "no_device" | "device_no_alerts" | "ready";

/**
 * 3 estados do usuário novo:
 *  - no_device        → sem subscription ativa (precisa ativar no aparelho)
 *  - device_no_alerts → aparelho pronto, mas admin ainda não liberou nenhum tipo
 *  - ready            → recebendo alertas
 */
export function usePushOnboardingState() {
  const query = useQuery({
    queryKey: ["push-onboarding-state"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes?.user?.id;
      if (!uid) return { devices: 0, alerts: 0 };

      const [{ count: devices }, { count: alerts }] = await Promise.all([
        supabase
          .from("push_subscriptions")
          .select("id", { count: "exact", head: true })
          .eq("user_id", uid)
          .eq("enabled", true)
          .is("deleted_at", null),
        supabase
          .from("push_notification_recipients")
          .select("user_id", { count: "exact", head: true })
          .eq("user_id", uid)
          .eq("enabled", true),
      ]);

      return { devices: devices ?? 0, alerts: alerts ?? 0 };
    },
  });

  const state: PushOnboardingState = query.isLoading
    ? "loading"
    : (query.data?.devices ?? 0) === 0
      ? "no_device"
      : (query.data?.alerts ?? 0) === 0
        ? "device_no_alerts"
        : "ready";

  return { state, devices: query.data?.devices ?? 0, alerts: query.data?.alerts ?? 0 };
}
