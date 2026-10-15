import { mirrorToWebPush } from "../_shared/push-mirror.ts";
// =====================================================
// meta-permission-watchdog
// Detecta e alerta perda de permissão de tokens Meta:
//  - error_200        → conta reportou (#200) grant ads_management
//  - account_orphaned → conta antes acessível sumiu do inventário de todos os tokens
//  - mass_assignment_loss → um mesmo system user perdeu >=3 contas em 24h
//
// Idempotência: só cria alerta se não houver 'open' com mesma (type, account, sysuser).
// Envio Pushcut único por ciclo, consolidado.
// Auth: x-internal-trigger OR admin JWT.
// =====================================================
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-trigger",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INTERNAL_TOKEN = "meta-perm-watchdog-7c38facb-2026";

// Mapeamento token slot → system user (baseado em diag-meta-tokens já rodado).
// Ajuste aqui se novos tokens forem adicionados.
const TOKEN_TO_SYSUSER: Record<string, { id: string; label: string }> = {
  "app_settings.meta_ads_access_token": { id: "122098677633369528", label: "API" },
  META_ACCESS_TOKEN: { id: "122109623457263612", label: "TESTE" },
  META_ACCESS_TOKEN_2: { id: "122098677633369528", label: "API" },
  META_ACCESS_TOKEN_3: { id: "122098677633369528", label: "API" },
};

interface PermRow {
  account_id: string;
  account_name: string | null;
  can_manage: boolean;
  can_read: boolean;
  tokens_with_manage: number;
  tokens_with_read: number;
  tokens_total_tested: number;
  tasks_by_token: any;
  last_error: string | null;
  checked_at: string;
}

async function sendPushcut(webhookUrl: string, title: string, text: string, timeSensitive = true) {
  if (!webhookUrl) return { ok: false, status: 0, body: "no webhook_url" };
  try {
    const r = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        text,
        isTimeSensitive: timeSensitive,
        sound: timeSensitive ? "vibra-bumper" : "system",
        actions: [
          { name: "Abrir Assets", url: "https://gtxmidiadash.lovable.app/assets" },
        ],
      }),
      signal: AbortSignal.timeout(8000),
    });
    const body = await r.text().catch(() => "");
    return { ok: r.ok, status: r.status, body: body.slice(0, 200) };
  } catch (e: any) {
    return { ok: false, status: 0, body: String(e?.message ?? e) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Auth
    const isInternal = req.headers.get("x-internal-trigger") === INTERNAL_TOKEN;
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    if (!isInternal) {
      const authHeader = req.headers.get("authorization") ?? "";
      if (!authHeader) {
        return new Response(JSON.stringify({ error: "unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: { user } } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
      if (!user) {
        return new Response(JSON.stringify({ error: "invalid token" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: role } = await supabase.from("user_roles")
        .select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
      if (!role) {
        return new Response(JSON.stringify({ error: "admin required" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // 1) Carrega snapshot atual de meta_token_permissions (paginação p/ passar do cap 1000)
    const allPerms: PermRow[] = [];
    const PAGE = 1000;
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from("meta_token_permissions")
        .select("account_id,account_name,can_manage,can_read,tokens_with_manage,tokens_with_read,tokens_total_tested,tasks_by_token,last_error,checked_at")
        .range(from, from + PAGE - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      allPerms.push(...(data as PermRow[]));
      if (data.length < PAGE) break;
      from += PAGE;
    }

    // 2) Classifica candidatos
    const err200: PermRow[] = [];
    const orphaned: PermRow[] = [];
    for (const p of allPerms) {
      const err = (p.last_error ?? "").toLowerCase();
      if (err.includes("(#200)") || err.includes("has not grant ads_management") || err.includes("ads_read permission")) {
        err200.push(p);
      } else if (
        p.tokens_with_manage === 0 && p.tokens_with_read === 0 &&
        (err.includes("nenhum token retornou") || err.includes("orphan"))
      ) {
        orphaned.push(p);
      }
    }

    // 3) Detecta system user afetado (via account_name pattern quando tasks_by_token vazio)
    // Se tasks_by_token tem entradas, usa a última known-good; senão heurística por nome.
    const guessSysUser = (p: PermRow): { id: string | null; label: string | null } => {
      // Se tem tasks_by_token com algum token no passado, usa o primeiro token conhecido
      try {
        const arr = Array.isArray(p.tasks_by_token) ? p.tasks_by_token : [];
        for (const entry of arr) {
          const label = entry?.token_label ?? entry?.label ?? entry?.secret_name;
          if (label && TOKEN_TO_SYSUSER[label]) return TOKEN_TO_SYSUSER[label];
        }
      } catch { /* ignore */ }
      // Fallback: nomes AURORA / CA / C0X / 0X| geralmente vivem no system user API
      const n = (p.account_name ?? "").toUpperCase();
      if (/AURORA|C0\d|CA\s|CA\d|GTX|BLACK|HAVEN|SPACE|VM0|MR\b/i.test(n)) {
        return { id: "122098677633369528", label: "API" };
      }
      return { id: null, label: null };
    };

    // 4) Insere/atualiza alertas idempotentes
    type AlertRow = {
      alert_type: "error_200" | "account_orphaned" | "mass_assignment_loss";
      account_id: string | null;
      account_name: string | null;
      system_user_id: string | null;
      system_user_label: string | null;
      affected_count: number;
      details: any;
    };
    const upserts: AlertRow[] = [];

    for (const p of err200) {
      const su = guessSysUser(p);
      upserts.push({
        alert_type: "error_200",
        account_id: p.account_id,
        account_name: p.account_name,
        system_user_id: su.id,
        system_user_label: su.label,
        affected_count: 1,
        details: { last_error: p.last_error, checked_at: p.checked_at },
      });
    }
    for (const p of orphaned) {
      const su = guessSysUser(p);
      upserts.push({
        alert_type: "account_orphaned",
        account_id: p.account_id,
        account_name: p.account_name,
        system_user_id: su.id,
        system_user_label: su.label,
        affected_count: 1,
        details: { last_error: p.last_error, checked_at: p.checked_at },
      });
    }

    // 5) Mass loss: agrupa err200+orphaned por system user
    const bySysUser = new Map<string, { label: string; accounts: string[] }>();
    for (const p of [...err200, ...orphaned]) {
      const su = guessSysUser(p);
      if (!su.id) continue;
      const cur = bySysUser.get(su.id) ?? { label: su.label!, accounts: [] };
      cur.accounts.push(`${p.account_id}${p.account_name ? " (" + p.account_name + ")" : ""}`);
      bySysUser.set(su.id, cur);
    }
    for (const [sysId, info] of bySysUser.entries()) {
      if (info.accounts.length >= 3) {
        upserts.push({
          alert_type: "mass_assignment_loss",
          account_id: null,
          account_name: null,
          system_user_id: sysId,
          system_user_label: info.label,
          affected_count: info.accounts.length,
          details: { accounts: info.accounts.slice(0, 30) },
        });
      }
    }

    // 6) Processa: pega alertas 'open' existentes p/ decidir insert vs. update last_seen
    const { data: openExisting } = await supabase
      .from("meta_permission_alerts")
      .select("id,alert_type,account_id,system_user_id,affected_count")
      .eq("status", "open");
    const existingKey = new Map<string, { id: string; affected_count: number }>();
    for (const e of openExisting ?? []) {
      const k = `${e.alert_type}|${e.account_id ?? ""}|${e.system_user_id ?? ""}`;
      existingKey.set(k, { id: e.id as string, affected_count: e.affected_count as number });
    }

    const newAlerts: AlertRow[] = [];
    const seenKeys = new Set<string>();
    for (const a of upserts) {
      const k = `${a.alert_type}|${a.account_id ?? ""}|${a.system_user_id ?? ""}`;
      if (seenKeys.has(k)) continue;
      seenKeys.add(k);
      const existing = existingKey.get(k);
      if (existing) {
        await supabase.from("meta_permission_alerts")
          .update({
            last_seen_at: new Date().toISOString(),
            affected_count: Math.max(existing.affected_count, a.affected_count),
            details: a.details,
            account_name: a.account_name,
            system_user_label: a.system_user_label,
          })
          .eq("id", existing.id);
      } else {
        newAlerts.push(a);
      }
    }

    let insertedIds: string[] = [];
    if (newAlerts.length > 0) {
      const { data: inserted } = await supabase
        .from("meta_permission_alerts")
        .insert(newAlerts.map((a) => ({ ...a, last_seen_at: new Date().toISOString() })))
        .select("id");
      insertedIds = (inserted ?? []).map((r: any) => r.id);
    }

    // 7) Auto-resolve: alertas 'open' que não apareceram neste ciclo
    const resolvedIds: string[] = [];
    for (const [k, e] of existingKey.entries()) {
      if (!seenKeys.has(k)) {
        await supabase.from("meta_permission_alerts")
          .update({ status: "resolved", resolved_at: new Date().toISOString() })
          .eq("id", e.id);
        resolvedIds.push(e.id);
      }
    }

    // 8) Pushcut ROTEADO POR OPERAÇÃO (isolamento multitenant real)
    // - Busca operation_id de cada account em meta_ad_accounts
    // - Agrupa novos alertas por operação
    // - Envia SOMENTE aos recipients ativos daquela operação (nada de webhook global)
    const pushcutResult: Record<string, any> = {};
    if (newAlerts.length > 0) {
      // Mapa account_id → operation_id
      const acctIds = Array.from(
        new Set(newAlerts.map((a) => a.account_id).filter((x): x is string => !!x)),
      );
      const acctToOp = new Map<string, string | null>();
      if (acctIds.length > 0) {
        const { data: acctRows } = await supabase
          .from("meta_ad_accounts")
          .select("account_id, operation_id")
          .in("account_id", acctIds);
        for (const r of acctRows ?? []) {
          acctToOp.set(r.account_id as string, (r.operation_id as string) ?? null);
        }
      }

      // Agrupa por operação. Mass loss (sem account_id): replica pra cada operação afetada
      // pelo mesmo system user (agrupando as accounts do detalhe).
      const byOp = new Map<string, { err200: AlertRow[]; orph: AlertRow[]; mass: AlertRow[] }>();
      const bucket = (opId: string) => {
        let b = byOp.get(opId);
        if (!b) { b = { err200: [], orph: [], mass: [] }; byOp.set(opId, b); }
        return b;
      };

      for (const a of newAlerts) {
        if (a.alert_type === "mass_assignment_loss") {
          // Extrai account_ids do details.accounts (formato "act_xxx (Nome)")
          const accs: string[] = Array.isArray(a.details?.accounts) ? a.details.accounts : [];
          const opIds = new Set<string>();
          for (const s of accs) {
            const m = /^([\w-]+)/.exec(String(s));
            const accId = m?.[1];
            const opId = accId ? acctToOp.get(accId) : null;
            if (opId) opIds.add(opId);
          }
          if (opIds.size === 0) {
            console.warn(`[watchdog] mass_assignment_loss sem operation_id resolvido — skip`);
            continue;
          }
          for (const opId of opIds) bucket(opId).mass.push(a);
          continue;
        }
        const opId = a.account_id ? acctToOp.get(a.account_id) : null;
        if (!opId) {
          console.warn(`[watchdog] alert sem operation_id (account=${a.account_id}) — skip pra evitar vazamento`);
          continue;
        }
        if (a.alert_type === "error_200") bucket(opId).err200.push(a);
        else if (a.alert_type === "account_orphaned") bucket(opId).orph.push(a);
      }

      // Envia por operação
      for (const [opId, group] of byOp.entries()) {
        const { data: recipients } = await supabase
          .from("notification_recipients")
          .select("id, name, webhook_url, operation_id")
          .eq("operation_id", opId)
          .eq("is_active", true);

        const active = (recipients ?? []).filter((r) => r.webhook_url && r.operation_id === opId);
        if (active.length === 0) {
          console.log(`[watchdog] op=${opId}: nenhum recipient ativo — skip (err200=${group.err200.length} orph=${group.orph.length} mass=${group.mass.length})`);
          pushcutResult[opId] = { skipped: "no_active_recipients" };
          continue;
        }

        let title = "⚠️ Meta: perda de permissão";
        if (group.mass.length > 0) {
          const m = group.mass[0];
          title = `🔴 System user ${m.system_user_label ?? m.system_user_id} perdeu ${m.affected_count} contas`;
        } else if (group.err200.length > 0) {
          title = `🟠 Meta erro (#200) em ${group.err200.length} conta${group.err200.length > 1 ? "s" : ""}`;
        } else if (group.orph.length > 0) {
          title = `🟠 ${group.orph.length} conta${group.orph.length > 1 ? "s" : ""} sumiu do inventário Meta`;
        }

        const lines: string[] = [];
        if (group.mass.length > 0) {
          for (const m of group.mass) {
            lines.push(`🔴 System user ${m.system_user_label ?? m.system_user_id}: ${m.affected_count} contas afetadas`);
            const accs = (m.details?.accounts ?? []).slice(0, 5);
            for (const a of accs) lines.push(`   • ${a}`);
            if (m.affected_count > 5) lines.push(`   +${m.affected_count - 5} outras`);
          }
          lines.push("");
        }
        if (group.err200.length > 0) {
          lines.push(`(#200) grant ads_management: ${group.err200.length}`);
          for (const a of group.err200.slice(0, 3)) {
            lines.push(`   • ${a.account_name ?? a.account_id} → ${a.system_user_label ?? "?"}`);
          }
          if (group.err200.length > 3) lines.push(`   +${group.err200.length - 3} outras`);
          lines.push("");
        }
        if (group.orph.length > 0) {
          lines.push(`Órfãs (sumiram de todos os tokens): ${group.orph.length}`);
          for (const a of group.orph.slice(0, 3)) {
            lines.push(`   • ${a.account_name ?? a.account_id} → ${a.system_user_label ?? "?"}`);
          }
          if (group.orph.length > 3) lines.push(`   +${group.orph.length - 3} outras`);
        }
        lines.push("");
        lines.push("Ação: BM → Users → System Users → reatribuir Ad Accounts com task Manage.");

        const critical = group.mass.length > 0;
        const results: any[] = [];
        for (const r of active) {
          const res = await sendPushcut(r.webhook_url as string, title, lines.join("\n"), critical);
          results.push({ recipient: r.name, ...res });
        }
        pushcutResult[opId] = { sent_to: active.length, results };

        // Canal PARALELO: Web Push
        await mirrorToWebPush({
          operation_id: opId === "global" ? null : opId,
          notification_type: "meta_permission_alert",
          title,
          body: lines.join("\n"),
          url: "/integracoes",
        });

      }

      // Marca notified_at em todos os inseridos se qualquer op teve entrega ok
      const anyOk = Object.values(pushcutResult).some((r: any) => Array.isArray(r?.results) && r.results.some((x: any) => x.ok));
      if (insertedIds.length > 0 && anyOk) {
        await supabase.from("meta_permission_alerts")
          .update({ notified_at: new Date().toISOString() })
          .in("id", insertedIds);
      }
    }

    await supabase.from("integration_logs").insert({
      integration: "meta-permission-watchdog",
      status: "success",
      records_processed: newAlerts.length,
      message: `scanned=${allPerms.length} err200=${err200.length} orphan=${orphaned.length} new=${newAlerts.length} resolved=${resolvedIds.length} pushcut=${JSON.stringify(pushcutResult).slice(0,120)}`.slice(0, 500),
    });

    return new Response(JSON.stringify({
      ok: true,
      scanned: allPerms.length,
      err200: err200.length,
      orphaned: orphaned.length,
      mass_groups: [...bySysUser.entries()].filter(([, v]) => v.accounts.length >= 3).length,
      new_alerts: newAlerts.length,
      resolved_alerts: resolvedIds.length,
      pushcut: pushcutResult,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("[meta-perm-watchdog] FAILED", e);
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
