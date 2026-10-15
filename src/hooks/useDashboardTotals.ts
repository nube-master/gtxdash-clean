import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDateRange } from "@/contexts/DateRangeContext";
import { useOperationId } from "@/contexts/OperationContext";
import { useEffect, useRef } from "react";


export interface DashboardTotals {
  totalSpend: number;
  totalRevenue: number;
  totalConversions: number;
  totalClicks: number;
  totalImpressions: number;
  totalLinkClicks: number;
  totalLpViews?: number;
  vslPlays?: number;
  initiatedCheckouts?: number;
  roas: number;
  cac: number;
  ticketMedio: number;
  lucroBruto: number;
  usdToBrl: number;
  cpRevenue: number;
  cpCount: number;
  rtRevenueBrl: number;
  rtCount: number;
  spendByChannel?: { meta: number; newsbreak: number };
  hourlyData?: any[];
  ts: string;
}

const EMPTY_TOTALS: DashboardTotals = {
  totalSpend: 0, totalRevenue: 0, totalConversions: 0, totalClicks: 0,
  totalImpressions: 0, totalLinkClicks: 0, roas: 0, cac: 0, ticketMedio: 0, lucroBruto: 0,
  usdToBrl: 5.15, cpRevenue: 0, cpCount: 0, rtRevenueBrl: 0, rtCount: 0,
  totalLpViews: 0, vslPlays: 0, initiatedCheckouts: 0,
  hourlyData: [],
  ts: "",
};

function getTodaySP(): string {
  const d = new Date();
  // Se for entre 00:00 e 01:00 UTC e precisarmos de Midnight Guard, mas aqui o objetivo é simplesmente a data BRT correta.
  // 00:40 UTC = 21:40 BRT (dia anterior).
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
}

async function loadFrozenLinkClicks(start: string, end: string, opId: string | null): Promise<number> {
  try {
    const params: Record<string, string> = {
      p_start_date: start,
      p_end_date: end,
    };
    if (opId) params.p_operation_id = opId;

    const { data, error } = await supabase
      .rpc("get_total_link_clicks" as any, params);

    if (error) {
      console.warn("[useDashboardTotals] Frozen link clicks unavailable:", error.message);
      return 0;
    }

    const rows = (data as any[]) || [];
    return rows.length > 0 ? Number(rows[0]?.total_link_clicks || 0) : 0;
  } catch (e) {
    console.warn("[useDashboardTotals] Frozen link clicks failed:", e);
    return 0;
  }
}

async function loadFrozenTotals(start: string, end: string, opId: string | null): Promise<DashboardTotals | null> {
  const todaySP = getTodaySP();
  if (end >= todaySP) return null;

  // GTX MIDIA (29/08/2026): snapshots legados foram congelados ANTES da integração
  // cod_orders (webhook Fahto/Sphere) e têm revenue zerado/errado. GTX agora é
  // 100% Meta (funil) + cod_orders (receita) via dashboard-totals live — nunca usar snapshot.
  if (opId === "0b758a2b-1b92-4769-b47b-416c567e320d") return null;

  let q = supabase
    .from("daily_totals_snapshot")
    .select("*")
    .gte("date", start)
    .lte("date", end)
    .order("date", { ascending: true })
    .order("created_at", { ascending: false });
  q = opId ? q.eq("operation_id", opId) : q.is("operation_id", null);

  const { data, error } = await q;
  if (error || !data || data.length === 0) return null;

  const startDate = new Date(`${start}T12:00:00Z`);
  const endDate = new Date(`${end}T12:00:00Z`);
  const expectedDays = Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  if (data.length < expectedDays) return null;

  const agg: DashboardTotals = { ...EMPTY_TOTALS };
  const uniqueRowsByDate = new Map<string, any>();
  for (const row of data) {
    if (!uniqueRowsByDate.has(row.date)) uniqueRowsByDate.set(row.date, row);
  }

  for (const row of uniqueRowsByDate.values()) {
    agg.totalSpend += Number(row.total_spend || 0);
    agg.totalRevenue += Number(row.total_revenue || 0);
    agg.totalConversions += Number(row.total_conversions || 0);
    agg.totalClicks += Number(row.total_clicks || 0);
    agg.totalImpressions += Number(row.total_impressions || 0);
    agg.cpRevenue += Number(row.cp_revenue || 0);
    agg.cpCount += Number(row.cp_count || 0);
    agg.rtRevenueBrl += Number(row.rt_revenue_brl || 0);
    agg.rtCount += Number(row.rt_count || 0);
    if (agg.totalLpViews !== undefined) agg.totalLpViews += Number((row as any).total_lp_views || 0);
    if (agg.vslPlays !== undefined) agg.vslPlays += Number((row as any).vsl_plays || 0);
    if (agg.initiatedCheckouts !== undefined) agg.initiatedCheckouts += Number((row as any).initiated_checkouts || 0);
  }

  try {
    agg.totalLinkClicks = await loadFrozenLinkClicks(start, end, opId);
  } catch (e) {
    console.warn("[useDashboardTotals] Frozen link clicks failed, using 0:", e);
    agg.totalLinkClicks = 0;
  }

  agg.roas = agg.totalSpend > 0 ? agg.totalRevenue / agg.totalSpend : 0;
  agg.cac = agg.totalConversions > 0 ? agg.totalSpend / agg.totalConversions : 0;
  agg.ticketMedio = agg.totalConversions > 0 ? agg.totalRevenue / agg.totalConversions : 0;
  agg.lucroBruto = agg.totalRevenue - agg.totalSpend;
  agg.usdToBrl = Number(data[data.length - 1].usd_to_brl || 5.15);
  agg.ts = `frozen:${data[data.length - 1].created_at}`;

  return agg;
}

async function fetchLiveTotals(start: string, end: string, opId: string | null, attempt = 0): Promise<DashboardTotals> {
  const baseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  let url = `${baseUrl}/functions/v1/dashboard-totals?start=${start}&end=${end}&_nocache=${Date.now()}`;
  if (opId) url += `&operation_id=${opId}`;
  else url += `&operation_id=null`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);

  try {
    const res = await fetch(url, {
      headers: {
        "Authorization": `Bearer ${anonKey}`,
        "apikey": anonKey,
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const errText = await res.text();
      const isTransient =
        res.status === 503 ||
        res.status === 502 ||
        res.status === 504 ||
        errText.includes("BOOT_ERROR") ||
        errText.includes("EDGE_RUNTIME_ERROR") ||
        errText.includes("temporarily unavailable");
      if (isTransient && attempt < 4) {
        const delay = 1200 * (attempt + 1);
        await new Promise((r) => setTimeout(r, delay));
        return fetchLiveTotals(start, end, opId, attempt + 1);
      }
      throw new Error(`dashboard-totals failed: ${res.status} ${errText}`);
    }

    return await res.json();
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

declare global {
  interface Window {
    __lastBrtDay?: string;
  }
}

export function useDashboardTotals() {
  const queryClient = useQueryClient();
  const { dateRange } = useDateRange();
  const [start, end] = dateRange;
  const opId = useOperationId();
  const lastDayRef = useRef<string>(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date()));
  
  useEffect(() => {
    const handleMidnight = () => {
      console.log("[useDashboardTotals] Operational day changed, invalidating totals...");
      queryClient.invalidateQueries({ queryKey: ["dashboard-totals"] });
      queryClient.invalidateQueries({ queryKey: ["spend-today-brt"] });
    };
    
    const checkBrtDay = () => {
      const brtDay = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
      if (lastDayRef.current && lastDayRef.current !== brtDay) {
        lastDayRef.current = brtDay;
        handleMidnight();
      }
    };
    const interval = setInterval(checkBrtDay, 30_000);

    window.addEventListener("tos:midnight-tick", handleMidnight);
    return () => {
      window.removeEventListener("tos:midnight-tick", handleMidnight);
      clearInterval(interval);
    };
  }, [queryClient]);

  return useQuery<DashboardTotals>({
    refetchInterval: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
    staleTime: 0,
    queryKey: ["dashboard-totals", start, end, opId],
    queryFn: async () => {
      const frozen = await loadFrozenTotals(start, end, opId);
      if (frozen) {
        console.log(`[useDashboardTotals] Using frozen snapshot for ${start}→${end}`);
        return frozen;
      }

      const live = await fetchLiveTotals(start, end, opId);
      const todaySP = getTodaySP();
      const isToday = start === todaySP && end === todaySP;
      const isEDD = opId === "1dd606e3-dac2-4064-b863-9784307c9e98";
      const isFahto = opId === "8707b3f8-ab41-4a63-902c-9ab97fe50c8a";

      if (isFahto) {
        // Source of truth for FAHTO is sales_data
        const getBounds = () => {
          const now = new Date();
          const spDateFormatter = new Intl.DateTimeFormat("en-CA", {
            timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
          });
          const brDateStr = start; // Usem a data selecionada (histórico ou hoje)
          const startUTC = new Date(`${brDateStr}T00:00:00-03:00`);
          const endUTC = new Date(`${end}T23:59:59-03:00`);
          return { brDateStr, startUTC, endUTC };
        };
        const { startUTC, endUTC } = getBounds();
        const startISO = startUTC.toISOString();
        const endISO = endUTC.toISOString();

        const { data: salesData, error: salesError } = await supabase
          .from("sales_data")
          .select("revenue")
          .eq("operation_id", opId)
          .eq("status", "approved")
          .gte("created_at", startISO)
          .lte("created_at", endISO);

        if (!salesError && salesData) {
          const totalRevenue = (salesData as any[]).reduce((acc, r) => acc + Number(r.revenue || 0), 0);
          const totalConversions = salesData.length;
          
          live.totalRevenue = totalRevenue;
          live.totalConversions = totalConversions;
          
          // Recalculate based on new revenue
          live.roas = live.totalSpend > 0 ? live.totalRevenue / live.totalSpend : 0;
          live.lucroBruto = live.totalRevenue - live.totalSpend;
          live.cac = live.totalConversions > 0 ? live.totalSpend / live.totalConversions : 0;
          live.ticketMedio = live.totalConversions > 0 ? live.totalRevenue / live.totalConversions : 0;
        }

        // IC -> Venda for FAHTO
        const { data: icData } = await supabase
          .from("redtrack_events")
          .select("id")
          .eq("operation_id", opId)
          .eq("event_type", "initiate_checkout")
          .gte("occurred_at", startISO)
          .lte("occurred_at", endISO);
          
        if (icData) {
          live.initiatedCheckouts = (icData as any[]).length;
        }
      }



      /* BUG - comentado 2026-08-20: chama get-spend-today-brt 
         que retorna valor errado e sobrescreve totalSpend correto 
         vindo do dashboard-totals
      if (isToday && opId) {
        const { data: token, error: tokenError } = await supabase.rpc("get_operation_credential", {
          p_operation_id: opId,
          p_provider: "meta_ads",
          p_profile_key: "default"
        });

        if (!tokenError && token) {
          const { data: spendData, error: spendError } = await supabase.functions.invoke(`get-spend-today-brt?operation_id=${opId}`, {
            method: "GET",
            headers: { "Authorization": `Bearer ${token}` }
          });

          if (!spendError && spendData && spendData.total_brl !== undefined) {
             const realTimeSpend = Number(spendData.total_brl || 0);
             if (realTimeSpend > 0) {
               console.log(`[useDashboardTotals] Applying Authoritative BRT Spend V2 for ${opId}: ${realTimeSpend}`);
               live.totalSpend = realTimeSpend;
               live.roas = live.totalSpend > 0 ? live.totalRevenue / live.totalSpend : 0;
               live.cac = live.totalConversions > 0 ? live.totalSpend / live.totalConversions : 0;
               live.lucroBruto = live.totalRevenue - live.totalSpend;
               live.ts = `${live.ts}|brt-auth-v2:${spendData.ts}`;
             }
          }
        }
      }
      */




      // Fallbacks para EDD se o pipeline principal retornar zero
      if (isToday && (isEDD || isFahto) && (live.totalImpressions === 0 || live.totalClicks === 0)) {
         const { data: funnelFallback } = await supabase.rpc('get_spend_normalized_sp', {
           p_start_date: todaySP,
           p_end_date: todaySP,
           p_operation_id: opId
         });
         
         if (funnelFallback && funnelFallback.length > 0) {
           const row = funnelFallback[0] as any;
           const fallbackClicks = Number(row.clicks || 0);
           if (live.totalImpressions === 0) {
             const imp = Number(row.impressions || 0);
             live.totalImpressions = imp > 0 ? imp : fallbackClicks * 50;
           }
           if (live.totalClicks === 0) live.totalClicks = fallbackClicks;
           if (live.totalLinkClicks === 0) live.totalLinkClicks = fallbackClicks;
           if (live.initiatedCheckouts === 0 || live.initiatedCheckouts === undefined) live.initiatedCheckouts = Number(row.initiated_checkouts || 0);
           if (live.totalLpViews === 0 || live.totalLpViews === undefined) live.totalLpViews = Number(row.landing_page_views || 0);
           if (live.vslPlays === 0 || live.vslPlays === undefined) live.vslPlays = Number(row.vsl_plays || 0);
         }
      }

      return live;
    },
    placeholderData: (prev: DashboardTotals | undefined) => prev ?? EMPTY_TOTALS,
    retry: 1,
    retryDelay: 2_000,
  });
}