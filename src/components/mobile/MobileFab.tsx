import { useCallback } from "react";
import {
  Menu, X, LayoutDashboard, BarChart3, Megaphone, Palette, Play, DollarSign,
  Crosshair, Facebook, Shield, ShoppingCart, ScrollText, Settings2, Users,
  LogOut, User, Banknote, GraduationCap, Radio, Bot, UserSearch, FileSearch,
  Package, Search, Gauge, Bell,
} from "lucide-react";
import trafficOsLogo from "@/assets/traffic-os-logo.png";
import type { LucideIcon } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/contexts/AuthContext";
import { useOperation, type OperationFeature } from "@/contexts/OperationContext";
import { cn } from "@/lib/utils";
import { canAccessCOD } from "@/lib/codAccess";

type MobileNavItem = {
  title: string;
  url: string;
  icon: LucideIcon;
  feature?: OperationFeature;
  adminOnly?: boolean;
};

// Mirror of AppSidebar groups (keep in sync with src/components/AppSidebar.tsx)
const operacaoNav: MobileNavItem[] = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard, feature: "dashboard" },
  { title: "Analytics", url: "/analytics", icon: BarChart3, feature: "analytics" },
  { title: "Campanhas", url: "/campaigns", icon: Megaphone, feature: "campaigns" },
  { title: "Meta Ads", url: "/pacing", icon: Gauge, feature: "pacing_controller" },
  { title: "Canais de Mídia", url: "/media-channels", icon: Radio },
];

const conteudoNav: MobileNavItem[] = [
  { title: "Criativos", url: "/creatives", icon: Palette, feature: "creatives" },
  { title: "VSLs", url: "/vsls", icon: Play, feature: "vsls" },
  { title: "Ao Vivo", url: "/ao-vivo", icon: Radio, feature: "ao_vivo" },
  { title: "Offers", url: "/offers", icon: Package, feature: null },
  { title: "Spy", url: "/spy", icon: Search, feature: null },
];

const financeiroNav: MobileNavItem[] = [
  { title: "Vendas", url: "/vendas", icon: ShoppingCart, feature: "vendas" },
  { title: "Central Financeira", url: "/unit-economics", icon: DollarSign, feature: "central_financeira" },
  { title: "Dashboard COD", url: "/dashboard/cod", icon: Package },
  { title: "Planejamento", url: "/planning", icon: Crosshair, feature: "planning" },
  { title: "Fluxo de Caixa", url: "/cashflow", icon: Banknote, feature: "cashflow" },
];

const infraNav: MobileNavItem[] = [
  { title: "Contingência", url: "/assets", icon: Shield, feature: "contingencia" },
  { title: "Academy", url: "/academy", icon: GraduationCap, feature: "academy" },
  { title: "Banco de Talentos", url: "/talent-bank", icon: UserSearch, feature: "talent_bank" },
];

const sistemaNav: MobileNavItem[] = [
  { title: "War Room", url: "/war-room", icon: ScrollText, feature: "war_room", adminOnly: true },
  { title: "Notificações Pushcut", url: "/notificacoes-pushcut", icon: Bell, adminOnly: true },
  { title: "App no celular e notificações", url: "/notifications", icon: Bell },
  { title: "Integrações", url: "/integrations", icon: Settings2, feature: "integrations", adminOnly: true },
  { title: "Acessos", url: "/admin/users", icon: Users, feature: "acessos", adminOnly: true },
];

interface MobileDrawerProps {
  open: boolean;
  onClose: () => void;
}

export function MobileDrawer({ open, onClose }: MobileDrawerProps) {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, displayName, roles, isAdmin, signOut, canAccessPage } = useAuth();
  const { operation, userRole, isFeatureEnabled } = useOperation();

  const handleNav = useCallback((url: string) => {
    navigate(url);
    onClose();
  }, [navigate, onClose]);

  if (!isMobile) return null;

  const passesFeature = (i: MobileNavItem) => (i.feature ? isFeatureEnabled(i.feature) : true);
  const passesRole = (i: MobileNavItem) => (!i.adminOnly || isAdmin);
  const passesAccess = (i: MobileNavItem) => canAccessPage(i.url);
  const passesCOD = (i: MobileNavItem) => i.url !== "/dashboard/cod" || canAccessCOD({ operation, userRole, roles, isAdmin, hasPagePermission: canAccessPage("/dashboard/cod") });
  const filterGroup = (items: MobileNavItem[]) =>
    items.filter((i) => passesRole(i) && passesFeature(i) && passesAccess(i) && passesCOD(i));

  const groups: { label: string; items: MobileNavItem[] }[] = [
    { label: "Operação", items: filterGroup(operacaoNav) },
    { label: "Conteúdo", items: filterGroup(conteudoNav) },
    { label: "Financeiro", items: filterGroup(financeiroNav) },
    { label: "Infraestrutura", items: filterGroup(infraNav) },
    { label: "Sistema", items: filterGroup(sistemaNav) },
  ].filter((g) => g.items.length > 0);

  const renderItem = (item: MobileNavItem) => {
    const active =
      location.pathname === item.url ||
      (item.url !== "/" && location.pathname.startsWith(item.url));
    return (
      <button
        key={item.url}
        onClick={() => handleNav(item.url)}
        className={cn(
          "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors mb-0.5",
          active
            ? "bg-primary/10 text-primary font-medium"
            : "text-muted-foreground hover:bg-accent/10 hover:text-foreground"
        )}
      >
        <item.icon className="h-4 w-4 shrink-0" />
        <span>{item.title}</span>
      </button>
    );
  };

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm animate-fade-in"
          onClick={onClose}
          style={{ animationDuration: "0.2s" }}
        />
      )}

      <div
        className={cn(
          "fixed top-0 left-0 bottom-0 z-[70] w-[240px] flex flex-col transition-transform duration-300 ease-out",
          open ? "translate-x-0" : "-translate-x-full"
        )}
        style={{ background: "hsl(220 14% 5%)" }}
      >
        {/* Header — logo + wordmark (mesmo do desktop) */}
        <div className="relative flex items-center gap-2.5 px-3 py-3.5 border-b" style={{ borderColor: "hsl(var(--primary) / 0.1)" }}>
          <div className="h-10 w-10 rounded-lg overflow-hidden shrink-0">
            <img src={trafficOsLogo} alt="Traffic OS" className="h-full w-full object-cover rounded-lg" />
          </div>
          <div className="flex flex-col min-w-0 leading-tight pr-8">
            <span className="text-[13px] font-bold tracking-wide">
              <span className="text-primary">TRAFFIC</span>{" "}
              <span className="text-foreground">OS</span>
            </span>
            <span className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground truncate">
              Profitable Scale System
            </span>
          </div>
          <button
            onClick={onClose}
            className="absolute right-2 top-2 h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Fechar menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>


        {/* Nav items - grouped, scrollable */}
        <div className="flex-1 overflow-y-auto py-3 px-2 overscroll-contain">
          {groups.map((g, idx) => (
            <div key={g.label} className={cn(idx > 0 && "mt-3")}>
              {idx > 0 && (
                <div className="mb-3 mx-3 border-t" style={{ borderColor: "hsl(var(--primary) / 0.08)" }} />
              )}
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium px-3 mb-2">
                {g.label}
              </p>
              {g.items.map(renderItem)}
            </div>
          ))}
          <div className="h-4" />
        </div>

        {/* Footer */}
        <div className="border-t p-3 space-y-3" style={{ borderColor: "hsl(var(--primary) / 0.08)" }}>
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
              <User className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-foreground truncate">{displayName || "Usuário"}</p>
              <p className="text-[10px] text-muted-foreground truncate">{user?.email || ""}</p>
            </div>
            <button onClick={signOut} className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors" title="Sair">
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex items-center justify-center gap-2 py-1">
            <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" style={{ boxShadow: "0 0 8px hsl(var(--primary) / 0.7)" }} />
            <span className="text-[9px] tracking-[0.2em] uppercase font-mono text-muted-foreground">GTX OS v3.0</span>
          </div>
        </div>
      </div>
    </>
  );
}

interface MobileFabProps {
  onOpen: () => void;
  badgeCount?: number;
  hasNewSale?: boolean;
}

export function MobileFab({ onOpen, badgeCount = 0, hasNewSale = false }: MobileFabProps) {
  const isMobile = useIsMobile();

  if (!isMobile) return null;

  return (
    <button
      onClick={onOpen}
      className={cn("mobile-fab", hasNewSale && "mobile-fab-pulse")}
      aria-label="Menu de navegação"
    >
      <Menu className="h-5 w-5" />
      {badgeCount > 0 && (
        <span className="mobile-fab-badge">{badgeCount > 9 ? "9+" : badgeCount}</span>
      )}
    </button>
  );
}
