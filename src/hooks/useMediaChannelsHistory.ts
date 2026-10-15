import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOperation } from "@/contexts/OperationContext";
import type { MediaChannel } from "@/hooks/useMediaChannelsData";

export interface ChannelDailyPoint {
  date: string; // YYYY-MM-DD (SP)
  spend: number;
  revenue: number;
}

export interface AccountDailySeries {
  account_id: string;
  account_label: string;
  daily: ChannelDailyPoint[];
}

export interface ChannelHistorySeries {
  channel: MediaChannel;
  daily: ChannelDailyPoint[];
  /** Quebra por conta Meta (ad account) — apenas para canais com spend_source = meta_api */
  accounts?: AccountDailySeries[];
}

interface Args {
  days: 30 | 60;
  enabled?: boolean;
}

function matchesChannel(payload: any, channel: MediaChannel): boolean {
  const rt_source = String(payload?.rt_source ?? "").toLowerCase().trim();
  const source = String(payload?.source ?? "").toLowerCase().trim();
  for (const p of channel.rt_source_patterns) {
    const needle = p.toLowerCase().trim();
    if (!needle) continue;
    if (rt_source === needle || rt_source.includes(needle)) return true;
    if (source.includes(needle)) return true;
  }
  for (const p of channel.utm_source_patterns) {
    const needle = p.toLowerCase().trim();
    if (!needle) continue;
    const utm = String(payload?.utm_source ?? "").toLowerCase().trim();
    if (utm === needle || utm.includes(needle)) return true;
  }
  return false;
}

function todaySP(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

function shiftDateSP(daysBack: number): string {
  const t = new Date(`${todaySP()}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() - daysBack);
  return t.toISOString().slice(0, 10);
}

export function useMediaChannelsHistory({ days, enabled = true }: Args) {
  const { operationId } = useOperation();

  return useQuery({
    queryKey: ["media-channels-history", operationId, days],
    enabled: enabled && !!operationId,
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
    queryFn: async (): Promise<ChannelHistorySeries[]> => {
      const startDate = shiftDateSP(days - 1);
      const endDate = todaySP();

      // 1) Canais ativos
      const { data: channelsRaw, error: cErr } = await supabase
        .from("media_channels")
        .select("*")
        .eq("is_active", true)
        .eq("operation_id", operationId!)
        .order("sort_order", { ascending: true });
      if (cErr) throw cErr;
      const channels = (channelsRaw ?? []) as unknown as MediaChannel[];
      const nonMetaChannels = channels.filter((c) => c.spend_source !== "meta_api");
      const nonMetaStoreSlugs = new Set(nonMetaChannels.map((c) => c.slug.toLowerCase().trim()));

      // 2) Eventos RedTrack para todos os dias (apenas canais não-Meta)
      const startISO = `${startDate}T03:00:00Z`;
      const endNext = new Date(`${endDate}T12:00:00Z`);
      endNext.setUTCDate(endNext.getUTCDate() + 1);
      const endISO = `${endNext.toISOString().slice(0, 10)}T03:00:00Z`;

      const { data: events, error: eErr } = await supabase
        .from("redtrack_events")
        .select("amount, occurred_at, raw_payload, operation_id")
        .gte("occurred_at", startISO)
        .lt("occurred_at", endISO)
        .in("event_type", ["purchase", "upsell"])
        .eq("operation_id", operationId!)
        .limit(100000);
      if (eErr) throw eErr;

      // 3) Spend Meta (normalizado) por dia — total
      const { data: spendData } = await supabase.rpc("get_spend_normalized_sp", {
        p_start_date: startDate,
        p_end_date: endDate,
        p_operation_id: operationId,
      });
      const metaSpendByDate = new Map<string, number>();
      for (const r of (spendData as any[] | null) ?? []) {
        const d = String(r.sp_date);
        metaSpendByDate.set(d, (metaSpendByDate.get(d) ?? 0) + Number(r.total_spend ?? 0));
      }

      // 3.b) Spend Newsbreak (API oficial) por dia — convertido USD→BRL
      const newsbreakSpendByDate = new Map<string, number>();
      const channelsHaveNewsbreak = channels.some((c) => (c as any).spend_source === "newsbreak_api");
      if (channelsHaveNewsbreak) {
        let usdToBrl = 5.15;
        const { data: rateRow } = await supabase
          .from("exchange_rate_log")
          .select("rate")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (rateRow?.rate) usdToBrl = Number(rateRow.rate);

        const { data: nbRows } = await supabase
          .from("newsbreak_traffic_data")
          .select("date, spend")
          .gte("date", startDate)
          .lte("date", endDate)
          .eq("operation_id", operationId!);
        for (const r of (nbRows as any[] | null) ?? []) {
          const d = String(r.date);
          newsbreakSpendByDate.set(d, (newsbreakSpendByDate.get(d) ?? 0) + Number(r.spend ?? 0) * usdToBrl);
        }
      }

      // Receita diária autoritativa = mesma fonte do Dashboard principal.
      // Snapshots congelam dias passados; hoje vem direto do dashboard-totals.
      const dashboardRevenueByDate = new Map<string, number>();
      const { data: snapshotRows } = await supabase
        .from("daily_totals_snapshot")
        .select("date, total_revenue")
        .gte("date", startDate)
        .lte("date", endDate)
        .eq("operation_id", operationId!);
      for (const r of (snapshotRows as any[] | null) ?? []) {
        dashboardRevenueByDate.set(String(r.date), Number(r.total_revenue ?? 0));
      }

      const today = todaySP();
      if (startDate <= today && today <= endDate) {
        try {
          const baseUrl = import.meta.env.VITE_SUPABASE_URL;
          const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
          const url = `${baseUrl}/functions/v1/dashboard-totals?start=${today}&end=${today}&operation_id=${operationId}`;
          const res = await fetch(url, { headers: { Authorization: `Bearer ${anonKey}`, apikey: anonKey } });
          if (res.ok) {
            const totals = await res.json();
            dashboardRevenueByDate.set(today, Number(totals?.totalRevenue ?? 0));
          }
        } catch (e) {
          console.warn("[useMediaChannelsHistory] dashboard-totals hoje falhou:", e);
        }
      }

      // 4) Spend Meta por (account_id, date) — para quebra por conta
      const { data: spendByAccount } = await supabase.rpc("get_traffic_spend_by_account", {
        p_start_date: startDate,
        p_end_date: endDate,
        p_operation_id: operationId,
      });

      // 5) Nomes/labels das contas Meta
      const { data: accountsRaw } = await supabase
        .from("meta_ad_accounts")
        .select("account_id, account_name")
        .eq("operation_id", operationId!);
      const accountLabelMap = new Map<string, string>();
      for (const a of (accountsRaw as any[] | null) ?? []) {
        accountLabelMap.set(String(a.account_id), String(a.account_name || a.account_id));
      }

      // 6) Vendas por conta Meta = via meta_campaign_status (campanha→conta) e cruzar com sales/RT
      const { data: campaignToAccountRaw } = await supabase
        .from("meta_campaign_status")
        .select("campaign_id, campaign_name, account_id")
        .eq("operation_id", operationId!);
      const campaignIdToAccount = new Map<string, string>();
      const campaignNameToAccount = new Map<string, string>();
      for (const c of (campaignToAccountRaw as any[] | null) ?? []) {
        if (c.campaign_id) campaignIdToAccount.set(String(c.campaign_id), String(c.account_id));
        if (c.campaign_name) {
          campaignNameToAccount.set(
            String(c.campaign_name).toLowerCase().trim(),
            String(c.account_id),
          );
        }
      }

      // 7) Sales (CartPanda + RT) → revenue por (account_id, date)
      const accountRevenueByDate = new Map<string, Map<string, number>>(); // account_id → date → revenue
      const addAcctRev = (accId: string, date: string, amt: number) => {
        if (!accId || !amt) return;
        if (!accountRevenueByDate.has(accId)) accountRevenueByDate.set(accId, new Map());
        const m = accountRevenueByDate.get(accId)!;
        m.set(date, (m.get(date) ?? 0) + amt);
      };

      // 7a) sales_data — apenas lojas Meta entram na quebra por conta.
      // Canais próprios (Newsbreak etc.) são subtraídos depois do total autoritativo.
      const { data: salesData } = await supabase
        .from("sales_data")
        .select("date, revenue, utm_campaign, status, store")
        .gte("date", startDate)
        .lte("date", endDate)
        .eq("operation_id", operationId!)
        .eq("status", "approved")
        .limit(100000);
      for (const s of (salesData as any[] | null) ?? []) {
        const store = String(s.store ?? "").toLowerCase().trim();
        if (nonMetaStoreSlugs.has(store)) continue;
        const acctId = campaignNameToAccount.get(String(s.utm_campaign ?? "").toLowerCase().trim());
        if (!acctId) continue;
        addAcctRev(acctId, String(s.date), Number(s.revenue ?? 0));
      }

      // 7b) RT events — usar utm_campaign / sub2 para mapear a conta
      const fmtSP = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Sao_Paulo",
        year: "numeric", month: "2-digit", day: "2-digit",
      });
      for (const ev of events ?? []) {
        const payload = ev.raw_payload as any;
        const utmCamp = String(payload?.utm_campaign ?? "").toLowerCase().trim();
        const sub2 = String(payload?.sub2 ?? payload?.aff_sub2 ?? "").trim();
        let acctId = sub2 ? campaignIdToAccount.get(sub2) : undefined;
        if (!acctId && utmCamp) acctId = campaignNameToAccount.get(utmCamp);
        if (!acctId) continue;
        const sp = fmtSP.format(new Date(ev.occurred_at));
        addAcctRev(acctId, sp, Number(ev.amount ?? 0));
      }

      // 8) Construir gama de datas
      const allDates: string[] = [];
      {
        const cursor = new Date(`${startDate}T12:00:00Z`);
        const stop = new Date(`${endDate}T12:00:00Z`);
        while (cursor <= stop) {
          allDates.push(cursor.toISOString().slice(0, 10));
          cursor.setUTCDate(cursor.getUTCDate() + 1);
        }
      }

      // 9) Construir séries por canal
      const nonMetaRevenueByDate = new Map<string, number>();
      for (const channel of nonMetaChannels) {
        const storeSlug = channel.slug.toLowerCase().trim();
        for (const s of (salesData as any[] | null) ?? []) {
          const store = String(s.store ?? "").toLowerCase().trim();
          if (store !== storeSlug) continue;
          const d = String(s.date);
          nonMetaRevenueByDate.set(d, (nonMetaRevenueByDate.get(d) ?? 0) + Number(s.revenue ?? 0));
        }
      }
      const result: ChannelHistorySeries[] = channels.map((channel) => {
        const dailyMap = new Map<string, ChannelDailyPoint>();
        for (const d of allDates) dailyMap.set(d, { date: d, spend: 0, revenue: 0 });

        // Receita do canal — para canais não-Meta, preferir sales_data por store=slug.
        if (channel.spend_source !== "meta_api") {
          const storeSlug = channel.slug.toLowerCase().trim();
          for (const s of (salesData as any[] | null) ?? []) {
            const store = String(s.store ?? "").toLowerCase().trim();
            if (store !== storeSlug) continue;
            const d = String(s.date);
            if (!dailyMap.has(d)) continue;
            dailyMap.get(d)!.revenue += Number(s.revenue ?? 0);
          }
          for (const ev of events ?? []) {
            if (!matchesChannel(ev.raw_payload, channel)) continue;
            const sp = fmtSP.format(new Date(ev.occurred_at));
            if (!dailyMap.has(sp)) continue;
            if (channel.spend_source === "redtrack_cost") {
              const cost = Number((ev.raw_payload as any)?.cost ?? 0) || 0;
              dailyMap.get(sp)!.spend += cost;
            }
          }
          // Newsbreak: gasto vem da API oficial (newsbreak_traffic_data)
          if ((channel as any).spend_source === "newsbreak_api") {
            for (const [d, v] of newsbreakSpendByDate.entries()) {
              if (dailyMap.has(d)) dailyMap.get(d)!.spend = v;
            }
          }
          return {
            channel,
            daily: Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date)),
          };
        }


        // Canal Meta: usar spend normalizado total + receita agregada (CartPanda+RT mapeadas)
        for (const [d, v] of metaSpendByDate.entries()) {
          if (dailyMap.has(d)) dailyMap.get(d)!.spend = v;
        }
        // Receita Meta = total autoritativo do Dashboard menos canais próprios.
        // Isso impede 25K no Dashboard e 27K em Canais de Mídia.
        for (const d of allDates) {
          const authoritative = dashboardRevenueByDate.get(d);
          if (authoritative !== undefined && dailyMap.has(d)) {
            dailyMap.get(d)!.revenue = Math.max(0, authoritative - (nonMetaRevenueByDate.get(d) ?? 0));
          }
        }

        // Quebra por conta
        const accountSpendByDate = new Map<string, Map<string, number>>(); // account_id → date → spend
        for (const r of (spendByAccount as any[] | null) ?? []) {
          const accId = String(r.account_id);
          const d = String(r.date);
          if (!accountSpendByDate.has(accId)) accountSpendByDate.set(accId, new Map());
          accountSpendByDate.get(accId)!.set(
            d,
            (accountSpendByDate.get(accId)!.get(d) ?? 0) + Number(r.total_spend ?? 0),
          );
        }
        const rawAccountRevenueTotalByDate = new Map<string, number>();
        for (const accMap of accountRevenueByDate.values()) {
          for (const [d, rev] of accMap.entries()) {
            rawAccountRevenueTotalByDate.set(d, (rawAccountRevenueTotalByDate.get(d) ?? 0) + rev);
          }
        }

        const allAccountIds = new Set<string>([
          ...accountSpendByDate.keys(),
          ...accountRevenueByDate.keys(),
        ]);

        const accounts: AccountDailySeries[] = Array.from(allAccountIds).map((accId) => {
          const map = new Map<string, ChannelDailyPoint>();
          for (const d of allDates) map.set(d, { date: d, spend: 0, revenue: 0 });
          const sMap = accountSpendByDate.get(accId);
          if (sMap) for (const [d, v] of sMap.entries()) {
            if (map.has(d)) map.get(d)!.spend = v;
          }
          const rMap = accountRevenueByDate.get(accId);
          if (rMap) for (const [d, v] of rMap.entries()) {
            if (!map.has(d)) continue;
            const target = dailyMap.get(d)?.revenue ?? 0;
            const rawTotal = rawAccountRevenueTotalByDate.get(d) ?? 0;
            map.get(d)!.revenue = rawTotal > 0 ? v * (target / rawTotal) : 0;
          }
          return {
            account_id: accId,
            account_label: accountLabelMap.get(accId) ?? accId,
            daily: Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date)),
          };
        }).sort((a, b) => {
          const sa = a.daily.reduce((s, d) => s + d.spend, 0);
          const sb = b.daily.reduce((s, d) => s + d.spend, 0);
          return sb - sa;
        });

        return {
          channel,
          daily: Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date)),
          accounts,
        };
      });

      return result;
    },
  });
}
