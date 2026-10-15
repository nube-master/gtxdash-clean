import { useLocation, Link } from "react-router-dom";
import {
  LayoutDashboard, BarChart3, Megaphone, Shield, Palette, Play, ShoppingCart,
  DollarSign, Crosshair, Banknote, Facebook, Settings2, Users, ScrollText, GraduationCap,
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";

const PAGE_META: Record<string, { title: string; icon: React.ElementType; parent?: string }> = {
  "/": { title: "Dashboard", icon: LayoutDashboard },
  "/analytics": { title: "Analytics", icon: BarChart3 },
  "/campaigns": { title: "Campanhas", icon: Megaphone },
  "/assets": { title: "Contingência", icon: Shield },
  "/creatives": { title: "Criativos", icon: Palette },
  "/vsls": { title: "VSLs", icon: Play },
  "/vendas": { title: "Vendas", icon: ShoppingCart },
  "/unit-economics": { title: "Central Financeira", icon: DollarSign },
  "/planning": { title: "Planejamento", icon: Crosshair },
  "/cashflow": { title: "Fluxo de Caixa", icon: Banknote },
  "/gtx-meta-ia": { title: "Meta IA", icon: Facebook },
  "/academy": { title: "Academy", icon: GraduationCap },
  "/war-room": { title: "War Room", icon: ScrollText },
  "/integrations": { title: "Integrações", icon: Settings2 },
  "/admin/users": { title: "Acessos", icon: Users },
};

export function Breadcrumbs() {
  const location = useLocation();
  const isMobile = useIsMobile();
  const meta = PAGE_META[location.pathname];

  if (!meta || location.pathname === "/" || isMobile) return null;

  const Icon = meta.icon;

  return (
    <div className="flex items-center gap-1.5 px-6 py-2 text-[11px] text-muted-foreground border-b border-border/30 bg-background/50">
      <Link to="/" className="hover:text-foreground transition-colors">
        <LayoutDashboard className="h-3 w-3" />
      </Link>
      <span className="text-muted-foreground/40">/</span>
      <span className="flex items-center gap-1 text-foreground font-medium">
        <Icon className="h-3 w-3" />
        {meta.title}
      </span>
    </div>
  );
}
