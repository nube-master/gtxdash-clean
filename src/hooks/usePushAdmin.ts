import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PushAdminUser {
  user_id: string;
  email: string | null;
  display_name: string | null;
  member_role: string | null;
  device_count: number;
  last_used_at: string | null;
  recipient_count: number;
}

/** Usuários da operação com status de push (RPC security definer). */
export function usePushAdminUsers(operationId?: string | null) {
  return useQuery({
    queryKey: ["push-admin-users", operationId],
    enabled: !!operationId,
    queryFn: async (): Promise<PushAdminUser[]> => {
      const { data, error } = await supabase.rpc("admin_list_push_users", {
        p_operation_id: operationId!,
      });
      if (error) throw error;
      return (data ?? []) as PushAdminUser[];
    },
  });
}

export interface RecipientRow {
  user_id: string;
  operation_id: string;
  notification_type: string;
  enabled: boolean;
}

/** Matriz de recipients da operação (todos os usuários). */
export function usePushAdminRecipients(operationId?: string | null) {
  const qc = useQueryClient();
  const key = ["push-admin-recipients", operationId];

  const query = useQuery({
    queryKey: key,
    enabled: !!operationId,
    queryFn: async (): Promise<RecipientRow[]> => {
      const { data, error } = await supabase
        .from("push_notification_recipients")
        .select("user_id, operation_id, notification_type, enabled")
        .eq("operation_id", operationId!);
      if (error) throw error;
      return (data ?? []) as RecipientRow[];
    },
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: key });
    void qc.invalidateQueries({ queryKey: ["push-admin-users", operationId] });
  };

  const toggle = useMutation({
    mutationFn: async (args: { userId: string; type: string; on: boolean }) => {
      if (!operationId) throw new Error("Nenhuma operação selecionada");
      if (args.on) {
        const { error } = await supabase.from("push_notification_recipients").upsert(
          {
            user_id: args.userId,
            operation_id: operationId,
            notification_type: args.type,
            enabled: true,
          },
          { onConflict: "user_id,operation_id,notification_type" },
        );
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("push_notification_recipients")
          .delete()
          .eq("user_id", args.userId)
          .eq("operation_id", operationId)
          .eq("notification_type", args.type);
        if (error) throw error;
      }
    },
    onSuccess: invalidate,
  });

  const setMany = useMutation({
    mutationFn: async (args: { userId: string; types: string[]; on: boolean }) => {
      if (!operationId) throw new Error("Nenhuma operação selecionada");
      if (args.on) {
        const rows = args.types.map((t) => ({
          user_id: args.userId,
          operation_id: operationId,
          notification_type: t,
          enabled: true,
        }));
        const { error } = await supabase
          .from("push_notification_recipients")
          .upsert(rows, { onConflict: "user_id,operation_id,notification_type" });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("push_notification_recipients")
          .delete()
          .eq("user_id", args.userId)
          .eq("operation_id", operationId);
        if (error) throw error;
      }
    },
    onSuccess: invalidate,
  });

  const copyFrom = useMutation({
    mutationFn: async (args: { fromUserId: string; toUserId: string }) => {
      if (!operationId) throw new Error("Nenhuma operação selecionada");
      const { data, error } = await supabase.rpc("admin_copy_push_prefs", {
        p_from: args.fromUserId,
        p_to: args.toUserId,
        p_operation_id: operationId,
      });
      if (error) throw error;
      return (data ?? 0) as number;
    },
    onSuccess: invalidate,
  });

  return { rows: query.data ?? [], isLoading: query.isLoading, toggle, setMany, copyFrom };
}
