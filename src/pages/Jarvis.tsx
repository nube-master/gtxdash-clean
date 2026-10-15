import { useState, useRef, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { Send, Trash2, Loader2, ListTodo, Search, Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useJarvisConversations } from "@/hooks/useJarvisConversations";
import { JarvisConversationSidebar } from "@/components/ai/JarvisConversationSidebar";

const JARVIS_TASKS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/jarvis-tasks`;
const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyst-chat`;

const COMMAND_CATEGORIES = [
  {
    label: "🎯 Otimização",
    commands: [
      {
        title: "Quais campanhas matar hoje?",
        prompt: "Analise todas as campanhas dos últimos 3 dias. Liste em tabela as campanhas que gastaram mais do que o CPA máximo (R$936) e tiveram 0 vendas. Inclua: nome da campanha, fase, gasto nos 3 dias, número de vendas, e decisão (🔴 Pausar). Mostre o total de campanhas a pausar e o quanto de gasto diário isso vai liberar.",
      },
      {
        title: "O que está pronto pra escalar?",
        prompt: "Analise as campanhas dos últimos 3 dias. Liste as que têm ROAS acima do mínimo (1.26x), CPA dentro da meta (abaixo de R$936) e pelo menos 2 vendas. Mostre: nome, fase atual, ROAS, CPA, vendas, gasto. Recomende qual fase mover cada uma.",
      },
      {
        title: "Diagnóstico completo agora",
        prompt: "Me dá um diagnóstico executivo completo: 1) Status geral (ROAS, CPA, Lucro, Margem hoje) 2) Campanhas ativas vs pausadas 3) Quantas campanhas estão sangrando (prejuízo nos últimos 3 dias) 4) Qual produto está gerando mais receita 5) Qual horário foi mais lucrativo hoje 6) 1 ação imediata que eu devo tomar agora",
      },
    ],
  },
  {
    label: "📊 Criativos",
    commands: [
      {
        title: "Criativos validados",
        prompt: "Liste todos os criativos que passaram pelo critério de validação nos últimos 7 dias. Mostre: nome do criativo, VSL associado, número de vendas, ROAS, fase atual. Separe por projeto (NDM, NDB, CRT).",
      },
      {
        title: "Criativos por fase",
        prompt: "Me dá um resumo rápido: quantos criativos estão em Teste, Pré-Escala e Escala agora. Mostra o número de cada fase e lista os nomes dos que estão em Escala.",
      },
      {
        title: "Sugestões para próxima semana",
        prompt: "Com base nos criativos que tiveram melhor CTR e maior taxa de play nos últimos 7 dias, quais ângulos ou formatos devo priorizar para criar novos criativos? Liste os top 3 padrões vencedores.",
      },
    ],
  },
  {
    label: "💰 Financeiro",
    commands: [
      {
        title: "Como foi ontem?",
        prompt: "Resumo do dia de ontem: Receita, Investimento, Lucro, ROAS, número de vendas, CPA médio, margem. Compare com a média dos últimos 7 dias e diz se foi um dia bom, médio ou ruim.",
      },
      {
        title: "Projeção pra fechar o mês",
        prompt: "Baseado no ritmo dos últimos 7 dias, qual o lucro projetado para fechar o mês? Qual a chance de bater a meta mensal? Quanto preciso investir por dia para atingir a meta?",
      },
      {
        title: "Qual produto priorizar?",
        prompt: "Compare NDM, NDB e CRT nos últimos 3 dias: ROAS, CPA, margem, número de vendas. Qual produto está performando melhor e merece mais investimento agora? Justifique com os números.",
      },
    ],
  },
];

function formatTime(dateStr: string | Date) {
  const date = typeof dateStr === "string" ? new Date(dateStr) : dateStr;
  return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="flex items-start gap-3 max-w-3xl">
        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-destructive/80 flex items-center justify-center shrink-0 mt-0.5 shadow-md">
          <span className="text-xs font-bold text-primary-foreground">J</span>
        </div>
        <div className="bg-muted/40 rounded-2xl rounded-bl-md px-5 py-3.5 border border-border/20">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: "0ms" }} />
            <span className="h-2 w-2 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: "150ms" }} />
            <span className="h-2 w-2 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: "300ms" }} />
          </div>
        </div>
      </div>
    </div>
  );
}

async function streamChat({
  messages,
  userName,
  onDelta,
  onDone,
  onError,
}: {
  messages: { role: string; content: string }[];
  userName: string;
  onDelta: (text: string) => void;
  onDone: () => void;
  onError: (err: string) => void;
}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) { onError("Faça login para usar o JARVIS."); return; }

  const resp = await fetch(CHAT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ messages, user_name: userName }),
  });

  if (!resp.ok) {
    const data = await resp.json().catch(() => ({}));
    if (resp.status === 429) { onError("Rate limit atingido. Aguarde alguns segundos."); return; }
    if (resp.status === 402) { onError("Créditos insuficientes."); return; }
    onError(data.error || "Erro ao conectar com a IA.");
    return;
  }

  if (!resp.body) { onError("Sem resposta da IA."); return; }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let textBuffer = "";
  let streamDone = false;

  while (!streamDone) {
    const { done, value } = await reader.read();
    if (done) break;
    textBuffer += decoder.decode(value, { stream: true });

    let newlineIndex: number;
    while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
      let line = textBuffer.slice(0, newlineIndex);
      textBuffer = textBuffer.slice(newlineIndex + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (line.startsWith(":") || line.trim() === "") continue;
      if (!line.startsWith("data: ")) continue;
      const jsonStr = line.slice(6).trim();
      if (jsonStr === "[DONE]") { streamDone = true; break; }
      try {
        const parsed = JSON.parse(jsonStr);
        const content = parsed.choices?.[0]?.delta?.content as string | undefined;
        if (content) onDelta(content);
      } catch {
        textBuffer = line + "\n" + textBuffer;
        break;
      }
    }
  }

  if (textBuffer.trim()) {
    for (let raw of textBuffer.split("\n")) {
      if (!raw) continue;
      if (raw.endsWith("\r")) raw = raw.slice(0, -1);
      if (!raw.startsWith("data: ")) continue;
      const jsonStr = raw.slice(6).trim();
      if (jsonStr === "[DONE]") continue;
      try {
        const parsed = JSON.parse(jsonStr);
        const content = parsed.choices?.[0]?.delta?.content as string | undefined;
        if (content) onDelta(content);
      } catch { /* ignore */ }
    }
  }

  onDone();
}

export default function Jarvis() {
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [isGeneratingTasks, setIsGeneratingTasks] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [debugData, setDebugData] = useState<any>(null);
  const [isDebugging, setIsDebugging] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { displayName } = useAuth();

  const userName = displayName || "operador";
  const [searchParams, setSearchParams] = useSearchParams();

  const {
    conversations,
    activeConversationId,
    messages,
    loadingConversations,
    loadingMessages,
    selectConversation,
    createConversation,
    startNewConversation,
    addMessage,
    updateLastAssistantContent,
    finalizeAssistantMessage,
    deleteConversation,
  } = useJarvisConversations();

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  // Focus input on mount and conversation change
  useEffect(() => {
    inputRef.current?.focus();
  }, [activeConversationId]);

  // Auto-send prompt from URL query param (e.g. from Analytics diagnostic)
  const autoSentRef = useRef(false);
  useEffect(() => {
    const prompt = searchParams.get("prompt");
    if (prompt && !autoSentRef.current && !isLoading && !loadingConversations) {
      autoSentRef.current = true;
      setSearchParams({}, { replace: true });
      setTimeout(() => send(decodeURIComponent(prompt)), 500);
    }
  }, [searchParams, isLoading, loadingConversations]);

  const debugDados = useCallback(async () => {
    if (isDebugging) return;
    setIsDebugging(true);
    setDebugData(null);
    try {
      const today = new Date();
      const todayStr = today.toISOString().split("T")[0];
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split("T")[0];
      const monthStr = todayStr.substring(0, 7);

      const [snap, goals, monthly, spendToday] = await Promise.all([
        supabase.from("daily_totals_snapshot").select("*").gte("date", yesterdayStr).lte("date", todayStr).order("date", { ascending: false }),
        supabase.from("planning_goals").select("*").lte("start_date", todayStr).gte("end_date", todayStr),
        supabase.from("monthly_goals").select("*").eq("month", monthStr),
        supabase.from("traffic_data").select("spend:spend_brl").eq("date", todayStr),
      ]);

      const totalSpendToday = (spendToday.data || []).reduce((s: number, r: any) => s + Number(r.spend || 0), 0);

      setDebugData({
        daily_totals_snapshot: { data: snap.data, error: snap.error },
        planning_goals: { data: goals.data, error: goals.error },
        monthly_goals: { data: monthly.data, error: monthly.error },
        spend_today_sum: totalSpendToday,
        spend_today_rows: (spendToday.data || []).length,
        queries: { todayStr, yesterdayStr, monthStr },
      });
    } catch (e: any) {
      setDebugData({ error: e.message });
    } finally {
      setIsDebugging(false);
    }
  }, [isDebugging]);

  const generateTasks = useCallback(async () => {
    if (isGeneratingTasks) return;
    setIsGeneratingTasks(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { toast.error("Faça login primeiro."); return; }

      const resp = await fetch(JARVIS_TASKS_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({}),
      });

      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Erro ao gerar tarefas");

      toast.success(data.message || `${data.summary?.total || 0} tarefas criadas!`);
    } catch (e: any) {
      toast.error(e.message || "Erro ao gerar tarefas");
    } finally {
      setIsGeneratingTasks(false);
    }
  }, [isGeneratingTasks]);

  const send = useCallback(async (text: string) => {
    if (!text.trim() || isLoading) return;
    setError(null);
    const trimmed = text.trim();
    setInput("");
    setIsLoading(true);
    setIsTyping(true);

    try {
      // Ensure we have a conversation
      let convId = activeConversationId;
      if (!convId) {
        convId = await createConversation(trimmed);
        if (!convId) {
          setError("Erro ao criar conversa.");
          setIsLoading(false);
          setIsTyping(false);
          return;
        }
      }

      // Save user message to DB
      await addMessage(convId, "user", trimmed);

      // Build full history for API (including the new message)
      const apiMessages = [
        ...messages.map(m => ({ role: m.role, content: m.content })),
        { role: "user", content: trimmed },
      ];

      const typingStart = Date.now();
      let assistantSoFar = "";
      let firstChunkReceived = false;

      const finalConvId = convId;

      await streamChat({
        messages: apiMessages,
        userName,
        onDelta: async (chunk) => {
          if (!firstChunkReceived) {
            firstChunkReceived = true;
            const elapsed = Date.now() - typingStart;
            if (elapsed < 1500) {
              await new Promise(r => setTimeout(r, 1500 - elapsed));
            }
            setIsTyping(false);
          }
          assistantSoFar += chunk;
          updateLastAssistantContent(assistantSoFar);
        },
        onDone: async () => {
          setIsLoading(false);
          setIsTyping(false);
          if (assistantSoFar) {
            await finalizeAssistantMessage(finalConvId, assistantSoFar);
          }
        },
        onError: (err) => {
          setError(err);
          setIsLoading(false);
          setIsTyping(false);
        },
      });
    } catch {
      setError("Erro de conexão.");
      setIsLoading(false);
      setIsTyping(false);
    }
  }, [messages, isLoading, userName, activeConversationId, createConversation, addMessage, updateLastAssistantContent, finalizeAssistantMessage]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
  const isEmptyState = !activeConversationId && messages.length === 0;

  return (
    <div className="flex h-[calc(100vh-3.5rem)] md:h-[calc(100vh-3.5rem)] bg-background" style={{ paddingBottom: isMobile ? "env(safe-area-inset-bottom, 60px)" : undefined }}>
      {/* Sidebar */}
      <JarvisConversationSidebar
        conversations={conversations}
        activeId={activeConversationId}
        loading={loadingConversations}
        onSelect={selectConversation}
        onNew={startNewConversation}
        onDelete={deleteConversation}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center gap-2 md:gap-3 px-3 md:px-6 py-3 md:py-4 border-b border-border/40 shrink-0 bg-background/80 backdrop-blur-sm">
          <button
            onClick={() => setSidebarOpen(true)}
            className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 border border-border/40 transition-colors md:hidden"
          >
            <Menu className="h-4 w-4" />
          </button>
          <div className="h-8 w-8 md:h-10 md:w-10 rounded-full bg-gradient-to-br from-primary to-destructive/80 flex items-center justify-center shadow-lg shrink-0">
            <span className="text-sm md:text-base font-bold text-primary-foreground">J</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm md:text-base font-bold text-foreground tracking-tight">JARVIS</span>
              <span className="flex items-center gap-1 text-[9px] md:text-[10px] text-muted-foreground bg-muted/50 rounded-full px-1.5 md:px-2 py-0.5">
                <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse inline-block" />
                Online
              </span>
            </div>
            <div className="text-[10px] md:text-[11px] text-muted-foreground hidden sm:block">Inteligência Operacional — Traffic OS</div>
          </div>
          <button
            onClick={generateTasks}
            disabled={isGeneratingTasks}
            className="h-7 md:h-8 px-2 md:px-3 rounded-lg flex items-center gap-1 md:gap-1.5 text-[10px] md:text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 border border-border/40 transition-colors"
            title="Gerar tarefas do dia no Todoist"
          >
            {isGeneratingTasks ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ListTodo className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">Gerar Tarefas</span>
          </button>
          <button
            onClick={debugDados}
            disabled={isDebugging}
            className="h-7 md:h-8 px-2 md:px-3 rounded-lg flex items-center gap-1 md:gap-1.5 text-[10px] md:text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 border border-border/40 transition-colors"
            title="Debug dados brutos"
          >
            {isDebugging ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">🔍 Debug</span>
          </button>
        </div>

        {/* Debug Data Display */}
        {debugData && (
          <div className="shrink-0 max-h-[50vh] overflow-y-auto border-b border-border/40 bg-muted/10 px-4 py-3">
            <div className="max-w-4xl mx-auto">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-foreground">🔍 Debug — Dados Brutos</span>
                <button onClick={() => setDebugData(null)} className="text-[10px] text-muted-foreground hover:text-foreground">Fechar</button>
              </div>
              <pre className="text-[11px] text-muted-foreground bg-background/80 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap border border-border/20">
                {JSON.stringify(debugData, null, 2)}
              </pre>
            </div>
          </div>
        )}

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 md:px-4 py-4 md:py-6 min-h-0">
          <div className="max-w-3xl mx-auto space-y-4 md:space-y-5">
            {/* Empty state — new conversation */}
            {isEmptyState && !isLoading && !loadingMessages && (
              <div className="flex flex-col items-center justify-center h-full gap-4 md:gap-6 py-8 md:py-14">
                <div className="h-16 w-16 md:h-20 md:w-20 rounded-full bg-gradient-to-br from-primary to-destructive/80 flex items-center justify-center shadow-2xl">
                  <span className="text-2xl md:text-3xl font-bold text-primary-foreground">J</span>
                </div>
                <div className="text-center">
                  <div className="text-base md:text-lg font-bold text-foreground mb-1">JARVIS</div>
                  <div className="text-xs md:text-sm text-muted-foreground max-w-[280px] md:max-w-sm">
                    E aí, {userName}. Pergunta o que quiser — tenho acesso a todos os dados da operação em tempo real.
                  </div>
                </div>
                <div className="w-full max-w-2xl px-2 space-y-4">
                  {COMMAND_CATEGORIES.map((cat) => (
                    <div key={cat.label}>
                      <div className="text-[11px] md:text-xs font-semibold text-muted-foreground mb-1.5 px-1">{cat.label}</div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 md:gap-2">
                        {cat.commands.map((cmd) => (
                          <button
                            key={cmd.title}
                            onClick={() => send(cmd.prompt)}
                            className="text-left text-[11px] md:text-xs px-3 md:px-4 py-2.5 md:py-3 rounded-xl border border-border/40 bg-muted/20 hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
                          >
                            {cmd.title}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Loading messages spinner */}
            {loadingMessages && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}

            {/* Messages */}
            {!loadingMessages && messages.map((msg) => (
              <div key={msg.id} className={cn("flex flex-col", msg.role === "user" ? "items-end" : "items-start")}>
                <div className={cn("flex items-start gap-2 md:gap-3", msg.role === "user" ? "flex-row-reverse" : "flex-row")}>
                  {msg.role === "assistant" && (
                    <div className="h-7 w-7 md:h-8 md:w-8 rounded-full bg-gradient-to-br from-primary to-destructive/80 flex items-center justify-center shrink-0 mt-0.5 shadow-md">
                      <span className="text-[10px] md:text-xs font-bold text-primary-foreground">J</span>
                    </div>
                  )}
                  <div
                    className={cn(
                      "max-w-[90%] md:max-w-[85%] rounded-2xl px-3 md:px-4 py-2.5 md:py-3 text-[13px] md:text-sm leading-relaxed",
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground rounded-br-md"
                        : "bg-muted/40 text-foreground rounded-bl-md border border-border/20"
                    )}
                  >
                    {msg.role === "assistant" ? (
                      <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1 md:prose-p:my-1.5 prose-ul:my-1 prose-li:my-0 prose-headings:my-2 prose-pre:my-1 md:prose-pre:my-1.5 prose-code:text-[10px] md:prose-code:text-xs">
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                      </div>
                    ) : (
                      msg.content
                    )}
                  </div>
                </div>
                <span className={cn("text-[9px] md:text-[10px] text-muted-foreground/40 mt-1", msg.role === "user" ? "mr-1" : "ml-9 md:ml-11")}>
                  {formatTime(msg.created_at)}
                </span>
              </div>
            ))}

            {isTyping && <TypingIndicator />}

            {error && (
              <div className="flex justify-center">
                <div className="text-xs text-destructive bg-destructive/10 rounded-lg px-4 py-2.5 border border-destructive/20">
                  {error}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Input */}
        <div className="shrink-0 border-t border-border/30 bg-background/80 backdrop-blur-sm">
          <div className="max-w-3xl mx-auto px-3 md:px-4 py-3 md:py-4">
            <div className="flex items-end gap-2 md:gap-3 bg-muted/20 rounded-2xl border border-border/30 px-3 md:px-4 py-2.5 md:py-3">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Fala comigo..."
                rows={1}
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground resize-none outline-none min-h-[24px] max-h-[120px]"
                style={{ fieldSizing: "content" } as any}
                disabled={isLoading}
              />
              <button
                onClick={() => send(input)}
                disabled={!input.trim() || isLoading}
                className={cn(
                  "h-9 w-9 rounded-xl flex items-center justify-center transition-all shrink-0",
                  input.trim() && !isLoading
                    ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
                    : "text-muted-foreground/30 cursor-not-allowed"
                )}
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
            <div className="text-center mt-2">
              <span className="text-[9px] text-muted-foreground/40">Powered by Claude · Dados em tempo real</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
