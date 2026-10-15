import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function testTodoistConnection(apiKey: string) {
  try {
    const res = await fetch("https://api.todoist.com/rest/v2/projects", {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const body = await res.text();
    console.log(`Todoist connectivity test: status=${res.status} body=${body.substring(0, 300)}`);
    return { status: res.status, body, ok: res.ok };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("Todoist connectivity test failed:", msg);
    return { status: 0, body: msg, ok: false };
  }
}

async function createTodoistTask(apiKey: string, content: string, description: string, priority: number, dueDate: string) {
  try {
    const payload = { content, description, priority, due_date: dueDate };
    console.log("Todoist POST payload:", JSON.stringify(payload));

    const res = await fetch("https://api.todoist.com/rest/v2/tasks", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-Request-Id": crypto.randomUUID(),
      },
      body: JSON.stringify(payload),
    });

    const body = await res.text();
    console.log(`Todoist create response: status=${res.status} body=${body.substring(0, 300)}`);
    return { status: res.status, body, ok: res.ok };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("Todoist create request error:", msg);
    return { status: 0, body: msg, ok: false };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    const TODOIST_API_KEY = Deno.env.get("TODOIST_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");
    if (!TODOIST_API_KEY) throw new Error("TODOIST_API_KEY not configured");

    // Step 1: Test Todoist connectivity
    console.log(`TODOIST_API_KEY length: ${TODOIST_API_KEY.length}, prefix: ${TODOIST_API_KEY.substring(0, 8)}...`);
    const connectivityTest = await testTodoistConnection(TODOIST_API_KEY);
    if (!connectivityTest.ok) {
      return new Response(JSON.stringify({
        success: false,
        error: "Todoist API connectivity failed",
        todoistTest: { status: connectivityTest.status, body: connectivityTest.body.substring(0, 500) },
        message: `❌ Falha na conexão com Todoist (status ${connectivityTest.status})`,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Date calculations
    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split("T")[0];
    const threeDaysAgo = new Date(today);
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    const threeDaysAgoStr = threeDaysAgo.toISOString().split("T")[0];

    // Fetch data in parallel
    const [
      { data: snapshots },
      { data: trafficData },
      { data: campaignStatuses },
      { data: salesData },
      { data: planningGoal },
    ] = await Promise.all([
      supabase.from("daily_totals_snapshot").select("*").gte("date", yesterdayStr).lte("date", todayStr).order("date", { ascending: false }),
      supabase.from("traffic_data").select("campaign_name, account_id, spend, clicks, impressions, date").gte("date", threeDaysAgoStr).lte("date", todayStr),
      supabase.from("meta_campaign_status").select("campaign_id, campaign_name, account_id, status, effective_status, daily_budget"),
      supabase.from("sales_data").select("utm_campaign, revenue, status, date").gte("date", threeDaysAgoStr).lte("date", todayStr).eq("status", "approved"),
      supabase.from("planning_goals").select("*").lte("start_date", todayStr).gte("end_date", todayStr).maybeSingle(),
    ]);

    // Build campaign aggregation
    const campaignMap = new Map<string, any>();
    for (const row of (trafficData || [])) {
      const key = row.campaign_name;
      if (!campaignMap.has(key)) {
        campaignMap.set(key, { fullName: key, accountId: row.account_id, spend: 0, clicks: 0, impressions: 0 });
      }
      const c = campaignMap.get(key)!;
      c.spend += row.spend || 0;
      c.clicks += row.clicks || 0;
      c.impressions += row.impressions || 0;
    }

    const salesByCampaign = new Map<string, { count: number; revenue: number; daySet: Set<string> }>();
    for (const s of (salesData || [])) {
      const key = s.utm_campaign || "unknown";
      if (!salesByCampaign.has(key)) salesByCampaign.set(key, { count: 0, revenue: 0, daySet: new Set() });
      const sc = salesByCampaign.get(key)!;
      sc.count++;
      sc.revenue += s.revenue || 0;
      sc.daySet.add(s.date);
    }

    function getPhase(name: string): string {
      if (name.includes("1-50-1")) return "TESTE";
      if (name.includes("1-100-1")) return "PRÉ ESCALA";
      if (name.includes("1-250-1")) return "ESCALA";
      return "OUTRO";
    }

    function getDisplayName(fullName: string): string {
      const cleaned = fullName.replace(/\|[\d]+$/, "").trim();
      const match = cleaned.match(/\[([^\]]+)\]/);
      return match ? match[1] : cleaned.substring(0, 40);
    }

    const campaignRows = [];
    for (const [name, data] of campaignMap.entries()) {
      const phase = getPhase(name);
      const statusInfo = (campaignStatuses || []).find((cs: any) => cs.campaign_name === name);
      const sales = salesByCampaign.get(name) || { count: 0, revenue: 0, daySet: new Set() };
      const daysWithSale = sales.daySet.size;
      const spend3DTotal = data.spend;
      const revenue3DTotal = sales.revenue;
      const roas3D = spend3DTotal > 0 ? revenue3DTotal / spend3DTotal : 0;
      const days = [threeDaysAgoStr, yesterdayStr, todayStr];
      const consistency3D = days.map(d => sales.daySet.has(d) ? "✅" : "❌").join("");

      let gtxDecision = "MANTER";
      let gtxReason = "";
      if (daysWithSale === 0 && spend3DTotal > 900) {
        gtxDecision = "CORTAR";
        gtxReason = `Gasto R$${spend3DTotal.toFixed(0)} em 3 dias sem venda`;
      } else if (phase === "TESTE" && roas3D >= 1.5 && daysWithSale >= 2) {
        gtxDecision = "PROMOVER";
        gtxReason = `ROAS 3D ${roas3D.toFixed(2)} com ${daysWithSale} dias de venda`;
      } else if (phase === "PRÉ ESCALA" && roas3D >= 1.5 && daysWithSale >= 2) {
        gtxDecision = "ESCALAR";
        gtxReason = `ROAS 3D ${roas3D.toFixed(2)} consistente`;
      } else if (roas3D > 0 && roas3D < 1.0 && daysWithSale <= 1) {
        gtxDecision = "OBSERVAR";
        gtxReason = `ROAS baixo (${roas3D.toFixed(2)})`;
      }

      if (spend3DTotal < 10) continue;

      campaignRows.push({
        displayName: getDisplayName(name),
        fullName: name,
        phase,
        status: statusInfo?.effective_status || "UNKNOWN",
        spend3DTotal: Math.round(spend3DTotal),
        salesConfirmed: sales.count,
        revenue3DTotal: Math.round(revenue3DTotal),
        roas3D: Number(roas3D.toFixed(2)),
        consistency3D,
        daysWithSale,
        gtxDecision,
        gtxReason,
      });
    }

    const todaySnap = (snapshots || []).find((s: any) => s.date === todayStr);
    const yesterdaySnap = (snapshots || []).find((s: any) => s.date === yesterdayStr);

    const dataContext = `## Dados Operacionais — ${todayStr}

### Snapshot Hoje:
${todaySnap ? `Receita: R$${todaySnap.total_revenue} | Gasto: R$${todaySnap.total_spend} | Lucro: R$${todaySnap.lucro_bruto} | ROAS: ${todaySnap.roas} | Vendas: ${todaySnap.total_conversions}` : "Sem dados de hoje ainda."}

### Snapshot Ontem:
${yesterdaySnap ? `Receita: R$${yesterdaySnap.total_revenue} | Gasto: R$${yesterdaySnap.total_spend} | Lucro: R$${yesterdaySnap.lucro_bruto} | ROAS: ${yesterdaySnap.roas} | Vendas: ${yesterdaySnap.total_conversions}` : "Sem dados."}

${planningGoal ? `### Planejamento:\nMeta Revenue: R$${planningGoal.revenue_goal} | Meta Lucro: R$${planningGoal.profit_goal} | Meta CPA: R$${planningGoal.cpa_goal}` : ""}

### Campanhas (últimos 3 dias):
${campaignRows.map(c => `- displayName: ${c.displayName} | Fase: ${c.phase} | Status: ${c.status} | Gasto 3D: R$${c.spend3DTotal} | Vendas: ${c.salesConfirmed} | ROAS 3D: ${c.roas3D} | Consistency: ${c.consistency3D} | Decisão: ${c.gtxDecision} | Motivo: ${c.gtxReason}`).join("\n")}`;

    // Call Anthropic
    const taskPrompt = `${dataContext}

Com base nos dados acima, gere uma lista de tarefas operacionais para hoje.

REGRAS:
- Campanhas com gtxDecision "CORTAR" ou gasto alto sem vendas → label "pausar", priority 4
- Campanhas com gtxDecision "ESCALAR" ou "PROMOVER" → label "escalar", priority 3
- Campanhas para observar → label "monitorar", priority 2
- Use o displayName (campo curto) no content, NÃO o fullName
- Formato do content: "⏸️ Pausar DISPLAYNAME — 0 vendas, R$920 gastos" ou "🚀 Escalar DISPLAYNAME — ROAS 2.1, consistente"
- description deve ter o motivo exato com dados numéricos e a fase
- Não invente campanhas — use APENAS as listadas acima
- Se não houver campanhas relevantes para uma categoria, não crie tarefas forçadas

Responda APENAS com JSON válido no formato:
{
  "tasks": [
    {
      "content": "⏸️ Pausar BMGTX-C/A-DB-03 — 0 vendas, R$920 gastos",
      "description": "Fase TESTE | Gasto 3D: R$920 | 0 vendas em 3 dias | Consistency: ❌❌❌",
      "priority": 4,
      "label": "pausar"
    }
  ]
}`;

    const aiResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        system: "Você é o JARVIS — inteligência operacional do Traffic OS. Gere tarefas operacionais em JSON puro, sem markdown, sem explicação extra. Apenas o JSON.",
        messages: [{ role: "user", content: taskPrompt }],
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("Anthropic error:", aiResponse.status, errText);
      throw new Error(`Claude error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const rawContent = aiData.content?.[0]?.text || "{}";
    let jsonStr = rawContent;
    const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
    if (jsonMatch) jsonStr = jsonMatch[0];

    let tasksPayload: { tasks: any[] };
    try {
      tasksPayload = JSON.parse(jsonStr);
    } catch {
      console.error("Failed to parse AI response:", rawContent);
      throw new Error("AI retornou formato inválido");
    }

    if (!tasksPayload.tasks || !Array.isArray(tasksPayload.tasks)) {
      throw new Error("AI não gerou tarefas válidas");
    }

    console.log(`AI generated ${tasksPayload.tasks.length} tasks. Creating in Todoist...`);

    // Create tasks in Todoist
    const results = { pausar: 0, escalar: 0, monitorar: 0, total: 0, errors: 0 };
    const todoistResponses: any[] = [];

    for (const task of tasksPayload.tasks) {
      const res = await createTodoistTask(
        TODOIST_API_KEY,
        task.content,
        task.description || "",
        task.priority || 2,
        todayStr,
      );

      todoistResponses.push({
        task: task.content,
        status: res.status,
        ok: res.ok,
        response: res.body.substring(0, 300),
      });

      if (res.ok) {
        results.total++;
        const label = task.label || "monitorar";
        if (label in results) (results as any)[label]++;
      } else {
        results.errors++;
      }
    }

    return new Response(JSON.stringify({
      success: results.total > 0,
      summary: results,
      tasks: tasksPayload.tasks,
      todoistTest: { status: connectivityTest.status, ok: connectivityTest.ok },
      todoistResponses,
      message: `✅ ${results.total} tarefas criadas no Todoist (⏸️ ${results.pausar} pausar | 🚀 ${results.escalar} escalar | 🟡 ${results.monitorar} monitorar)${results.errors > 0 ? ` | ⚠️ ${results.errors} erros` : ""}`,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("jarvis-tasks error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
