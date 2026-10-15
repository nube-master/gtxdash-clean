import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/** Call dashboard-totals edge function for authoritative metrics */
async function fetchDashboardTotals(start: string, end: string): Promise<any> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  try {
    const resp = await fetch(
      `${supabaseUrl}/functions/v1/dashboard-totals?start=${start}&end=${end}&force_live=true`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          "Content-Type": "application/json",
        },
      }
    );
    if (!resp.ok) {
      console.error("[analyst-chat] dashboard-totals error:", resp.status);
      return null;
    }
    return await resp.json();
  } catch (e) {
    console.error("[analyst-chat] dashboard-totals fetch failed:", e);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const { messages, user_name } = await req.json();
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");

    const userName = user_name || "Vidal";

    // ── Date setup (always Brazil UTC-3) ──
    const now = new Date();
    const brazilOffset = -3 * 60;
    const brazilTime = new Date(now.getTime() + brazilOffset * 60 * 1000);
    const todayStr = brazilTime.toISOString().split('T')[0];
    const monthStart = `${todayStr.substring(0, 7)}-01`;
    const yesterdayDate = new Date(brazilTime);
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterdayStr = yesterdayDate.toISOString().split('T')[0];
    const sevenDaysAgo = new Date(brazilTime);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];

    // ── Fetch ALL data in parallel ──
    const [
      todayTotals,
      monthTotals,
      yesterdaySnapshot,
      recentSalesResult,
      topCampaignsTodayResult,
      monthGoalResult,
      planningGoalResult,
      cbCreativeSalesResult,
      creativeTrafficResult,
      vslDataResult,
      cashflowSettingsResult,
      cashflowAdjustmentsResult,
      fixedCostsResult,
      teamMembersResult,
      testCreativesResult,
      testTrafficResult,
      testSalesResult,
    ] = await Promise.all([
      // Authoritative today totals — SAME source as dashboard
      fetchDashboardTotals(todayStr, todayStr),
      // Authoritative month totals — SAME source as dashboard
      fetchDashboardTotals(monthStart, todayStr),
      // Last 7 days snapshots (most recent = yesterday, D-1)
      supabase.from("daily_totals_snapshot").select("*").gte("date", sevenDaysAgoStr).order("date", { ascending: false }).limit(7),
      // Recent sales
      supabase.from("sales_data").select("date, revenue, status, product_name, utm_campaign").gte("date", yesterdayStr).order("date", { ascending: false }).limit(50),
      // Top campaigns today
      supabase.from("traffic_data").select("campaign_name, spend, clicks, impressions").eq("date", todayStr).order("spend", { ascending: false }).limit(20),
      // Monthly goal
      supabase.from("monthly_goals").select("*").eq("month", todayStr.substring(0, 7)).maybeSingle(),
      // Planning goal
      supabase.from("planning_goals").select("*").lte("start_date", todayStr).gte("end_date", todayStr).maybeSingle(),
      // Creative sales (CB attribution)
      supabase.rpc("get_leaderboard_cb_sales", { p_start_date: monthStart, p_end_date: todayStr }),
      // Creative traffic
      supabase.rpc("get_creative_traffic_aggregated", { p_start_date: monthStart, p_end_date: todayStr }),
      // VSL data
      supabase.from("vsl_aggregated" as any).select("*").limit(30),
      // Cashflow settings
      supabase.from("cashflow_settings").select("*").eq("month", todayStr.substring(0, 7)).maybeSingle(),
      // Cashflow adjustments (current month)
      supabase.from("cashflow_adjustments").select("*").gte("date", monthStart).lte("date", todayStr),
      // Fixed costs
      supabase.from("fixed_costs").select("*").eq("is_active", true),
      // Team members
      supabase.from("team_members").select("*").eq("is_active", true),
      // Test creatives breakdown (phase 1-50-1)
      supabase.from("traffic_data").select("date, campaign_name, ad_name, spend, clicks, ctr, cpm, impressions").gte("date", "2022-03-22").ilike("campaign_name", "%1-50-1%").order("date", { ascending: false }).limit(200),
      // Test traffic (recent 4 days for test creatives with sales cross-ref)
      supabase.from("traffic_data").select("date, campaign_name, ad_name, spend, clicks, impressions, ctr, cpm").gte("date", "2026-03-23").lte("date", todayStr).ilike("campaign_name", "%1-50-1%").order("spend", { ascending: false }),
      // Test sales (same period for cross-referencing)
      supabase.from("sales_data").select("date, revenue, utm_campaign, utm_content, product_name, status").gte("date", "2026-03-23").lte("date", todayStr).eq("status", "confirmed"),
    ]);

    const recentSnapshots = yesterdaySnapshot.data || [];
    const yesterdaySnap = recentSnapshots[0] || null; // most recent = D-1
    const recentSales = recentSalesResult.data || [];
    const topCampaignsToday = topCampaignsTodayResult.data || [];
    const monthGoal = monthGoalResult.data;
    const planningGoal = planningGoalResult.data;
    const cbCreativeSales = cbCreativeSalesResult.data || [];
    const creativeTraffic = creativeTrafficResult.data || [];
    const vslData = vslDataResult.data || [];
    const cashflowSettings = cashflowSettingsResult.data;
    const cashflowAdjustments = cashflowAdjustmentsResult.data || [];
    const fixedCosts = fixedCostsResult.data || [];
    const teamMembers = teamMembersResult.data || [];
    const testCreatives = testCreativesResult.data || [];
    const testTraffic = testTrafficResult.data || [];
    const testSales = testSalesResult.data || [];

    // ── Build creative performance with REAL attribution ──
    const salesByCampaign: Record<string, { sales: number; revenue: number }> = {};
    for (const row of cbCreativeSales) {
      const key = row.campaign_name;
      if (!salesByCampaign[key]) salesByCampaign[key] = { sales: 0, revenue: 0 };
      salesByCampaign[key].sales += 1;
      salesByCampaign[key].revenue += Number(row.revenue_brl || 0);
    }

    const creativeMap: Record<string, { spend: number; clicks: number; impressions: number; sales: number; revenue: number; campaigns: string[] }> = {};
    for (const row of creativeTraffic) {
      const ad = row.ad_name || "unknown";
      if (!creativeMap[ad]) creativeMap[ad] = { spend: 0, clicks: 0, impressions: 0, sales: 0, revenue: 0, campaigns: [] };
      creativeMap[ad].spend += Number(row.total_spend || 0);
      creativeMap[ad].clicks += Number(row.total_clicks || 0);
      creativeMap[ad].impressions += Number(row.total_impressions || 0);
      const campSales = salesByCampaign[row.campaign_name];
      if (campSales) {
        creativeMap[ad].sales += campSales.sales;
        creativeMap[ad].revenue += campSales.revenue;
      }
      if (!creativeMap[ad].campaigns.includes(row.campaign_name)) {
        creativeMap[ad].campaigns.push(row.campaign_name);
      }
    }

    const creativesList = Object.entries(creativeMap)
      .map(([ad, d]) => ({ ad, ...d, roas: d.spend > 0 ? d.revenue / d.spend : 0 }))
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 25);

    // ── Financial calculations ──
    const totalFixedCosts = fixedCosts.reduce((s: number, c: any) => s + Number(c.monthly_value || 0), 0);
    const dailyFixedCosts = totalFixedCosts / 30;
    const totalCommissions = teamMembers.reduce((s: number, m: any) => {
      if (m.commission_type === "fixed") return s + Number(m.fixed_value || 0);
      return s;
    }, 0);

    // ── Format helper ──
    const fmt = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    // ── Build context block ──
    const contextBlock = `## Dados Operacionais (Fonte Autoritativa — mesma do Dashboard)

### HOJE — Dados em Tempo Real (${todayStr}):
${todayTotals ? `
- Investimento: ${fmt(todayTotals.totalSpend)}
- Faturamento: ${fmt(todayTotals.totalRevenue)}
- Lucro Bruto: ${fmt(todayTotals.lucroBruto)}
- ROAS: ${todayTotals.roas?.toFixed(2)}
- Vendas: ${todayTotals.totalConversions}
- Ticket Médio: ${fmt(todayTotals.ticketMedio)}
- CAC: ${fmt(todayTotals.cac)}
- Cliques: ${todayTotals.totalClicks}
- Impressões: ${todayTotals.totalImpressions}
- Câmbio USD/BRL: ${todayTotals.usdToBrl?.toFixed(2)}
` : "Dados de hoje indisponíveis no momento."}

### ONTEM — Snapshot Oficial (${yesterdaySnap?.date || yesterdayStr}):
${yesterdaySnap ? `
- Faturamento: ${fmt(yesterdaySnap.total_revenue)}
- Investimento: ${fmt(yesterdaySnap.total_spend)}
- Lucro Bruto: ${fmt(yesterdaySnap.lucro_bruto)}
- ROAS: ${yesterdaySnap.roas?.toFixed(2)}
- Vendas: ${yesterdaySnap.total_conversions}
- Ticket Médio: ${fmt(yesterdaySnap.ticket_medio)}
- CAC: ${fmt(yesterdaySnap.cac)}
` : "Snapshot de ontem ainda não disponível."}

### Snapshots Últimos 7 Dias:
${recentSnapshots.map((s: any) => `- ${s.date} | Rev: ${fmt(s.total_revenue)} | Spend: ${fmt(s.total_spend)} | Lucro: ${fmt(s.lucro_bruto)} | ROAS: ${s.roas?.toFixed(2)} | Vendas: ${s.total_conversions}`).join("\n") || "Sem snapshots disponíveis."}

### Mês Atual (${monthStart} a ${todayStr} — fonte autoritativa):
${monthTotals ? `
- Faturamento Acumulado: ${fmt(monthTotals.totalRevenue)}
- Investimento Acumulado: ${fmt(monthTotals.totalSpend)}
- Lucro Bruto Acumulado: ${fmt(monthTotals.lucroBruto)}
- Vendas no Mês: ${monthTotals.totalConversions}
- ROAS Médio: ${monthTotals.roas?.toFixed(2)}
- Ticket Médio: ${fmt(monthTotals.ticketMedio)}
- CAC Médio: ${fmt(monthTotals.cac)}
` : "Dados do mês indisponíveis."}
${monthGoal ? `- Meta de Faturamento: ${fmt(monthGoal.goal_value)}
- Meta de Lucro: ${fmt(monthGoal.profit_goal)}
- Progresso Faturamento: ${monthTotals ? ((monthTotals.totalRevenue / (monthGoal.goal_value || 1)) * 100).toFixed(1) : "N/A"}%
- Progresso Lucro: ${monthTotals ? ((monthTotals.lucroBruto / (monthGoal.profit_goal || 1)) * 100).toFixed(1) : "N/A"}%` : ""}

### Financeiro:
- Custos Fixos Mensais: ${fmt(totalFixedCosts)}
- Custos Fixos Diários (pro-rata): ${fmt(dailyFixedCosts)}
- Comissões Fixas Mensais: ${fmt(totalCommissions)}
${monthTotals ? `- Imposto Meta (12.15%): ${fmt(monthTotals.totalSpend * 0.1215)}
- Lucro Líquido Estimado (mês): ${fmt(monthTotals.lucroBruto - totalFixedCosts - totalCommissions - (monthTotals.totalSpend * 0.1215))}` : ""}

### Fluxo de Caixa:
${cashflowSettings ? `
- Caixa Inicial (offset): ${fmt(cashflowSettings.initial_cash)}
- ROI Projeção: ${cashflowSettings.projection_roi}
- Modelo de Pagamento: ${cashflowSettings.payment_model}
` : "Sem configuração de fluxo de caixa para o mês."}
- Ajustes manuais no mês: ${cashflowAdjustments.length} registros (total: ${fmt(cashflowAdjustments.reduce((s: number, a: any) => s + Number(a.amount || 0), 0))})

### Top Campanhas Hoje (por investimento):
${topCampaignsToday.slice(0, 10).map((c: any) => `- ${c.campaign_name}: ${fmt(c.spend)} investido | ${c.clicks} cliques | ${c.impressions} impressões`).join("\n")}

### Vendas Recentes:
${recentSales.slice(0, 15).map((s: any) => `- ${s.date} | ${fmt(s.revenue)} | ${s.status} | ${s.product_name || "N/A"} | UTM: ${s.utm_campaign || "N/A"}`).join("\n")}

${planningGoal ? `### Planejamento:
- Meta Revenue: ${fmt(planningGoal.revenue_goal)}
- Meta Lucro: ${fmt(planningGoal.profit_goal)}
- Meta Vendas: ${planningGoal.sales_goal}
- Meta CPA: ${fmt(planningGoal.cpa_goal)}
- Meta Margem: ${planningGoal.margin_goal}%` : ""}

### Performance por Criativo (mês atual — atribuição via ClickBank campaign_id):
${creativesList.map((c) => `- ${c.ad} | Spend: ${fmt(c.spend)} | Vendas: ${c.sales} | Revenue: ${fmt(c.revenue)} | ROAS: ${c.roas.toFixed(2)} | Clicks: ${c.clicks}`).join("\n") || "Sem dados de criativos."}

### VSL Performance:
${vslData.slice(0, 15).map((v: any) => `- ${v.video_name} | Views: ${v.total_views || 0} | Unique: ${v.total_unique_views || 0} | Retenção: ${Number(v.avg_retention || 0).toFixed(1)}% | Button CTR: ${Number(v.button_ctr || 0).toFixed(1)}%`).join("\n") || "Sem dados de VSLs."}

### Criativos em Teste (fase 1-50-1 — breakdown diário):
${testCreatives.slice(0, 50).map((t: any) => `- ${t.date} | ${t.ad_name} | Camp: ${t.campaign_name} | Spend: ${fmt(Number(t.spend || 0))} | Clicks: ${t.clicks} | CTR: ${Number(t.ctr || 0).toFixed(2)}% | CPM: ${fmt(Number(t.cpm || 0))} | Impr: ${t.impressions}`).join("\n") || "Sem dados de criativos em teste."}

### Test Traffic (criativos 1-50-1 últimos 4 dias — para cruzar com vendas):
${testTraffic.slice(0, 80).map((t: any) => `- ${t.date} | ${t.ad_name} | Camp: ${t.campaign_name} | Spend: ${fmt(Number(t.spend || 0))} | Clicks: ${t.clicks} | CTR: ${Number(t.ctr || 0).toFixed(2)}% | CPM: ${fmt(Number(t.cpm || 0))} | Impr: ${t.impressions}`).join("\n") || "Sem dados de test traffic."}

### Test Sales (vendas confirmadas últimos 4 dias — para cruzar com criativos):
${testSales.slice(0, 100).map((s: any) => `- ${s.date} | ${fmt(Number(s.revenue || 0))} | UTM Camp: ${s.utm_campaign || "N/A"} | UTM Content: ${s.utm_content || "N/A"} | Produto: ${s.product_name || "N/A"}`).join("\n") || "Sem vendas de teste no período."}`;
    const systemPrompt = `Você é o JARVIS — gestor de tráfego virtual da operação. Você tem acesso em tempo real a todos os dados do sistema: campanhas, criativos, vendas, VSLs, investimento, ROAS, CPA, margem e histórico.

PERSONALIDADE:
Você é direto mas humano. Fala como um sócio experiente, não como um relatório automatizado. Tem senso de humor leve quando a situação permite. O usuário se chama ${userName} — nunca use outro nome.

REGRA MAIS IMPORTANTE:
Você NUNCA joga dados na cara do usuário sem ele pedir.
Se ele disser 'oi', você responde 'oi'.
Se ele perguntar como você está, você responde naturalmente.
Você só puxa dados e faz análise quando ele pedir explicitamente.

EXEMPLOS DO QUE NÃO FAZER:
❌ 'Bom dia' → 'Bom dia! Temos R$169k gastos hoje...'
❌ 'Tudo bem?' → 'Tudo! ROAS de 1.30, campanhas...'

EXEMPLOS DO QUE FAZER:
✅ 'Bom dia' → 'Bom dia. Como posso ajudar hoje?'
✅ 'Tudo bem?' → 'Tudo certo. E você?'
✅ 'Como está a operação?' → [aí sim puxa os dados e analisa]

REGRAS DE OTIMIZAÇÃO DA OPERAÇÃO (aplique sempre que analisar campanhas):

REGRA DE PAUSA:
- Janela de análise padrão: últimos 3 dias
- Se uma campanha gastou mais do que o CPA máximo configurado (padrão: R$936) nos últimos 3 dias E teve 0 vendas → RECOMENDAR PAUSA imediatamente
- Essa regra se aplica a qualquer fase (Teste, Pré-Escala, Escala)
- Se a campanha gastou mais de 2x o CPA e teve menos de 1 venda → RECOMENDAR PAUSA com prioridade crítica

FASES DE CAMPANHA:
- Fase 01 / Teste de Criativos (1-50-1): validação inicial, limite de gasto menor
- Fase 02 / Pré-Escala (1-100-1): criativo validado, testando escalabilidade
- Fase 03 / Escala (1-250-1): campanha comprovada, orçamento maior

COMO RESPONDER:
- Seja direto e operacional. Não enrole.
- Quando pedirem lista de campanhas pra pausar, retorne em formato de tabela:
  | Campanha | Gasto 3d | Vendas 3d | CPA | Decisão |
- Quando pedirem criativos, separe por fase e mostre quantidade + lista
- Quando pedirem diagnóstico geral, mostre: ROAS, CPA, Lucro, campanhas ativas, campanhas sangrando, criativos validados
- Sempre termine com 1 recomendação de ação imediata
- Use emojis para facilitar leitura: 🔴 pausar, 🟡 observar, 🟢 escalar

REGRA CRÍTICA SOBRE FONTES DE DADOS:
TODOS os dados que você recebe aqui vêm da MESMA fonte autoritativa do Dashboard.
Os números aqui SÃO os mesmos que aparecem no dashboard — nunca haverá divergência.

REGRA DE TIMEZONE:
- Todas as datas são calculadas em horário de Brasília (UTC-3).
- Os dados do daily_totals_snapshot mais recente são sempre de ontem (D-1).

FORMATO:
- Respostas curtas quando a pergunta é curta
- Usa emojis com moderação — só quando faz sentido
- Nunca começa com 'Claro!', 'Certamente!', 'Ótima pergunta!'
- Termina análises com AÇÃO PRIORITÁRIA quando relevante
- Valores sempre em R$ formato brasileiro

## DADOS DISPONÍVEIS (use apenas quando o usuário pedir análise):
${contextBlock}`;

    const userMessages = messages.map((m: any) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content,
    }));

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        system: systemPrompt,
        messages: userMessages,
        stream: true,
      }),
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit excedido. Tente novamente em alguns segundos." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const text = await response.text();
      console.error("Anthropic error:", status, text);
      return new Response(JSON.stringify({ error: "Erro na API Claude." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const transformStream = new TransformStream({
      transform(chunk, controller) {
        const text = new TextDecoder().decode(chunk);
        const lines = text.split("\n");
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (!jsonStr) continue;
          try {
            const event = JSON.parse(jsonStr);
            if (event.type === "content_block_delta" && event.delta?.text) {
              const openAiChunk = {
                choices: [{ delta: { content: event.delta.text } }],
              };
              controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(openAiChunk)}\n\n`));
            } else if (event.type === "message_stop") {
              controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
            }
          } catch { /* skip */ }
        }
      },
    });

    return new Response(response.body!.pipeThrough(transformStream), {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("analyst-chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
