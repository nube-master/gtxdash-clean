import { useQuery } from "@tanstack/react-query";
import { useOperationId } from "@/contexts/OperationContext";
import type { DashboardTotals } from "@/hooks/useDashboardTotals";

function getTodaySP(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

async function fetchTodayDashboardTotals(opId: string | null, attempt = 0): Promise<DashboardTotals> {
  const today = getTodaySP();
  const baseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  let url = `${baseUrl}/functions/v1/dashboard-totals?start=${today}&end=${today}`;

  if (opId) url += `&operation_id=${opId}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);

  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${anonKey}`,
        apikey: anonKey,
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
        console.warn(`[useTodayDashboardTotals] Transient ${res.status} (attempt ${attempt + 1}/5), retrying in ${delay}ms`);
        await new Promise((r) => setTimeout(r, delay));
        return fetchTodayDashboardTotals(opId, attempt + 1);
      }
      throw new Error(`dashboard-totals(today) failed: ${res.status} ${errText}`);
    }

    return await res.json();
  } catch (error) {
    clearTimeout(timeout);
    throw error;
  }
}

export function useTodayDashboardTotals() {
  const opId = useOperationId();
  const today = getTodaySP();

  return useQuery<DashboardTotals>({
    queryKey: ["dashboard-totals-today", today, opId],
    queryFn: () => fetchTodayDashboardTotals(opId),
    staleTime: 5_000,
    refetchInterval: 15_000,
    retry: 1,
  });
}