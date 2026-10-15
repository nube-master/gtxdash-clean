// Spy v2: VSL Intelligence
// Analisa transcrições de VSL (arquivos da pasta "Transcrição" de uma oferta)
// via Lovable AI (Gemini) e gera insights estruturados (público, ângulos, dores etc).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import mammoth from "npm:mammoth@1.8.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const BUCKET = "spy-offer-files";
const FOLDER_NAMES = ["Transcrição", "Transcricao", "Transcript", "VSL"];
const MAX_CHARS_PER_FILE = 60_000; // ~limite seguro de contexto
const MAX_TOTAL_CHARS = 180_000;

const VSL_ANALYSIS_TOOL = {
  type: "function",
  function: {
    name: "analyze_vsl_transcript",
    description:
      "Extrai elementos de copywriting e estrutura persuasiva de uma VSL com base na transcrição.",
    parameters: {
      type: "object",
      properties: {
        top_hooks: {
          type: "array",
          description: "Principais ganchos usados na VSL (frases curtas em PT-BR + tipo)",
          items: {
            type: "object",
            properties: {
              value: { type: "string", description: "Frase ou tipo do gancho (PT-BR)" },
              count: { type: "integer", description: "Peso/relevância 1-10" },
            },
            required: ["value", "count"],
            additionalProperties: false,
          },
        },
        top_angles: {
          type: "array",
          description: "Ângulos principais (mecanismo, promessa central, abordagem)",
          items: {
            type: "object",
            properties: {
              value: { type: "string" },
              count: { type: "integer" },
            },
            required: ["value", "count"],
            additionalProperties: false,
          },
        },
        top_pains: {
          type: "array",
          description: "Dores/problemas explorados",
          items: {
            type: "object",
            properties: {
              value: { type: "string" },
              count: { type: "integer" },
            },
            required: ["value", "count"],
            additionalProperties: false,
          },
        },
        top_ctas: {
          type: "array",
          description: "Estilos de CTA usados (urgência, escassez, curiosidade etc) + frases-exemplo",
          items: {
            type: "object",
            properties: {
              value: { type: "string" },
              count: { type: "integer" },
            },
            required: ["value", "count"],
            additionalProperties: false,
          },
        },
        top_triggers: {
          type: "array",
          description: "Gatilhos emocionais dominantes (medo, esperança, vergonha, alívio etc)",
          items: {
            type: "object",
            properties: {
              value: { type: "string" },
              count: { type: "integer" },
            },
            required: ["value", "count"],
            additionalProperties: false,
          },
        },
        top_audiences: {
          type: "array",
          description: "Público-alvo inferido (idade/perfil/contexto)",
          items: {
            type: "object",
            properties: {
              value: { type: "string" },
              count: { type: "integer" },
            },
            required: ["value", "count"],
            additionalProperties: false,
          },
        },
        promise: { type: "string", description: "Promessa central da VSL em 1 frase (PT-BR)" },
        mechanism: { type: "string", description: "Mecanismo único / o 'como' da promessa (PT-BR)" },
        big_idea: { type: "string", description: "Big Idea da VSL em 1 frase" },
        structure_summary: {
          type: "string",
          description:
            "Resumo da estrutura narrativa em 4-8 bullets (Hook → História → Vilão → Mecanismo → Prova → Oferta → CTA), em PT-BR.",
        },
        executive_summary: {
          type: "string",
          description:
            "Resumo executivo da VSL em 3-5 frases corridas (PT-BR): do que se trata, para quem, qual a grande promessa e como ela é entregue.",
        },
        key_claims: {
          type: "array",
          description:
            "Principais alegações/promessas factuais feitas na VSL (resultados, benefícios, dados, comparações). Frases curtas em PT-BR.",
          items: {
            type: "object",
            properties: {
              value: { type: "string", description: "Alegação em 1 frase" },
              count: { type: "integer", description: "Força/impacto 1-10" },
            },
            required: ["value", "count"],
            additionalProperties: false,
          },
        },
        turning_points: {
          type: "array",
          description:
            "Pontos de virada do roteiro: momentos onde a narrativa muda de marcha (revelação do vilão, descoberta do mecanismo, prova decisiva, virada emocional, transição para oferta). 3-6 itens.",
          items: {
            type: "object",
            properties: {
              moment: {
                type: "string",
                description: "Onde acontece (ex: 'Abertura', 'Após a história pessoal', 'Antes do CTA')",
              },
              description: { type: "string", description: "O que muda na narrativa em 1-2 frases (PT-BR)" },
            },
            required: ["moment", "description"],
            additionalProperties: false,
          },
        },
        avg_score: {
          type: "integer",
          description: "Nota geral 0-100 da força persuasiva da VSL",
        },
      },
      required: [
        "top_hooks",
        "top_angles",
        "top_pains",
        "top_ctas",
        "top_triggers",
        "top_audiences",
        "executive_summary",
        "key_claims",
        "turning_points",
        "avg_score",
      ],
      additionalProperties: false,
    },
  },
};

function isTextLike(name: string, mime?: string | null) {
  const n = name.toLowerCase();
  if (n.endsWith(".txt") || n.endsWith(".md") || n.endsWith(".srt") || n.endsWith(".vtt")) return true;
  if (mime && (mime.startsWith("text/") || mime === "application/json")) return true;
  return false;
}

function isDocx(name: string, mime?: string | null) {
  return name.toLowerCase().endsWith(".docx") ||
    mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
}

function isSupported(name: string, mime?: string | null) {
  return isTextLike(name, mime) || isDocx(name, mime);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { offer_id } = await req.json();
    if (!offer_id) {
      return new Response(JSON.stringify({ error: "offer_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supa = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: offer, error: offerErr } = await supa
      .from("spy_offers")
      .select("id, operation_id, offer_name")
      .eq("id", offer_id)
      .maybeSingle();
    if (offerErr || !offer) throw new Error("offer not found");

    // Busca arquivos da pasta de Transcrição (ou VSL)
    const { data: files, error: filesErr } = await supa
      .from("spy_offer_files")
      .select("id, folder, file_name, storage_path, mime_type, size_bytes")
      .eq("offer_id", offer_id)
      .in("folder", FOLDER_NAMES);
    if (filesErr) throw filesErr;

    const candidates = (files || []).filter((f) => isSupported(f.file_name, f.mime_type));
    if (!candidates.length) {
      return new Response(
        JSON.stringify({
          ok: false,
          error:
            "Nenhuma transcrição encontrada. Suba um arquivo .txt/.md/.srt/.vtt/.docx na pasta 'Transcrição'.",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Baixa e concatena conteúdo
    let combined = "";
    const usedFiles: any[] = [];
    for (const f of candidates) {
      if (combined.length >= MAX_TOTAL_CHARS) break;
      const { data: blob, error: dlErr } = await supa.storage.from(BUCKET).download(f.storage_path);
      if (dlErr || !blob) {
        console.warn("download error", f.storage_path, dlErr);
        continue;
      }
      let text = "";
      try {
        if (isDocx(f.file_name, f.mime_type)) {
          const buf = new Uint8Array(await blob.arrayBuffer());
          const result = await mammoth.extractRawText({ buffer: buf });
          text = (result?.value || "").trim();
        } else {
          text = await blob.text();
        }
      } catch (parseErr) {
        console.warn("parse error", f.file_name, parseErr);
        continue;
      }
      // Limpa SRT/VTT: remove números/timestamps
      if (/\.(srt|vtt)$/i.test(f.file_name)) {
        text = text
          .replace(/^WEBVTT.*$/gm, "")
          .replace(/^\d+\s*$/gm, "")
          .replace(/^\d{2}:\d{2}:\d{2}[.,]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[.,]\d{3}.*$/gm, "")
          .replace(/\n{3,}/g, "\n\n")
          .trim();
      }
      if (!text) continue;
      if (text.length > MAX_CHARS_PER_FILE) text = text.slice(0, MAX_CHARS_PER_FILE);
      combined += `\n\n===== ${f.file_name} =====\n${text}`;
      usedFiles.push({ id: f.id, file_name: f.file_name, chars: text.length });
    }

    if (!combined.trim()) {
      return new Response(
        JSON.stringify({ ok: false, error: "Não foi possível ler o conteúdo dos arquivos." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log(
      `[spy-analyze-vsl] offer=${offer_id} files=${usedFiles.length} chars=${combined.length}`,
    );

    // Chama Gemini com tool calling
    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          {
            role: "system",
            content:
              "Você é um copywriter sênior brasileiro especializado em VSLs (Video Sales Letters) de direct response. Analise a transcrição abaixo e devolva o framework completo SEMPRE em PT-BR. Seja específico, conciso e baseie-se em evidências do texto.",
          },
          {
            role: "user",
            content: `Oferta: ${offer.offer_name}\n\nTranscrição(ões) da VSL:\n${combined}`,
          },
        ],
        tools: [VSL_ANALYSIS_TOOL],
        tool_choice: {
          type: "function",
          function: { name: "analyze_vsl_transcript" },
        },
      }),
    });

    if (!aiResp.ok) {
      const t = await aiResp.text();
      console.error("AI gateway error", aiResp.status, t.slice(0, 300));
      if (aiResp.status === 429)
        return new Response(JSON.stringify({ error: "Rate limit excedido, tente novamente em instantes." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      if (aiResp.status === 402)
        return new Response(JSON.stringify({ error: "Créditos insuficientes na workspace Lovable AI." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      throw new Error("AI gateway error");
    }

    const aiData = await aiResp.json();
    const call = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!call?.function?.arguments) throw new Error("AI não retornou análise estruturada.");

    let parsed: any;
    try {
      parsed = JSON.parse(call.function.arguments);
    } catch {
      throw new Error("AI retornou JSON inválido.");
    }

    const summary = {
      ...parsed,
      total_analyzed: usedFiles.length,
    };

    await supa
      .from("spy_offers")
      .update({
        vsl_intel_summary: summary,
        vsl_intel_analyzed_at: new Date().toISOString(),
        vsl_intel_source_files: usedFiles,
      })
      .eq("id", offer_id);

    return new Response(JSON.stringify({ ok: true, summary, files_used: usedFiles }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("spy-analyze-vsl fatal", e);
    return new Response(JSON.stringify({ error: e?.message || "unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
