import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOperation } from "@/contexts/OperationContext";

export interface MediaChannel {
  id: string;
  name: string;
  slug: string;
  color: string;
  icon: string;
  rt_source_patterns: string[];
  utm_source_patterns: string[];
  campaign_name_patterns: string[];
  spend_source: "meta_api" | "redtrack_cost" | "manual" | "newsbreak_api" | "mgid_api" | "taboola_api";
  revenue_source: "redtrack" | "sales_data" | "clickbank";
  is_active: boolean;
  sort_order: number;
}

export interface ChannelGoal {
  id: string;
  channel_id: string;
  roas_target: number;
  cpa_target: number;
  daily_revenue_target: number;
  daily_spend_cap: number;
  min_sales_per_day: number;
  notes: string;
}

export interface ChannelMetrics {
  channel: MediaChannel;
  goal: ChannelGoal | null;
  spend: number;
  revenue: number;
  sales: number;
  roas: number;
  cpa: number;
  profit: number;
  margin: number;
  /** % do alvo de ROAS (100 = bateu) */
  roas_attainment: number;
  /** % do alvo de CPA invertido (100 = bateu, abaixo do alvo) */
  cpa_attainment: number;
  /** série diária [{date, spend, revenue}] */
  daily: Array<{ date: string; spend: number; revenue: number }>;
}

interface Args {
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
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

export function useMediaChannelsData({ startDate, endDate, enabled = true }: Args) {
  const { operationId } = useOperation();

  return useQuery({
    queryKey: ["media-channels-data", operationId, startDate, endDate],
    enabled: enabled && !!operationId,
    staleTime: 60_000,
    refetchInterval: 120_000,
    queryFn: async (): Promise<ChannelMetrics[]> => {
      // 1) Buscar canais e metas
      const [{ data: channelsRaw, error: cErr }, { data: goalsRaw, error: gErr }] = await Promise.all([
        supabase
          .from("media_channels")
          .select("*")
          .eq("is_active", true)
          .eq("operation_id", operationId!)
          .order("sort_order", { ascending: true }),
        supabase.from("channel_performance_goals").select("*").eq("operation_id", operationId!),
      ]);
      if (cErr) throw cErr;
      if (gErr) throw gErr;

      const channels = (channelsRaw ?? []) as unknown as MediaChannel[];
      const goalsByChannel = new Map<string, ChannelGoal>(
        ((goalsRaw ?? []) as unknown as ChannelGoal[]).map((g) => [g.channel_id, g])
      );

      // 2) Buscar eventos do RedTrack no período (purchase + upsell) — usado para canais não-Meta (ex: NewsBreak)
      const startISO = `${startDate}T03:00:00Z`;
      const endDateNext = new Date(endDate);
      endDateNext.setDate(endDateNext.getDate() + 1);
      const endISO = `${endDateNext.toISOString().slice(0, 10)}T03:00:00Z`;

      const { data: events, error: eErr } = await supabase
        .from("redtrack_events")
        .select("amount, occurred_at, raw_payload, operation_id")
        .gte("occurred_at", startISO)
        .lt("occurred_at", endISO)
        .in("event_type", ["purchase", "upsell"])
        .eq("operation_id", operationId!)
        .limit(50000);
      if (eErr) throw eErr;

      // 2.a2) Conversões RedTrack via polling (operações sem postback, ex: FAHTO)
      //       Fonte autoritativa de receita por canal via rt_source.
      const { data: rtConvs } = await supabase
        .from("redtrack_conversions")
        .select("payout_brl, conv_time, rt_source, source, rt_campaign")
        .gte("conv_time", startISO)
        .lt("conv_time", endISO)
        .eq("operation_id", operationId!)
        .limit(50000);

      // 2.b) Buscar vendas autoritativas em sales_data (já deduplicadas pelo sync-redtrack-sales)
      //      Usadas para canais não-Meta (ex: NewsBreak) onde RedTrack postback vem com amount=0.
      const { data: salesRows } = await supabase
        .from("sales_data")
        .select("store, revenue, date, utm_source, utm_campaign, created_at, order_id")
        .gte("date", startDate)
        .lte("date", endDate)
        .eq("status", "approved")
        .eq("operation_id", operationId!);

      // 2.c) Regra de segurança NewsBreak:
      //      O canal NewsBreak só pode receber receita que já entrou em sales_data
      //      com store='newsbreak' via postback RedTrack/sync-redtrack-sales.
      //      NÃO cruzar CB IPN/MMP por aff_sub2 nem por hints de click: IDs internos
      //      de afiliado/loja podem parecer não-Meta e inflar o canal.
      // ⚠️ Contamos APENAS linhas com revenue > 0 para canais não-Meta.
      // Postbacks RedTrack (NewsBreak etc.) podem chegar com amount=0 e gerar
      // múltiplas linhas em sales_data para a mesma venda — só a com receita
      // representa a venda real autoritativa.
      const salesByStore = new Map<string, { revenue: number; sales: number; daily: Map<string, number> }>();
      for (const row of (salesRows as any[] | null) ?? []) {
        const store = String(row.store || "").toLowerCase().trim();
        if (!store) continue;
        const rev = Number(row.revenue ?? 0);
        if (rev <= 0) continue; // ignora linhas zeradas
        const cur = salesByStore.get(store) ?? { revenue: 0, sales: 0, daily: new Map() };
        cur.revenue += rev;
        cur.sales += 1;
        const d = String(row.date);
        cur.daily.set(d, (cur.daily.get(d) ?? 0) + rev);
        salesByStore.set(store, cur);
      }

      // 3) Gasto Meta normalizado (mesma fonte do dashboard) por dia
      const { data: spendData } = await supabase.rpc("get_spend_normalized_sp", {
        p_start_date: startDate,
        p_end_date: endDate,
        p_operation_id: operationId,
      });
      const metaSpendByDate = new Map<string, number>();
      let metaSpendTotal = 0;
      for (const r of (spendData as any[] | null) ?? []) {
        const d = String(r.sp_date);
        const v = Number(r.total_spend ?? 0);
        metaSpendByDate.set(d, (metaSpendByDate.get(d) ?? 0) + v);
        metaSpendTotal += v;
      }

      // 3.b) Cotação USD→BRL (usada para Newsbreak spend e fallback de receita em USD)
      let usdToBrl = 5.15;
      {
        const { data: rateRow } = await supabase
          .from("exchange_rate_log")
          .select("rate")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (rateRow?.rate) usdToBrl = Number(rateRow.rate);
      }

      // 3.c) Gasto Newsbreak (API oficial) — em USD, convertemos para BRL
      const channelsHaveNewsbreak = channels.some((c) => c.spend_source === "newsbreak_api");
      const newsbreakSpendByDate = new Map<string, number>();
      let newsbreakSpendTotal = 0;
      if (channelsHaveNewsbreak) {
        const { data: nbRows } = await supabase
          .from("newsbreak_traffic_data")
          .select("date, spend")
          .gte("date", startDate)
          .lte("date", endDate)
          .eq("operation_id", operationId!);
        for (const r of (nbRows as any[] | null) ?? []) {
          const d = String(r.date);
          const v = Number(r.spend ?? 0) * usdToBrl;
          newsbreakSpendByDate.set(d, (newsbreakSpendByDate.get(d) ?? 0) + v);
          newsbreakSpendTotal += v;
        }
      }

      // 3.d) Gasto MGID (API oficial) — em USD, convertemos para BRL
      const channelsHaveMgid = channels.some((c) => c.spend_source === "mgid_api");
      const mgidSpendByDate = new Map<string, number>();
      let mgidSpendTotal = 0;
      if (channelsHaveMgid) {
        const { data: mgRows } = await supabase
          .from("mgid_traffic_data")
          .select("date, spend")
          .gte("date", startDate)
          .lte("date", endDate)
          .eq("operation_id", operationId!);
        for (const r of (mgRows as any[] | null) ?? []) {
          const d = String(r.date);
          const v = Number(r.spend ?? 0) * usdToBrl;
          mgidSpendByDate.set(d, (mgidSpendByDate.get(d) ?? 0) + v);
          mgidSpendTotal += v;
        }
      }


      // 3.e) Gasto Taboola (API oficial) — em USD, convertemos para BRL
      const channelsHaveTaboola = channels.some((c) => c.spend_source === "taboola_api");
      const taboolaSpendByDate = new Map<string, number>();
      let taboolaSpendTotal = 0;
      if (channelsHaveTaboola) {
        const { data: tbRows } = await supabase
          .from("taboola_traffic_data")
          .select("date, spend")
          .gte("date", startDate)
          .lte("date", endDate)
          .eq("operation_id", operationId!);
        for (const r of (tbRows as any[] | null) ?? []) {
          const d = String(r.date);
          const v = Number(r.spend ?? 0) * usdToBrl;
          taboolaSpendByDate.set(d, (taboolaSpendByDate.get(d) ?? 0) + v);
          taboolaSpendTotal += v;
        }
      }

      // 4) ⚡ Buscar TOTAIS do dashboard (única fonte de verdade) para o canal Meta

      //    Garante paridade absoluta com o Overview/Analytics.
      let dashboardTotalRevenue = 0;
      let dashboardTotalConversions = 0;
      const dashboardDailyRevenue = new Map<string, number>();

      try {
        const baseUrl = import.meta.env.VITE_SUPABASE_URL;
        const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
        let url = `${baseUrl}/functions/v1/dashboard-totals?start=${startDate}&end=${endDate}`;
        if (operationId) url += `&operation_id=${operationId}`;
        const res = await fetch(url, {
          headers: { "Authorization": `Bearer ${anonKey}`, "apikey": anonKey },
        });
        if (res.ok) {
          const dt = await res.json();
          dashboardTotalRevenue = Number(dt?.totalRevenue ?? 0);
          dashboardTotalConversions = Number(dt?.totalConversions ?? 0);
        }
      } catch (e) {
        console.warn("[useMediaChannelsData] dashboard-totals failed, fallback ao RT:", e);
      }

      // 5) Construir série diária consolidada (CartPanda + RedTrack) para o gráfico do canal Meta
      //    – usa daily_totals_snapshot quando congelado; senão soma dos eventos
      const { data: snapRows } = await supabase
        .from("daily_totals_snapshot")
        .select("date, total_revenue, total_conversions")
        .gte("date", startDate)
        .lte("date", endDate)
        .eq("operation_id", operationId!);
      for (const r of (snapRows as any[] | null) ?? []) {
        dashboardDailyRevenue.set(String(r.date), Number(r.total_revenue ?? 0));
      }

      // O dia atual não fica em snapshot; use o mesmo total autoritativo do Dashboard.
      // Em período de um dia, evita o gráfico buscar o bruto do RedTrack e divergir do KPI.
      const todaySP = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
      if (startDate === endDate && startDate === todaySP) {
        dashboardDailyRevenue.set(todaySP, dashboardTotalRevenue);
      } else if (startDate <= todaySP && todaySP <= endDate) {
        try {
          const baseUrl = import.meta.env.VITE_SUPABASE_URL;
          const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
          const url = `${baseUrl}/functions/v1/dashboard-totals?start=${todaySP}&end=${todaySP}&operation_id=${operationId}`;
          const res = await fetch(url, { headers: { Authorization: `Bearer ${anonKey}`, apikey: anonKey } });
          if (res.ok) {
            const dt = await res.json();
            dashboardDailyRevenue.set(todaySP, Number(dt?.totalRevenue ?? 0));
          }
        } catch (e) {
          console.warn("[useMediaChannelsData] dashboard-totals hoje falhou:", e);
        }
      }

      // Para dias sem snapshot, usar eventos RT (todos eles, pois Meta = canal autoritativo de receita)
      const rtRevenueByDate = new Map<string, number>();
      for (const ev of events ?? []) {
        const occurred = new Date(ev.occurred_at);
        const sp = new Intl.DateTimeFormat("en-CA", {
          timeZone: "America/Sao_Paulo",
          year: "numeric", month: "2-digit", day: "2-digit",
        }).format(occurred);
        rtRevenueByDate.set(sp, (rtRevenueByDate.get(sp) ?? 0) + Number(ev.amount ?? 0));
      }
      for (const [d, v] of rtRevenueByDate.entries()) {
        if (!dashboardDailyRevenue.has(d)) dashboardDailyRevenue.set(d, v);
      }

      // 6) PRIMEIRO PASSO: calcular receita/vendas dos canais NÃO-Meta (autoridade própria)
      //    para depois subtrair do "Meta" (que recebe o resíduo do dashboard global).
      const nonMetaResults = new Map<string, { revenue: number; sales: number; daily: Map<string, { spend: number; revenue: number }>; spendFromRT: number }>();

      for (const channel of channels) {
        if (channel.spend_source === "meta_api") continue;

        let revenue = 0;
        let sales = 0;
        let spendFromRT = 0;
        const dailyMap = new Map<string, { spend: number; revenue: number }>();

        // Pattern matching no RedTrack para custo/eventos brutos
        for (const ev of events ?? []) {
          if (!matchesChannel(ev.raw_payload, channel)) continue;
          const occurred = new Date(ev.occurred_at);
          const sp = new Intl.DateTimeFormat("en-CA", {
            timeZone: "America/Sao_Paulo",
            year: "numeric", month: "2-digit", day: "2-digit",
          }).format(occurred);
          const cost = Number((ev.raw_payload as any)?.cost ?? 0) || 0;
          if (channel.spend_source === "redtrack_cost") spendFromRT += cost;
          const cur = dailyMap.get(sp) ?? { spend: 0, revenue: 0 };
          if (channel.spend_source === "redtrack_cost") cur.spend += cost;
          dailyMap.set(sp, cur);
        }

        // Receita autoritativa via sales_data por store=slug
        const storeKey = channel.slug.toLowerCase();
        const fromSales = salesByStore.get(storeKey);
        if (fromSales && fromSales.sales > 0) {
          revenue = fromSales.revenue;
          sales = fromSales.sales;
          for (const [d, v] of fromSales.daily.entries()) {
            const cur = dailyMap.get(d) ?? { spend: 0, revenue: 0 };
            cur.revenue = v;
            dailyMap.set(d, cur);
          }
        } else {
          // Fallback legado: somar amounts dos eventos RT.
          // ⚠️ RedTrack reporta `amount` em USD (payout_default). Convertemos para BRL
          //    para canais não-Meta que ainda não tiveram sync-redtrack-sales (ex: vendas
          //    recentes do Newsbreak antes da venda virar linha autoritativa em sales_data).
          for (const ev of events ?? []) {
            if (!matchesChannel(ev.raw_payload, channel)) continue;
            const amountUsd = Number(ev.amount ?? 0);
            if (amountUsd <= 0) continue;
            const amountBrl = amountUsd * usdToBrl;
            const occurred = new Date(ev.occurred_at);
            const sp = new Intl.DateTimeFormat("en-CA", {
              timeZone: "America/Sao_Paulo",
              year: "numeric", month: "2-digit", day: "2-digit",
            }).format(occurred);
            revenue += amountBrl;
            sales += 1;
            const cur = dailyMap.get(sp) ?? { spend: 0, revenue: 0 };
            cur.revenue += amountBrl;
            dailyMap.set(sp, cur);
          }
        }

        // Fallback 2: conversões via polling (redtrack_conversions) — usado pela FAHTO,
        // que não recebe postback. Match estrito por rt_source/source do canal.
        if (sales === 0) {
          for (const c of (rtConvs as any[] | null) ?? []) {
            if (!matchesChannel(c, channel)) continue;
            const brl = Number(c.payout_brl ?? 0);
            if (brl <= 0) continue;
            const sp = new Intl.DateTimeFormat("en-CA", {
              timeZone: "America/Sao_Paulo",
              year: "numeric", month: "2-digit", day: "2-digit",
            }).format(new Date(c.conv_time));
            revenue += brl;
            sales += 1;
            const cur = dailyMap.get(sp) ?? { spend: 0, revenue: 0 };
            cur.revenue += brl;
            dailyMap.set(sp, cur);
          }
        }



        nonMetaResults.set(channel.id, { revenue, sales, daily: dailyMap, spendFromRT });
      }

      // Total já atribuído a canais não-Meta — será subtraído do canal Meta para
      // evitar dupla contagem (dashboardTotalRevenue inclui TODAS as vendas).
      let nonMetaRevenueTotal = 0;
      let nonMetaSalesTotal = 0;
      const nonMetaRevenueByDate = new Map<string, number>();
      for (const r of nonMetaResults.values()) {
        nonMetaRevenueTotal += r.revenue;
        nonMetaSalesTotal += r.sales;
        for (const [d, v] of r.daily.entries()) {
          nonMetaRevenueByDate.set(d, (nonMetaRevenueByDate.get(d) ?? 0) + v.revenue);
        }
      }

      // 7) Construir métricas finais por canal
      const result: ChannelMetrics[] = channels.map((channel) => {
        const isMetaChannel = channel.spend_source === "meta_api";

        let revenue = 0;
        let sales = 0;
        const dailyMap = new Map<string, { spend: number; revenue: number }>();

        if (isMetaChannel) {
          // Canal Meta = dashboard global MENOS o que outros canais já reivindicaram.
          // Garante que a soma dos canais == faturamento total do dashboard.
          revenue = Math.max(0, dashboardTotalRevenue - nonMetaRevenueTotal);
          sales = Math.max(0, dashboardTotalConversions - nonMetaSalesTotal);
          for (const [d, v] of dashboardDailyRevenue.entries()) {
            const cur = dailyMap.get(d) ?? { spend: 0, revenue: 0 };
            cur.revenue = Math.max(0, v - (nonMetaRevenueByDate.get(d) ?? 0));
            dailyMap.set(d, cur);
          }
        } else {
          const pre = nonMetaResults.get(channel.id);
          if (pre) {
            revenue = pre.revenue;
            sales = pre.sales;
            for (const [d, v] of pre.daily.entries()) dailyMap.set(d, v);
          }
        }

        // Gasto: Meta vem da API; Newsbreak vem da API oficial; demais do RedTrack ou manual
        let spend = 0;
        if (channel.spend_source === "meta_api") {
          spend = metaSpendTotal;
          for (const [d, v] of metaSpendByDate.entries()) {
            const cur = dailyMap.get(d) ?? { spend: 0, revenue: 0 };
            cur.spend = v;
            dailyMap.set(d, cur);
          }
        } else if (channel.spend_source === "newsbreak_api") {
          spend = newsbreakSpendTotal;
          for (const [d, v] of newsbreakSpendByDate.entries()) {
            const cur = dailyMap.get(d) ?? { spend: 0, revenue: 0 };
            cur.spend = v;
            dailyMap.set(d, cur);
          }
        } else if (channel.spend_source === "mgid_api") {
          spend = mgidSpendTotal;
          for (const [d, v] of mgidSpendByDate.entries()) {
            const cur = dailyMap.get(d) ?? { spend: 0, revenue: 0 };
            cur.spend = v;
            dailyMap.set(d, cur);
          }
        } else if (channel.spend_source === "taboola_api") {
          spend = taboolaSpendTotal;
          for (const [d, v] of taboolaSpendByDate.entries()) {
            const cur = dailyMap.get(d) ?? { spend: 0, revenue: 0 };
            cur.spend = v;
            dailyMap.set(d, cur);
          }
        } else if (channel.spend_source === "redtrack_cost") {

          spend = nonMetaResults.get(channel.id)?.spendFromRT ?? 0;
        } else {
          spend = 0;
        }

        const roas = spend > 0 ? revenue / spend : 0;
        const cpa = sales > 0 ? spend / sales : 0;
        const profit = revenue - spend;
        const margin = revenue > 0 ? (profit / revenue) * 100 : 0;

        const goal = goalsByChannel.get(channel.id) ?? null;
        const roas_attainment = goal && goal.roas_target > 0 ? (roas / goal.roas_target) * 100 : 0;
        const cpa_attainment = goal && goal.cpa_target > 0 && cpa > 0 ? (goal.cpa_target / cpa) * 100 : 0;

        const daily = Array.from(dailyMap.entries())
          .map(([date, v]) => ({ date, spend: v.spend, revenue: v.revenue }))
          .sort((a, b) => a.date.localeCompare(b.date));

        return {
          channel, goal,
          spend, revenue, sales,
          roas, cpa, profit, margin,
          roas_attainment, cpa_attainment,
          daily,
        };
      });

      return result;
    },
  });
}
