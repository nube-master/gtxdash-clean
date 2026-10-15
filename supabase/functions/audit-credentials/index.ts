// SPDX-License-Identifier: MIT
// TEMPORÁRIA — deletar após F8.B.5
// GET  → audit env vars
// POST → migra credentials pro Vault + operation_credentials (idempotente)
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const GTX_OPERATION_ID = '0b758a2b-1b92-4769-b47b-416c567e320d';

const EXPECTED_ENV_VARS = [
  'META_ADS_ACCESS_TOKEN','META_TOKEN_HU','META_TOKEN_CATALOG','HU_TOKEN_ACCOUNT_IDS',
  'META_GRAPH_VERSION','META_HTTP_TIMEOUT_MS',
  'META_ACCESS_TOKEN_2','META_ACCESS_TOKEN_3','META_ACCESS_TOKEN_4','META_ACCESS_TOKEN_5',
  'META_ACCESS_TOKEN_6','META_ACCESS_TOKEN_7','META_ACCESS_TOKEN_8','META_ACCESS_TOKEN_9','META_ACCESS_TOKEN_10',
  'REDTRACK_API_KEY','CLICKBANK_CLERK_API_KEY','VTURB_API_KEY','VTURB_API_TOKEN',
  'APIFY_API_TOKEN','TODOIST_API_KEY','PUSHCUT_WEBHOOK_URL',
  'SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_ANON_KEY',
  'DASHBOARD_API_KEY','ANTHROPIC_API_KEY','LOVABLE_API_KEY','MCP_APP_BASE_URL',
];

const PROVIDER_MAP: Record<string, { provider: string; profile: string }> = {
  META_ADS_ACCESS_TOKEN: { provider: 'meta_ads', profile: 'default' },
  META_TOKEN_HU:         { provider: 'meta_ads', profile: 'perfil_hu' },
  META_TOKEN_CATALOG:    { provider: 'meta_ads', profile: 'perfil_catalog' },
  META_ACCESS_TOKEN_2:   { provider: 'meta_ads', profile: 'perfil_fallback_2' },
  REDTRACK_API_KEY:      { provider: 'redtrack', profile: 'default' },
  CLICKBANK_CLERK_API_KEY:{ provider: 'clickbank', profile: 'default' },
  VTURB_API_KEY:         { provider: 'vturb', profile: 'default' },
  APIFY_API_TOKEN:       { provider: 'apify', profile: 'default' },
  TODOIST_API_KEY:       { provider: 'todoist', profile: 'default' },
  PUSHCUT_WEBHOOK_URL:   { provider: 'pushcut', profile: 'default' },
};

const CREDS_TO_MIGRATE = [
  { envVar: 'META_ADS_ACCESS_TOKEN',   provider: 'meta_ads',  profile: 'default',           accountIdsFrom: null },
  { envVar: 'META_TOKEN_HU',           provider: 'meta_ads',  profile: 'perfil_hu',         accountIdsFrom: 'HU_TOKEN_ACCOUNT_IDS' },
  { envVar: 'META_TOKEN_CATALOG',      provider: 'meta_ads',  profile: 'perfil_catalog',    accountIdsFrom: null },
  { envVar: 'META_ACCESS_TOKEN_2',     provider: 'meta_ads',  profile: 'perfil_fallback_2', accountIdsFrom: null },
  { envVar: 'REDTRACK_API_KEY',        provider: 'redtrack',  profile: 'default',           accountIdsFrom: null },
  { envVar: 'CLICKBANK_CLERK_API_KEY', provider: 'clickbank', profile: 'default',           accountIdsFrom: null },
  { envVar: 'VTURB_API_KEY',           provider: 'vturb',     profile: 'default',           accountIdsFrom: null },
  { envVar: 'APIFY_API_TOKEN',         provider: 'apify',     profile: 'default',           accountIdsFrom: null },
  { envVar: 'TODOIST_API_KEY',         provider: 'todoist',   profile: 'default',           accountIdsFrom: null },
  { envVar: 'PUSHCUT_WEBHOOK_URL',     provider: 'pushcut',   profile: 'default',           accountIdsFrom: null },
];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      'content-type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-audit-secret',
    },
  });
}

async function isAuthorized(req: Request): Promise<boolean> {
  const authHeader = req.headers.get('authorization') ?? '';
  const auditSecret = req.headers.get('x-audit-secret') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? 'XXX_NEVER_MATCH_SR';
  const sharedSecret = Deno.env.get('AUDIT_CREDENTIALS_SECRET') ?? 'XXX_NEVER_MATCH_AUD';
  if (authHeader.includes(serviceKey)) return true;
  if (auditSecret.length > 0 && auditSecret === sharedSecret) return true;
  if (authHeader.startsWith('Bearer ')) {
    try {
      const jwt = authHeader.replace(/^Bearer\s+/i, '');
      const admin = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey);
      const { data: u } = await admin.auth.getUser(jwt);
      if (u?.user) {
        const { data: sa } = await admin
          .from('super_admins').select('user_id').eq('user_id', u.user.id).maybeSingle();
        if (sa) return true;
      }
    } catch { /* ignore */ }
  }
  return false;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-audit-secret',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      },
    });
  }

  if (!(await isAuthorized(req))) {
    return json({ error: 'unauthorized — service_role, x-audit-secret, or super_admin required' }, 401);
  }

  if (req.method === 'POST') return handleMigrate();
  return handleAudit();
});

async function handleAudit(): Promise<Response> {
  const audit = EXPECTED_ENV_VARS.map((name) => {
    const value = Deno.env.get(name);
    const present = value !== undefined && value !== null && value !== '';
    return {
      name,
      present,
      length: present ? value!.length : 0,
      first_char: present ? value!.charAt(0) : null,
      last_char: present ? value!.charAt(value!.length - 1) : null,
      csv_items: present && value!.includes(',') ? value!.split(',').length : null,
      migration_target: PROVIDER_MAP[name] ?? null,
    };
  });
  const summary = {
    total_expected: EXPECTED_ENV_VARS.length,
    total_present: audit.filter((a) => a.present).length,
    total_missing: audit.filter((a) => !a.present).length,
    to_migrate: audit
      .filter((a) => a.present && a.migration_target)
      .map((a) => ({ name: a.name, provider: a.migration_target!.provider, profile_key: a.migration_target!.profile, length: a.length })),
    missing_expected: audit.filter((a) => !a.present && a.migration_target).map((a) => a.name),
    infra_env_vars: audit.filter((a) => !a.migration_target).map((a) => ({ name: a.name, present: a.present })),
  };
  return json({ audit, summary });
}

async function handleMigrate(): Promise<Response> {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const results: any[] = [];

  for (const cred of CREDS_TO_MIGRATE) {
    results.push(await migrateSingleCredential(supabase, cred));
  }

  const { data: newsbreakRows, error: nbErr } = await supabase
    .from('newsbreak_ad_accounts')
    .select('id, account_id, account_name, operation_id, access_token');
  if (nbErr) {
    results.push({ provider: 'newsbreak', status: 'failed', reason: 'query_error', error: nbErr.message });
  } else {
    for (const nb of newsbreakRows ?? []) {
      results.push(await migrateNewsbreak(supabase, nb));
    }
  }

  const summary = {
    total: results.length,
    created: results.filter((r) => r.status === 'created').length,
    skipped: results.filter((r) => r.status === 'skipped').length,
    failed: results.filter((r) => r.status === 'failed').length,
  };

  await supabase.from('_migration_log').insert({
    phase: 'F8.B.4',
    step: 'migrate_credentials',
    status: summary.failed === 0 ? 'completed' : 'partial',
    completed_at: new Date().toISOString(),
    metadata: { summary, function: 'audit-credentials POST /migrate' },
  });

  return json({ summary, results });
}

async function migrateSingleCredential(supabase: any, cred: any) {
  const { envVar, provider, profile, accountIdsFrom } = cred;
  const value = Deno.env.get(envVar);
  if (!value) return { envVar, provider, profile, status: 'skipped', reason: 'env var not set' };

  const { data: existing } = await supabase
    .from('operation_credentials')
    .select('id')
    .eq('operation_id', GTX_OPERATION_ID)
    .eq('provider', provider)
    .eq('profile_key', profile)
    .maybeSingle();
  if (existing) return { envVar, provider, profile, status: 'skipped', reason: 'already migrated', id: existing.id };

  let accountIds: string[] = [];
  if (accountIdsFrom) {
    const raw = Deno.env.get(accountIdsFrom);
    if (raw) accountIds = raw.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
  }

  const vaultSecretName = `gtx_${provider}_${profile}`;
  const { data: vaultSecretId, error: vaultError } = await supabase.rpc('vault_create_secret_wrapper', {
    secret_value: value,
    secret_name: vaultSecretName,
    secret_description: `${envVar} migrated at ${new Date().toISOString()}`,
  });
  if (vaultError) return { envVar, provider, profile, status: 'failed', reason: 'vault_error', error: vaultError.message };

  const { error: insertError, data: inserted } = await supabase
    .from('operation_credentials')
    .insert({
      operation_id: GTX_OPERATION_ID,
      provider,
      profile_key: profile,
      vault_secret_id: vaultSecretId,
      vault_secret_name: vaultSecretName,
      account_ids: accountIds,
      status: 'active',
      metadata: {
        source: `env_var:${envVar}`,
        migrated_at: new Date().toISOString(),
        migrated_by: 'F8.B.4_audit_credentials_migrate',
        length: value.length,
        account_ids_count: accountIds.length,
      },
    })
    .select('id')
    .single();
  if (insertError) return { envVar, provider, profile, status: 'failed', reason: 'insert_error', error: insertError.message };

  // F9 DIA1B — audit_tool_bypass: log EVERY credential touch to system_logs (forensic trail)
  await supabase.from('system_logs').insert({
    type: 'audit_credentials',
    function_name: 'audit-credentials',
    message: `credential_migrated provider=${provider} profile=${profile}`,
    operation_id: GTX_OPERATION_ID,
    metadata: {
      audit_tool_bypass: true,
      envVar, provider, profile, credential_id: inserted.id,
      vault_secret_name: vaultSecretName,
      account_ids_count: accountIds.length,
      at: new Date().toISOString(),
    },
  });

  return {
    envVar, provider, profile, status: 'created', id: inserted.id,
    vault_secret_name: vaultSecretName, account_ids_count: accountIds.length,
  };
}

async function migrateNewsbreak(supabase: any, nb: any) {
  if (!nb.access_token) return { provider: 'newsbreak', account: nb.account_id, status: 'skipped', reason: 'no token' };

  const profileKey = `newsbreak_${nb.account_id}`;
  const { data: existing } = await supabase
    .from('operation_credentials')
    .select('id')
    .eq('operation_id', nb.operation_id)
    .eq('provider', 'newsbreak')
    .eq('profile_key', profileKey)
    .maybeSingle();
  if (existing) return { provider: 'newsbreak', account: nb.account_id, status: 'skipped', reason: 'already migrated' };

  const vaultSecretName = `newsbreak_${nb.account_id}`;
  const { data: vaultSecretId, error: vaultError } = await supabase.rpc('vault_create_secret_wrapper', {
    secret_value: nb.access_token,
    secret_name: vaultSecretName,
    secret_description: `Newsbreak account ${nb.account_id}`,
  });
  if (vaultError) return { provider: 'newsbreak', account: nb.account_id, status: 'failed', reason: 'vault_error', error: vaultError.message };

  const { error: insertError, data: inserted } = await supabase
    .from('operation_credentials')
    .insert({
      operation_id: nb.operation_id,
      provider: 'newsbreak',
      profile_key: profileKey,
      vault_secret_id: vaultSecretId,
      vault_secret_name: vaultSecretName,
      account_ids: [nb.account_id],
      status: 'active',
      metadata: {
        source: 'newsbreak_ad_accounts.access_token',
        newsbreak_account_id: nb.account_id,
        newsbreak_account_name: nb.account_name,
        ad_account_row_id: nb.id,
        migrated_at: new Date().toISOString(),
        migrated_by: 'F8.B.4_audit_credentials_migrate',
      },
    })
    .select('id')
    .single();
  if (insertError) return { provider: 'newsbreak', account: nb.account_id, status: 'failed', reason: 'insert_error', error: insertError.message };

  // F9 DIA1B — audit_tool_bypass forensic trail
  await supabase.from('system_logs').insert({
    type: 'audit_credentials',
    function_name: 'audit-credentials',
    message: `credential_migrated provider=newsbreak account=${nb.account_id}`,
    operation_id: nb.operation_id,
    metadata: {
      audit_tool_bypass: true,
      provider: 'newsbreak', account_id: nb.account_id,
      credential_id: inserted.id, vault_secret_name: vaultSecretName,
      at: new Date().toISOString(),
    },
  });

  return { provider: 'newsbreak', account: nb.account_id, status: 'created', id: inserted.id };
}
