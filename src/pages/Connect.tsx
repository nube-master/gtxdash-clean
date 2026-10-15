import { useEffect, useState } from "react";
import { Copy, Check, ExternalLink, Bot, Loader2, CircleCheck, CircleAlert, RefreshCw, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID as string;
const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
const mcpUrl = `https://${projectRef}.supabase.co/functions/v1/mcp`;

type McpStatus = "loading" | "connected" | "error" | "unauthenticated";
type McpTool = { name: string; title?: string; description?: string };

async function pingMcpAuthenticated(): Promise<{
  status: McpStatus;
  latencyMs?: number;
  detail?: string;
  tools?: McpTool[];
}> {
  const started = performance.now();
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return { status: "unauthenticated", detail: "Sem sessão ativa" };

    // JSON-RPC tools/list — prova reachability + auth + lista tools disponíveis
    const res = await fetch(mcpUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "accept": "application/json, text/event-stream",
        authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    const latencyMs = Math.round(performance.now() - started);
    if (res.status === 401 || res.status === 403) {
      return { status: "unauthenticated", latencyMs, detail: `HTTP ${res.status}` };
    }
    if (!res.ok) return { status: "error", latencyMs, detail: `HTTP ${res.status}` };
    const text = await res.text();
    // Pode voltar como SSE ou JSON puro
    const jsonLine = text.trim().split("\n").find((l) => l.startsWith("{") || l.startsWith("data:"))?.replace(/^data:\s*/, "");
    const body = JSON.parse(jsonLine ?? text);
    const tools: McpTool[] = body?.result?.tools ?? [];
    return { status: "connected", latencyMs, detail: `${tools.length} tools disponíveis`, tools };
  } catch (err) {
    return { status: "error", detail: err instanceof Error ? err.message : "Falha de rede" };
  }
}

export default function Connect() {
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState<McpStatus>("loading");
  const [statusDetail, setStatusDetail] = useState<string>("");
  const [latency, setLatency] = useState<number | undefined>();
  const [tools, setTools] = useState<McpTool[]>([]);

  const runPing = async () => {
    setStatus("loading");
    const r = await pingMcpAuthenticated();
    setStatus(r.status);
    setStatusDetail(r.detail ?? "");
    setLatency(r.latencyMs);
    setTools(r.tools ?? []);
  };

  useEffect(() => { runPing(); }, []);

  const copy = async () => {
    await navigator.clipboard.writeText(mcpUrl);
    setCopied(true);
    toast.success("URL copiada");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 space-y-6">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Bot className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-semibold tracking-tight">
            Conectar assistente de IA
          </h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Cole a URL abaixo no ChatGPT ou no Claude para que eles possam consultar seus
          dados de campanhas, vendas e pacing diretamente.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            URL do servidor MCP
          </CardTitle>
          <StatusPill status={status} latency={latency} detail={statusDetail} onRefresh={runPing} />
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 rounded-lg border bg-muted/40 p-3">
            <code className="flex-1 text-sm break-all font-mono">{mcpUrl}</code>
            <Button size="sm" variant="secondary" onClick={copy} className="shrink-0">
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              <span className="ml-1.5">{copied ? "Copiado" : "Copiar"}</span>
            </Button>
          </div>
          {status === "connected" && (
            <p className="mt-2 text-xs text-emerald-600">
              ✓ Autenticado como sua conta · backend respondendo · {tools.length} ferramenta{tools.length === 1 ? "" : "s"} disponíve{tools.length === 1 ? "l" : "is"}.
            </p>
          )}
          {status === "unauthenticated" && (
            <p className="mt-2 text-xs text-amber-600">
              Servidor está no ar mas sua sessão não foi aceita. Faça logout/login e tente de novo.
            </p>
          )}
          {status === "error" && (
            <p className="mt-2 text-xs text-destructive">
              Não foi possível alcançar o servidor MCP. {statusDetail}
            </p>
          )}
        </CardContent>
      </Card>

      {tools.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Wrench className="h-4 w-4" /> O que a IA pode fazer hoje
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {tools.map((t) => (
              <div key={t.name} className="rounded-lg border bg-muted/20 p-3">
                <div className="flex items-baseline gap-2">
                  <code className="text-xs font-mono text-primary">{t.name}</code>
                  {t.title && <span className="text-sm font-medium">{t.title}</span>}
                </div>
                {t.description && (
                  <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{t.description}</p>
                )}
              </div>
            ))}
            <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
              <strong className="text-foreground">Exemplos de prompt:</strong>
              <ul className="mt-1.5 space-y-1 list-disc list-inside">
                <li>"Liste minhas pacing rules ativas"</li>
                <li>"Faça health check no MCP do GTX Dash"</li>
              </ul>
              <p className="mt-2">
                Quer que a IA <em>execute</em> ações (pausar campanha, dobrar budget, religar)? Peça pra
                gente adicionar novas tools ao MCP — hoje ele é read-only.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="chatgpt" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="chatgpt">ChatGPT</TabsTrigger>
          <TabsTrigger value="claude">Claude</TabsTrigger>
        </TabsList>

        <TabsContent value="chatgpt" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Como conectar no ChatGPT</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-4 text-sm">
                <Step n={1}>
                  Abra{" "}
                  <ExternalLinkA href="https://chatgpt.com/#settings/Connectors/Advanced">
                    Configurações → Connectors → Advanced
                  </ExternalLinkA>{" "}
                  e ative o <strong>Developer mode</strong> (leia o aviso de risco antes de ativar).
                </Step>
                <Step n={2}>
                  No compositor de chat, abra o menu <strong>"+"</strong> e ligue o{" "}
                  <strong>Developer mode</strong>.
                </Step>
                <Step n={3}>
                  Clique em <strong>Add sources</strong> e depois em{" "}
                  <strong>Connect more</strong>.
                </Step>
                <Step n={4}>
                  Dê um nome ao conector (ex: <em>GTX Dashboard</em>) e cole a URL acima
                  no campo de servidor.
                </Step>
                <Step n={5}>Peça ao ChatGPT para usar o app — pronto.</Step>
              </ol>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="claude" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Como conectar no Claude</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-4 text-sm">
                <Step n={1}>
                  Abra{" "}
                  <ExternalLinkA href="https://claude.ai/customize/connectors?modal=add-custom-connector">
                    Claude → Custom connectors
                  </ExternalLinkA>
                  .
                </Step>
                <Step n={2}>
                  Dê um nome ao conector (ex: <em>GTX Dashboard</em>) e cole a URL acima.
                </Step>
                <Step n={3}>
                  Ative o conector no compositor de chat e peça ao Claude para consultar
                  seus dados.
                </Step>
              </ol>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <p className="text-xs text-muted-foreground text-center">
        Uma vez conectado, o assistente descobre sozinho o que consegue fazer (pacing,
        vendas, criativos, etc).
      </p>
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
        {n}
      </span>
      <span className="pt-0.5 leading-relaxed">{children}</span>
    </li>
  );
}

function ExternalLinkA({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 text-primary underline underline-offset-2 hover:opacity-80"
    >
      {children}
      <ExternalLink className="h-3 w-3" />
    </a>
  );
}

function StatusPill({
  status,
  latency,
  detail,
  onRefresh,
}: {
  status: McpStatus;
  latency?: number;
  detail?: string;
  onRefresh: () => void;
}) {
  const cfg = {
    loading: { icon: Loader2, label: "Verificando…", cls: "bg-muted text-muted-foreground border-border", spin: true },
    connected: { icon: CircleCheck, label: latency != null ? `Conectado · ${latency}ms` : "Conectado", cls: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30", spin: false },
    unauthenticated: { icon: CircleAlert, label: "Sem autenticação", cls: "bg-amber-500/10 text-amber-600 border-amber-500/30", spin: false },
    error: { icon: CircleAlert, label: "Erro de conexão", cls: "bg-destructive/10 text-destructive border-destructive/30", spin: false },
  }[status];
  const Icon = cfg.icon;
  return (
    <div className="flex items-center gap-2">
      <span
        title={detail}
        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${cfg.cls}`}
      >
        <Icon className={`h-3.5 w-3.5 ${cfg.spin ? "animate-spin" : ""}`} />
        {cfg.label}
      </span>
      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7"
        onClick={onRefresh}
        disabled={status === "loading"}
        aria-label="Testar novamente"
      >
        <RefreshCw className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
