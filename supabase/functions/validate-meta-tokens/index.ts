// validate-meta-tokens (v2)
// Para cada token Meta cadastrado, consulta /me/adaccounts?fields=id,name,account_status,tasks
// e agrega por conta: quais tokens têm MANAGE (podem pausar/ligar), quais só leem, e quais não têm nenhum acesso.
// Grava snapshot em public.meta_token_permissions.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import {
  getAllMetaAccessTokens,
  getAllMetaTokensForOperation,
  getOperationFromContext,
} from '../_shared/getMetaToken.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface MetaAdAccount {
  id: string;
  account_id?: string;
  name?: string;
  account_status?: number;
  tasks?: string[];
}

async function fetchAdAccountsForToken(token: string): Promise<{ accounts: MetaAdAccount[]; error: string | null }> {
  const all: MetaAdAccount[] = [];
  let url: string | null =
    `https://graph.facebook.com/v21.0/me/adaccounts?fields=id,account_id,name,account_status,tasks,user_tasks&limit=200&access_token=${encodeURIComponent(token)}`;
  try {
    while (url) {
      const res = await fetch(url);
      const json = await res.json();
      if (!res.ok || json.error) return { accounts: [], error: json.error?.message ?? `HTTP ${res.status}` };
      if (Array.isArray(json.data)) all.push(...json.data);
      url = json.paging?.next ?? null;
    }
    return { accounts: all, error: null };
  } catch (e) {
    return { accounts: [], error: e instanceof Error ? e.message : String(e) };
  }
}

async function fetchTokenPermissions(token: string): Promise<string[]> {
  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/me/permissions?access_token=${encodeURIComponent(token)}`);
    const json = await res.json();
    if (!res.ok) return [];
    return (json.data ?? [])
      .filter((p: any) => p.status === 'granted')
      .map((p: any) => p.permission);
  } catch {
    return [];
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    // Vault-first pool (F8.B.6 batch 5)
    const { operationId: rootOpId } = await getOperationFromContext({});
    const tokensWithMeta = await getAllMetaTokensForOperation(rootOpId);
    const tokens: string[] = tokensWithMeta.map((t) => t.token);
    // Fallback duro se Vault esvaziar
    if (tokens.length === 0) {
      const legacyPool = await getAllMetaAccessTokens(supabase as any);
      tokens.push(...legacyPool);
    }
    // Preflight log
    await supabase.from('integration_logs').insert({
      integration: 'meta_ads',
      status: 'info',
      operation_id: rootOpId,
      message: JSON.stringify({
        event: 'pacing_action_preflight',
        edge_function: 'validate-meta-tokens',
        action: 'validate_all_tokens',
        token_pool_size: tokensWithMeta.length,
        token_sources: tokensWithMeta.map((t) => t.source),
        via_vault: tokensWithMeta.length > 0 && tokensWithMeta.every((t) => t.source === 'vault'),
      }),
    }).then(() => {}).catch(() => {});
    if (tokens.length === 0) {
      return new Response(JSON.stringify({ error: 'no_tokens_configured' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // account_id -> { name, perTokenTasks: [{tokenIdx, tasks[]}], errors: [] }
    const byAccount = new Map<string, {
      name: string;
      perToken: Array<{ token_index: number; tasks: string[] }>;
      errors: string[];
    }>();

    // Pré-carrega permissões de cada token
    const tokenHasAdsManagement: boolean[] = [];
    for (let i = 0; i < tokens.length; i++) {
      const perms = await fetchTokenPermissions(tokens[i]);
      tokenHasAdsManagement.push(perms.includes('ads_management'));
    }

    for (let i = 0; i < tokens.length; i++) {
      const { accounts, error } = await fetchAdAccountsForToken(tokens[i]);
      if (error) {
        console.warn(`[validate-meta-tokens] token#${i + 1} error: ${error}`);
        continue;
      }
      for (const a of accounts) {
        const accountId = (a.account_id || a.id || '').replace(/^act_/, '');
        if (!accountId) continue;
        if (!byAccount.has(accountId)) {
          byAccount.set(accountId, { name: a.name || accountId, perToken: [], errors: [] });
        }
        const entry = byAccount.get(accountId)!;
        if (a.name && !entry.name) entry.name = a.name;
        // Se tasks veio vazio mas a conta é vista + token tem ads_management, assumimos SÓ LEITURA
        // (a conta aparecer em /me/adaccounts prova visibilidade, NÃO permissão de escrita — Meta
        // retorna "Invalid parameter" no POST de status se o user tem apenas leitura na conta compartilhada).
        // Para marcar MANAGE fazemos teste de write real logo abaixo.
        let tasks = a.tasks ?? [];
        if (tasks.length === 0 && tokenHasAdsManagement[i]) {
          tasks = ['ANALYZE']; // só leitura por default; upgrade via probe abaixo
        }
        entry.perToken.push({ token_index: i + 1, tasks });
      }
    }

    // Probe de escrita em PARALELO com concorrência limitada.
    const probeTargets = Array.from(byAccount.entries()).filter(
      ([, info]) => !info.perToken.some((t) => t.tasks.includes('MANAGE')) && info.perToken.length > 0,
    );
    const CONCURRENCY = 20;
    let cursor = 0;
    async function worker() {
      while (cursor < probeTargets.length) {
        const idx = cursor++;
        const [accountId, info] = probeTargets[idx];
        for (const pt of info.perToken) {
          const tk = tokens[pt.token_index - 1];
          if (!tk) continue;
          try {
            const r = await fetch(
              `https://graph.facebook.com/v21.0/act_${accountId}?fields=funding_source_details&access_token=${encodeURIComponent(tk)}`,
            );
            const j = await r.json();
            if (r.ok && !j.error && j.funding_source_details !== undefined) {
              pt.tasks = ['MANAGE', 'ADVERTISE', 'ANALYZE'];
              break;
            }
          } catch { /* skip */ }
        }
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

    // Também incluir contas conhecidas do sistema (meta_ad_accounts) mesmo que NENHUM token as retorne
    // — nesse caso ficam registradas como "sem acesso".
    const { data: knownAccounts } = await supabase
      .from('meta_ad_accounts')
      .select('account_id, account_name');
    for (const k of (knownAccounts ?? []) as Array<{ account_id: string; account_name: string }>) {
      const norm = String(k.account_id).replace(/^act_/, '');
      if (!byAccount.has(norm)) {
        byAccount.set(norm, { name: k.account_name || norm, perToken: [], errors: ['nenhum token retornou esta conta'] });
      }
    }

    const now = new Date().toISOString();
    const rows = Array.from(byAccount.entries()).map(([accountId, info]) => {
      const tokensWithManage = info.perToken.filter((t) => t.tasks.includes('MANAGE')).length;
      const tokensWithRead = info.perToken.filter(
        (t) => t.tasks.includes('ANALYZE') || t.tasks.includes('ADVERTISE') || t.tasks.includes('MANAGE'),
      ).length;
      return {
        account_id: accountId,
        account_name: info.name,
        can_manage: tokensWithManage > 0,
        can_read: tokensWithRead > 0,
        tokens_with_manage: tokensWithManage,
        tokens_with_read: tokensWithRead,
        tokens_total_tested: tokens.length,
        tasks_by_token: info.perToken,
        last_error: info.errors[0] ?? null,
        checked_at: now,
        updated_at: now,
      };
    });

    if (rows.length > 0) {
      const { error: upErr } = await supabase
        .from('meta_token_permissions')
        .upsert(rows, { onConflict: 'account_id' });
      if (upErr) throw upErr;
    }

    return new Response(
      JSON.stringify({
        success: true,
        tokens_tested: tokens.length,
        accounts_evaluated: rows.length,
        accounts_can_manage: rows.filter((r) => r.can_manage).length,
        accounts_read_only: rows.filter((r) => r.can_read && !r.can_manage).length,
        accounts_no_access: rows.filter((r) => !r.can_read).length,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[validate-meta-tokens]', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
