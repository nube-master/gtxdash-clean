import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface RetentionPoint {
  seconds: number;
  users: number;
  retention: number;
}

interface RetentionData {
  player_id: string;
  video_duration: number;
  average_watched_time: number;
  engagement_rate: number;
  curve: RetentionPoint[];
}

export function useVslRetention(playerId: string | null, startDate?: string, endDate?: string) {
  return useQuery({
    queryKey: ["vsl-retention", playerId, startDate, endDate],
    queryFn: async (): Promise<RetentionData> => {
      const { data, error } = await supabase.functions.invoke("get-vsl-retention", {
        body: {
          player_id: playerId,
          start_date: startDate ? `${startDate} 00:00:00` : undefined,
          end_date: endDate ? `${endDate} 23:59:59` : undefined,
        },
      });
      if (error) throw error;
      return data;
    },
    enabled: !!playerId,
    staleTime: 5 * 60 * 1000,
  });
}
