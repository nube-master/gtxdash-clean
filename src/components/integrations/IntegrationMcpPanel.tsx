import { useState, useEffect } from "react";
import { Copy, Check, ExternalLink, Shield, Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { McpDiagnostics } from "./McpDiagnostics";

const MCP_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mcp-server`;

const TOOL_GROUPS = [
  {
    label: "Dashboard & Analytics",
    tools: [
      { name: "get_dashboard", desc: "Totais consolidados: spend, revenue, lucro, ROAS, CPA" },
      { name: "get_daily_performance", desc: "Snapshots diários: spend, revenue, lucro, ROAS por dia" },
      { name: "get_traffic_by_campaign", desc: "Breakdown de tráfego por campanha e dia" },
      { name: "get_spend_by_account", desc: "Investimento diário por conta Meta Ads" },
    ],
  },
  {
    label: "Campanhas",
    tools: [
      { name: "get_campaigns", desc: "Performance detalhada por campanha" },
      { name: "get_campaign_statuses", desc: "Status atual de todas as campanhas (ACTIVE, PAUSED...)" },
    ],
  },
  {
    label: "Criativos & VSL",
    tools: [
      { name: "get_creatives", desc: "Performance de criativos: spend, cliques, views de vídeo" },
      { name: "get_vsl_performance", desc: "Retenção de VSLs e atribuição UTM" },
    ],
  },
  {
    label: "Vendas",
    tools: [
      { name: "get_sales", desc: "Vendas recentes de todas as fontes (CartPanda, ClickBank, RedTrack)" },
    ],
  },
  {
    label: "Financeiro",
    tools: [
      { name: "get_financial_summary", desc: "P&L: custos fixos, ajustes manuais, metas mensais" },
      { name: "get_fixed_costs", desc: "Custos fixos ativos da operação" },
      { name: "get_meta_financials", desc: "Saldo, spend cap e cartões das contas Meta" },
      { name: "get_exchange_rate", desc: "Taxa de câmbio USD → BRL + histórico" },
    ],
  },
  {
    label: "Fluxo de Caixa & Planejamento",
    tools: [
      { name: "get_cashflow", desc: "Configurações e lançamentos do fluxo de caixa" },
      { name: "get_planning", desc: "Metas mensais e progresso atual" },
    ],
  },
  {
    label: "Contingência / Ativos",
    tools: [
      { name: "get_contingency", desc: "Infraestrutura: contas, BMs, regras de mapeamento" },
      { name: "get_account_statuses", desc: "Status atual de todas as contas Meta" },
      { name: "get_account_status_history", desc: "Histórico de mudanças de status" },
    ],
  },
  {
    label: "Sistema & Integrações",
    tools: [
      { name: "health_check", desc: "Status geral do sistema" },
      { name: "get_integration_logs", desc: "Logs de sincronização das integrações" },
      { name: "get_notification_config", desc: "Destinatários e templates de notificações" },
      { name: "get_app_settings", desc: "Configurações globais da aplicação" },
      { name: "ask_analyst", desc: "Pergunta livre ao analista de IA" },
    ],
  },
];

export function IntegrationMcpPanel() {
  const [copied, setCopied] = useState<string | null>(null);
  const [fullUrl, setFullUrl] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loadingUrl, setLoadingUrl] = useState(false);
  const [showToken, setShowToken] = useState(false);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    toast.success(`${label} copiado!`);
    setTimeout(() => setCopied(null), 2000);
  };

  const loadFullUrl = async () => {
    if (fullUrl) return;
    setLoadingUrl(true);
    try {
      const { data, error } = await supabase.functions.invoke("get-mcp-url");
      if (error) throw error;
      if (data?.full_url) {
        setFullUrl(data.full_url);
        setToken(data.token);
      } else {
        throw new Error("Resposta inválida do servidor");
      }
    } catch (e: any) {
      toast.error(e?.message || "Falha ao carregar URL com token");
    } finally {
      setLoadingUrl(false);
    }
  };

  useEffect(() => {
    loadFullUrl();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const maskedUrl = fullUrl && token
    ? fullUrl.replace(token, `${token.slice(0, 6)}${"•".repeat(Math.max(0, token.length - 10))}${token.slice(-4)}`)
    : null;

  const mcpConfigUrl = fullUrl ?? `${MCP_URL}?key=<SEU_DASHBOARD_API_KEY>`;

  const mcpConfig = JSON.stringify(
    {
      mcpServers: {
        "traffic-os": {
          url: mcpConfigUrl,
        },
      },
    },
    null,
    2
  );

  const totalTools = TOOL_GROUPS.reduce((s, g) => s + g.tools.length, 0);

  return (
    <div className="space-y-6">
      {/* Status */}
      <div className="flex items-center gap-2">
        <Badge
          variant="outline"
          className="text-[11px] font-mono gap-1 bg-[hsl(var(--warroom-positive))]/10 text-[hsl(var(--warroom-positive))] border-[hsl(var(--warroom-positive))]/30"
        >
          <Shield className="h-3 w-3" />
          Ativo — v3.0 (Streamable HTTP)
        </Badge>
        <span className="text-xs text-muted-foreground">
          {totalTools} ferramentas disponíveis
        </span>
      </div>

      {/* URL base */}
      <div className="space-y-2">
        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          URL Base do Servidor MCP
        </Label>
        <div className="flex gap-2">
          <Input readOnly value={MCP_URL} className="font-mono text-xs bg-muted/30" />
          <Button
            size="icon"
            variant="outline"
            className="shrink-0"
            onClick={() => copyToClipboard(MCP_URL, "URL")}
          >
            {copied === "URL" ? <Check className="h-4 w-4 text-[hsl(var(--warroom-positive))]" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* URL com token (pronta para Claude) */}
      <div className="space-y-2 p-4 rounded-lg bg-primary/5 border border-primary/20">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-semibold text-foreground uppercase tracking-wider">
            🔑 URL Completa com Token (cole no Claude)
          </Label>
          {fullUrl && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs gap-1.5"
              onClick={() => setShowToken((s) => !s)}
            >
              {showToken ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
              {showToken ? "Ocultar" : "Mostrar"}
            </Button>
          )}
        </div>

        {loadingUrl && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Carregando token...
          </div>
        )}

        {!loadingUrl && fullUrl && (
          <>
            <div className="flex gap-2">
              <Input
                readOnly
                value={showToken ? fullUrl : (maskedUrl ?? fullUrl)}
                className="font-mono text-xs bg-background"
              />
              <Button
                size="icon"
                variant="default"
                className="shrink-0"
                onClick={() => copyToClipboard(fullUrl, "URL completa")}
              >
                {copied === "URL completa" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Esta URL contém seu token de acesso. <strong>Não compartilhe</strong> com terceiros — qualquer pessoa com este link pode ler os dados da sua operação.
            </p>
          </>
        )}

        {!loadingUrl && !fullUrl && (
          <Button size="sm" variant="outline" onClick={loadFullUrl} className="text-xs">
            Tentar novamente
          </Button>
        )}
      </div>

      {/* Diagnóstico de conexão */}
      <McpDiagnostics />

      {/* Auth */}
      <div className="space-y-2">
        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Autenticação
        </Label>
        <p className="text-xs text-muted-foreground">
          Header <code className="px-1 py-0.5 rounded bg-muted text-[11px] font-mono">Authorization: Bearer &lt;DASHBOARD_API_KEY&gt;</code> ou
          query param <code className="px-1 py-0.5 rounded bg-muted text-[11px] font-mono">?key=&lt;DASHBOARD_API_KEY&gt;</code>
        </p>
      </div>

      {/* Config JSON */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Configuração para Claude / AI
          </Label>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs gap-1.5"
            onClick={() => copyToClipboard(mcpConfig, "Config")}
          >
            {copied === "Config" ? <Check className="h-3 w-3 text-[hsl(var(--warroom-positive))]" /> : <Copy className="h-3 w-3" />}
            Copiar JSON
          </Button>
        </div>
        <pre className="p-4 rounded-lg bg-muted/30 border border-border text-xs font-mono overflow-x-auto whitespace-pre leading-relaxed">
          {mcpConfig}
        </pre>
      </div>

      {/* Tools by group */}
      <div className="space-y-4">
        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Ferramentas Disponíveis ({totalTools})
        </Label>
        {TOOL_GROUPS.map((group) => (
          <div key={group.label} className="space-y-2">
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              {group.label}
            </h4>
            <div className="grid grid-cols-1 gap-1.5">
              {group.tools.map((tool) => (
                <div
                  key={tool.name}
                  className="flex items-start gap-3 p-2.5 rounded-lg bg-muted/20 border border-border/50"
                >
                  <code className="text-[11px] font-mono font-semibold text-primary shrink-0 mt-0.5">
                    {tool.name}
                  </code>
                  <span className="text-[11px] text-muted-foreground">{tool.desc}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Instructions */}
      <div className="p-4 rounded-lg bg-primary/5 border border-primary/20 space-y-2">
        <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
          <ExternalLink className="h-3.5 w-3.5 text-primary" />
          Como conectar
        </h4>
        <ol className="text-xs text-muted-foreground space-y-1.5 list-decimal list-inside">
          <li>Copie o JSON de configuração acima</li>
          <li>No Claude Desktop ou outro cliente MCP, adicione como novo servidor</li>
          <li>Substitua <code className="px-1 py-0.5 rounded bg-muted text-[11px] font-mono">&lt;SEU_DASHBOARD_API_KEY&gt;</code> pelo seu token real</li>
          <li>Teste com o comando <code className="px-1 py-0.5 rounded bg-muted text-[11px] font-mono">health_check</code></li>
        </ol>
      </div>
    </div>
  );
}
