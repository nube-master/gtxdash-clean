import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PUSH_SW_URL } from "@/lib/pushServiceWorker";

export interface PushDevice {
  id: string;
  endpoint: string;
  device_label: string | null;
  operation_id: string | null;
  enabled: boolean;
  created_at: string;
  last_used_at: string | null;
}

/** Dispositivos (subscriptions) do próprio usuário logado. */
export function usePushDevices() {
  const qc = useQueryClient();

  const devices = useQuery({
    queryKey: ["push-devices-mine"],
    queryFn: async (): Promise<PushDevice[]> => {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes?.user?.id;
      if (!uid) return [];
      const { data, error } = await supabase
        .from("push_subscriptions")
        .select("id, endpoint, device_label, operation_id, enabled, created_at, last_used_at")
        .eq("user_id", uid)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PushDevice[];
    },
  });

  const currentEndpoint = useQuery({
    queryKey: ["push-current-endpoint"],
    queryFn: async (): Promise<string | null> => {
      if (!("serviceWorker" in navigator)) return null;
      try {
        const reg = await navigator.serviceWorker.getRegistration(PUSH_SW_URL);
        const sub = await reg?.pushManager.getSubscription();
        return sub?.endpoint ?? null;
      } catch {
        return null;
      }
    },
  });

  const removeDevice = useMutation({
    mutationFn: async (device: PushDevice) => {
      // Se for o dispositivo atual, também derruba a subscription local.
      if (currentEndpoint.data && device.endpoint === currentEndpoint.data) {
        const reg = await navigator.serviceWorker.getRegistration(PUSH_SW_URL);
        const sub = await reg?.pushManager.getSubscription();
        await sub?.unsubscribe();
      }
      const { error } = await supabase.functions.invoke("push-unsubscribe", {
        body: { subscription_id: device.id },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["push-devices-mine"] });
      void qc.invalidateQueries({ queryKey: ["push-current-endpoint"] });
      void qc.invalidateQueries({ queryKey: ["push-onboarding-state"] });
    },
  });

  return {
    devices: devices.data ?? [],
    isLoading: devices.isLoading,
    currentEndpoint: currentEndpoint.data ?? null,
    removeDevice,
    refetch: () => {
      void devices.refetch();
      void currentEndpoint.refetch();
    },
  };
}

export interface MyRecipientRow {
  operation_id: string;
  notification_type: string;
  enabled: boolean;
}

/** O que o próprio usuário recebe hoje (somente leitura — admin controla). */
export function useMyPushRecipients() {
  return useQuery({
    queryKey: ["push-recipients-mine"],
    queryFn: async (): Promise<MyRecipientRow[]> => {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes?.user?.id;
      if (!uid) return [];
      const { data, error } = await supabase
        .from("push_notification_recipients")
        .select("operation_id, notification_type, enabled")
        .eq("user_id", uid)
        .eq("enabled", true);
      if (error) throw error;
      return (data ?? []) as MyRecipientRow[];
    },
  });
}
