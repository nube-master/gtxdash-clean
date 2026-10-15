// =====================================================
// auto-match-charges
// Sprint 1 Reconciliação Financeira - D3 (v2: heurística valor+data)
//
// Motor de match baseado em HEURÍSTICA VALOR+DATA (sem
// depender de account_id, que muitas vezes é descriptor
// e não bate com Meta API).
//
// Algoritmo:
//   - Janela: ±5 dias
//   - Tolerância valor: ±2%
//   - Score = proximidade_data * similaridade_valor
//     * proximidade_data = 1 - (|diff|/5)*0.5  (mín 0.5 em 5d)
//     * similaridade_valor = 1 - (|gap|/expected)  (clamp 0..1)
//   - Threshold auto-match: score >= 0.85
//   - Múltiplos candidatos com score próximo (Δ<0.05) → unmatched
//   - Score < 0.85 → unmatched (revisão manual)
//
// Body:
//   { start_date?, end_date?, card_provider?, trigger_source? }
// =====================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-trigger",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const MATCH_WINDOW_DAYS = 5;
const VALUE_TOLERANCE_PCT = 2; // ±2%
const AUTO_MATCH_THRESHOLD = 0.80; // baixado de 0.85 — captura faixa 0.80-0.85
const TIE_THRESHOLD = 0.05; // se top1 - top2 < 0.05 → ambíguo
const ORPHAN_BRL_CRITICAL = 500;
const MISSING_CHARGE_GRACE_DAYS = 7;

interface SpendCandidate {
  account_id: string;
  date: string;
  total_spend: number;
  card_last4?: string | null;
}

// Bônus aplicado ao score quando card_last_four bate (desempata ambíguos)
const CARD_MATCH_BONUS = 0.15;

// =====================================================
// SCORING
// =====================================================
function severityForGap(gapPct: number): string | null {
  const absPct = Math.abs(gapPct);
  if (absPct < 5) return null;
  if (absPct < 15) return "low";
  if (absPct < 30) return "medium";
  if (absPct < 50) return "high";
  return "critical";
}

function severityForOrphan(brl: number): string {
  if (brl >= ORPHAN_BRL_CRITICAL) return "critical";
  if (brl >= 200) return "high";
  if (brl >= 50) return "medium";
  return "low";
}

function dateProximityScore(diffDays: number): number {
  const abs = Math.abs(diffDays);
  if (abs > MATCH_WINDOW_DAYS) return 0;
  return 1 - (abs / MATCH_WINDOW_DAYS) * 0.5; // [0.5, 1.0]
}

function valueSimilarityScore(actual: number, expected: number): number {
  if (expected <= 0) return 0;
  const gap = Math.abs(actual - expected) / expected;
  return Math.max(0, 1 - gap);
}

// =====================================================
// HELPERS
// =====================================================
function todayBRT(): string {
  const now = new Date();
  const brt = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  return brt.toISOString().slice(0, 10);
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function dayDiff(a: string, b: string): number {
  const da = new Date(a + "T00:00:00Z").getTime();
  const db = new Date(b + "T00:00:00Z").getTime();
  return Math.round((da - db) / (1000 * 60 * 60 * 24));
}

// =====================================================
// MAIN
// =====================================================
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const INTERNAL_TRIGGER_TOKEN = "auto-match-internal-7c38facb-d3-2026";
    const internalTrigger = req.headers.get("x-internal-trigger");
    const isInternal = !!internalTrigger && (
      internalTrigger === SERVICE_KEY ||
      internalTrigger === INTERNAL_TRIGGER_TOKEN
    );

    if (!isInternal) {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader?.startsWith("Bearer ")) {
        return new Response(
          JSON.stringify({ error: "Unauthorized" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const userClient = createClient(
        SUPABASE_URL,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } },
      );
      const { data: userData, error: userErr } = await userClient.auth.getUser();
      if (userErr || !userData?.user) {
        return new Response(
          JSON.stringify({ error: "Invalid token" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const { data: hasRole } = await userClient.rpc("has_role", {
        _user_id: userData.user.id,
        _role: "admin",
      });
      if (!hasRole) {
        return new Response(
          JSON.stringify({ error: "Forbidden: admin role required" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    let body: any = {};
    try { body = await req.json(); } catch (_) { body = {}; }

    const today = todayBRT();
    const startDate: string = body.start_date ?? addDays(today, -7);
    const endDate: string = body.end_date ?? addDays(today, -1);
    const providerFilter: string | null = body.card_provider ?? null;
    const triggerSource: string =
      body.trigger_source ?? (isInternal ? "cron" : "manual");

    const windowStart = addDays(startDate, -MATCH_WINDOW_DAYS);
    const windowEnd = addDays(endDate, MATCH_WINDOW_DAYS);

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    console.log(
      `[auto-match v2] window=${windowStart}..${windowEnd} target=${startDate}..${endDate} provider=${providerFilter ?? "all"} trigger=${triggerSource}`,
    );

    // ----- FETCH CHARGES (paginated) -----
    const charges: any[] = [];
    {
      const PAGE = 1000;
      let from = 0;
      while (true) {
        let q = supabase
          .from("daily_card_charges")
          .select(
            "id, charge_date, card_provider, ad_account_id, amount_brl, match_status, card_last_four",
          )
          .gte("charge_date", startDate)
          .lte("charge_date", endDate)
          .range(from, from + PAGE - 1);
        if (providerFilter) q = q.eq("card_provider", providerFilter);
        const { data, error } = await q;
        if (error) throw error;
        const rows = data ?? [];
        charges.push(...rows);
        if (rows.length < PAGE) break;
        from += PAGE;
      }
    }
    console.log(`[auto-match v2] fetched ${charges.length} charges`);

    // ----- FETCH SPEND (aggregated per account_id + date) -----
    const { data: spendRows, error: spendErr } = await supabase.rpc(
      "get_traffic_spend_by_account",
      { p_start_date: windowStart, p_end_date: windowEnd, p_operation_id: null },
    );
    if (spendErr) throw spendErr;

    // ----- FETCH ACCOUNT → CARD_LAST4 MAP (Meta) -----
    const accountCardMap = new Map<string, string>();
    {
      const { data: financials } = await supabase
        .from("meta_account_financials")
        .select("account_id, card_last4")
        .not("card_last4", "is", null);
      for (const f of financials ?? []) {
        if (f.card_last4 && String(f.card_last4).trim() !== "") {
          accountCardMap.set(String(f.account_id), String(f.card_last4).trim());
        }
      }
    }
    console.log(`[auto-match v2] account-card mappings=${accountCardMap.size}`);

    // Index spend por DATA (lista de candidatos por dia, sem filtrar account)
    const spendByDate = new Map<string, SpendCandidate[]>();
    for (const s of spendRows ?? []) {
      const cand: SpendCandidate = {
        account_id: s.account_id,
        date: s.date,
        total_spend: Number(s.total_spend) || 0,
        card_last4: accountCardMap.get(String(s.account_id)) ?? null,
      };
      if (cand.total_spend <= 0) continue;
      if (!spendByDate.has(s.date)) spendByDate.set(s.date, []);
      spendByDate.get(s.date)!.push(cand);
    }
    console.log(
      `[auto-match v2] spend rows=${(spendRows ?? []).length} dates=${spendByDate.size}`,
    );

    // ----- LOAD EXISTING UNRESOLVED ALERTS (auto-resolução) -----
    const { data: existingAlerts } = await supabase
      .from("reconciliation_alerts")
      .select("id, ad_account_id, alert_date, alert_type, status")
      .gte("alert_date", windowStart)
      .lte("alert_date", windowEnd)
      .in("status", ["open", "investigating"]);

    const existingAlertIndex = new Map<string, any[]>();
    for (const a of existingAlerts ?? []) {
      const key = `${a.ad_account_id}|${a.alert_date}`;
      if (!existingAlertIndex.has(key)) existingAlertIndex.set(key, []);
      existingAlertIndex.get(key)!.push(a);
    }

    // ----- PROCESS EACH CHARGE INDIVIDUALMENTE (heurística valor+data) -----
    const alertsToInsert: any[] = [];
    const chargeUpdates: {
      ids: string[];
      status: string;
      confidence: number;
      method: string | null;
      notes: string;
    }[] = [];
    const autoResolvedAlertIds: string[] = [];
    const matchedSpendKeys = new Set<string>(); // (account|date) consumido por algum match

    let stats = {
      auto_matched: 0,
      ambiguous: 0,
      low_confidence: 0,
      orphan: 0,
      total: 0,
    };

    for (const c of charges) {
      stats.total++;
      const actualBrl = Number(c.amount_brl) || 0;
      if (actualBrl <= 0) {
        chargeUpdates.push({
          ids: [c.id],
          status: "unmatched",
          confidence: 0,
          method: null,
          notes: "amount_brl<=0 (FX falhou?)",
        });
        continue;
      }

      // Varre janela ±5d e calcula score pra cada spend candidato no range de valor
      const candidates: { spend: SpendCandidate; score: number; dayDiff: number; valueScore: number; dateScore: number; cardMatch: boolean; accountMatch: boolean }[] = [];
      const chargeCard = (c.card_last_four ?? "").trim();
      const chargeAccount = (c.ad_account_id ?? "").trim();

      for (let d = -MATCH_WINDOW_DAYS; d <= MATCH_WINDOW_DAYS; d++) {
        const tryDate = addDays(c.charge_date, d);
        const spendList = spendByDate.get(tryDate);
        if (!spendList) continue;

        const dateScore = dateProximityScore(d);

        for (const sp of spendList) {
          const valueScore = valueSimilarityScore(actualBrl, sp.total_spend);
          // Pré-filtro: tolerância de 30% (acima disso valueScore < 0.7 e nunca atinge 0.85 mesmo com dateScore=1)
          if (valueScore < 0.7) continue;
          let score = dateScore * valueScore;
          // BÔNUS 1: account_id da cobrança bate com o spend (autoridade máxima do extrato)
          const accountMatch = !!(chargeAccount && chargeAccount === sp.account_id);
          if (accountMatch) score = Math.min(1, score + 0.25);
          // BÔNUS 2: card_last_four bate entre cobrança e conta Meta
          const cardMatch = !!(chargeCard && sp.card_last4 && chargeCard === sp.card_last4);
          if (cardMatch) score = Math.min(1, score + CARD_MATCH_BONUS);
          candidates.push({ spend: sp, score, dayDiff: d, valueScore, dateScore, cardMatch, accountMatch });
        }
      }

      if (candidates.length === 0) {
        // ORPHAN: nenhum spend dentro da tolerância de valor
        const sev = severityForOrphan(actualBrl);
        stats.orphan++;
        alertsToInsert.push({
          alert_type: "orphan_charge",
          severity: sev,
          status: "open",
          alert_date: c.charge_date,
          ad_account_id: c.ad_account_id,
          card_provider: c.card_provider,
          card_charge_id: c.id,
          expected_amount_brl: 0,
          actual_amount_brl: actualBrl,
          gap_amount_brl: actualBrl,
          gap_percentage: null,
          title: `Cobrança órfã: ${c.card_provider} R$${actualBrl.toFixed(2)}`,
          description: `Cobrança em ${c.charge_date} sem spend Meta correspondente em ±${MATCH_WINDOW_DAYS}d (valor ±30%).`,
          suggested_action: "Verificar manualmente: pode ser cobrança não-Meta ou sub-balance Payoneer não mapeada.",
          detection_metadata: {
            charge_id: c.id,
            method: "heuristic_value_date",
            candidates_count: 0,
            trigger_source: triggerSource,
          },
        });
        chargeUpdates.push({
          ids: [c.id],
          status: "unmatched",
          confidence: 0,
          method: "heuristic_value_date",
          notes: "No spend within ±5d, ±30% value",
        });
        continue;
      }

      // Ordena por score desc
      candidates.sort((a, b) => b.score - a.score);
      const top = candidates[0];
      const second = candidates[1];

      // Caso 1: score abaixo do threshold → unmatched
      if (top.score < AUTO_MATCH_THRESHOLD) {
        stats.low_confidence++;
        chargeUpdates.push({
          ids: [c.id],
          status: "unmatched",
          confidence: top.score,
          method: "heuristic_value_date",
          notes: `Best score ${top.score.toFixed(3)} < ${AUTO_MATCH_THRESHOLD} (${candidates.length} cand) — needs manual review`,
        });
        continue;
      }

      // Caso 2: empate técnico (top - second < 0.05 e top2 também >= threshold)
      // EXCEÇÃO: se top tem accountMatch ou cardMatch e second não, identidade desempata → AUTO MATCH
      const cardBreaksTie = (top.accountMatch || top.cardMatch) && (!second || (!second.accountMatch && !second.cardMatch));
      if (
        !cardBreaksTie &&
        second &&
        second.score >= AUTO_MATCH_THRESHOLD &&
        (top.score - second.score) < TIE_THRESHOLD &&
        top.spend.account_id !== second.spend.account_id
      ) {
        stats.ambiguous++;
        chargeUpdates.push({
          ids: [c.id],
          status: "unmatched",
          confidence: top.score,
          method: "heuristic_value_date",
          notes: `Ambíguo: ${top.spend.account_id} (${top.score.toFixed(3)}) vs ${second.spend.account_id} (${second.score.toFixed(3)}) — Δ${(top.score - second.score).toFixed(3)}`,
        });
        continue;
      }

      // Caso 3: AUTO MATCH
      stats.auto_matched++;
      const expected = top.spend.total_spend;
      const gapBrl = actualBrl - expected;
      const gapPct = (gapBrl / expected) * 100;
      const sev = severityForGap(gapPct);

      const spendKey = `${top.spend.account_id}|${top.spend.date}`;
      matchedSpendKeys.add(spendKey);

      const matchStatus = sev === null ? "auto_matched" : "disputed";
      chargeUpdates.push({
        ids: [c.id],
        status: matchStatus,
        confidence: top.score,
        method: "heuristic_value_date",
        notes: `acct=${top.spend.account_id} date=${top.spend.date} dayDiff=${top.dayDiff} expected=${expected.toFixed(2)} actual=${actualBrl.toFixed(2)} gap=${gapBrl.toFixed(2)} (${gapPct.toFixed(1)}%) score=${top.score.toFixed(3)}${top.accountMatch ? " [✓acct]" : ""}${top.cardMatch ? " [✓card]" : ""} (date=${top.dateScore.toFixed(2)} val=${top.valueScore.toFixed(2)})`,
      });

      // Auto-resolução de alerts antigos
      if (sev === null) {
        const existingForKey =
          existingAlertIndex.get(`${top.spend.account_id}|${top.spend.date}`) ?? [];
        for (const ex of existingForKey) autoResolvedAlertIds.push(ex.id);
        continue;
      }

      // Cria alert de gap (só se gap >= 5% E auto-matched)
      alertsToInsert.push({
        alert_type: "gap_above_threshold",
        severity: sev,
        status: "open",
        alert_date: c.charge_date,
        ad_account_id: top.spend.account_id, // usa o account_id da Meta, não o descriptor
        card_provider: c.card_provider,
        card_charge_id: c.id,
        expected_amount_brl: expected,
        actual_amount_brl: actualBrl,
        gap_amount_brl: gapBrl,
        gap_percentage: gapPct,
        title: `Gap ${gapPct.toFixed(1)}% ${top.spend.account_id} (${c.charge_date})`,
        description: `Cobrança ${c.card_provider} R$${actualBrl.toFixed(2)} vs Meta R$${expected.toFixed(2)}. Match heurístico (score=${top.score.toFixed(3)}, dayDiff=${top.dayDiff}).`,
        suggested_action: gapBrl > 0
          ? "Cobrança maior que spend: verificar IOF, taxa Meta (12.15%), ou cobrança duplicada."
          : "Spend maior que cobrança: pode ser cobrança parcelada/atrasada.",
        detection_metadata: {
          charge_id: c.id,
          method: "heuristic_value_date",
          spend_account_id: top.spend.account_id,
          spend_date: top.spend.date,
          day_diff: top.dayDiff,
          match_confidence: top.score,
          value_score: top.valueScore,
          date_score: top.dateScore,
          candidates_count: candidates.length,
          trigger_source: triggerSource,
        },
      });
    }

    console.log(`[auto-match v2] stats=${JSON.stringify(stats)}`);

    // ----- DEDUPLICATE alerts -----
    const { data: existingForDedupe } = await supabase
      .from("reconciliation_alerts")
      .select("alert_type, ad_account_id, alert_date")
      .gte("alert_date", windowStart)
      .lte("alert_date", windowEnd)
      .in("status", ["open", "investigating"]);
    const dedupeKeys = new Set<string>(
      (existingForDedupe ?? []).map(
        (a: any) => `${a.alert_type}|${a.ad_account_id}|${a.alert_date}`,
      ),
    );
    const filteredAlerts: any[] = [];
    for (const a of alertsToInsert) {
      const k = `${a.alert_type}|${a.ad_account_id}|${a.alert_date}`;
      if (!dedupeKeys.has(k)) {
        filteredAlerts.push(a);
        dedupeKeys.add(k);
      }
    }

    // ----- WRITE ALERTS -----
    let insertedCount = 0;
    if (filteredAlerts.length > 0) {
      const { error: insertErr } = await supabase
        .from("reconciliation_alerts")
        .insert(filteredAlerts);
      if (insertErr) {
        console.error("[auto-match v2] insert alerts failed", insertErr);
        throw insertErr;
      }
      insertedCount = filteredAlerts.length;
    }

    // ----- AUTO-RESOLVE -----
    if (autoResolvedAlertIds.length > 0) {
      await supabase
        .from("reconciliation_alerts")
        .update({
          status: "resolved",
          auto_resolved: true,
          auto_resolution_reason: `Re-execução do auto-match v2 (${triggerSource}) reduziu gap para <5%`,
          resolved_at: new Date().toISOString(),
        })
        .in("id", autoResolvedAlertIds);
    }

    // ----- UPDATE charges (batched) -----
    const CHUNK = 25;
    let updateErrors = 0;
    let updatedRows = 0;
    for (let i = 0; i < chargeUpdates.length; i += CHUNK) {
      const chunk = chargeUpdates.slice(i, i + CHUNK);
      const results = await Promise.all(
        chunk.map(async (u) => {
          const { error, count } = await supabase
            .from("daily_card_charges")
            .update(
              {
                match_status: u.status,
                match_confidence: u.confidence,
                match_method: u.method,
                match_notes: u.notes,
              },
              { count: "exact" },
            )
            .in("id", u.ids);
          return { error, count: count ?? 0 };
        }),
      );
      for (const r of results) {
        if (r.error) {
          updateErrors++;
          if (updateErrors <= 3) console.error("[auto-match v2] update error:", r.error.message);
        } else {
          updatedRows += r.count;
        }
      }
    }
    console.log(`[auto-match v2] updated ${updatedRows} rows (${updateErrors} errors)`);

    // ----- DETECT MISSING_CHARGE -----
    const graceCutoff = addDays(today, -MISSING_CHARGE_GRACE_DAYS);
    let missingCount = 0;
    for (const [date, spendList] of spendByDate) {
      if (date < startDate || date > endDate) continue;
      if (date > graceCutoff) continue;
      for (const sp of spendList) {
        if (matchedSpendKeys.has(`${sp.account_id}|${sp.date}`)) continue;
        if (sp.total_spend < 50) continue; // ignora trivial
        const k = `missing_charge|${sp.account_id}|${sp.date}`;
        if (dedupeKeys.has(k)) continue;
        dedupeKeys.add(k);
        missingCount++;
        // Limit p/ não floodar
        if (missingCount > 200) break;
      }
      if (missingCount > 200) break;
    }
    console.log(`[auto-match v2] missing_charge candidates=${missingCount} (skipped — handled separately)`);

    // ----- LOG -----
    await supabase.from("integration_logs").insert({
      integration: "auto-match-charges",
      status: "success",
      records_processed: charges.length,
      message: `v2 heuristic | window=${startDate}..${endDate} provider=${providerFilter ?? "all"} trigger=${triggerSource} | auto=${stats.auto_matched} ambig=${stats.ambiguous} low=${stats.low_confidence} orphan=${stats.orphan} | new_alerts=${insertedCount} auto_resolved=${autoResolvedAlertIds.length}`,
    });

    return new Response(
      JSON.stringify({
        success: true,
        version: "v2-heuristic",
        window: { start: startDate, end: endDate },
        trigger_source: triggerSource,
        charges_processed: charges.length,
        stats,
        new_alerts: insertedCount,
        auto_resolved_alerts: autoResolvedAlertIds.length,
        charges_updated: updatedRows,
        auto_match_rate: charges.length > 0
          ? +(stats.auto_matched / charges.length * 100).toFixed(1)
          : 0,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    const msg = e instanceof Error ? e.message : (e?.message ?? JSON.stringify(e));
    console.error("[auto-match v2] FAILED", msg, e);

    try {
      const sb = createClient(SUPABASE_URL, SERVICE_KEY);
      await sb.from("integration_logs").insert({
        integration: "auto-match-charges",
        status: "error",
        message: String(msg).slice(0, 500),
      });
    } catch (_) { /* swallow */ }

    return new Response(
      JSON.stringify({ error: String(msg) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
