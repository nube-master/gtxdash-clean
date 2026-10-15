import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const META_API = "https://graph.facebook.com/v21.0";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Auth: require authenticated user
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const authClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: claimsData, error: claimsErr } = await authClient.auth.getClaims(authHeader.replace("Bearer ", ""));
  if (claimsErr || !claimsData?.claims) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Get operation_id from query params or body
  let operationId: string | null = null;
  const url = new URL(req.url);
  operationId = url.searchParams.get("operation_id");
  if (!operationId && req.method === "POST") {
    try {
      const body = await req.json();
      operationId = body.operation_id || null;
    } catch {}
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // NOTE: não damos early-return quando a operação não tem contas salvas.
    // Esse era um bug: o botão "Buscar Contas" precisa descobrir as contas
    // novas dos tokens recém-adicionados justamente quando a operação ainda
    // está vazia. Descobrimos sempre via Meta API e listamos como "NOVA".

    const { getAllMetaTokensForOperation, getOperationFromContext } = await import("../_shared/getMetaToken.ts");
    const { operationId: resolvedOpId, source: opSource } = await getOperationFromContext({
      explicitOperationId: operationId ?? undefined,
    });
    const tokensWithMeta = await getAllMetaTokensForOperation(resolvedOpId);
    const accessTokens = tokensWithMeta.map((t) => t.token);
    console.log("[list-meta-accounts] tokens resolved", {
      operation_id: resolvedOpId,
      op_source: opSource,
      count: tokensWithMeta.length,
      sources: tokensWithMeta.map((t) => t.source),
      profiles: tokensWithMeta.map((t) => t.profile_key),
    });
    if (accessTokens.length === 0) {
      // Nenhum token configurado para esta operação — retorna vazio (não é erro).
      // A UI deve orientar o usuário a configurar um token Meta.
      return new Response(
        JSON.stringify({
          accounts: [],
          total: 0,
          operation_id: resolvedOpId,
          needs_token: true,
          message: "Nenhum token Meta configurado para esta operação. Configure um token para listar as contas.",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }


    // Fetch ALL ad accounts from Meta — múltiplas fontes + múltiplos tokens
    // pra cobrir tudo. Cada token (user pessoal, system user, etc.) pode ver
    // BMs/contas diferentes; mergeamos tudo via Map por id.
    type MetaAcc = {
      id: string;
      name: string;
      account_status: number;
      currency?: string;
      timezone_name?: string;
    };
    const seen = new Map<string, MetaAcc>();

    async function pullPaged(url: string, source: string) {
      let next: string | null = url;
      let pages = 0;
      while (next) {
        const res: Response = await fetch(next);
        if (!res.ok) {
          const err = await res.text();
          console.warn(`[list-meta-accounts] ${source} falhou: ${err.slice(0, 200)}`);
          return;
        }
        const json: any = await res.json();
        if (Array.isArray(json.data)) {
          for (const a of json.data as MetaAcc[]) {
            if (a?.id && !seen.has(a.id)) seen.set(a.id, a);
          }
        }
        next = json.paging?.next || null;
        if (++pages > 50) break; // safety
      }
    }

    const fields = "id,name,account_status,currency,timezone_name";
    const warnings: string[] = [];
    let totalBms = 0;

    for (let i = 0; i < accessTokens.length; i++) {
      const accessToken = accessTokens[i];
      const tokenLabel = `token#${i + 1}`;
      const beforeCount = seen.size;

      // 1) Contas atribuídas direto ao usuário do token
      await pullPaged(
        `${META_API}/me/adaccounts?fields=${fields}&limit=500&access_token=${accessToken}`,
        `${tokenLabel}:me/adaccounts`
      );

      // 2) BMs visíveis por esse token + contas owned/client de cada
      try {
        let bmsUrl: string | null = `${META_API}/me/businesses?fields=id,name&limit=200&access_token=${accessToken}`;
        const businesses: Array<{ id: string; name: string }> = [];
        while (bmsUrl) {
          const r = await fetch(bmsUrl);
          if (!r.ok) {
            const errBody = await r.text();
            const errMsg = `${tokenLabel}:me/businesses HTTP ${r.status}: ${errBody.slice(0, 200)}`;
            console.warn(`[list-meta-accounts] ${errMsg}`);
            warnings.push(errMsg);
            break;
          }
          const j: any = await r.json();
          if (Array.isArray(j.data)) businesses.push(...j.data);
          bmsUrl = j.paging?.next || null;
        }
        totalBms += businesses.length;
        console.log(`[list-meta-accounts] ${tokenLabel} → ${businesses.length} BMs`);

        await Promise.all(
          businesses.flatMap((bm) => [
            pullPaged(
              `${META_API}/${bm.id}/owned_ad_accounts?fields=${fields}&limit=500&access_token=${accessToken}`,
              `${tokenLabel}:bm:${bm.id}/owned`
            ),
            pullPaged(
              `${META_API}/${bm.id}/client_ad_accounts?fields=${fields}&limit=500&access_token=${accessToken}`,
              `${tokenLabel}:bm:${bm.id}/client`
            ),
          ])
        );
      } catch (e) {
        const errMsg = `${tokenLabel} BM iteration error: ${e instanceof Error ? e.message : String(e)}`;
        console.warn(`[list-meta-accounts] ${errMsg}`);
        warnings.push(errMsg);
      }

      const added = seen.size - beforeCount;
      console.log(`[list-meta-accounts] ${tokenLabel} adicionou ${added} contas novas (total: ${seen.size})`);
    }

    const metaAccounts = Array.from(seen.values());
    console.log(`Fetched ${metaAccounts.length} unique accounts from ${accessTokens.length} tokens / ${totalBms} BMs`);
    const bmWarning = warnings.length > 0 ? warnings.join(" | ") : null;

    // Get saved accounts from DB - filter by operation_id
    let query = supabase
      .from("meta_ad_accounts")
      .select("account_id, account_name, is_active, category, currency, timezone, operation_id");

    if (operationId) {
      query = query.eq("operation_id", operationId);
    }

    const { data: savedAccounts } = await query;

    type SavedRow = {
      account_id: string;
      account_name: string | null;
      is_active: boolean;
      category: string | null;
      currency: string | null;
      timezone: string | null;
    };
    // BUGFIX: o banco guarda account_id COM prefixo `act_` (constraint
    // meta_ad_accounts_account_id_format_check). Antes comparávamos o id do
    // Meta já sem prefixo contra as chaves com prefixo → is_saved sempre false
    // e TODA conta antiga aparecia com badge "NOVA". Normalizamos os dois lados.
    const stripAct = (id: string) => String(id || "").replace(/^act_/, "");
    const savedMap = new Map<string, SavedRow>();
    for (const sa of (savedAccounts || []) as SavedRow[]) {
      savedMap.set(stripAct(sa.account_id), sa);
    }

    // Merge: TODAS as contas que a Meta retornou + TODAS as salvas que nenhum
    // token está enxergando agora (token expirado, BM caiu, permissão revogada).
    const returnedIds = new Set<string>();
    const accounts = metaAccounts.map((a) => {
      const cleanId = stripAct(a.id);
      returnedIds.add(cleanId);
      const saved = savedMap.get(cleanId);
      return {
        // Devolvemos no formato canônico do banco (`act_...`) para que o
        // upsert da UI não viole a constraint e não crie linha duplicada.
        account_id: `act_${cleanId}`,
        account_name: a.name,
        account_status: a.account_status,
        currency: a.currency || saved?.currency || "",
        timezone: a.timezone_name || saved?.timezone || "America/Sao_Paulo",
        is_active: saved ? saved.is_active : false,
        is_saved: !!saved,
        category: saved?.category || "own",
        not_visible_via_token: false,
      };
    });

    for (const [id, saved] of savedMap) {
      if (returnedIds.has(id)) continue;
      accounts.push({
        account_id: `act_${id}`,
        account_name: saved.account_name || `act_${id}`,
        account_status: 0, // desconhecido — nenhum token consegue ler
        currency: saved.currency || "",
        timezone: saved.timezone || "America/Sao_Paulo",
        is_active: saved.is_active,
        is_saved: true,
        category: saved.category || "own",
        not_visible_via_token: true,
      });
    }


    const hiddenCount = accounts.filter((a) => a.not_visible_via_token).length;
    console.log(
      `[list-meta-accounts] retornando ${accounts.length} contas ` +
      `(${metaAccounts.length} visíveis via token, ${hiddenCount} salvas mas invisíveis)`
    );

    return new Response(JSON.stringify({ accounts, bm_warning: bmWarning, hidden_count: hiddenCount }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
