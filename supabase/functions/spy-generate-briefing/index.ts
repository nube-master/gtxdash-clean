// Spy v2 Phase 7: Briefing Enzo
// Gera um briefing completo em Markdown a partir dos dados da oferta + IA + ads + insights
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { offer_id } = await req.json();
    if (!offer_id) {
      return new Response(JSON.stringify({ ok: false, error: "offer_id obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Carrega oferta + ads ATIVAS + insights + LPs
    const { data: offer, error: offerErr } = await sb
      .from("spy_offers").select("*").eq("id", offer_id).maybeSingle();
    if (offerErr || !offer) {
      return new Response(JSON.stringify({ ok: false, error: "Oferta não encontrada" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: adsData } = await sb
      .from("spy_ads").select("*").eq("offer_id", offer_id).eq("is_active", true)
      .order("created_at", { ascending: false }).limit(30);
    const ads = adsData ?? [];

    const { data: insightsData } = await sb
      .from("spy_ad_insights").select("*").eq("offer_id", offer_id)
      .order("score_persuasao", { ascending: false }).limit(20);
    const insights = insightsData ?? [];

    const { data: lpsData } = await sb
      .from("spy_lps").select("*").eq("offer_id", offer_id).limit(10);
    const lps = lpsData ?? [];

    // Monta contexto pro LLM
    const adsBlock = ads.slice(0, 15).map((a: any, i: number) => {
      const ins = insights.find((x: any) => x.ad_id === a.id);
      return [
        `### Ad ${i + 1}${a.headline ? ` — ${a.headline}` : ""}`,
        a.primary_text ? `Copy: ${a.primary_text.slice(0, 400)}` : "",
        a.cta_text ? `CTA: ${a.cta_text}` : "",
        ins ? `Hook: ${ins.hook_type ?? ""} | Angle: ${ins.angle ?? ""} | Dor: ${ins.pain_point ?? ""} | Gatilho: ${ins.emotional_trigger ?? ""} | Score: ${ins.score_persuasao ?? "?"}` : "",
      ].filter(Boolean).join("\n");
    }).join("\n\n");

    const summary = (offer.copy_intel_summary as any) ?? {};
    const summaryBlock = [
      summary.top_hooks?.length ? `Top hooks: ${summary.top_hooks.join(", ")}` : "",
      summary.top_angles?.length ? `Top angles: ${summary.top_angles.join(", ")}` : "",
      summary.top_triggers?.length ? `Top gatilhos: ${summary.top_triggers.join(", ")}` : "",
      summary.top_audiences?.length ? `Públicos: ${summary.top_audiences.join(", ")}` : "",
      summary.avg_score != null ? `Score médio: ${summary.avg_score}` : "",
    ].filter(Boolean).join("\n");

    const systemPrompt = `Você é um copywriter sênior e estrategista de marketing direto criando um BRIEFING DE PRODUÇÃO completo para o copywriter Enzo. O briefing precisa ser ACIONÁVEL: ele lê e parte pra escrever VSL/anúncios. Escreva em PT-BR, tom direto e estratégico, sem floreios. Use estrutura em Markdown.`;

    const userPrompt = `# Oferta: ${offer.offer_name}
Produto: ${offer.product_name ?? "—"} | Nicho: ${offer.nicho ?? "—"} / ${offer.subnicho ?? "—"} | GEO: ${offer.geo_main ?? "—"} | Idioma: ${offer.idioma ?? "—"}
Anunciante: ${offer.primary_advertiser ?? "—"} | Ads ativos: ${offer.active_ads_count} | Dias rodando: ${offer.days_running_max ?? "—"}
Payout est.: USD ${offer.payout_estimated_usd ?? "—"} | Atributos: ${(offer.atributos ?? []).join(", ") || "—"}

## Análise IA prévia
${offer.ai_summary ?? "—"}
Nichos detectados: ${(offer.ai_niche_tags ?? []).join(", ") || "—"}
Angles detectados: ${(offer.ai_angles ?? []).join(", ") || "—"}

## Padrões agregados de copy
${summaryBlock || "—"}

## LPs rastreadas
${lps.map((l: any) => `- ${l.title ?? l.url} (${l.url})`).join("\n") || "—"}

## Amostra de ads ATIVOS
${adsBlock || "—"}

---

Monte o BRIEFING ENZO com EXATAMENTE estas seções (use ## como heading):

## 1. Promessa Central
Frase de uma linha + 2-3 sub-promessas.

## 2. Mecanismo Único
O "porquê funciona" — explicação curta e original. Liste 3-5 elementos.

## 3. Avatar / Público-Alvo
Idade, perfil, dor primária, dor secundária, gatilhos emocionais dominantes, objeções comuns.

## 4. Ângulos Vencedores
Liste os 3-5 ângulos mais fortes com explicação de quando usar cada.

## 5. Hooks de Abertura (5 opções)
Hooks prontos para abrir VSL/ad, baseados nos padrões detectados.

## 6. Estrutura de VSL recomendada
Esqueleto (Hook → Problema → História → Mecanismo → Prova → Oferta → CTA), com tempo estimado por bloco.

## 7. CTAs e Ofertas Sugeridas
3-5 variações de CTA + estrutura de oferta (preço, bônus, garantia).

## 8. Referências de Criativo
Quais ads ativos copiar/adaptar (cite por número Ad N) e por quê.

## 9. Avisos & Compliance
Pontos de atenção (claims, palavras-gatilho a evitar para a plataforma).

## 10. Plano de Teste Rápido
Como o Enzo deve estruturar os primeiros 3-5 criativos pra validar.`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!aiResp.ok) {
      const txt = await aiResp.text();
      console.error("AI gateway error", aiResp.status, txt);
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ ok: false, error: "Rate limit. Tente novamente em alguns segundos." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResp.status === 402) {
        return new Response(JSON.stringify({ ok: false, error: "Créditos esgotados. Adicione créditos na workspace." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ ok: false, error: "Falha na IA" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiJson = await aiResp.json();
    const briefing: string = aiJson.choices?.[0]?.message?.content ?? "";

    if (!briefing.trim()) {
      return new Response(JSON.stringify({ ok: false, error: "Briefing vazio" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const finalMd = `# Briefing Enzo — ${offer.offer_name}\n_Gerado em ${new Date().toISOString()}_\n\n${briefing}`;

    await sb.from("spy_offers").update({
      briefing_md: finalMd,
      briefing_generated_at: new Date().toISOString(),
    }).eq("id", offer_id);

    return new Response(JSON.stringify({ ok: true, briefing_md: finalMd }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("spy-generate-briefing error", e);
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
