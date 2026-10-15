
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `Você é a GTX META IA™.

Sua função é analisar campanhas de tráfego pago com base no framework proprietário GTX:
- 1-50-1 = Teste
- 1-100-1 = Pré-escala
- 1-250-1 = Escala

REGRA DE SEGURANÇA ABSOLUTA:
⚠️ NUNCA recomendar PAUSAR uma campanha com lucro positivo (revenue > spend). Se a campanha está lucrativa, ela DEVE continuar rodando.

REGRAS DE DECISÃO:

## Teste (1-50-1):
- 2+ vendas no período → ESCALAR (promover imediatamente)
- 1 venda + ROAS >= 1.30 → ESCALAR (promover para 1-100-1)
- 1 venda + lucro positivo → MONITORAR
- 0 vendas + investimento > R$100 + prejuízo → PAUSAR
- Sem dados suficientes → MONITORAR

## Pré-escala (1-100-1):
- ROAS >= 1.30 por 2+ dias → ESCALAR (promover para 1-250-1)
- Lucro positivo + ROAS >= 1.0 → MONITORAR
- ROAS < 1.0 por 2+ dias + prejuízo → PAUSAR
- Performance instável → AJUSTAR

## Escala (1-250-1):
- ROAS >= 1.30 consistente → ESCALAR (aumentar orçamento)
- Lucro positivo → MONITORAR (manter posição)
- 2 dias negativos + prejuízo → REDUZIR
- 3 dias negativos + prejuízo → PAUSAR

## Criativo fraco em múltiplas campanhas:
- Se o mesmo criativo tem ROAS < 0.8 em 3+ campanhas → MATAR_CRIATIVO

DECISÕES POSSÍVEIS (use EXATAMENTE estes valores):
- ESCALAR (apenas ESCALA: replicar estrutura)
- PROMOVER (TESTE→PRÉ ou PRÉ→ESCALA)
- MONITORAR
- REDUZIR
- CORTAR

INSTRUÇÕES:
- Analise TODAS as campanhas recebidas
- Use dados dos últimos 3 dias quando disponíveis
- PRIORIZE O LUCRO sobre o ROAS. Campanha lucrativa = campanha boa.
- Não explique demais. Motivo curto (max 15 palavras).

Retorne APENAS um JSON array com objetos contendo:
{ "campaign_name": string, "fase": string, "decisao": string, "motivo_curto": string, "acao_recomendada": string }`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { campaigns } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // Build compact campaign summary for AI
    const summary = (campaigns || []).map((c: any) => ({
      campaign: c.displayName?.substring(0, 80) || c.fullName?.substring(0, 80),
      fase: c.phase,
      spend: Math.round(c.spend),
      revenue: Math.round(c.revenue),
      roas: Number(c.roas?.toFixed(2)),
      profit: Math.round(c.profit),
      vendas: c.salesConfirmed,
      vendas_3d: c.sales3D,
      dias_com_venda: c.daysWithSale,
      consistencia: c.consistency3D,
      score: c.scoreGtx,
      criativo: c.creativeId,
      status: c.status,
    }));

    const userPrompt = `Analise estas ${summary.length} campanhas e retorne o JSON com decisões:\n\n${JSON.stringify(summary, null, 1)}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit excedido. Tente novamente em alguns segundos." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "Créditos insuficientes. Adicione créditos ao workspace." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const text = await response.text();
      console.error("AI gateway error:", status, text);
      return new Response(JSON.stringify({ error: "Erro no gateway de IA" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "[]";

    // Extract JSON from response (may be wrapped in markdown)
    let jsonStr = content;
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) jsonStr = jsonMatch[1].trim();

    let decisions;
    try {
      decisions = JSON.parse(jsonStr);
    } catch {
      console.error("Failed to parse AI response:", content);
      decisions = [];
    }

    return new Response(JSON.stringify({ decisions }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("gtx-ai-analyze error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
