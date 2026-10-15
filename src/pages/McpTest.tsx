import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const MCP_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mcp-server`;

type LogEntry = { t: string; kind: "info" | "ok" | "err" | "evt" | "tx" | "rx"; msg: string };

export default function McpTest() {
  const [token, setToken] = useState(() => localStorage.getItem("mcp_test_token") || "");
  const [sessionId, setSessionId] = useState<string>("");
  const [connected, setConnected] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const log = (kind: LogEntry["kind"], msg: string) =>
    setLogs((l) => [...l, { t: new Date().toISOString().slice(11, 23), kind, msg }]);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  useEffect(() => {
    if (token) localStorage.setItem("mcp_test_token", token);
  }, [token]);

  const connect = async () => {
    if (!token) {
      log("err", "Informe o token primeiro.");
      return;
    }
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    log("info", `GET ${MCP_URL} (SSE)…`);
    try {
      const res = await fetch(`${MCP_URL}?token=${encodeURIComponent(token)}`, {
        method: "GET",
        headers: { Accept: "text/event-stream" },
        signal: ctrl.signal,
      });
      const sid = res.headers.get("Mcp-Session-Id") || "";
      setSessionId(sid);
      log(sid ? "ok" : "err", `HTTP ${res.status} — Mcp-Session-Id: ${sid || "(ausente)"}`);
      if (!res.ok || !res.body) {
        const txt = await res.text().catch(() => "");
        log("err", `Falha: ${txt || res.statusText}`);
        return;
      }
      setConnected(true);
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buf = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += value;
        const events = buf.split(/\n\n/);
        buf = events.pop() || "";
        for (const evt of events) {
          if (!evt.trim()) continue;
          if (evt.startsWith(":")) {
            log("evt", `comment: ${evt.slice(1).trim()}`);
          } else {
            log("rx", evt);
          }
        }
      }
      log("info", "Stream encerrado.");
    } catch (e: any) {
      if (e?.name === "AbortError") log("info", "Conexão cancelada.");
      else log("err", `Erro: ${e?.message || String(e)}`);
    } finally {
      setConnected(false);
    }
  };

  const disconnect = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setConnected(false);
  };

  const postRpc = async (label: string, payload: unknown) => {
    log("tx", `→ ${label}: ${JSON.stringify(payload)}`);
    try {
      const res = await fetch(MCP_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          Authorization: `Bearer ${token}`,
          ...(sessionId ? { "Mcp-Session-Id": sessionId } : {}),
        },
        body: JSON.stringify(payload),
      });
      const ct = res.headers.get("Content-Type") || "";
      const body = ct.includes("application/json") ? JSON.stringify(await res.json()) : await res.text();
      log(res.ok ? "ok" : "err", `← HTTP ${res.status} ${ct} ${body.slice(0, 800)}`);
    } catch (e: any) {
      log("err", `POST falhou: ${e?.message || String(e)}`);
    }
  };

  const doInitialize = () =>
    postRpc("initialize", {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "mcp-test-page", version: "1.0" } },
    });

  const doToolsList = () => postRpc("tools/list", { jsonrpc: "2.0", id: 2, method: "tools/list" });

  const doDashboardSnapshot = () =>
    postRpc("tools/call get_dashboard_snapshot", {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "get_dashboard_snapshot", arguments: {} },
    });

  const doListCreatives = () =>
    postRpc("tools/call list_creatives", {
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "list_creatives", arguments: { min_spend: 100 } },
    });

  const doHealthCheck = () =>
    postRpc("tools/call health_check", {
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: { name: "health_check", arguments: {} },
    });

  const doPing = () => postRpc("ping", { jsonrpc: "2.0", id: 6, method: "ping" });

  const clearLogs = () => setLogs([]);

  const kindColor: Record<LogEntry["kind"], string> = {
    info: "text-muted-foreground",
    ok: "text-emerald-500",
    err: "text-red-500",
    evt: "text-blue-400",
    tx: "text-amber-400",
    rx: "text-cyan-400",
  };

  return (
    <div className="container mx-auto p-6 space-y-4 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold">MCP Server — Teste de Conexão</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Testar novamente as tools via curl para confirmar que todas respondem corretamente sem erro "Tool not found".
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            Configuração
            <Badge variant={connected ? "default" : "secondary"}>
              {connected ? "Conectado" : "Desconectado"}
            </Badge>
            {sessionId && <Badge variant="outline" className="font-mono text-[10px]">{sessionId.slice(0, 8)}…</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Endpoint</Label>
            <Input value={MCP_URL} readOnly className="font-mono text-xs" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Token (gtx_… ou DASHBOARD_API_KEY)</Label>
            <Input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="gtx_xxxxxxxxxxxxxxxx"
              className="font-mono text-xs"
            />
          </div>
          <div className="flex flex-wrap gap-2 pt-2">
            {!connected ? (
              <Button onClick={connect} size="sm">Abrir SSE (GET)</Button>
            ) : (
              <Button onClick={disconnect} size="sm" variant="destructive">Fechar stream</Button>
            )}
            <Button onClick={doInitialize} size="sm" variant="outline" disabled={!token}>initialize</Button>
            <Button onClick={doToolsList} size="sm" variant="outline" disabled={!token}>tools/list</Button>
            <Button onClick={doDashboardSnapshot} size="sm" variant="outline" disabled={!token}>Snapshot</Button>
             <Button onClick={doListCreatives} size="sm" variant="outline" disabled={!token}>Creatives</Button>
            <Button onClick={doHealthCheck} size="sm" variant="outline" disabled={!token}>Health</Button>
            <Button onClick={doPing} size="sm" variant="outline" disabled={!token}>ping</Button>
            <Button onClick={clearLogs} size="sm" variant="ghost" className="ml-auto">Limpar logs</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Logs ({logs.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-black/40 rounded p-3 h-[460px] overflow-auto font-mono text-[11px] leading-relaxed">
            {logs.length === 0 ? (
              <div className="text-muted-foreground">Sem eventos ainda. Clique em "Abrir SSE" para iniciar.</div>
            ) : (
              logs.map((l, i) => (
                <div key={i} className={kindColor[l.kind]}>
                  <span className="text-muted-foreground">[{l.t}]</span>{" "}
                  <span className="uppercase">{l.kind}</span>{" "}
                  <span className="whitespace-pre-wrap break-all">{l.msg}</span>
                </div>
              ))
            )}
            <div ref={logsEndRef} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Como conectar no Claude.ai</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <p>1. Em <strong>Claude.ai → Settings → Connectors → Add custom connector</strong>.</p>
          <p>2. Cole a URL: <code className="text-xs">{MCP_URL}</code></p>
          <p>3. Authentication: <strong>Bearer token</strong> → cole seu <code>gtx_…</code></p>
          <p>4. Se o cliente não permitir Bearer no GET, use: <code className="text-xs">{MCP_URL}?token=SEU_TOKEN</code></p>
        </CardContent>
      </Card>
    </div>
  );
}
