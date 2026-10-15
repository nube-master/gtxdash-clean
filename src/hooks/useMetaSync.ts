import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export function useMetaSync() {
  const [isSyncing, setIsSyncing] = useState(false);
  const { toast } = useToast();

  const triggerSync = async (operationId: string, dateFrom?: string, dateTo?: string) => {
    if (isSyncing) return;
    
    setIsSyncing(true);
    try {
      // Use the service role key from the window or a default if available, 
      // but usually the Edge Function should handle the master token itself.
      const { data, error } = await supabase.functions.invoke("sync-meta-ads", {
        body: {
          operation_id: operationId,
          date_from: dateFrom,
          date_to: dateTo,
          force: true
        }
      });

      if (error) throw error;

      toast({
        title: "Sincronização iniciada",
        description: `Os dados do Meta Ads estão sendo atualizados para ${operationId.slice(0, 8)}...`,
      });
      
      return data;
    } catch (err: any) {
      console.error("Meta sync error:", err);
      toast({
        title: "Erro na sincronização",
        description: err.message || "Não foi possível sincronizar com o Meta Ads.",
        variant: "destructive",
      });
      throw err;
    } finally {
      setIsSyncing(false);
    }
  };

  return { triggerSync, isSyncing };
}
