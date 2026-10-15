import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOperation } from "@/contexts/OperationContext";
import { CheckCircle2, Settings2, Plug, Maximize2, Minimize2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { IntegrationCartPandaPanel } from "@/components/integrations/IntegrationCartPandaPanel";
import { IntegrationMetaPanel } from "@/components/integrations/IntegrationMetaPanel";
import { IntegrationNewsbreakPanel } from "@/components/integrations/IntegrationNewsbreakPanel";
import { IntegrationClickBankPanel } from "@/components/integrations/IntegrationClickBankPanel";
import { IntegrationDigistore24Panel } from "@/components/integrations/IntegrationDigistore24Panel";
import { IntegrationHotmartPanel } from "@/components/integrations/IntegrationHotmartPanel";
import { IntegrationVturbPanel } from "@/components/integrations/IntegrationVturbPanel";
import { IntegrationRedTrackPanel } from "@/components/integrations/IntegrationRedTrackPanel";
import { IntegrationTaboolaPanel } from "@/components/integrations/IntegrationTaboolaPanel";
import { IntegrationMcpPanel } from "@/components/integrations/IntegrationMcpPanel";
import { IntegrationMgidPanel } from "@/components/integrations/IntegrationMgidPanel";
import { SphereIntegrationPanel } from "@/components/integrations/shphere/SphereIntegrationPanel";
import { FahtoIntegrationPanel } from "@/components/integrations/fahto/FahtoIntegrationPanel";
import { HwIntegrationPanel } from "@/components/integrations/hw/HwIntegrationPanel";
import { WebhookLogsPanel } from "@/components/integrations/WebhookLogsPanel";

import { IntegrationLogsPanel } from "@/components/integrations/IntegrationLogsPanel";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import logoMetaAsset from "@/assets/facebook-logo.webp.asset.json";
const logoMeta = logoMetaAsset.url;
import logoCartPanda from "@/assets/logos/cartpanda.png";
import logoClickBank from "@/assets/logos/clickbank.png";
import logoDigistore24 from "@/assets/logos/digistore24.png";
import logoHotmart from "@/assets/logos/hotmart.png";
import logoVturb from "@/assets/logos/vturb.png";
import logoRedTrack from "@/assets/logos/redtrack.png";
import logoMcp from "@/assets/logos/mcp.png";
import logoNewsbreak from "@/assets/logos/newsbreak.png";
import logoMgid from "@/assets/logos/mgid.png";
import logoHw from "@/assets/logos/hw.svg";
import logoTaboolaAsset from "@/assets/logos/taboola.png.asset.json";
const logoTaboola = logoTaboolaAsset.url;

type IntegrationId = "meta-ads" | "newsbreak" | "taboola" | "mgid" | "cartpanda" | "clickbank" | "digistore24" | "hotmart" | "redtrack" | "vturb" | "mcp" | "shphere" | "fahto" | "hw";

interface IntegrationDef {
  id: IntegrationId;
  name: string;
  category: string;
  logo: string;
  borderColor: string;
  description: string;
}

const integrations: IntegrationDef[] = [
  {
    id: "meta-ads",
    name: "Meta Ads",
    category: "Plataformas de Anúncio",
    logo: logoMeta,
    borderColor: "border-[hsl(var(--warroom-info))]/40",
    description: "Importe dados de impressões, CPM, CPC e gastos diretamente da Meta (Facebook/Instagram Ads).",
  },
  {
    id: "newsbreak",
    name: "Newsbreak Ads",
    category: "Plataformas de Anúncio",
    logo: logoNewsbreak,
    borderColor: "border-destructive/40",
    description: "Sincronize spend, campanhas e criativos do Newsbreak Ads via API oficial (Access Token).",
  },
  {
    id: "taboola",
    name: "Taboola Ads",
    category: "Plataformas de Anúncio",
    logo: logoTaboola,
    borderColor: "border-[#005aff]/40",
    description: "Sincronize spend, campanhas e conversões do Taboola via API oficial (Client ID + Client Secret).",
  },
  {
    id: "mgid",
    name: "MGID Ads",
    category: "Plataformas de Anúncio",
    logo: logoMgid,
    borderColor: "border-[hsl(24,95%,55%)]/40",
    description: "Sincronize spend, campanhas e estatísticas diárias do MGID Ads via API oficial (Client ID + API Token).",
  },
  {
    id: "cartpanda",
    name: "CartPanda",
    category: "Plataformas de Venda",
    logo: logoCartPanda,
    borderColor: "border-primary/40",
    description: "Receba vendas aprovadas automaticamente via webhook (postback S2S).",
  },
  {
    id: "clickbank",
    name: "ClickBank",
    category: "Plataformas de Venda",
    logo: logoClickBank,
    borderColor: "border-[hsl(var(--warroom-info))]/40",
    description: "Receba vendas e eventos da ClickBank automaticamente via IPN (Instant Payment Notification).",
  },
  {
    id: "digistore24",
    name: "Digistore24",
    category: "Plataformas de Venda",
    logo: logoDigistore24,
    borderColor: "border-[hsl(var(--warroom-warning))]/40",
    description: "Receba vendas aprovadas automaticamente via IPN (Instant Payment Notification) do Digistore24.",
  },
  {
    id: "hotmart",
    name: "Hotmart",
    category: "Plataformas de Venda",
    logo: logoHotmart,
    borderColor: "border-[hsl(24,95%,53%)]/40",
    description: "Receba vendas aprovadas, reembolsos e chargebacks via Postback 2.0 da Hotmart (BRL/USD/EUR).",
  },
  {
    id: "vturb",
    name: "Vturb",
    category: "Plataformas de Vídeo",
    logo: logoVturb,
    borderColor: "border-[hsl(var(--warroom-warning))]/40",
    description: "Hospedagem de vídeos com métricas de conversão e play rate.",
  },
  {
    id: "redtrack",
    name: "RedTrack",
    category: "Rastreamento",
    logo: logoRedTrack,
    borderColor: "border-destructive/40",
    description: "Plataforma de rastreamento e otimização de campanhas de tráfego.",
  },
  {
    id: "mcp",
    name: "MCP Server",
    category: "Inteligência Artificial",
    logo: logoMcp,
    borderColor: "border-purple-500/40",
    description: "Conecte assistentes de IA (Claude, ChatGPT) aos dados da operação via Model Context Protocol.",
  },
  {
    id: "shphere",
    name: "Shphere",
    category: "Plataformas de Venda",
    logo: logoCartPanda, // Fallback temporary
    borderColor: "border-primary/40",
    description: "Receba vendas COD (Cash on Delivery) automaticamente via webhook da Shphere.",
  },
  {
    id: "fahto",
    name: "Fahto",
    category: "Plataformas de Venda",
    logo: logoCartPanda, // Fallback temporary
    borderColor: "border-primary/40",
    description: "Receba vendas COD (Cash on Delivery) automaticamente via webhook da Fahto.",
  },
  {
    id: "hw",
    name: "H&W",
    category: "Plataformas de Venda",
    logo: logoHw,
    borderColor: "border-primary/40",
    description: "Colete webhooks do checkout H&W para validar o payload antes de ativar vendas e notificações.",
  },
];


const categories = ["Plataformas de Anúncio", "Plataformas de Venda", "Plataformas de Vídeo", "Rastreamento", "Inteligência Artificial"];

const LS_KEY = "tos_integration_panel_expanded";

export default function Integrations() {
  const { operationId } = useOperation();
  const [activePanel, setActivePanel] = useState<IntegrationId | null>(null);
  const [isExpanded, setIsExpanded] = useState(() => {
    try { return localStorage.getItem(LS_KEY) === "true"; } catch { return false; }
  });

  const toggleExpanded = useCallback(() => {
    setIsExpanded((prev) => {
      const next = !prev;
      try { localStorage.setItem(LS_KEY, String(next)); } catch {}
      return next;
    });
  }, []);

  // Keyboard shortcut: Shift+Enter to toggle expand
  useEffect(() => {
    if (!activePanel) return;
    const handler = (e: KeyboardEvent) => {
      if (e.shiftKey && e.key === "Enter") { e.preventDefault(); toggleExpanded(); }
      if (e.key === "Escape") { setActivePanel(null); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [activePanel, toggleExpanded]);

  const { data: logs } = useQuery({
    queryKey: ["integration-logs", operationId],
    queryFn: async () => {
      let query = supabase
        .from("integration_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);
      if (operationId) query = query.eq("operation_id", operationId);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  const getStatus = (integrationId: string): "connected" | "not_configured" => {
    if (integrationId === "mcp") return "connected";
    const log = logs?.find((l) => l.integration === integrationId);
    return log ? "connected" : "not_configured";
  };

  const connectedCount = integrations.filter((i) => getStatus(i.id) === "connected").length;
  const activeDef = integrations.find((i) => i.id === activePanel);

  return (
    <div className="full-width-page w-full space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10 border border-primary/20">
            <Plug className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Integrações</h1>
            <p className="text-sm text-muted-foreground">
              Conecte suas plataformas de vídeo, vendas e rastreamento para centralizar suas métricas
            </p>
          </div>
        </div>
        <Badge variant="outline" className="text-xs font-mono gap-1.5 px-3 py-1.5">
          <CheckCircle2 className="h-3.5 w-3.5 text-[hsl(var(--warroom-positive))]" />
          {connectedCount} conectadas
        </Badge>
      </div>

      <div className="h-px bg-border" />

      {/* Cards by category */}
      {categories.map((cat) => {
        const items = integrations.filter((i) => i.category === cat);
        if (items.length === 0) return null;
        return (
          <div key={cat} className="space-y-4">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              {cat}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {items.map((item) => {
                const status = getStatus(item.id);
                const isConnected = status === "connected";
                return (
                  <button
                    key={item.id}
                    onClick={() => setActivePanel(item.id)}
                    className={`group relative text-left rounded-xl border-2 bg-card p-5 transition-all hover:shadow-md hover:border-primary/30 ${
                      isConnected ? item.borderColor : "border-border"
                    }`}
                  >
                    <div className={`absolute inset-x-0 top-0 h-[3px] rounded-t-xl ${
                      isConnected ? "bg-[hsl(var(--warroom-positive))]" : "bg-transparent"
                    }`} />
                    <div className="flex items-start gap-4">
                      <div className="p-1.5 rounded-lg bg-muted/50 border border-border/50 overflow-hidden">
                        <img src={item.logo} alt={item.name} className="h-8 w-8 rounded object-contain p-0.5" loading="lazy" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-sm font-semibold text-foreground">{item.name}</span>
                        </div>
                        <span className="text-[11px] text-muted-foreground">{item.category}</span>
                      </div>
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground leading-relaxed line-clamp-2">
                      {item.description}
                    </p>
                    <div className="mt-4 flex items-center justify-between">
                      {isConnected ? (
                        <Badge variant="outline" className="text-[11px] font-mono gap-1 bg-[hsl(var(--warroom-positive))]/10 text-[hsl(var(--warroom-positive))] border-[hsl(var(--warroom-positive))]/30">
                          <CheckCircle2 className="h-3 w-3" />
                          Conectado
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[11px] font-mono text-muted-foreground">
                          Não configurado
                        </Badge>
                      )}
                      <span className="flex items-center gap-1.5 text-xs text-primary font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                        <Settings2 className="h-3.5 w-3.5" />
                        {isConnected ? "Editar" : "Configurar"}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Logs section */}
      <IntegrationLogsPanel logs={logs} />
      <WebhookLogsPanel />

      {/* Integration Panel — Expandable Drawer */}
      {activePanel && activeDef && (
        <>
          {/* Backdrop */}
          <div
            className={cn(
              "fixed inset-0 z-40 bg-background/80 transition-opacity duration-200",
              isExpanded ? "opacity-100" : "opacity-60"
            )}
            onClick={() => setActivePanel(null)}
          />

          {/* Panel */}
          <div
            className={cn(
              "fixed z-50 top-0 right-0 h-full bg-card border-l border-border shadow-2xl flex flex-col transition-all duration-200 ease-in-out",
              isExpanded
                ? "left-0 w-full border-l-0"
                : "w-full sm:w-[540px] md:w-[600px] lg:w-[640px]"
            )}
          >
            {/* Panel Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-1.5 rounded-lg bg-muted/50 border border-border/50 overflow-hidden">
                  <img src={activeDef.logo} alt={activeDef.name} className="h-7 w-7 rounded object-contain p-0.5" loading="lazy" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-foreground">{activeDef.name}</h2>
                  <p className="text-xs text-muted-foreground">{activeDef.description}</p>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                      onClick={toggleExpanded}
                    >
                      {isExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">
                    {isExpanded ? "Minimizar" : "Expandir"} <kbd className="ml-1.5 px-1 py-0.5 rounded bg-muted text-[10px] font-mono">⇧↵</kbd>
                  </TooltipContent>
                </Tooltip>

                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  onClick={() => setActivePanel(null)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Panel Content */}
            <ScrollArea className="flex-1 min-h-0">
              <div className={cn(
                "p-5 pb-10 space-y-6",
                isExpanded ? "max-w-full px-8" : ""
              )}>
                {activePanel === "meta-ads" && <IntegrationMetaPanel />}
                {activePanel === "newsbreak" && <IntegrationNewsbreakPanel />}
                {activePanel === "taboola" && <IntegrationTaboolaPanel />}
                {activePanel === "mgid" && <IntegrationMgidPanel />}
                {activePanel === "cartpanda" && <IntegrationCartPandaPanel />}
                {activePanel === "clickbank" && <IntegrationClickBankPanel />}
                {activePanel === "digistore24" && <IntegrationDigistore24Panel />}
                {activePanel === "hotmart" && <IntegrationHotmartPanel />}
                {activePanel === "redtrack" && <IntegrationRedTrackPanel />}
                {activePanel === "vturb" && <IntegrationVturbPanel />}
                {activePanel === "mcp" && <IntegrationMcpPanel />}
                {activePanel === "shphere" && <SphereIntegrationPanel />}
                {activePanel === "fahto" && <FahtoIntegrationPanel />}
                {activePanel === "hw" && <HwIntegrationPanel />}

              </div>
            </ScrollArea>
          </div>
        </>
      )}
    </div>
  );
}
