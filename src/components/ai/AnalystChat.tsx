import { useState, useRef, useEffect, useCallback } from "react";
import { Bot, X, Send, Sparkles, Trash2, Loader2, ListTodo } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import ReactMarkdown from "react-markdown";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

type ChatMsg = { role: "user" | "assistant"; content: string; timestamp: Date };

const JARVIS_TASKS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/jarvis-tasks`;
const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyst-chat`;

const SUGGESTIONS = [
  "Como está a performance de hoje?",
  "Qual o ROAS do mês?",
  "Quais campanhas estão dando prejuízo?",
  "Projeção de lucro pra fechar o mês?",
];

function formatTime(date: Date) {
  return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="flex items-start gap-2">
        <div className="h-7 w-7 rounded-full bg-primary/20 flex items-center justify-center shrink-0 mt-0.5">
          <span className="text-[11px] font-bold text-primary">J</span>
        </div>
        <div className="bg-muted/50 rounded-2xl rounded-bl-md px-4 py-3 border border-border/30">
          <div className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "0ms" }} />
            <span className="h-2 w-2 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "150ms" }} />
            <span className="h-2 w-2 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "300ms" }} />
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
  messages: ChatMsg[];
  userName: string;
  onDelta: (text: string) => void;
  onDone: () => void;
  onError: (err: string) => void;
}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) { onError("Faça login para usar o JARVIS."); return; }

  const apiMessages = messages.map(m => ({ role: m.role, content: m.content }));

  const resp = await fetch(CHAT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ messages: apiMessages, user_name: userName }),
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

export function AnalystChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [isGeneratingTasks, setIsGeneratingTasks] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const isMobile = useIsMobile();
  const { displayName } = useAuth();

  const userName = displayName || "operador";

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
      
      setMessages(prev => [
        ...prev,
        { role: "assistant", content: `🤖 **Tarefas do dia criadas no Todoist!**\n\n${data.message}\n\n${(data.tasks || []).map((t: any) => `- ${t.content}`).join("\n")}`, timestamp: new Date() },
      ]);
    } catch (e: any) {
      toast.error(e.message || "Erro ao gerar tarefas");
    } finally {
      setIsGeneratingTasks(false);
    }
  }, [isGeneratingTasks]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, open, isTyping]);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  const send = useCallback(async (text: string) => {
    if (!text.trim() || isLoading) return;
    setError(null);
    const userMsg: ChatMsg = { role: "user", content: text.trim(), timestamp: new Date() };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput("");
    setIsLoading(true);
    setIsTyping(true);

    // Show typing indicator for at least 1.5s
    const typingStart = Date.now();

    let assistantSoFar = "";
    let firstChunkReceived = false;

    const upsert = async (chunk: string) => {
      if (!firstChunkReceived) {
        firstChunkReceived = true;
        const elapsed = Date.now() - typingStart;
        if (elapsed < 1500) {
          await new Promise(r => setTimeout(r, 1500 - elapsed));
        }
        setIsTyping(false);
      }
      assistantSoFar += chunk;
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant" && last === prev[prev.length - 1]) {
          return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: assistantSoFar } : m));
        }
        return [...prev, { role: "assistant", content: assistantSoFar, timestamp: new Date() }];
      });
    };

    try {
      await streamChat({
        messages: updatedMessages,
        userName,
        onDelta: upsert,
        onDone: () => { setIsLoading(false); setIsTyping(false); },
        onError: (err) => { setError(err); setIsLoading(false); setIsTyping(false); },
      });
    } catch {
      setError("Erro de conexão.");
      setIsLoading(false);
      setIsTyping(false);
    }
  }, [messages, isLoading, userName]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  return (
    <>
      {/* FAB */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className={cn(
            "fixed z-[60] rounded-full shadow-2xl flex items-center justify-center transition-all duration-300",
            "bg-gradient-to-br from-primary to-primary/80 text-primary-foreground hover:scale-110 hover:shadow-primary/40",
            isMobile ? "bottom-20 right-4 h-12 w-12" : "bottom-6 right-6 h-14 w-14"
          )}
          title="JARVIS"
        >
          <Sparkles className="h-6 w-6" />
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div
          className={cn(
            "fixed z-[60] flex flex-col bg-background border border-border/60 shadow-2xl rounded-2xl overflow-hidden transition-all duration-300",
            isMobile
              ? "inset-2 bottom-16"
              : "bottom-6 right-6 w-[420px] h-[600px] max-h-[80vh]"
          )}
        >
          {/* Header */}
          <div className="flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-primary/10 to-primary/5 border-b border-border/40 shrink-0">
            <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center">
              <span className="text-sm font-bold text-primary">J</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-foreground">JARVIS</div>
              <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-primary inline-block" />
                Online · Conectado aos dados
              </div>
            </div>
            <button
              onClick={generateTasks}
              disabled={isGeneratingTasks}
              className="h-7 px-2 rounded-md flex items-center gap-1 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors text-[10px] font-medium"
              title="Gerar tarefas do dia no Todoist"
            >
              {isGeneratingTasks ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ListTodo className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">Tarefas</span>
            </button>
            <button
              onClick={() => { setMessages([]); setError(null); }}
              className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
              title="Limpar conversa"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setOpen(false)}
              className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-4 min-h-0">
            {messages.length === 0 && !isLoading && (
              <div className="flex flex-col items-center justify-center h-full gap-4 py-8">
                <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="text-2xl font-bold text-primary">J</span>
                </div>
                <div className="text-center">
                  <div className="text-sm font-semibold text-foreground mb-1">JARVIS</div>
                  <div className="text-xs text-muted-foreground max-w-[260px]">
                    E aí, {userName}. Pergunta o que quiser — tenho acesso a todos os dados da operação em tempo real.
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-1.5 w-full max-w-[300px]">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="text-left text-[11px] px-3 py-2 rounded-lg border border-border/50 bg-muted/30 hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={cn("flex flex-col", msg.role === "user" ? "items-end" : "items-start")}>
                <div className={cn("flex items-start gap-2", msg.role === "user" ? "flex-row-reverse" : "flex-row")}>
                  {msg.role === "assistant" && (
                    <div className="h-7 w-7 rounded-full bg-primary/20 flex items-center justify-center shrink-0 mt-0.5">
                      <span className="text-[11px] font-bold text-primary">J</span>
                    </div>
                  )}
                  <div
                    className={cn(
                      "max-w-[80%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed",
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground rounded-br-md"
                        : "bg-muted/50 text-foreground rounded-bl-md border border-border/30"
                    )}
                  >
                    {msg.role === "assistant" ? (
                      <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-ul:my-1 prose-li:my-0 prose-headings:my-2 prose-pre:my-1 prose-code:text-[11px]">
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                      </div>
                    ) : (
                      msg.content
                    )}
                  </div>
                </div>
                <span className={cn("text-[9px] text-muted-foreground/50 mt-1", msg.role === "user" ? "mr-1" : "ml-9")}>
                  {formatTime(msg.timestamp)}
                </span>
              </div>
            ))}

            {isTyping && <TypingIndicator />}

            {error && (
              <div className="flex justify-center">
                <div className="text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2 border border-destructive/20">
                  {error}
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="px-3 pb-3 pt-1 shrink-0 border-t border-border/30">
            <div className="flex items-end gap-2 bg-muted/30 rounded-xl border border-border/40 px-3 py-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Fala comigo..."
                rows={1}
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground resize-none outline-none min-h-[24px] max-h-[100px]"
                style={{ fieldSizing: "content" } as any}
                disabled={isLoading}
              />
              <button
                onClick={() => send(input)}
                disabled={!input.trim() || isLoading}
                className={cn(
                  "h-8 w-8 rounded-lg flex items-center justify-center transition-all shrink-0",
                  input.trim() && !isLoading
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "text-muted-foreground/40 cursor-not-allowed"
                )}
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
            <div className="text-center mt-1.5">
              <span className="text-[9px] text-muted-foreground/50">Powered by Claude · Dados em tempo real</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
