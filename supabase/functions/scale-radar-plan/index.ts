
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { consistentCreatives, weakAccounts, accountNameMap } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const prompt = `Você é um estrategista de mídia paga especialista em Meta Ads.

Analise os dados abaixo e gere um plano de duplicação de criativos.

## Criativos Consistentes (últimos 3 dias):
${JSON.stringify(consistentCreatives, null, 2)}

## Contas Subperformando (ROAS < 1.0):
${JSON.stringify(weakAccounts, null, 2)}

Para cada recomendação, retorne:
- creative: ID do criativo
- targetAccount: nome da conta onde duplicar (use os nomes fornecidos nos dados, não IDs numéricos)
- structure: estrutura recomendada (1-50-1, 1-100-1 ou 1-250-1)
- budget: orçamento diário sugerido em reais
- justification: justificativa objetiva em 1-2 frases
- structure: estrutura recomendada (1-50-1, 1-100-1 ou 1-250-1)
- budget: orçamento diário sugerido em reais
- justification: justificativa objetiva em 1-2 frases

Retorne no máximo 5 recomendações priorizadas por potencial de lucro.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "Você é um analista de performance de Meta Ads. Responda APENAS com o JSON solicitado via tool call." },
          { role: "user", content: prompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "duplication_plan",
              description: "Return duplication recommendations for winning creatives",
              parameters: {
                type: "object",
                properties: {
                  recommendations: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        creative: { type: "string" },
                        targetAccount: { type: "string" },
                        structure: { type: "string" },
                        budget: { type: "string" },
                        justification: { type: "string" },
                      },
                      required: ["creative", "targetAccount", "structure", "budget", "justification"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["recommendations"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "duplication_plan" } },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);

      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit atingido, tente novamente em alguns minutos." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos insuficientes. Adicione créditos ao workspace." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      throw new Error(`AI error: ${response.status}`);
    }

    const aiData = await response.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    let recommendations = [];

    if (toolCall?.function?.arguments) {
      try {
        const parsed = JSON.parse(toolCall.function.arguments);
        recommendations = parsed.recommendations ?? [];
      } catch {
        console.error("Failed to parse tool call arguments");
      }
    }

    return new Response(JSON.stringify({ recommendations }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("scale-radar-plan error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
