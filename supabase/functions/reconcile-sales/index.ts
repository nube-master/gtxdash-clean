import { mirrorToWebPush } from "../_shared/push-mirror.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function brDate(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Paginated fetch */
async function fetchAll(supabase: any, table: string, select: string, filters: (q: any) => any) {
  const PAGE = 1000;
  let all: any[] = [];
  let from = 0;
  while (true) {
    let q = supabase.from(table).select(select);
    q = filters(q);
    q = q.range(from, from + PAGE - 1);
    const { data, error } = await q;
    if (error) { console.error(`fetchAll ${table}:`, error.message); break; }
    all = all.concat(data || []);
    if ((data?.length || 0) < PAGE) break;
    from += PAGE;
  }
  return all;
}

/**
 * Standard payout range filter for ClickBank SALEs.
 * Excludes upsells/bumps that come with anomalous amounts (e.g. $102, $383).
 * Only counts sales within the expected payout range ($200–$260).
 */
const CB_MIN_PAYOUT = 200;
const CB_MAX_PAYOUT = 260;

/** Fixed payout per project for manual entries */
const PROJECT_PAYOUT_USD: Record<string, number> = {
  NDM: 240,
  NDR: 235,
  LDR: 235,
  NDB: 235,
  CRT: 230,
  OUTROS: 235,
};

/** Minimum minutes since last reconciliation before allowing another run */
const COOLDOWN_MINUTES = 5;

/** Max sales to auto-insert in one run (increased to cover full-day gaps) */
const MAX_AUTO_INSERT = 200;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const h = { ...corsHeaders, "Content-Type": "application/json" };

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !supabaseKey) {
    return new Response(JSON.stringify({ error: "Missing env vars" }), { status: 500, headers: h });
  }
  const supabase = createClient(supabaseUrl, supabaseKey);

  const url = new URL(req.url);
  let mode = url.searchParams.get("mode") || "check"; // "check" | "reconcile" | "auto" | "status"
  const targetDate = url.searchParams.get("date") || brDate();
  const gapThreshold = parseInt(url.searchParams.get("threshold") || "2", 10);

  // Parse body for POST requests
  let forceMode: string | null = null;
  if (req.method === "POST") {
    try {
      const body = await req.json();
      forceMode = body.mode || null;
    } catch { /* ignore */ }
  }
  if (forceMode) mode = forceMode;

  try {
    // ── 1. Count ClickBank audit SALE records, filtering by payout range ──
    const cbRowsRaw = await fetchAll(supabase, "clickbank_audit", "receipt, amount_usd, amount_brl, transaction_type, meta_campaign_id, aff_sub2, aff_sub3, affiliate, product_name", (q: any) =>
      q.eq("date", targetDate).eq("transaction_type", "SALE")
    );

    // Filter: only real sales within standard payout range (excludes upsells/bumps)
    const cbRows = cbRowsRaw.filter((r: any) => {
      const amt = Number(r.amount_usd || 0);
      return amt >= CB_MIN_PAYOUT && amt <= CB_MAX_PAYOUT;
    });
    const cbExcluded = cbRowsRaw.length - cbRows.length;

    // Track which CB sales have campaign IDs for smart attribution
    const cbWithCampaignId = cbRows.filter((r: any) => r.meta_campaign_id);

    const cbCount = cbRows.length;
    const cbRevUsd = cbRows.reduce((s: number, r: any) => s + Number(r.amount_usd || 0), 0);
    const cbRevBrl = cbRows.reduce((s: number, r: any) => s + Number(r.amount_brl || 0), 0);

    // ── 2. Count RedTrack purchases (SP timezone bounds) ──
    const startUtc = `${targetDate}T03:00:00Z`;
    const nextDay = new Date(`${targetDate}T12:00:00Z`);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    const endUtc = `${nextDay.toISOString().slice(0, 10)}T03:00:00Z`;

    const rtRows = await fetchAll(supabase, "redtrack_events", "id, amount, currency, redtrack_id, offer_name", (q: any) =>
      q.eq("event_type", "purchase").gte("occurred_at", startUtc).lt("occurred_at", endUtc)
    );

    // Separate organic from manual
    const rtOrganic = rtRows.filter((r: any) => !(r.offer_name || "").includes("[MANUAL]"));
    const rtManual = rtRows.filter((r: any) => (r.offer_name || "").includes("[MANUAL]"));
    const rtCount = rtRows.length;
    const rtOrganicCount = rtOrganic.length;
    const rtManualCount = rtManual.length;

    // Get exchange rate
    let usdToBrl = 5.15;
    try {
      const { data: rateRow } = await supabase
        .from("exchange_rate_log")
        .select("rate")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      if (Number(rateRow?.rate ?? 0) > 0) usdToBrl = Number(rateRow!.rate);
    } catch { /* fallback */ }

    const rtRevBrl = rtRows.reduce((s: number, r: any) => {
      const amt = Number(r.amount || 0);
      return s + (r.currency === "BRL" ? amt : amt * usdToBrl);
    }, 0);

    // Gap: CB real sales vs RT organic (exclude existing manual adjustments)
    const gap = cbCount - rtOrganicCount;
    const gapPct = cbCount > 0 ? (gap / cbCount) * 100 : 0;
    const coveragePct = cbCount > 0 ? (rtOrganicCount / cbCount) * 100 : 100;
    const revenueGapBrl = cbRevBrl - rtRevBrl;

    const statusPayload = {
      date: targetDate,
      clickbank: { count: cbCount, excluded_anomalous: cbExcluded, revenue_usd: cbRevUsd, revenue_brl: cbRevBrl },
      redtrack: { count: rtCount, organic: rtOrganicCount, manual: rtManualCount, revenue_brl: Math.round(rtRevBrl * 100) / 100 },
      gap: { count: gap, pct: Math.round(gapPct * 100) / 100, revenue_brl: Math.round(revenueGapBrl * 100) / 100 },
      coverage_pct: Math.round(coveragePct * 100) / 100,
      usd_to_brl: usdToBrl,
    };

    if (mode === "status") {
      return new Response(JSON.stringify({ success: true, ...statusPayload }), { headers: h });
    }

    // ── 3. Guard: CB data incomplete ──
    const cbCoverageOfRt = rtOrganicCount > 0 ? (cbCount / rtOrganicCount) * 100 : 0;
    const cbIsIncomplete = cbCount > 0 && cbCoverageOfRt < 50;

    if (cbIsIncomplete && (mode === "auto" || mode === "reconcile")) {
      const reason = `CB audit incomplete: only ${cbCount} IPNs vs ${rtOrganicCount} RT records (${cbCoverageOfRt.toFixed(0)}% coverage). Skipping.`;
      console.log(`[reconcile-sales] ${reason}`);
      await supabase.from("integration_logs").insert({
        integration: "reconciler", status: "skipped", records_processed: 0, message: reason,
      });
      return new Response(JSON.stringify({ success: true, action: "skipped_cb_incomplete", reason, ...statusPayload }), { headers: h });
    }

    // No gap or RT already has more
    if (gap <= 0) {
      console.log(`[reconcile-sales] No gap for ${targetDate}: CB=${cbCount} RT_organic=${rtOrganicCount}`);
      return new Response(JSON.stringify({ success: true, action: "none", reason: "No gap (RT organic >= CB count)", ...statusPayload }), { headers: h });
    }

    // ── 4. Cooldown check: prevent runs within 5 minutes of each other ──
    const shouldReconcile = mode === "reconcile" || mode === "auto";

    if (shouldReconcile) {
      const { data: lastLog } = await supabase
        .from("integration_logs")
        .select("created_at")
        .eq("integration", "reconciler")
        .eq("status", "success")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (lastLog?.created_at) {
        const lastRunMs = new Date(lastLog.created_at).getTime();
        const nowMs = Date.now();
        const elapsedMin = (nowMs - lastRunMs) / 60000;

        if (elapsedMin < COOLDOWN_MINUTES) {
          const reason = `Cooldown active: last reconciliation was ${elapsedMin.toFixed(1)} min ago (min ${COOLDOWN_MINUTES} min). Skipping.`;
          console.log(`[reconcile-sales] ${reason}`);
          return new Response(JSON.stringify({ success: true, action: "cooldown", reason, ...statusPayload }), { headers: h });
        }
      }
    }

    // ── 5. Alert (Pushcut) if gap exceeds threshold — 1x/dia às ~23:30+ BRT ──
    const brtHour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", hour: "numeric", hour12: false }).format(new Date()));
    const isAlertWindow = brtHour >= 23; // 23:00–23:59 BRT

    if (gap >= gapThreshold && isAlertWindow) {
      // Check if alert was already sent today
      const { data: todayAlert } = await supabase
        .from("integration_logs")
        .select("id")
        .eq("integration", "reconciler_alert")
        .gte("created_at", `${targetDate}T00:00:00Z`)
        .limit(1)
        .maybeSingle();

      if (!todayAlert) {
        const { data: gabrielRow } = await supabase
          .from("notification_recipients")
          .select("webhook_url")
          .eq("name", "Gabriel Vidal")
          .eq("is_active", true)
          .limit(1)
          .single();

        const pushcutUrl = gabrielRow?.webhook_url || Deno.env.get("PUSHCUT_WEBHOOK_URL");
        if (pushcutUrl) {
          const isAutoMode = shouldReconcile;
          const neededInserts = Math.max(0, gap - rtManualCount);
          const actualInsert = Math.min(neededInserts, MAX_AUTO_INSERT);

          const alertTitle = `⚠️ Gap de Vendas: ${gap} (${neededInserts} a inserir)`;
          const alertBody = [
            `📅 ${targetDate}`,
            `🏷️ CB IPN (filtrado): ${cbCount} vendas (excluídos ${cbExcluded} anômalos)`,
            `📡 RT: ${rtOrganicCount} orgânicas + ${rtManualCount} manuais`,
            `❌ Gap: ${gap} vendas (${gapPct.toFixed(1)}%)`,
            `💰 Ticket: NDM=$${PROJECT_PAYOUT_USD.NDM} / NDR=$${PROJECT_PAYOUT_USD.NDR}`,
            "",
            isAutoMode
              ? `✅ Inserindo ${actualInsert} vendas manuais`
              : `ℹ️ Modo check — sem ação automática`,
          ].join("\n");

          try {
            await fetch(pushcutUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ title: alertTitle, text: alertBody }),
            });
            // Mark alert as sent today
            await supabase.from("integration_logs").insert({
              integration: "reconciler_alert",
              status: "sent",
              records_processed: gap,
              message: `Daily gap alert sent for ${targetDate}: gap=${gap}`,
            });
            console.log(`[reconcile-sales] Daily alert sent to Gabriel Vidal`);
          } catch (e) {
            console.error("[reconcile-sales] Pushcut error:", (e as Error).message);
          }

          // Canal PARALELO: Web Push
          await mirrorToWebPush({
            operation_id: null,
            notification_type: "reconciler_gap_alert",
            title: alertTitle,
            body: alertBody,
            url: "/",
          });
        }
      } else {
        console.log(`[reconcile-sales] Alert already sent today for ${targetDate}, skipping.`);
      }
    }

    // ── 6. Auto-reconcile (with per-project gap protection) ──
    if (shouldReconcile && gap > 0) {
      // ── Helper: detect project from campaign name, product text, or affiliate ──
      // Load dynamic vendor config from app_settings
      const AFFILIATE_PROJECT_MAP: Record<string, string> = {
        guipires: "NDM", guipiresp: "NDM",
        gtxndr: "NDR",
        gtxndb: "NDB",
        gtxndb2: "NDB2",
        gtxwl: "LDR",
        nrptgtx: "CRT",
      };
      // Overlay dynamic config from clickbank_vendors (takes priority)
      try {
        const { data: vendorData } = await supabase
          .from("app_settings")
          .select("value")
          .eq("key", "clickbank_vendors")
          .single();
        if (vendorData?.value && Array.isArray(vendorData.value)) {
          for (const v of vendorData.value as { nickname: string; label: string }[]) {
            if (v.nickname && v.label) {
              AFFILIATE_PROJECT_MAP[v.nickname.trim().toLowerCase()] = v.label.trim().toUpperCase();
            }
          }
        }
      } catch (e) { console.warn("Failed to load clickbank_vendors for reconcile:", e); }

       function detectProject(campaignName?: string | null, productText?: string | null, affiliate?: string | null): string {
         // Priority 1: affiliate nickname (AUTHORITATIVE — each project has its own ClickBank affiliate account)
         if (affiliate) {
           const mapped = AFFILIATE_PROJECT_MAP[affiliate.toLowerCase().trim()];
           if (mapped) return mapped;
         }

         // Priority 2: explicit campaign tags (fallback when affiliate is unknown/generic)
         if (campaignName) {
           if (/\[NDB2\]/i.test(campaignName)) return "NDB2";
           if (/\[NDM\]|\[MEMO\]|\[NDN\]/i.test(campaignName)) return "NDM";
           if (/\[NDR\]/i.test(campaignName)) return "NDR";
           if (/\[LDG\]|\[LDR\]/i.test(campaignName)) return "LDR";
           if (/\[NEURO\]|\[NDB\]|\[ND\]/i.test(campaignName)) return "NDB";
           if (/\[AILULA\]/i.test(campaignName)) return "CRT";
           if (/\[CRT\]/i.test(campaignName)) return "CRT";
           // BM prefix without explicit tag → NDM (operational fallback)
           if (/\[(BM|BMV|BMGTX|BMHAVEN|BMLLC|BM\d)/i.test(campaignName)) return "NDM";
         }

         // Priority 3: fallback text matching (offer/product)
         if (productText) {
           if (/NDR/i.test(productText)) return "NDR";
           if (/NDM|NEURODYNE|MEMO/i.test(productText)) return "NDM";
           if (/LDG|LDR|LEANDROPS/i.test(productText)) return "LDR";
           if (/NDB|NEURO\s*B/i.test(productText)) return "NDB";
           if (/CRT|CRSTRENGHT|CRSTRANGE|CORE\s*STR|AILULA/i.test(productText)) return "CRT";
         }

         return "OUTROS";
       }

      // Existing manual rows may already represent a CB receipt (id: reconcile-YYYY-MM-DD-receipt-<RECEIPT>)
      const existingManualReceipts = new Set<string>();
      const receiptPrefix = `reconcile-${targetDate}-receipt-`;
      for (const r of rtManual) {
        const rid = String(r.redtrack_id || "");
        if (rid.startsWith(receiptPrefix)) {
          existingManualReceipts.add(rid.slice(receiptPrefix.length));
        }
      }

      // Candidate CB rows that are not yet represented by receipt-based manual rows
      const cbCandidates = cbRows.filter((cb: any) => !existingManualReceipts.has(String(cb.receipt || "")));

      // ── Look up campaign details from meta_campaign_status + traffic_data fallback ──
      const campaignIdSet = new Set<string>();
      for (const cb of cbCandidates) {
        if (cb.meta_campaign_id) campaignIdSet.add(cb.meta_campaign_id);
      }
      // Also collect IDs from ALL cbRows (for project deficit calc)
      for (const cb of cbRows) {
        if (cb.meta_campaign_id) campaignIdSet.add(cb.meta_campaign_id);
      }

      const campaignInfoMap = new Map<string, { name: string; account_id: string }>();
      if (campaignIdSet.size > 0) {
        const campaignIds = Array.from(campaignIdSet);

        // Step 1: Primary lookup via meta_campaign_status
        for (let i = 0; i < campaignIds.length; i += 50) {
          const batch = campaignIds.slice(i, i + 50);
          const { data: campaigns } = await supabase
            .from("meta_campaign_status")
            .select("campaign_id, campaign_name, account_id")
            .in("campaign_id", batch);

          for (const c of (campaigns || [])) {
            campaignInfoMap.set(c.campaign_id, { name: c.campaign_name, account_id: c.account_id });
          }
        }

        // Step 2: Fallback — for unresolved IDs, try traffic_data (has campaign_name with embedded campaign IDs)
        const unresolvedIds = campaignIds.filter(id => !campaignInfoMap.has(id));
        if (unresolvedIds.length > 0) {
          console.log(`[reconcile-sales] ${unresolvedIds.length} campaign IDs unresolved, trying traffic_data fallback...`);
          for (let i = 0; i < unresolvedIds.length; i += 20) {
            const batch = unresolvedIds.slice(i, i + 20);
            // Search traffic_data for campaigns containing these IDs in the campaign_name
            for (const cid of batch) {
              const { data: tdRows } = await supabase
                .from("traffic_data")
                .select("campaign_name, account_id")
                .ilike("campaign_name", `%${cid}%`)
                .limit(1);

              if (tdRows && tdRows.length > 0) {
                campaignInfoMap.set(cid, { name: tdRows[0].campaign_name, account_id: tdRows[0].account_id });
              }
            }
          }
        }

        console.log(`[reconcile-sales] Campaign lookup: ${campaignInfoMap.size}/${campaignIdSet.size} IDs resolved`);
      }

      // ── Re-enrich existing manual rows that have meta_campaign_id but generic utm_campaign ──
      if (campaignInfoMap.size > 0) {
        const { data: unresolvedManual } = await supabase
          .from("redtrack_events")
          .select("id, meta_campaign_id, utm_campaign")
          .eq("event_type", "purchase")
          .like("offer_name", "%[MANUAL]%")
          .like("utm_campaign", "%[AUTO] Reconcile%")
          .gte("occurred_at", startUtc)
          .lt("occurred_at", endUtc);

        let enrichedCount = 0;
        for (const row of (unresolvedManual || [])) {
          if (!row.meta_campaign_id) continue;
          const info = campaignInfoMap.get(row.meta_campaign_id);
          if (!info) continue;

          const utmContentMatch = info.name.match(/\[([^\]]+)\]/g);
          const utmContent = utmContentMatch && utmContentMatch.length >= 2 ? utmContentMatch[1] : null;

          await supabase
            .from("redtrack_events")
            .update({
              utm_campaign: info.name,
              utm_source: `FB_${info.account_id}`,
              utm_content: utmContent,
            })
            .eq("id", row.id);
          enrichedCount++;
        }
        if (enrichedCount > 0) {
          console.log(`[reconcile-sales] Re-enriched ${enrichedCount} previously unresolved manual rows`);
        }
      }



      // ── Per-project deficit calculation (prevents NDR being hidden by NDM totals) ──
      const inc = (m: Map<string, number>, key: string) => m.set(key, (m.get(key) || 0) + 1);

      const cbByProject = new Map<string, number>();
      for (const cb of cbRows) {
        const campaignName = cb.meta_campaign_id ? campaignInfoMap.get(cb.meta_campaign_id)?.name : null;
        const project = detectProject(campaignName, cb.product_name, cb.affiliate);
        inc(cbByProject, project);
      }

      const rtOrganicByProject = new Map<string, number>();
      for (const rt of rtOrganic) {
        const project = detectProject(rt.utm_campaign || rt.offer_name, rt.product_name || rt.offer_name, null);
        inc(rtOrganicByProject, project);
      }

      const rtManualByProject = new Map<string, number>();
      for (const rt of rtManual) {
        const project = detectProject(rt.utm_campaign || rt.offer_name, rt.product_name || rt.offer_name, null);
        inc(rtManualByProject, project);
      }

      const projectDeficit = new Map<string, number>();
      for (const [project, cbProjCount] of cbByProject.entries()) {
        if (project === "OUTROS") continue; // Skip unattributable sales to avoid over-insertion
        const organic = rtOrganicByProject.get(project) || 0;
        const manual = rtManualByProject.get(project) || 0;
        const deficit = cbProjCount - organic - manual;
        if (deficit > 0) projectDeficit.set(project, deficit);
      }

      // Also add a capped OUTROS deficit based on global gap minus known project deficits
      const knownProjectDeficit = Array.from(projectDeficit.values()).reduce((s, v) => s + v, 0);
      const outrosDeficit = Math.max(0, gap - knownProjectDeficit - rtManualCount);
      if (outrosDeficit > 0) projectDeficit.set("OUTROS", outrosDeficit);

      const neededInserts = Array.from(projectDeficit.values()).reduce((sum, n) => sum + n, 0);
      if (neededInserts <= 0) {
        const reason = `No per-project deficit. Global gap=${gap}, but project distribution is already covered by manual entries.`;
        console.log(`[reconcile-sales] ${reason}`);
        return new Response(JSON.stringify({ success: true, action: "already_covered", reason, ...statusPayload }), { headers: h });
      }

      // Prioritize non-NDM projects first for fair recovery (NDR/LDG/NDB)
      const sortedCandidates = [...cbCandidates].sort((a, b) => {
        const projA = detectProject(campaignInfoMap.get(a.meta_campaign_id)?.name, a.product_name, a.affiliate);
        const projB = detectProject(campaignInfoMap.get(b.meta_campaign_id)?.name, b.product_name, b.affiliate);

        if (projA === "NDM" && projB !== "NDM") return 1;
        if (projA !== "NDM" && projB === "NDM") return -1;

        if (a.meta_campaign_id && !b.meta_campaign_id) return -1;
        if (!a.meta_campaign_id && b.meta_campaign_id) return 1;
        return 0;
      });

      const selectedCbRows: any[] = [];
      for (const cb of sortedCandidates) {
        if (selectedCbRows.length >= MAX_AUTO_INSERT) break;

        const campaignName = cb.meta_campaign_id ? campaignInfoMap.get(cb.meta_campaign_id)?.name : null;
        const project = detectProject(campaignName, cb.product_name, cb.affiliate);
        const remaining = projectDeficit.get(project) || 0;
        if (remaining <= 0) continue;

        selectedCbRows.push(cb);
        projectDeficit.set(project, remaining - 1);
      }

      const insertCount = selectedCbRows.length;
      if (insertCount <= 0) {
        const reason = "No eligible receipts left to insert after deficit distribution.";
        console.log(`[reconcile-sales] ${reason}`);
        return new Response(JSON.stringify({ success: true, action: "already_covered", reason, ...statusPayload }), { headers: h });
      }

      // ── Helper: extract creative-level utm_content from campaign name ──
      function extractUtmContent(campaignName: string | null): string | null {
        if (!campaignName) return null;
        // Extract second bracket tag (the creative ID like [H02B31-TOM])
        const matches = campaignName.match(/\[([^\]]+)\]/g);
        if (matches && matches.length >= 2) {
          // Return the second bracket content as utm_content (mirrors RedTrack organic behavior)
          return matches[1]; // Keep brackets for consistency with organic data
        }
        return null;
      }

      // NOTE: No proportional/smart attribution. Only exact campaign ID matches are used.

      // ── Resolve operation_id per insert from account → operation mapping ──
      const accountToOperationMap = new Map<string, string>();
      let fallbackOperationId: string | null = null;
      try {
        const { data: metaAccounts } = await supabase
          .from("meta_ad_accounts")
          .select("account_id, operation_id")
          .eq("is_active", true);
        if (metaAccounts) {
          for (const acc of metaAccounts) {
            if (acc.operation_id) {
              accountToOperationMap.set(acc.account_id, acc.operation_id);
            }
          }
        }
        const { data: opRow } = await supabase
          .from("operations")
          .select("id")
          .eq("status", "active")
          .order("created_at", { ascending: true })
          .limit(1)
          .single();
        if (opRow?.id) fallbackOperationId = opRow.id;
      } catch { /* fallback: null */ }

      const baseHour = 10;
      const manualRows = [];
      let attributedCount = 0;

      for (let i = 0; i < insertCount; i++) {
        const cb = selectedCbRows[i];
        const campInfo = cb.meta_campaign_id ? campaignInfoMap.get(cb.meta_campaign_id) : null;
        const campaignName = campInfo?.name || null;
        const accountId = campInfo?.account_id || null;
        const project = detectProject(campaignName, cb.product_name, cb.affiliate);
        const ticketUsd = PROJECT_PAYOUT_USD[project] || 235;
        const hour = baseHour + Math.floor((i * 10) / Math.max(insertCount, 1));
        const minute = Math.floor(Math.random() * 59);
        const fallbackOccurredAt = `${targetDate}T${String(hour + 3).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00Z`;
        const fakeId = `reconcile-${targetDate}-receipt-${cb.receipt}`;

        // Only use exact campaign ID match — no proportional distribution
        const utmContent = extractUtmContent(campaignName);

        const offerLabel = project !== "OUTROS"
          ? `Facebook | Clickbank | ${project} | Reconciled`
          : "Ajuste paridade ClickBank";

        manualRows.push({
          redtrack_id: fakeId,
          occurred_at: cb.created_at || fallbackOccurredAt,
          event_type: "purchase",
          amount: ticketUsd,
          currency: "USD",
          status: "approved",
          offer_name: `[MANUAL] ${offerLabel}`,
          product_name: project !== "OUTROS" ? project : (cb.product_name || "Clickbank"),
          utm_source: accountId ? `FB_${accountId}` : "facebook",
          utm_campaign: campaignName || (cb.meta_campaign_id ? `[UNRESOLVED] Campaign ID ${cb.meta_campaign_id}` : `[AUTO] Reconcile ${targetDate}`),
          utm_content: utmContent,
          meta_campaign_id: cb.meta_campaign_id || null,
          operation_id: accountId ? (accountToOperationMap.get(accountId) || fallbackOperationId) : fallbackOperationId,
        });

        if (cb.meta_campaign_id && campaignName) attributedCount++;
      }

      const { error } = await supabase
        .from("redtrack_events")
        .upsert(manualRows, { onConflict: "redtrack_id", ignoreDuplicates: false });

      if (error) {
        console.error("[reconcile-sales] Insert error:", error.message);
        return new Response(JSON.stringify({ success: false, error: error.message, ...statusPayload }), { status: 500, headers: h });
      }

      await supabase.from("integration_logs").insert({
        integration: "reconciler",
        status: "success",
        records_processed: insertCount,
        message: `Reconciled ${insertCount} sales for ${targetDate} (${attributedCount} attributed via exact campaign ID). CB=${cbCount} (excl ${cbExcluded} anomalous) RT_organic=${rtOrganicCount} RT_manual_existing=${rtManualCount} gap=${gap} per_project_gap=${neededInserts} ticket=per-project(NDM=$${PROJECT_PAYOUT_USD.NDM}/NDR=$${PROJECT_PAYOUT_USD.NDR}).`,
      });

      console.log(`[reconcile-sales] Inserted ${insertCount} sales (${attributedCount} attributed via exact campaign ID) for ${targetDate}`);

      return new Response(JSON.stringify({
        success: true,
        action: "reconciled",
        inserted: insertCount,
        attributed: attributedCount,
        ticket_usd: PROJECT_PAYOUT_USD,
        capped: neededInserts > MAX_AUTO_INSERT,
        campaigns_resolved: campaignInfoMap.size,
        ...statusPayload,
      }), { headers: h });
    }

    // Check mode: just report
    return new Response(JSON.stringify({
      success: true,
      action: gap >= gapThreshold ? "alert_sent" : "below_threshold",
      ...statusPayload,
    }), { headers: h });

  } catch (err) {
    const msg = (err as Error).message || "Unknown error";
    console.error("[reconcile-sales] Error:", msg);
    return new Response(JSON.stringify({ success: false, error: msg }), { status: 500, headers: h });
  }
});
