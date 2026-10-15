// Spy v2 Phase 3: Copywriter Intelligence
// Analisa ads ATIVAS de uma oferta via Lovable AI (Gemini Flash) e gera insights de copy
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

const ANALYSIS_TOOL = {
  type: "function",
  function: {
    name: "analyze_ad_copy",
    description: "Extrai elementos de copywriting persuasivo do anúncio.",
    parameters: {
      type: "object",
      properties: {
        hook_type: { type: "string", description: "Tipo do gancho: pergunta, choque, prova_social, curiosidade, autoridade, dor, promessa, historia, urgencia, transformacao" },
        hook_text: { type: "string", description: "Frase exata do gancho (primeiras 1-2 linhas)" },
        angle: { type: "string", description: "Angle principal em 1 frase curta em PT-BR (ex: 'método natural sem remédio')" },
        promise: { type: "string", description: "Promessa central em PT-BR" },
        pain_point: { type: "string", description: "Dor/problema explorado em PT-BR" },
        cta_style: { type: "string", description: "Estilo do CTA: urgencia, curiosidade, beneficio, prova, escassez, soft" },
        emotional_trigger: { type: "string", description: "Gatilho emocional dominante: medo, esperanca, raiva, vergonha, orgulho, alivio, ganancia, pertencimento" },
        target_audience: { type: "string", description: "Público-alvo inferido em PT-BR (idade/perfil)" },
        score_persuasao: { type: "integer", description: "Nota 0-100 de força persuasiva do copy" },
      },
      required: ["hook_type", "angle", "pain_point", "cta_style", "emotional_trigger", "score_persuasao"],
      additionalProperties: false,
    },
  },
};

async function analyzeAd(ad: any): Promise<any | null> {
  const copy = [
    ad.primary_text ? `TEXTO: ${ad.primary_text}` : "",
    ad.headline ? `TITULO: ${ad.headline}` : "",
    ad.description ? `DESCRICAO: ${ad.description}` : "",
    ad.cta_text ? `CTA: ${ad.cta_text}` : "",
  ].filter(Boolean).join("\n");

  if (!copy.trim()) return null;

  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: "Você é um copywriter sênior brasileiro. Analise anúncios de Facebook em qualquer idioma e devolva insights estruturados SEMPRE em português do Brasil (PT-BR). Seja conciso e direto." },
        { role: "user", content: `Analise este anúncio de Facebook Ads:\n\n${copy}` },
      ],
      tools: [ANALYSIS_TOOL],
      tool_choice: { type: "function", function: { name: "analyze_ad_copy" } },
    }),
  });

  if (!resp.ok) {
    const t = await resp.text();
    console.error("AI gateway error", resp.status, t.slice(0, 200));
    if (resp.status === 429 || resp.status === 402) throw new Error(`ai_${resp.status}`);
    return null;
  }

  const data = await resp.json();
  const call = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!call?.function?.arguments) return null;
  try {
    return JSON.parse(call.function.arguments);
  } catch {
    return null;
  }
}

function summarize(insights: any[]): any {
  const tally = (key: string) => {
    const map = new Map<string, number>();
    for (const i of insights) {
      const v = i?.[key];
      if (!v) continue;
      map.set(v, (map.get(v) || 0) + 1);
    }
    return [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([value, count]) => ({ value, count }));
  };

  const scores = insights.map((i) => i?.score_persuasao).filter((n) => typeof n === "number");
  const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;

  return {
    total_analyzed: insights.length,
    top_hooks: tally("hook_type"),
    top_angles: tally("angle"),
    top_pains: tally("pain_point"),
    top_ctas: tally("cta_style"),
    top_triggers: tally("emotional_trigger"),
    top_audiences: tally("target_audience"),
    avg_score: avg,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { offer_id, force = false } = await req.json();
    if (!offer_id) {
      return new Response(JSON.stringify({ error: "offer_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supa = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: offer, error: offerErr } = await supa
      .from("spy_offers")
      .select("id, operation_id")
      .eq("id", offer_id)
      .maybeSingle();
    if (offerErr || !offer) throw new Error("offer not found");

    // ATIVAS apenas
    const { data: ads } = await supa
      .from("spy_ads")
      .select("id, primary_text, headline, description, cta_text")
      .eq("offer_id", offer_id)
      .eq("ad_active_status", "active")
      .limit(50);

    const adList = ads || [];
    if (adList.length === 0) {
      return new Response(JSON.stringify({ ok: true, analyzed: 0, message: "no active ads" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Pula ads já analisadas (a menos que force)
    let pending = adList;
    if (!force) {
      const { data: existing } = await supa
        .from("spy_ad_insights")
        .select("ad_id")
        .in("ad_id", adList.map((a) => a.id));
      const done = new Set((existing || []).map((e) => e.ad_id));
      pending = adList.filter((a) => !done.has(a.id));
    }

    console.log(`[spy-analyze-copy] offer=${offer_id} active=${adList.length} pending=${pending.length}`);

    let analyzed = 0;
    for (const ad of pending) {
      try {
        const insight = await analyzeAd(ad);
        if (!insight) continue;
        await supa.from("spy_ad_insights").upsert({
          ad_id: ad.id,
          offer_id,
          operation_id: offer.operation_id,
          hook_type: insight.hook_type,
          hook_text: insight.hook_text || null,
          angle: insight.angle || null,
          promise: insight.promise || null,
          pain_point: insight.pain_point || null,
          cta_style: insight.cta_style || null,
          emotional_trigger: insight.emotional_trigger || null,
          target_audience: insight.target_audience || null,
          score_persuasao: insight.score_persuasao ?? null,
          raw_analysis: insight,
          analyzed_at: new Date().toISOString(),
        }, { onConflict: "ad_id" });
        analyzed++;
      } catch (e: any) {
        if (String(e?.message || "").startsWith("ai_")) {
          console.warn("AI limit reached, stopping batch");
          break;
        }
        console.error("ad analyze error", ad.id, e);
      }
    }

    // Reagrega summary sobre TODAS as insights ativas
    const { data: allInsights } = await supa
      .from("spy_ad_insights")
      .select("hook_type, angle, pain_point, cta_style, emotional_trigger, target_audience, score_persuasao")
      .eq("offer_id", offer_id);

    const summary = summarize(allInsights || []);

    await supa
      .from("spy_offers")
      .update({
        copy_intel_summary: summary,
        copy_intel_analyzed_at: new Date().toISOString(),
      })
      .eq("id", offer_id);

    return new Response(JSON.stringify({ ok: true, analyzed, total_insights: (allInsights || []).length, summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("spy-analyze-copy fatal", e);
    return new Response(JSON.stringify({ error: e?.message || "unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
