import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useOperation } from "@/contexts/OperationContext";
import { useAuth } from "@/contexts/AuthContext";
import { canAccessCOD } from "@/lib/codAccess";

/**
 * Restringe /dashboard/cod às operações GTX
 * (slug ou nome contendo "gtx") ou usuários privilegiados
 * (super_admin, admin, owner). Espelha a regra do AppSidebar.
 */
export function CODAccessGuard({ children }: { children: ReactNode }) {
  const { operation, userRole, loading } = useOperation();
  const { roles, isAdmin, loading: authLoading, canAccessPage } = useAuth();

  if (loading || authLoading) return null;

  const isGtx = canAccessCOD({
    operation,
    userRole,
    roles,
    isAdmin,
    hasPagePermission: canAccessPage("/dashboard/cod"),
  });

  if (!isGtx) return <Navigate to="/" replace />;
  return <>{children}</>;
}

