import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { PacingCampaign } from "@/components/pacing/mockData";

export interface DrawerActionEvent {
  id: string;
  triggered_at: string;
  action_type: string;
  reason: string;
  rule_id: string | null;
  rule_name: string | null;
  spend_at_action: number | null;
  spend_last_hour: number | null;
  pct_above_expected: number | null;
  dry_run: boolean;
  success: boolean | null;
}

export interface DrawerRuleFire {
  rule_id: string;
  fired_today: number;
}

export interface DrawerHourlyPoint {
  hour: number;       // 0..23 BRT
  spend: number;      // BRL — campaign-level when controller snapshots exist; fallback legacy share
  expected: number;   // pace linear
}

export interface DrawerData {
  // Spend rolling últimos 60 minutos por campanha (Meta campaign hourly API via pacing-controller)
  spendLastHourBrl: number | null;
  spendLastHourSource: "campaign-hourly" | "campaign-share" | "unavailable";

  // Yesterday spend for the same campaign (by campaign_name + account_id)
  spendYesterdayBrl: number | null;
  cpaYesterday: number | null;
  roasYesterday: number | null;

  // Hourly account-level (chart)
  hourly: DrawerHourlyPoint[];
  expectedPctNow: number; // % do dia decorrido (BRT)

  // Real timeline
  timeline: DrawerActionEvent[];

  // disparou Nx hoje, por rule_id (campaign IN campaign_ids array)
  firesByRule: Map<string, number>;
}

const fmtDateBRT = (d: Date) => {
  const brt = new Date(d.getTime() - 3 * 60 * 60 * 1000); // converte instante UTC → "data BRT"
  return brt.toISOString().slice(0, 10);
};

function brtNow() {
  const now = new Date();
  // hora BRT em [0..23], minutos
  const utcMin = now.getUTCHours() * 60 + now.getUTCMinutes();
  const brtMin = (utcMin - 180 + 1440) % 1440;
  return { hour: Math.floor(brtMin / 60), min: brtMin % 60, dateStr: fmtDateBRT(now) };
}

export function useCampaignDrawerData(campaign: PacingCampaign | null) {
  return useQuery<DrawerData>({
    queryKey: ["campaign-drawer", campaign?.id, campaign?.accountId, campaign?.name],
    enabled: !!campaign,
    refetchInterval: 60_000,
    staleTime: 30_000,
    queryFn: async () => {
      if (!campaign) throw new Error("no campaign");
      const { hour: nowHourBRT, min: nowMinBRT, dateStr: todayBRT } = brtNow();
      const yesterdayBRT = (() => {
        const d = new Date();
        d.setUTCDate(d.getUTCDate() - 1);
        return fmtDateBRT(d);
      })();
      const since24h = new Date(Date.now() - 24 * 3600_000).toISOString();
      const startOfTodayBRT = new Date(`${todayBRT}T03:00:00.000Z`).toISOString(); // 00:00 BRT = 03:00 UTC

      // ── Parallel fetches ────────────────────────────────────────────────
      const [actionsRes, evalRes, ydayRes, hourlyRes, todayTrafficRes, snapshotRes] = await Promise.all([
        // Timeline 24h para a campanha
        (supabase as any)
          .from("pacing_action_log")
          .select(
            "id, triggered_at, action_type, reason, rule_id, spend_at_action, spend_last_hour, pct_above_expected, dry_run, success"
          )
          .eq("campaign_id", campaign.id)
          .gte("triggered_at", since24h)
          .order("triggered_at", { ascending: false })
          .limit(50),
        // Avaliações de hoje que mencionaram esta campanha
        (supabase as any)
          .from("pacing_evaluation_log")
          .select("rule_id, campaign_ids")
          .gte("evaluated_at", startOfTodayBRT)
          .contains("campaign_ids", [campaign.id]),
        // traffic_data de ontem (campaign-level via campaign_name + account_id)
        campaign.accountId
          ? (supabase as any)
              .from("traffic_data")
              .select("spend:spend_brl, clicks, impressions")
              .eq("account_id", campaign.accountId)
              .eq("campaign_name", campaign.name)
              .eq("date", yesterdayBRT)
          : Promise.resolve({ data: [] }),
        // hourly da conta inteira hoje
        campaign.accountId
          ? (supabase as any)
              .from("traffic_data_hourly")
              .select("hour, spend:spend_brl")
              .eq("account_id", campaign.accountId)
              .eq("date", todayBRT)
              .order("hour", { ascending: true })
          : Promise.resolve({ data: [] }),
        // spend total da conta hoje (para calcular share)
        campaign.accountId
          ? (supabase as any)
              .from("traffic_data")
              .select("campaign_name, spend:spend_brl")
              .eq("account_id", campaign.accountId)
              .eq("date", todayBRT)
          : Promise.resolve({ data: [] }),
        campaign.accountId
          ? (supabase as any)
              .from("pacing_campaign_hourly_snapshots")
              .select("spend_last_60m_brl, spend_today_brl, snapshot_at")
              .eq("account_id", campaign.accountId.replace(/^act_/, ""))
              .eq("campaign_id", campaign.id)
              .eq("date", todayBRT)
              .order("snapshot_at", { ascending: false })
              .limit(1)
          : Promise.resolve({ data: [] }),
      ]);

      // Rule names
      const ruleIdsFromActions = Array.from(
        new Set(((actionsRes.data ?? []) as any[]).map((a) => a.rule_id).filter(Boolean))
      );
      const ruleNames = new Map<string, string>();
      if (ruleIdsFromActions.length) {
        const { data } = await (supabase as any)
          .from("pacing_rules")
          .select("id, name")
          .in("id", ruleIdsFromActions);
        for (const r of (data ?? []) as any[]) ruleNames.set(r.id, r.name);
      }

      const timeline: DrawerActionEvent[] = ((actionsRes.data ?? []) as any[]).map((a) => ({
        id: a.id,
        triggered_at: a.triggered_at,
        action_type: a.action_type,
        reason: a.reason ?? "",
        rule_id: a.rule_id,
        rule_name: a.rule_id ? ruleNames.get(a.rule_id) ?? null : null,
        spend_at_action: a.spend_at_action,
        spend_last_hour: a.spend_last_hour,
        pct_above_expected: a.pct_above_expected,
        dry_run: !!a.dry_run,
        success: a.success,
      }));

      // Fires by rule (today)
      const firesByRule = new Map<string, number>();
      for (const row of (evalRes.data ?? []) as any[]) {
        if (!row.rule_id) continue;
        firesByRule.set(row.rule_id, (firesByRule.get(row.rule_id) ?? 0) + 1);
      }

      // Yesterday
      const yday = ((ydayRes.data ?? []) as any[]).reduce(
        (acc, r) => {
          acc.spend += Number(r.spend ?? 0);
          return acc;
        },
        { spend: 0 }
      );
      const spendYesterdayBrl = yday.spend > 0 ? yday.spend : null;

      // Hourly chart (account-level)
      const hourlyRaw = ((hourlyRes.data ?? []) as any[]) as { hour: number; spend: number }[];
      const accountTodayTotal = ((todayTrafficRes.data ?? []) as any[]).reduce(
        (s, r) => s + Number(r.spend ?? 0),
        0
      );
      const campaignTodayTotal = campaign.spend ?? 0;
      const campaignShare =
        accountTodayTotal > 0 ? Math.min(1, campaignTodayTotal / accountTodayTotal) : 0;

      // Scale account hourly to campaign-estimated hourly using share
      const hourly: DrawerHourlyPoint[] = [];
      const sumAccount = hourlyRaw.reduce((s, r) => s + Number(r.spend ?? 0), 0) || 1;
      let acc = 0;
      for (let h = 0; h < 24; h++) {
        const row = hourlyRaw.find((r) => Number(r.hour) === h);
        const rawSpend = row ? Number(row.spend) : 0;
        // estimated campaign spend nessa hora = rawSpend * (campaignTotal / sumAccount)
        const camSpend =
          campaignTodayTotal > 0 ? rawSpend * (campaignTodayTotal / sumAccount) : 0;
        acc += camSpend;
        const expected =
          campaignTodayTotal > 0 ? (campaignTodayTotal * ((h + 1) / 24)) : 0;
        hourly.push({ hour: h, spend: acc, expected });
      }

      const latestSnapshot = (((snapshotRes as any).data ?? []) as any[])[0] as
        | { spend_last_60m_brl?: number | string | null; spend_today_brl?: number | string | null; snapshot_at?: string }
        | undefined;

      // Last-hour: fonte correta é snapshot do controller, que consulta Meta em level=campaign
      // e calcula rolling últimos 60 minutos. Fallback legado só existe enquanto ainda não
      // há snapshot salvo pra campanha.
      const lastHourRow = hourlyRaw.find((r) => Number(r.hour) === nowHourBRT);
      const fallbackSpendLastHourBrl =
        lastHourRow && campaignShare > 0 ? Number(lastHourRow.spend) * campaignShare : null;
      const snapshotLast60 = latestSnapshot ? Number(latestSnapshot.spend_last_60m_brl ?? 0) : null;
      const spendLastHourBrl = snapshotLast60 != null ? snapshotLast60 : fallbackSpendLastHourBrl;

      const expectedPctNow = ((nowHourBRT * 60 + nowMinBRT) / 1440) * 100;

      return {
        spendLastHourBrl,
        spendLastHourSource:
          snapshotLast60 != null
            ? "campaign-hourly"
            : fallbackSpendLastHourBrl != null
              ? "campaign-share"
              : "unavailable",
        spendYesterdayBrl,
        cpaYesterday: null,
        roasYesterday: null,
        hourly,
        expectedPctNow,
        timeline,
        firesByRule,
      };
    },
  });
}

export function formatHHMM(iso: string): string {
  const d = new Date(iso);
  // exibir BRT
  const utcMin = d.getUTCHours() * 60 + d.getUTCMinutes();
  const brtMin = (utcMin - 180 + 1440) % 1440;
  const h = Math.floor(brtMin / 60);
  const m = brtMin % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
