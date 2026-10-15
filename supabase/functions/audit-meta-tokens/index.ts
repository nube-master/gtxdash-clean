// audit-meta-tokens
// Retorna, por token Meta cadastrado, o system user, escopos concedidos
// (ads_read/ads_management/business_management/...) e a lista de ad accounts
// que o token consegue enxergar com as tasks correspondentes.
//
// Uso: chamado pela página /super-admin/audit-tokens (super admin only).
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

interface AdAccount {
  account_id: string;
  name: string;
  account_status: number | null;
  tasks: string[];
}

interface TokenAudit {
  token_index: number;
  profile_key: string;
  source: string;
  token_preview: string;
  system_user: {
    id: string | null;
    name: string | null;
    type: string | null;
    app_id: string | null;
    app_name: string | null;
    is_valid: boolean;
    expires_at: number | null;
    data_access_expires_at: number | null;
  };
  scopes: string[];
  scopes_summary: {
    ads_read: boolean;
    ads_management: boolean;
    business_management: boolean;
    pages_read_engagement: boolean;
  };
  accounts: AdAccount[];
  accounts_count: number;
  error: string | null;
}

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url);
  return await res.json();
}

async function fetchDebugToken(token: string): Promise<any> {
  // debug_token needs an app access token; using the same token works when it
  // has the app-level scope. For system users the same token is accepted.
  const j = await fetchJson(
    `https://graph.facebook.com/v21.0/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(token)}`,
  );
  return j?.data ?? null;
}

async function fetchMe(token: string): Promise<any> {
  return await fetchJson(
    `https://graph.facebook.com/v21.0/me?fields=id,name&access_token=${encodeURIComponent(token)}`,
  );
}

async function fetchPermissions(token: string): Promise<string[]> {
  const j = await fetchJson(
    `https://graph.facebook.com/v21.0/me/permissions?access_token=${encodeURIComponent(token)}`,
  );
  if (!Array.isArray(j?.data)) return [];
  return j.data.filter((p: any) => p.status === 'granted').map((p: any) => p.permission);
}

async function fetchAdAccounts(token: string): Promise<{ accounts: AdAccount[]; error: string | null }> {
  const all: AdAccount[] = [];
  let url: string | null =
    `https://graph.facebook.com/v21.0/me/adaccounts?fields=id,account_id,name,account_status,tasks&limit=200&access_token=${encodeURIComponent(token)}`;
  try {
    while (url) {
      const j: any = await fetchJson(url);
      if (j?.error) return { accounts: [], error: j.error.message ?? 'graph error' };
      if (Array.isArray(j?.data)) {
        for (const a of j.data) {
          const id = a.id || (a.account_id ? `act_${a.account_id}` : null);
          if (!id) continue;
          all.push({
            account_id: id,
            name: a.name ?? id,
            account_status: typeof a.account_status === 'number' ? a.account_status : null,
            tasks: Array.isArray(a.tasks) ? a.tasks : [],
          });
        }
      }
      url = j?.paging?.next ?? null;
    }
    return { accounts: all, error: null };
  } catch (e) {
    return { accounts: [], error: e instanceof Error ? e.message : String(e) };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    // Guard: super admin only
    const authHeader = req.headers.get('Authorization') ?? '';
    const jwt = authHeader.replace(/^Bearer\s+/i, '');
    if (!jwt) {
      return new Response(JSON.stringify({ error: 'unauthenticated' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { data: userRes } = await supabase.auth.getUser(jwt);
    const userId = userRes?.user?.id;
    if (!userId) {
      return new Response(JSON.stringify({ error: 'unauthenticated' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { data: sa } = await supabase
      .from('super_admins')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle();
    if (!sa) {
      return new Response(JSON.stringify({ error: 'forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Token pool (Vault-first, legacy fallback)
    const { operationId: rootOpId } = await getOperationFromContext({});
    const tokensWithMeta = await getAllMetaTokensForOperation(rootOpId);
    let entries = tokensWithMeta.map((t) => ({
      token: t.token,
      profile_key: t.profile_key,
      source: t.source as string,
    }));
    if (entries.length === 0) {
      const legacy = await getAllMetaAccessTokens(supabase as any);
      entries = legacy.map((t) => ({ token: t, profile_key: 'legacy', source: 'legacy_env' }));
    }

    const audits: TokenAudit[] = [];
    for (let i = 0; i < entries.length; i++) {
      const { token, profile_key, source } = entries[i];
      const [debug, me, perms, accountsRes] = await Promise.all([
        fetchDebugToken(token).catch(() => null),
        fetchMe(token).catch(() => null),
        fetchPermissions(token).catch(() => []),
        fetchAdAccounts(token),
      ]);

      const scopes: string[] = Array.isArray(debug?.scopes) ? debug.scopes : perms;
      const audit: TokenAudit = {
        token_index: i + 1,
        profile_key,
        source,
        token_preview: `${token.slice(0, 8)}…${token.slice(-6)}`,
        system_user: {
          id: debug?.user_id ?? me?.id ?? null,
          name: me?.name ?? null,
          type: debug?.type ?? null,
          app_id: debug?.app_id ?? null,
          app_name: debug?.application ?? null,
          is_valid: debug?.is_valid ?? (!!me?.id),
          expires_at: debug?.expires_at ?? null,
          data_access_expires_at: debug?.data_access_expires_at ?? null,
        },
        scopes,
        scopes_summary: {
          ads_read: scopes.includes('ads_read'),
          ads_management: scopes.includes('ads_management'),
          business_management: scopes.includes('business_management'),
          pages_read_engagement: scopes.includes('pages_read_engagement'),
        },
        accounts: accountsRes.accounts,
        accounts_count: accountsRes.accounts.length,
        error: accountsRes.error,
      };
      audits.push(audit);
    }

    // Cross-reference: which system accounts each token is missing
    // Only consider ACTIVE accounts — inactive/disabled ones being absent is expected.
    const { data: knownAccounts } = await supabase
      .from('meta_ad_accounts')
      .select('account_id, account_name, is_active');
    const known = (knownAccounts ?? []) as Array<{ account_id: string; account_name: string; is_active: boolean }>;
    const activeKnown = known.filter((k) => k.is_active);

    // Universe seen by AT LEAST one token (active accounts only)
    const seenByAnyToken = new Set<string>();
    for (const a of audits) {
      for (const acc of a.accounts) seenByAnyToken.add(acc.account_id);
    }
    const orphanedActive = activeKnown.filter(
      (k) => !seenByAnyToken.has(String(k.account_id).startsWith("act_") ? String(k.account_id) : `act_${k.account_id}`),
    );

    const perTokenCoverage = audits.map((a) => {
      const visible = new Set(a.accounts.map((x) => x.account_id));
      // "missing" = active accounts other tokens see but this one doesn't
      const missingFromThisToken = activeKnown.filter(
        (k) => !visible.has(String(k.account_id).startsWith("act_") ? String(k.account_id) : `act_${k.account_id}`) && seenByAnyToken.has(String(k.account_id).startsWith("act_") ? String(k.account_id) : `act_${k.account_id}`),
      ).length;
      const manage = a.accounts.filter((x) => x.tasks.includes('MANAGE')).length;
      const anyTask = a.accounts.filter((x) => x.tasks.length > 0).length;
      return {
        token_index: a.token_index,
        total_visible: a.accounts.length,
        can_manage: manage,
        read_only: anyTask - manage,
        // active accounts this token could theoretically see (others do) but doesn't
        missing_active_accounts: missingFromThisToken,
      };
    });


    return new Response(
      JSON.stringify({
        success: true,
        generated_at: new Date().toISOString(),
        tokens_total: audits.length,
        known_accounts_total: known.length,
        known_accounts_active: activeKnown.length,
        orphaned_active_accounts: orphanedActive.map((k) => ({
          account_id: k.account_id, account_name: k.account_name,
        })),
        tokens: audits,
        coverage: perTokenCoverage,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[audit-meta-tokens]', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
