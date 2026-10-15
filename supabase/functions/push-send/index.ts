import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';
import { isRenderedUsdPulse } from '../_shared/pulse-usd-format.ts';

interface SubRow {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  device_label: string | null;
  created_at: string;
}

interface TemplateRow {
  id: string;
  type: string;
  operation_id: string | null;
  title_template: string;
  body_template: string;
  icon: string | null;
  use_legacy: boolean;
}

/** Interpola {{var}} usando vars; deixa o placeholder quando não houver valor. */
function interpolate(text: string, vars: Record<string, unknown>): string {
  return (text ?? '').replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, key: string) => {
    const v = vars[key];
    if (v === undefined || v === null || v === '') return `{{${key}}}`;
    return String(v);
  });
}

/** Remove segmentos cujo placeholder não foi resolvido (evita " · {{x}}" no push). */
function cleanUnresolved(text: string): string {
  if (!text) return text;
  return text
    // linha inteira que virou só rótulo + placeholder (ex.: "camp: {{utm_campaign}}")
    .split('\n')
    .filter((line) => !/^\s*[^\n{}]{0,24}:\s*\{\{\s*\w+\s*\}\}\s*$/.test(line))
    .join('\n')
    // separadores ( · | • | — | - ) antes/depois de um placeholder órfão
    .replace(/\s*[·•—|-]\s*\{\{\s*\w+\s*\}\}/g, '')
    .replace(/\{\{\s*\w+\s*\}\}\s*[·•—|-]\s*/g, '')
    .replace(/\{\{\s*\w+\s*\}\}/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

function humanizeType(t: string | null): string {

  if (!t) return 'NOTIFICAÇÃO';
  return t.replace(/_/g, ' ').toUpperCase();
}

function summarizePayload(p: Record<string, unknown> | null): string {
  if (!p) return '';
  return Object.entries(p)
    .filter(([k, v]) => v !== null && v !== undefined && v !== '' && k !== 'op')
    .slice(0, 6)
    .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
    .join(' • ');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const publicKey = Deno.env.get('VAPID_PUBLIC_KEY');
    const privateKey = Deno.env.get('VAPID_PRIVATE_KEY');
    const subject = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com';
    if (!publicKey || !privateKey) return json({ error: 'VAPID keys not configured' }, 500);
    webpush.setVapidDetails(subject, publicKey, privateKey);

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const body = await req.json().catch(() => null);
    const operationId: string | null = body?.operation_id ?? null;
    const notificationType: string | null = body?.notification_type ?? null;
    const title: string = body?.title ?? '';
    const message: string = body?.body ?? '';
    const url: string = body?.url ?? '/';
    const extraPayload: Record<string, unknown> | null =
      body?.payload && typeof body.payload === 'object' ? body.payload : null;
    const targetUserIds: string[] | null = Array.isArray(body?.target_user_ids)
      ? body.target_user_ids
      : null;

    if (!title) return json({ error: 'title is required' }, 400);

    // Vendas reais NUNCA podem falhar em silêncio por falta de cadastro exato:
    // caímos para filtros progressivamente mais amplos.
    const isSale = notificationType === 'sale_approved';
    // Venda sem operação nunca é enviada (sem escopo = risco de vazar para todos).
    if (isSale && !operationId && !targetUserIds) {
      console.error('[push-send] sale_approved sem operation_id — bloqueado');
      return json({ ok: true, sent: 0, failed: 0, reason: 'missing_operation_id' });
    }
    const saleKey = isSale
      ? String(extraPayload?.order_id ?? extraPayload?.tracking_id ?? '').trim()
      : '';
    const saleCreatedAt = isSale
      ? String(extraPayload?.sale_created_at ?? '').trim()
      : '';

    // Backfills e reprocessamentos nunca devem acordar o usuário com venda antiga.
    if (saleCreatedAt) {
      const saleTs = Date.parse(saleCreatedAt);
      if (Number.isFinite(saleTs) && Date.now() - saleTs > 10 * 60_000) {
        console.warn('[push-send] sale_approved antiga descartada', { operationId, saleKey, saleCreatedAt });
        return json({ ok: true, sent: 0, failed: 0, reason: 'stale_sale', sale_key: saleKey });
      }
    }

    // Guarda central: writers concorrentes e crons repetidos não reenviam a mesma venda.
    // Nível 1: mesmo order_id (normalizado, sem prefixo "rt:").
    // Nível 2 (semântico): mesma op + mesmo instante da venda + mesmo valor USD,
    //   porque a MESMA venda entra por writers diferentes com IDs diferentes
    //   (ex.: sales_data "rt:<clickid>" vs redtrack_events "<clickid>").
    if (isSale) {
      const dedupeSince = new Date(Date.now() - 10 * 60_000).toISOString();
      const normalizedKey = saleKey.replace(/^rt:/i, '').trim();
      const valorUsd = String(extraPayload?.valor_usd ?? '').trim();

      const scope = (q: any) =>
        operationId ? q.eq('operation_id', operationId) : q.is('operation_id', null);

      const checks: Array<{ reason: string; run: () => Promise<{ data: any[] | null; error: any }> }> = [];

      if (normalizedKey) {
        checks.push({
          reason: 'duplicate_sale:order_id',
          run: () =>
            scope(
              admin
                .from('push_notification_history')
                .select('id, payload')
                .eq('notification_type', 'sale_approved')
                .gte('sent_at', dedupeSince)
                .or(`payload->>order_id.eq.${normalizedKey},payload->>order_id.eq.rt:${normalizedKey}`)
                .limit(1),
            ),
        });
      }

      if (saleCreatedAt && valorUsd) {
        checks.push({
          reason: 'duplicate_sale:semantic',
          run: () =>
            scope(
              admin
                .from('push_notification_history')
                .select('id')
                .eq('notification_type', 'sale_approved')
                .eq('payload->>sale_created_at', saleCreatedAt)
                .eq('payload->>valor_usd', valorUsd)
                .gte('sent_at', dedupeSince)
                .limit(1),
            ),
        });
      }

      for (const check of checks) {
        const { data: duplicateRows, error: duplicateError } = await check.run();
        if (duplicateError) throw new Error(duplicateError.message);
        if ((duplicateRows ?? []).length > 0) {
          console.warn('[push-send] sale_approved duplicada descartada', {
            operationId,
            saleKey,
            saleCreatedAt,
            valorUsd,
            reason: check.reason,
          });
          return json({ ok: true, sent: 0, failed: 0, reason: check.reason, sale_key: saleKey });
        }
      }

      // Claim atômico: o histórico só é gravado APÓS o envio, então writers
      // concorrentes (delta de ~65ms) passariam pelas leituras acima. A PK da
      // push_send_claims garante que só o primeiro segue adiante.
      const claimKeys = [
        normalizedKey ? `sale:${operationId ?? 'null'}:oid:${normalizedKey}` : null,
        saleCreatedAt && valorUsd ? `sale:${operationId ?? 'null'}:sem:${saleCreatedAt}:${valorUsd}` : null,
      ].filter(Boolean) as string[];

      for (const key of claimKeys) {
        const { error: claimError } = await admin
          .from('push_send_claims')
          .insert({ dedupe_key: key });
        if (claimError) {
          if ((claimError as { code?: string }).code === '23505') {
            console.warn('[push-send] sale_approved duplicada (claim)', { operationId, key });
            return json({ ok: true, sent: 0, failed: 0, reason: 'duplicate_sale:claim', sale_key: saleKey });
          }
          console.error('[push-send] falha ao gravar claim', claimError);
        }
      }

      // Housekeeping barato (claims só precisam viver a janela de dedupe).
      admin
        .from('push_send_claims')
        .delete()
        .lt('created_at', new Date(Date.now() - 60 * 60_000).toISOString())
        .then(() => {}, () => {});
    }
    let overrideTemplateId: string | null = null;

    const fetchRecipients = async (opts: { byType: boolean; byOp: boolean }) => {
      let q = admin
        .from('push_notification_recipients')
        .select('user_id, template_id')
        .eq('enabled', true);
      if (opts.byOp && operationId) q = q.eq('operation_id', operationId);
      if (opts.byType && notificationType) q = q.eq('notification_type', notificationType);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      for (const r of data ?? []) {
        if ((r as { template_id?: string | null }).template_id) {
          overrideTemplateId = (r as { template_id: string }).template_id;
        }
      }
      return [...new Set((data ?? []).map((r) => r.user_id as string))];
    };


    // Resolve target users
    let userIds: string[] = targetUserIds ?? [];
    let resolution = targetUserIds ? 'explicit_targets' : 'type+operation';
    if (!targetUserIds) {
      userIds = await fetchRecipients({ byType: true, byOp: true });
      // ISOLAMENTO: nunca buscar destinatários sem filtro de operação
      // (fallback "type_only" vazou venda da ROY GROUP para usuários da FAHTO).
      if (userIds.length === 0 && isSale && operationId) {
        userIds = await fetchRecipients({ byType: false, byOp: true });
        resolution = 'sale_fallback:operation_only';
      }
      // Último nível: NUNCA cair para "qualquer recipient" (vazaria venda de uma
      // operação para usuários de outra). Cai só para admins/owners da própria op.
      if (userIds.length === 0 && isSale && operationId) {
        const { data: admins } = await admin
          .from('operation_members')
          .select('user_id')
          .eq('operation_id', operationId)
          .in('role', ['owner', 'admin']);
        userIds = [...new Set((admins ?? []).map((a) => a.user_id as string))];
        resolution = 'sale_fallback:operation_admins';
      }
    }

    if (userIds.length === 0) {
      if (isSale) console.error('[push-send] sale_approved sem NENHUM recipient cadastrado', { operationId });
      return json({ ok: true, sent: 0, failed: 0, reason: 'no recipients', resolution });
    }

    // A inscrição é um DISPOSITIVO, não um escopo de operação: o filtro por op
    // já aconteceu em push_notification_recipients. Enviamos para TODOS os
    // dispositivos ativos do destinatário. Antes preferíamos as inscrições
    // marcadas com a operação atual, o que fazia um iPhone registrado na FAHTO
    // nunca receber vendas de EDD/GTX (o único device daquela op era o Mac).
    const { data: allSubs, error: subsErr } = await admin
      .from('push_subscriptions')
      .select('id, user_id, endpoint, p256dh, auth, device_label, created_at, operation_id')
      .in('user_id', userIds)
      .eq('enabled', true)
      .is('deleted_at', null);
    if (subsErr) throw new Error(subsErr.message);

    let rows: SubRow[] = ((allSubs ?? []) as SubRow[]).slice();
    resolution += '+subs_all_devices';


    if (rows.length === 0) {
      console.error('[push-send] sem subscription ativa', { notificationType, operationId, userIds });
      return json({ ok: true, sent: 0, failed: 0, reason: 'no subscriptions', resolution });
    }



    // Mantém uma inscrição por endpoint e também a mais recente por usuário+dispositivo.
    // Evita duas inscrições antigas do mesmo PWA entregarem o mesmo push duas vezes.
    rows.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
    const seenEndpoints = new Set<string>();
    const seenDevices = new Set<string>();
    rows = rows.filter((r) => {
      if (seenEndpoints.has(r.endpoint)) return false;
      const deviceKey = r.device_label?.trim() ? `${r.user_id}::${r.device_label.trim()}` : '';
      if (deviceKey && seenDevices.has(deviceKey)) return false;
      seenEndpoints.add(r.endpoint);
      if (deviceKey) seenDevices.add(deviceKey);
      return true;
    });

    // ===== Template Pushcut como fonte de formato =====
    // Vendas mantêm o formato legado; todos os outros tipos usam o template ativo.
    let opRow: { name?: string | null; slug?: string | null } | null = null;
    if (operationId) {
      const { data } = await admin
        .from('operations')
        .select('name, slug')
        .eq('id', operationId)
        .maybeSingle();
      opRow = data ?? null;
    }
    const opLabel = (opRow?.slug || opRow?.name || '').toString().trim();

    let tpl: TemplateRow | null = null;
    if (overrideTemplateId) {
      const { data } = await admin
        .from('notification_templates')
        .select('id, type, operation_id, title_template, body_template, icon, use_legacy')
        .eq('id', overrideTemplateId)
        .maybeSingle();
      tpl = (data as TemplateRow) ?? null;
    }
    if (!tpl && notificationType) {
      const base = admin
        .from('notification_templates')
        .select('id, type, operation_id, title_template, body_template, icon, use_legacy')
        .eq('type', notificationType)
        .eq('is_active', true);
      if (operationId) {
        const { data } = await base.eq('operation_id', operationId).limit(1);
        tpl = ((data ?? [])[0] as TemplateRow) ?? null;
      }
      if (!tpl) {
        const { data } = await admin
          .from('notification_templates')
          .select('id, type, operation_id, title_template, body_template, icon, use_legacy')
          .eq('type', notificationType)
          .eq('is_active', true)
          .is('operation_id', null)
          .limit(1);
        tpl = ((data ?? [])[0] as TemplateRow) ?? null;
      }
    }

    // valor_usd sempre com 2 decimais nos pushes de venda.
    const rawUsd = Number((extraPayload as Record<string, unknown> | null)?.valor_usd);
    const valorUsdFmt = Number.isFinite(rawUsd) ? rawUsd.toFixed(2) : undefined;

    const vars: Record<string, unknown> = {
      ...(extraPayload ?? {}),
      ...(valorUsdFmt ? { valor_usd: valorUsdFmt } : {}),
      op: opLabel,
      op_slug: opRow?.slug ?? opLabel,
      op_name: opRow?.name ?? opLabel,
      title,
      body: message,
    };

    let finalTitle = title;
    let finalBody = message;
    let format: string;

    if (isRenderedUsdPulse(notificationType, extraPayload)) {
      // The producer already rendered the currency and compact report body.
      finalTitle = title;
      finalBody = message;
      format = 'rendered_usd_pulse';
    } else if (tpl && !(isSale && tpl.use_legacy)) {
      finalTitle = interpolate(tpl.title_template || title, vars) || title;
      finalBody = interpolate(tpl.body_template || message, vars) || message;
      format = `template:${tpl.id}`;
    } else if (isSale) {
      // Legado: interpola o que o writer mandou (ex.: "from {{op_name}}")
      finalTitle = interpolate(title, vars) || title;
      finalBody = interpolate(message, vars) || message;
      format = 'legacy_sale';
    } else {

      finalTitle = `${humanizeType(notificationType)}${opLabel ? ` — ${opLabel}` : ''}`;
      finalBody = message || summarizePayload(extraPayload) || humanizeType(notificationType);
      format = 'fallback_no_template';
      console.warn('[push-send] template ausente', { notificationType, operationId });
      await admin.from('push_notification_history').insert({
        user_id: null,
        operation_id: operationId,
        notification_type: notificationType,
        title: finalTitle,
        body: finalBody,
        payload: { reason: 'missing_template', url, ...(extraPayload ?? {}) },
        status: 'missing_template',
      });
    }

    // Placeholders sem valor não vazam pro usuário: removem o próprio segmento.
    finalTitle = cleanUnresolved(finalTitle);
    finalBody = cleanUnresolved(finalBody);
    // Venda sem valor resolvido não vai com body vazio/quebrado.
    if (isSale && (!finalBody || !valorUsdFmt)) finalBody = '(payload incompleto)';



    const payload = JSON.stringify({
      title: finalTitle,
      body: finalBody,
      url,
      type: notificationType,
      ...(tpl?.icon ? { icon: tpl.icon, badge: tpl.icon } : {}),
      ...(extraPayload ?? {}),
    });
    let sent = 0;
    let failed = 0;
    const history: Record<string, unknown>[] = [];

    for (const s of rows) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
        );
        sent++;
        history.push({
          user_id: s.user_id,
          operation_id: operationId,
          notification_type: notificationType,
          title: finalTitle,
          body: finalBody,
          payload: { url, ...(extraPayload ?? {}) },
          status: 'sent',
        });
        await admin
          .from('push_subscriptions')
          .update({ last_used_at: new Date().toISOString() })
          .eq('id', s.id);
      } catch (err) {
        failed++;
        const statusCode = (err as { statusCode?: number })?.statusCode;
        const expired = statusCode === 404 || statusCode === 410;
        if (expired) {
          await admin.from('push_subscriptions').update({ enabled: false }).eq('id', s.id);
        }
        history.push({
          user_id: s.user_id,
          operation_id: operationId,
          notification_type: notificationType,
          title: finalTitle,
          body: finalBody,
          payload: { url, ...(extraPayload ?? {}) },
          status: expired ? 'expired' : 'failed',
          error: String((err as Error)?.message ?? err).slice(0, 500),
        });
      }
    }

    if (history.length > 0) {
      await admin.from('push_notification_history').insert(history);
    }

    return json({ ok: true, sent, failed, total: rows.length, resolution, format, template_id: tpl?.id ?? null });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
