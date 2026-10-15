import { useQuery } from "@tanstack/react-query";

/**
 * Fetches dashboard-totals scoped to a specific operation, bypassing the
 * global OperationContext. Used by the super-admin OperationDetail page so
 * the KPIs shown there match EXACTLY what that operation's own Dashboard
 * (Overview) renders — same source, same rules (Midnight Guard, Dual-Source
 * MAX, frontend-only filters, etc.).
 */
export interface OperationDashboardTotals {
  totalSpend: number;
  totalRevenue: number;
  totalConversions: number;
  totalClicks: number;
  totalImpressions: number;
  totalLinkClicks: number;
  totalLpViews: number;
  roas: number;
  cac: number;
  ticketMedio: number;
  lucroBruto: number;
  usdToBrl: number;
  cpRevenue: number;
  cpCount: number;
  rtRevenueBrl: number;
  rtCount: number;
  ts?: string;
}

function todayBRT(): Date {
  const s = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  return new Date(`${s}T00:00:00`);
}
function fmt(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
}

export type OpRange =
  | "today"
  | "yesterday"
  | "7d"
  | "30d"
  | "mtd"
  | "last_month"
  | "q_current"
  | "q_last"
  | "custom";

export function rangeToDates(
  range: OpRange,
  customStart?: string,
  customEnd?: string,
): { start: string; end: string } {
  const t = todayBRT();
  const shift = (n: number) => {
    const d = new Date(t);
    d.setDate(d.getDate() + n);
    return d;
  };
  const y = t.getFullYear();
  const m = t.getMonth(); // 0-based
  switch (range) {
    case "today":     return { start: fmt(t), end: fmt(t) };
    case "yesterday": return { start: fmt(shift(-1)), end: fmt(shift(-1)) };
    case "7d":        return { start: fmt(shift(-6)), end: fmt(t) };
    case "30d":       return { start: fmt(shift(-29)), end: fmt(t) };
    case "mtd":       return { start: fmt(new Date(y, m, 1)), end: fmt(t) };
    case "last_month":
      return { start: fmt(new Date(y, m - 1, 1)), end: fmt(new Date(y, m, 0)) };
    case "q_current": {
      const qs = Math.floor(m / 3) * 3;
      return { start: fmt(new Date(y, qs, 1)), end: fmt(t) };
    }
    case "q_last": {
      const qs = Math.floor(m / 3) * 3 - 3;
      return { start: fmt(new Date(y, qs, 1)), end: fmt(new Date(y, qs + 3, 0)) };
    }
    case "custom":
      return { start: customStart ?? fmt(t), end: customEnd ?? fmt(t) };
  }
}


async function fetchScoped(opId: string, start: string, end: string): Promise<OperationDashboardTotals> {
  const baseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const url = `${baseUrl}/functions/v1/dashboard-totals?start=${start}&end=${end}&operation_id=${opId}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${anonKey}`,
      apikey: anonKey,
    },
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`dashboard-totals (op scoped) failed: ${res.status} ${txt}`);
  }
  return (await res.json()) as OperationDashboardTotals;
}

export function useOperationDashboardTotals(
  opId: string | undefined,
  range: OpRange,
  currency: "BRL" | "USD",
  enabled = true,
  customStart?: string,
  customEnd?: string,
) {
  const { start, end } = rangeToDates(range, customStart, customEnd);

  return useQuery({
    queryKey: ["op-dashboard-totals", opId, start, end],
    enabled: !!opId && enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const r = await fetchScoped(opId!, start, end);
      const num = (v: any) => {
        const n = Number(v);
        return Number.isFinite(n) ? n : 0;
      };
      // dashboard-totals does NOT return lucroBruto/usdToBrl — derive defensively
      const totalSpend = num(r.totalSpend);
      const totalRevenue = num(r.totalRevenue);
      const totalConversions = num(r.totalConversions);
      const fx = num(r.usdToBrl) > 0 ? num(r.usdToBrl) : 0;
      const raw: OperationDashboardTotals = {
        ...r,
        totalSpend,
        totalRevenue,
        totalConversions,
        totalClicks: num(r.totalClicks),
        totalImpressions: num(r.totalImpressions),
        totalLinkClicks: num(r.totalLinkClicks),
        totalLpViews: num(r.totalLpViews),
        roas: totalSpend > 0 ? totalRevenue / totalSpend : 0,
        cac: totalConversions > 0 ? totalSpend / totalConversions : 0,
        ticketMedio: totalConversions > 0 ? totalRevenue / totalConversions : 0,
        lucroBruto: totalRevenue - totalSpend,
        usdToBrl: fx,
        cpRevenue: num(r.cpRevenue),
        cpCount: num(r.cpCount),
        rtRevenueBrl: num(r.rtRevenueBrl),
        rtCount: num(r.rtCount),
      };
      if (currency === "USD" && fx > 0) {
        return {
          ...raw,
          totalSpend: raw.totalSpend / fx,
          totalRevenue: raw.totalRevenue / fx,
          lucroBruto: raw.lucroBruto / fx,
          ticketMedio: raw.ticketMedio / fx,
          cac: raw.cac / fx,
          cpRevenue: raw.cpRevenue / fx,
          rtRevenueBrl: raw.rtRevenueBrl / fx,
        } as OperationDashboardTotals;
      }
      return raw;
    },

  });
}
