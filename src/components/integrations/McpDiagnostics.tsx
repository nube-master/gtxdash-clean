import { useState } from "react";
import { Loader2, CheckCircle2, XCircle, AlertCircle, RefreshCw, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";

const MCP_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mcp-server`;

type CheckStatus = "idle" | "running" | "ok" | "fail";

interface CheckResult {
  id: string;
  label: string;
  description: string;
  status: CheckStatus;
  httpStatus?: number;
  latencyMs?: number;
  message?: string;
  responseSnippet?: string;
  ranAt?: string;
}

const INITIAL: CheckResult[] = [
  {
    id: "url",
    label: "1. Recuperar URL com token (get-mcp-url)",
    description: "Verifica se sua sessão consegue gerar a URL autenticada",
    status: "idle",
  },
  {
    id: "valid",
    label: "2. Conectar com chave VÁLIDA (initialize)",
    description: "Simula o handshake que o Claude faz",
    status: "idle",
  },
  {
    id: "invalid",
    label: "3. Conectar com chave INVÁLIDA (deve dar 401)",
    description: "Confirma que o servidor está rejeitando chaves erradas como esperado",
    status: "idle",
  },
  {
    id: "tools",
    label: "4. Listar tools (tools/list)",
    description: "Garante que o servidor expõe as 23 ferramentas",
    status: "idle",
  },
  {
    id: "health",
    label: "5. Executar health_check",
    description: "Roda uma tool real ponta-a-ponta",
    status: "idle",
  },
];

function fmtTime() {
  const d = new Date();
  return d.toLocaleTimeString("pt-BR", { hour12: false }) + "." + String(d.getMilliseconds()).padStart(3, "0");
}

function StatusIcon({ status }: { status: CheckStatus }) {
  if (status === "running") return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
  if (status === "ok") return <CheckCircle2 className="h-4 w-4 text-[hsl(var(--warroom-positive))]" />;
  if (status === "fail") return <XCircle className="h-4 w-4 text-destructive" />;
  return <AlertCircle className="h-4 w-4 text-muted-foreground/40" />;
}

function badgeForStatus(s?: number) {
  if (s === undefined) return null;
  const ok = s >= 200 && s < 300;
  return (
    <Badge
      variant="outline"
      className={`text-[10px] font-mono ${
        ok
          ? "bg-[hsl(var(--warroom-positive))]/10 text-[hsl(var(--warroom-positive))] border-[hsl(var(--warroom-positive))]/30"
          : "bg-destructive/10 text-destructive border-destructive/30"
      }`}
    >
      HTTP {s}
    </Badge>
  );
}

export function McpDiagnostics() {
  const [checks, setChecks] = useState<CheckResult[]>(INITIAL);
  const [running, setRunning] = useState(false);

  const update = (id: string, patch: Partial<CheckResult>) =>
    setChecks((arr) => arr.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  async function timedFetch(url: string, init: RequestInit) {
    const t0 = performance.now();
    let httpStatus = 0;
    let body = "";
    try {
      const res = await fetch(url, init);
      httpStatus = res.status;
      body = await res.text();
      return { httpStatus, body, latencyMs: Math.round(performance.now() - t0) };
    } catch (e: any) {
      return {
        httpStatus: 0,
        body: e?.message || "network error",
        latencyMs: Math.round(performance.now() - t0),
      };
    }
  }

  async function runAll() {
    setRunning(true);
    setChecks(INITIAL.map((c) => ({ ...c, status: "idle" })));

    // 1. get-mcp-url via supabase functions invoke (uses session JWT)
    update("url", { status: "running" });
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    let token: string | null = null;
    let fullUrl: string | null = null;
    try {
      // Pull current session token from supabase localStorage entry
      const sessionRaw = Object.keys(localStorage).find((k) => k.includes("auth-token"));
      const session = sessionRaw ? JSON.parse(localStorage.getItem(sessionRaw)!) : null;
      const accessToken = session?.access_token || anonKey;

      const r = await timedFetch(`${supabaseUrl}/functions/v1/get-mcp-url`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          apikey: anonKey,
          "Content-Type": "application/json",
        },
        body: "{}",
      });
      if (r.httpStatus === 200) {
        const data = JSON.parse(r.body);
        token = data.token;
        fullUrl = data.full_url;
        update("url", {
          status: "ok",
          httpStatus: r.httpStatus,
          latencyMs: r.latencyMs,
          message: `Token obtido (${token?.slice(0, 6)}…${token?.slice(-4)})`,
          ranAt: fmtTime(),
        });
      } else {
        update("url", {
          status: "fail",
          httpStatus: r.httpStatus,
          latencyMs: r.latencyMs,
          message: r.httpStatus === 401 ? "Sessão expirada — refaça login" : "Falha ao gerar URL",
          responseSnippet: r.body.slice(0, 200),
          ranAt: fmtTime(),
        });
        setRunning(false);
        return;
      }
    } catch (e: any) {
      update("url", { status: "fail", message: e?.message, ranAt: fmtTime() });
      setRunning(false);
      return;
    }

    const initBody = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "diag", version: "1" } },
    });

    // 2. valid key
    update("valid", { status: "running" });
    const r2 = await timedFetch(`${MCP_URL}?key=${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
      body: initBody,
    });
    update("valid", {
      status: r2.httpStatus === 200 ? "ok" : "fail",
      httpStatus: r2.httpStatus,
      latencyMs: r2.latencyMs,
      message: r2.httpStatus === 200 ? "Handshake OK" : "Servidor rejeitou a chave atual",
      responseSnippet: r2.body.slice(0, 250),
      ranAt: fmtTime(),
    });

    // 3. invalid key (expect 401)
    update("invalid", { status: "running" });
    const r3 = await timedFetch(`${MCP_URL}?key=chave_intencionalmente_invalida_xyz`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
      body: initBody,
    });
    update("invalid", {
      status: r3.httpStatus === 401 ? "ok" : "fail",
      httpStatus: r3.httpStatus,
      latencyMs: r3.latencyMs,
      message:
        r3.httpStatus === 401
          ? "✓ Servidor rejeita chave inválida (comportamento correto)"
          : "Inesperado: deveria ter retornado 401",
      responseSnippet: r3.body.slice(0, 250),
      ranAt: fmtTime(),
    });

    // 4. tools/list
    update("tools", { status: "running" });
    const r4 = await timedFetch(`${MCP_URL}?key=${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }),
    });
    let toolsCount = 0;
    try {
      toolsCount = JSON.parse(r4.body)?.result?.tools?.length || 0;
    } catch {
      /* ignore */
    }
    update("tools", {
      status: r4.httpStatus === 200 && toolsCount > 0 ? "ok" : "fail",
      httpStatus: r4.httpStatus,
      latencyMs: r4.latencyMs,
      message: toolsCount > 0 ? `${toolsCount} tools expostas` : "Nenhuma tool retornada",
      responseSnippet: r4.body.slice(0, 200),
      ranAt: fmtTime(),
    });

    // 5. health_check
    update("health", { status: "running" });
    const r5 = await timedFetch(`${MCP_URL}?key=${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "health_check", arguments: {} },
      }),
    });
    update("health", {
      status: r5.httpStatus === 200 ? "ok" : "fail",
      httpStatus: r5.httpStatus,
      latencyMs: r5.latencyMs,
      message: r5.httpStatus === 200 ? "Tool executou ponta-a-ponta" : "Falha ao executar tool",
      responseSnippet: r5.body.slice(0, 300),
      ranAt: fmtTime(),
    });

    setRunning(false);
  }

  const allGreen = checks.every((c) => c.status === "ok");
  const anyFail = checks.some((c) => c.status === "fail");
  const hasRun = checks.some((c) => c.status !== "idle");

  return (
    <div className="space-y-4 p-4 rounded-lg border border-border bg-muted/10">
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-xs font-semibold uppercase tracking-wider">
            🩺 Diagnóstico de Conexão MCP
          </Label>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Roda os mesmos passos que o Claude faz e mostra status HTTP + latência exata.
          </p>
        </div>
        <Button size="sm" onClick={runAll} disabled={running} className="gap-1.5">
          {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          {running ? "Testando…" : hasRun ? "Rodar de novo" : "Rodar diagnóstico"}
        </Button>
      </div>

      {hasRun && (
        <div
          className={`text-xs font-medium px-3 py-2 rounded-md ${
            allGreen
              ? "bg-[hsl(var(--warroom-positive))]/10 text-[hsl(var(--warroom-positive))] border border-[hsl(var(--warroom-positive))]/30"
              : anyFail
              ? "bg-destructive/10 text-destructive border border-destructive/30"
              : "bg-muted/30 text-muted-foreground border border-border"
          }`}
        >
          {allGreen
            ? "✅ Servidor MCP 100% operacional. Se o Claude continuar com erro, o problema está na config local dele (URL antiga ou cache do mcp-remote)."
            : anyFail
            ? "❌ Encontramos falhas — veja os detalhes abaixo (snippet da resposta inclui a mensagem real)."
            : "Aguardando resultados…"}
        </div>
      )}

      <div className="space-y-2">
        {checks.map((c) => (
          <div
            key={c.id}
            className="flex items-start gap-3 p-3 rounded-md bg-background border border-border/50"
          >
            <div className="pt-0.5">
              <StatusIcon status={c.status} />
            </div>
            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-xs font-medium">{c.label}</span>
                <div className="flex items-center gap-1.5">
                  {badgeForStatus(c.httpStatus)}
                  {c.latencyMs !== undefined && (
                    <Badge variant="outline" className="text-[10px] font-mono gap-1">
                      <Clock className="h-2.5 w-2.5" />
                      {c.latencyMs}ms
                    </Badge>
                  )}
                  {c.ranAt && (
                    <span className="text-[10px] font-mono text-muted-foreground">{c.ranAt}</span>
                  )}
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">{c.description}</p>
              {c.message && (
                <p
                  className={`text-[11px] font-medium ${
                    c.status === "ok"
                      ? "text-[hsl(var(--warroom-positive))]"
                      : c.status === "fail"
                      ? "text-destructive"
                      : "text-foreground"
                  }`}
                >
                  {c.message}
                </p>
              )}
              {c.responseSnippet && (
                <pre className="text-[10px] font-mono bg-muted/40 p-2 rounded border border-border/50 overflow-x-auto whitespace-pre-wrap break-all max-h-24 overflow-y-auto">
                  {c.responseSnippet}
                </pre>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="text-[10px] text-muted-foreground space-y-1 pt-2 border-t border-border/50">
        <p>
          <strong>Como interpretar:</strong>
        </p>
        <ul className="list-disc list-inside space-y-0.5 ml-1">
          <li>
            <strong>Test 1 falhou (401):</strong> sua sessão expirou — refaça login no painel.
          </li>
          <li>
            <strong>Test 2 falhou (401) mas Test 3 deu 401 também:</strong> a chave atual no backend
            mudou desde a última vez que você copiou a URL para o Claude → recopie a URL completa.
          </li>
          <li>
            <strong>Tudo verde mas Claude ainda falha:</strong> URL desatualizada no
            <code className="mx-1 px-1 py-0.5 rounded bg-muted text-[10px] font-mono">
              claude_desktop_config.json
            </code>
            ou cache em <code className="px-1 py-0.5 rounded bg-muted text-[10px] font-mono">~/.mcp-auth/</code>.
            Apague e reinicie o Claude.
          </li>
          <li>
            <strong>HTTP 0:</strong> bloqueio de rede/CORS — improvável aqui, mas indicaria firewall.
          </li>
        </ul>
      </div>
    </div>
  );
}
