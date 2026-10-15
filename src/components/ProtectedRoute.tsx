import { Navigate, useLocation } from "react-router-dom";
import { useAuth, type AppRole } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNeedsOnboarding } from "@/hooks/useNeedsOnboarding";
import { useOperation } from "@/contexts/OperationContext";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import { logAccessDenied } from "@/lib/auditAccessDenied";

const PAGE_ORDER = ["/", "/analytics", "/campaigns", "/assets", "/vendas", "/meta-ads", "/creatives", "/vsls", "/unit-economics", "/planning"];

interface Props {
  children: React.ReactNode;
  /** If set, user must have at least one of these roles (admin always passes) */
  allowedRoles?: AppRole[];
  /** Skip the onboarding redirect check (used on /onboarding itself) */
  skipOnboardingCheck?: boolean;
}

export function ProtectedRoute({ children, allowedRoles, skipOnboardingCheck }: Props) {
  const { user, loading, permsLoaded, roles, isAdmin, canAccessPage, allowedPages, fetchFailed, refetchMeta } = useAuth();
  const location = useLocation();
  const { data: needsOnboarding, isLoading: checkingOnboarding } = useNeedsOnboarding();
  const { needsSelection, loading: opLoading } = useOperation();
  const { data: isSuperAdmin } = useSuperAdmin();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  // Fail-closed: never render gated UI (sidebar, dashboards) before permissions land.
  if (!permsLoaded && !fetchFailed) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }


  // If metadata fetch failed due to transient DB errors, show retry UI instead of signing out
  if (fetchFailed && roles.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <p className="text-sm text-muted-foreground">Erro de conexão ao carregar permissões.</p>
        <p className="text-xs text-muted-foreground">O banco de dados está temporariamente sobrecarregado.</p>
        <button
          onClick={() => refetchMeta()}
          className="px-4 py-2 rounded text-xs font-medium tracking-wider uppercase"
          style={{ background: "#FF1E1E", color: "#fff", border: "none", cursor: "pointer" }}
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  // Still checking onboarding status — show loader briefly
  if (!skipOnboardingCheck && checkingOnboarding) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Onboarding redirect: if user has no operation, redirect to onboarding
  // (skip this check on the onboarding page itself)
  if (!skipOnboardingCheck && !checkingOnboarding && needsOnboarding) {
    return <Navigate to="/onboarding" replace />;
  }

  // F9-DIA3: super_admin (ou user com N ops) sem operação ativa → tela de seleção.
  // Dashboard consolidado é acessível sem op selecionada (é agregado).
  const isConsolidadoRoute = location.pathname.startsWith("/dashboard/consolidado");
  if (!skipOnboardingCheck && !opLoading && needsSelection && !isConsolidadoRoute) {
    return <Navigate to="/select-operation" replace state={{ from: location.pathname }} />;
  }

  // Role-based check
  if (allowedRoles && !isAdmin) {
    const hasAccess = allowedRoles.some((r) => roles.includes(r));
    if (!hasAccess) {
      return (
        <div className="flex flex-col items-center justify-center py-24 gap-2">
          <p className="text-sm text-muted-foreground">Você não tem acesso a esta página.</p>
        </div>
      );
    }
  }

  // Page permission check (skip for system routes like /admin/*, /integrations)
  const systemRoutes = ["/login", "/privacy", "/terms", "/onboarding"];
  const isSystemRoute = systemRoutes.some((r) => location.pathname.startsWith(r));
  if (!isSystemRoute && !canAccessPage(location.pathname)) {
    console.warn("[RBAC] Acesso negado à rota", location.pathname, "user:", user.id);
    logAccessDenied({ userId: user.id, attemptedRoute: location.pathname, grantedRoutes: allowedPages });
    // If user has allowed pages, always redirect to first accessible page
    if (allowedPages && allowedPages.length > 0) {
      const firstAllowed = PAGE_ORDER.find((p) => allowedPages.includes(p)) || allowedPages[0];
      if (firstAllowed !== location.pathname) return <Navigate to={firstAllowed} replace />;
    }

    return (
      <div className="flex flex-col items-center justify-center py-24 gap-2">
        <p className="text-sm text-muted-foreground">Você não tem acesso a esta página.</p>
        <p className="text-xs text-muted-foreground">Solicite acesso ao administrador.</p>
      </div>
    );
  }

  return <>{children}</>;
}
