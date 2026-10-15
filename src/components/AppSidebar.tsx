import {
  LayoutDashboard,
  BarChart3,
  Megaphone,
  Palette,
  Play,
  DollarSign,
  Crosshair,
  Banknote,
  Facebook,
  Settings2,
  LogOut,
  Users,
  Shield,
  ScrollText,
  ShoppingCart,
  GraduationCap,
  Bot,
  Crown,
  Activity,
  UserSearch,
  Radio,
  FileSearch,
  Package,
  Search,
  Gauge,
  Bell,
  BellRing,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useOperation, type OperationFeature } from "@/contexts/OperationContext";
import {
  Sidebar,
  SidebarContent,
  useSidebar,
} from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useCallback, useRef, useState, useMemo } from "react";
import { useLocation } from "react-router-dom";

import { SidebarFavorites, type FavoriteItem } from "@/components/sidebar/SidebarFavorites";
import { SidebarRecentes, type RecentItem } from "@/components/sidebar/SidebarRecentes";
import { NavGroup, type NavItem } from "@/components/sidebar/SidebarNavGroup";
import { SidebarFooterBlock } from "@/components/sidebar/SidebarFooterBlock";
import { SidebarWorkspaceHeader } from "@/components/sidebar/SidebarWorkspaceHeader";
import { useSidebarFavorites } from "@/hooks/useSidebarFavorites";
import { useSidebarRecentes } from "@/hooks/useSidebarRecentes";
import { useDashboardTotals } from "@/hooks/useDashboardTotals";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import { canAccessCOD } from "@/lib/codAccess";

/* ─── Navigation Groups ─── */
const operacaoNav: NavItem[] = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard, roles: null },
  { title: "Analytics", url: "/analytics", icon: BarChart3, roles: null },
  { title: "Campanhas", url: "/campaigns", icon: Megaphone, roles: null },
  { title: "Meta Ads", url: "/pacing", icon: Facebook, roles: null },
  { title: "Canais de Mídia", url: "/media-channels", icon: Radio, roles: null },
];

const conteudoNav: NavItem[] = [
  { title: "Criativos", url: "/creatives", icon: Palette, roles: null },
  { title: "VSLs", url: "/vsls", icon: Play, roles: null },
  { title: "Ao Vivo", url: "/ao-vivo", icon: Radio, roles: null },
  { title: "Offers", url: "/offers", icon: Package, roles: null },
  { title: "Spy", url: "/spy", icon: Search, roles: null },
];

const financeiroNav: NavItem[] = [
  { title: "Vendas", url: "/vendas", icon: ShoppingCart, roles: null },
  { title: "Central Financeira", url: "/unit-economics", icon: DollarSign, roles: null },
  { title: "Dashboard COD", url: "/dashboard/cod", icon: Package, roles: null },
  { title: "Planejamento", url: "/planning", icon: Crosshair, roles: null },
  { title: "Fluxo de Caixa", url: "/cashflow", icon: Banknote, roles: null },
  // { title: "Reconciliação", url: "/financial/reconciliation", icon: FileSearch, roles: ["admin"] },
];

const infraNav: NavItem[] = [
  { title: "Contingência", url: "/assets", icon: Shield, roles: null },
  { title: "Academy", url: "/academy", icon: GraduationCap, roles: null },
  { title: "Banco de Talentos", url: "/talent-bank", icon: UserSearch, roles: null },
];

const sistemaNav: NavItem[] = [
  { title: "Pushcut & Relatórios", url: "/war-room", icon: ScrollText, roles: ["admin"] },
  { title: "Notificações Pushcut", url: "/notificacoes-pushcut", icon: Bell, roles: ["admin"] },
  { title: "App no celular e notificações", url: "/notifications", icon: Bell, roles: null },
  { title: "Notificações & Usuários", url: "/notification-users", icon: BellRing, roles: ["admin"] },
  { title: "Conectar IA", url: "/connect", icon: Bot, roles: null },
  { title: "Integrações", url: "/integrations", icon: Settings2, roles: ["admin"] },
  { title: "Acessos", url: "/admin/users", icon: Users, roles: ["admin"] },
];

const allNavItems: NavItem[] = [...operacaoNav, ...conteudoNav, ...financeiroNav, ...infraNav, ...sistemaNav];

/* ─── Main Sidebar ─── */
export function AppSidebar() {
  const { user, displayName, avatarUrl, roles, isAdmin, signOut, canAccessPage } = useAuth();
  const { isFeatureEnabled, operation, userRole } = useOperation();
  const { state, setOpen, isMobile } = useSidebar();
  const collapsed = state === "collapsed";
  const leaveTimer = useRef<ReturnType<typeof setTimeout>>();
  const enterTimer = useRef<ReturnType<typeof setTimeout>>();
  const [pinned, setPinned] = useState(false);
  const { favoriteUrls, toggleFavorite } = useSidebarFavorites();
  const recenteUrls = useSidebarRecentes();
  const { data: totals } = useDashboardTotals();
  const { data: isSuperAdmin } = useSuperAdmin();

  const salesBadge = (totals?.totalConversions ?? 0) > 0 ? `+${totals?.totalConversions}` : null;

  // Map URLs to features for gating
  const FEATURE_URL_MAP: Record<string, OperationFeature> = {
    "/": "dashboard",
    "/analytics": "analytics",
    "/campaigns": "campaigns",
    "/pacing": "pacing_controller",
    "/media-channels": "analytics",
    "/gtx-meta-ia": "meta_ia",
    "/jarvis": "jarvis",
    "/creatives": "creatives",
    "/vsls": "vsls",
    "/ao-vivo": "ao_vivo",
    "/offers": "creatives",
    "/spy": "jarvis",
    "/vendas": "vendas",
    "/unit-economics": "central_financeira",
    "/dashboard/cod": "dashboard",
    "/profit-audit": "central_financeira",
    "/planning": "planning",
    "/cashflow": "cashflow",
    "/assets": "contingencia",
    "/academy": "academy",
    "/talent_bank": "talent_bank",
    "/war-room": "war_room",
    "/notificacoes-pushcut": "war_room",
    "/connect": "integrations",
    "/integrations": "integrations",
    "/admin/users": "acessos",
  };

  const applyFeatureGating = useCallback((items: NavItem[]): NavItem[] => {
    return items.filter((item) => {
      if (isAdmin) return true;
      const feature = FEATURE_URL_MAP[item.url];
      if (feature && !isFeatureEnabled(feature)) return false;
      return true;
    });
  }, [isFeatureEnabled]);

  const financeiroNavWithBadges = useMemo(() => {
    // Libera a aba COD para qualquer op GTX ou usuários privilegiados.
    const isGtx = canAccessCOD({ operation, userRole, roles, isAdmin, hasPagePermission: canAccessPage("/dashboard/cod") });
    return applyFeatureGating(financeiroNav)
      .filter((item) => item.url !== "/dashboard/cod" || isGtx)
      .map((item) => {
        if (item.url === "/vendas" && salesBadge) {
          return { ...item, badge: salesBadge, badgeColor: "bg-emerald-500/15 text-emerald-500" };
        }
        return item;
      });
  }, [salesBadge, applyFeatureGating, operation, userRole, roles, isAdmin, canAccessPage]);

  const gatedOperacaoNav = useMemo(() => applyFeatureGating(operacaoNav), [applyFeatureGating]);
  const gatedConteudoNav = useMemo(() => applyFeatureGating(conteudoNav), [applyFeatureGating]);
  const gatedInfraNav = useMemo(() => applyFeatureGating(infraNav), [applyFeatureGating]);
  const gatedSistemaNav = useMemo(() => applyFeatureGating(sistemaNav), [applyFeatureGating]);

  const canSee = (navRoles: string[] | null, url: string) => {
    if (isAdmin) return true;
    if (navRoles && !navRoles.some((r) => roles.includes(r as any))) return false;
    return canAccessPage(url);
  };

  const favoriteItems: FavoriteItem[] = favoriteUrls
    .map((url) => allNavItems.find((n) => n.url === url))
    .filter(Boolean) as FavoriteItem[];

  const recenteItems: RecentItem[] = recenteUrls
    .filter((url) => url !== location.pathname && !favoriteUrls.includes(url))
    .map((url) => allNavItems.find((n) => n.url === url))
    .filter(Boolean) as RecentItem[];

  const handleMouseEnter = useCallback(() => {
    if (isMobile || pinned) return;
    clearTimeout(leaveTimer.current);
    enterTimer.current = setTimeout(() => setOpen(true), 300);
  }, [setOpen, isMobile, pinned]);

  const handleMouseLeave = useCallback(() => {
    if (isMobile || pinned) return;
    clearTimeout(enterTimer.current);
    leaveTimer.current = setTimeout(() => setOpen(false), 200);
  }, [setOpen, isMobile, pinned]);

  const togglePin = useCallback(() => {
    setPinned((prev) => {
      const next = !prev;
      if (next) {
        clearTimeout(leaveTimer.current);
        clearTimeout(enterTimer.current);
        setOpen(true);
      }
      return next;
    });
  }, [setOpen]);

  const initials = (displayName || user?.email || "U").slice(0, 2).toUpperCase();

  return (
    <TooltipProvider delayDuration={0}>
      <div onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave} className="hidden md:block">
        <Sidebar
          collapsible="icon"
          className="border-r bg-sidebar"
          style={{ borderColor: "var(--sidebar-border)" }}
        >
          {/* Header with brand + operation selector */}
          <SidebarWorkspaceHeader collapsed={collapsed} pinned={pinned} togglePin={togglePin} />

          {/* Content */}
          <SidebarContent className="px-1.5 py-2 space-y-0.5">
            <SidebarFavorites collapsed={collapsed} favorites={favoriteItems} onRemove={toggleFavorite} />
            <NavGroup label="Operação" items={gatedOperacaoNav} canSee={canSee} collapsed={collapsed} onFavoriteToggle={toggleFavorite} favoriteUrls={favoriteUrls} />
            <NavGroup label="Conteúdo" items={gatedConteudoNav} canSee={canSee} collapsed={collapsed} onFavoriteToggle={toggleFavorite} favoriteUrls={favoriteUrls} />
            <NavGroup label="Financeiro" items={financeiroNavWithBadges} canSee={canSee} collapsed={collapsed} onFavoriteToggle={toggleFavorite} favoriteUrls={favoriteUrls} />
            <NavGroup label="Infraestrutura" items={gatedInfraNav} canSee={canSee} collapsed={collapsed} onFavoriteToggle={toggleFavorite} favoriteUrls={favoriteUrls} />
            {gatedSistemaNav.some((i) => canSee(i.roles, i.url)) && (
              <NavGroup label="Sistema" items={gatedSistemaNav} canSee={canSee} collapsed={collapsed} onFavoriteToggle={toggleFavorite} favoriteUrls={favoriteUrls} />
            )}
            {isSuperAdmin && (
              <NavGroup label="Super Admin" items={[
                { title: "Painel SA", url: "/super-admin", icon: Crown, roles: null },
                { title: "System Health", url: "/super-admin/system-health", icon: Activity, roles: null },
                { title: "Auditoria Tokens Meta", url: "/super-admin/audit-tokens", icon: Activity, roles: null },
              ]} canSee={() => true} collapsed={collapsed} onFavoriteToggle={toggleFavorite} favoriteUrls={favoriteUrls} />
            )}
            <SidebarRecentes collapsed={collapsed} recentes={recenteItems} />
          </SidebarContent>

          {/* Footer */}
          <SidebarFooterBlock
            collapsed={collapsed}
            user={user}
            displayName={displayName}
            initials={initials}
            avatarUrl={avatarUrl}
            signOut={signOut}
          />
        </Sidebar>
      </div>
    </TooltipProvider>
  );
}
