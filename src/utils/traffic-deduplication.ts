import { supabase } from "@/integrations/supabase/client";

/**
 * Utilitário para deduplicar registros de tráfego baseando-se na chave natural
 * (operação, conta, data, campanha, adset, anúncio, impressões e gasto).
 * Essencial para evitar inflação de spend em ambientes com múltiplos syncs ou falhas de sobreposição.
 */
export function deduplicateTraffic(data: any[]): any[] {
  if (!data || !Array.isArray(data)) return [];
  
  const seen = new Set();
  return data.filter(item => {
    // Chave natural para um registro de anúncio do Meta Ads
    const key = `${item.operation_id}|${item.account_id}|${item.date}|${item.campaign_name}|${item.adset_name}|${item.ad_name}|${item.impressions}|${item.spend}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Busca dados de tráfego com deduplicação no lado do cliente.
 * Usado como fallback enquanto as RPCs de banco (v2) não são atualizadas para tratar duplicidade na origem.
 */
export async function getDeduplicatedTraffic(operationId: string, startDate: string, endDate: string) {
  const { data, error } = await supabase
    .from("traffic_data")
    .select("*")
    .eq("operation_id", operationId)
    .gte("date", startDate)
    .lte("date", endDate);
    
  if (error) throw error;
  return deduplicateTraffic(data || []);
}
