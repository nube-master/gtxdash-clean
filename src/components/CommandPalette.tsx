import { useEffect, useState, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from "@/components/ui/command";
import {
  LayoutDashboard, BarChart3, Megaphone, Shield, Palette, Play, ShoppingCart,
  DollarSign, Crosshair, Banknote, Facebook, Settings2, Users, ScrollText,
  GraduationCap, RefreshCw, Moon, Sun, Search, Gauge, Radio, Target, Eye,
  HelpCircle, Video, Bot, History, Layers,
} from "lucide-react";
import { useTheme } from "@/hooks/useTheme";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";

const pages = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard, keywords: "home overview início" },
  { title: "Pacing", url: "/pacing", icon: Gauge, keywords: "pacing controle campanhas tempo real" },
  { title: "War Room", url: "/war-room", icon: Radio, keywords: "war room relatórios reports" },
  { title: "Analytics", url: "/analytics", icon: BarChart3, keywords: "análise dados relatório" },
  { title: "Vendas", url: "/vendas", icon: ShoppingCart, keywords: "sales receita revenue" },
  { title: "Criativos", url: "/creatives", icon: Palette, keywords: "creatives imagens vídeos" },
  { title: "Offers", url: "/offers", icon: Target, keywords: "ofertas produtos" },
  { title: "Spy", url: "/spy", icon: Eye, keywords: "espionar concorrente ad library" },
  { title: "Planejamento", url: "/planning", icon: Crosshair, keywords: "metas goals planning" },
  { title: "Fluxo de Caixa", url: "/cashflow", icon: Banknote, keywords: "cashflow saldo dinheiro" },
  { title: "Campanhas", url: "/campaigns", icon: Megaphone, keywords: "campaigns ads anúncios" },
  { title: "Contingência", url: "/assets", icon: Shield, keywords: "contas bm business manager" },
  { title: "VSLs", url: "/vsls", icon: Play, keywords: "vídeo retenção vturb" },
  { title: "Performance VSL", url: "/performance-vsl", icon: Video, keywords: "performance vsl criativos" },
  { title: "Meta Ads", url: "/meta-ads", icon: Facebook, keywords: "meta facebook ads contas" },
  { title: "Central Financeira", url: "/unit-economics", icon: DollarSign, keywords: "financeiro custos p&l" },
  { title: "Reconciliação", url: "/financial/reconciliation", icon: Layers, keywords: "reconciliacao cartão extrato" },
  { title: "Meta IA", url: "/gtx-meta-ia", icon: Facebook, keywords: "inteligência artificial ai decisões" },
  { title: "Jarvis", url: "/jarvis", icon: Bot, keywords: "jarvis ia análise" },
  { title: "Histórico Pacing", url: "/pacing/historico", icon: History, keywords: "histórico pacing log auditoria" },
  { title: "Score Rules", url: "/pacing/score-rules", icon: Crosshair, keywords: "score rules regras pontuação" },
  { title: "Budget Groups", url: "/pacing/budget-groups", icon: DollarSign, keywords: "budget groups orçamento grupos" },
  { title: "Talent Bank", url: "/talent-bank", icon: Users, keywords: "talent bank rh recrutamento" },
  { title: "Academy", url: "/academy", icon: GraduationCap, keywords: "escola cursos aprendizado" },
  { title: "Ao Vivo", url: "/ao-vivo", icon: Radio, keywords: "ao vivo live" },
  { title: "Media Channels", url: "/media-channels", icon: Megaphone, keywords: "media channels canais" },
  { title: "Integrações", url: "/integrations", icon: Settings2, keywords: "api webhook meta redtrack" },
  { title: "Acessos", url: "/admin/users", icon: Users, keywords: "usuários admin permissões" },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();
  const queryClient = useQueryClient();
  const { isAdmin, canAccessPage } = useAuth();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const handleSelect = useCallback((url: string) => {
    setOpen(false);
    navigate(url);
  }, [navigate]);

  const handleRefresh = useCallback(() => {
    setOpen(false);
    queryClient.invalidateQueries();
  }, [queryClient]);

  const handleToggleTheme = useCallback(() => {
    setOpen(false);
    toggleTheme();
  }, [toggleTheme]);

  const visiblePages = pages.filter((p) => {
    if (p.url === "/integrations" || p.url === "/admin/users") return isAdmin;
    if (p.url === "/war-room") return isAdmin;
    return canAccessPage(p.url);
  });

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Buscar página ou ação..." />
      <CommandList>
        <CommandEmpty>Nenhum resultado encontrado.</CommandEmpty>
        <CommandGroup heading="Páginas">
          {visiblePages.map((page) => (
            <CommandItem
              key={page.url}
              value={`${page.title} ${page.keywords}`}
              onSelect={() => handleSelect(page.url)}
              className="gap-3"
            >
              <page.icon className="h-4 w-4 text-muted-foreground" />
              <span>{page.title}</span>
              {location.pathname === page.url && (
                <span className="ml-auto text-[10px] text-primary font-medium">atual</span>
              )}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Ações">
          <CommandItem onSelect={handleRefresh} className="gap-3">
            <RefreshCw className="h-4 w-4 text-muted-foreground" />
            <span>Atualizar dados</span>
            <span className="ml-auto text-[10px] text-muted-foreground font-mono">R</span>
          </CommandItem>
          <CommandItem onSelect={handleToggleTheme} className="gap-3">
            {theme === "dark" ? <Sun className="h-4 w-4 text-muted-foreground" /> : <Moon className="h-4 w-4 text-muted-foreground" />}
            <span>{theme === "dark" ? "Modo claro" : "Modo escuro"}</span>
            <span className="ml-auto text-[10px] text-muted-foreground font-mono">T</span>
          </CommandItem>
          <CommandItem
            onSelect={() => {
              setOpen(false);
              setTimeout(() => document.dispatchEvent(new CustomEvent("shortcuts:toggle")), 50);
            }}
            className="gap-3"
            value="atalhos teclado shortcuts ajuda help"
          >
            <HelpCircle className="h-4 w-4 text-muted-foreground" />
            <span>Mostrar atalhos de teclado</span>
            <span className="ml-auto text-[10px] text-muted-foreground font-mono">?</span>
          </CommandItem>
          <CommandItem
            onSelect={() => {
              setOpen(false);
              setTimeout(() => {
                const search = document.querySelector<HTMLInputElement>(
                  'input[type="search"], input[placeholder*="uscar" i], input[placeholder*="earch" i]'
                );
                search?.focus();
                search?.select?.();
              }, 50);
            }}
            className="gap-3"
            value="buscar focar search filtro"
          >
            <Search className="h-4 w-4 text-muted-foreground" />
            <span>Focar busca da página</span>
            <span className="ml-auto text-[10px] text-muted-foreground font-mono">.</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
