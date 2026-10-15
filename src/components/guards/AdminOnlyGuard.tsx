import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";

/** Libera a rota apenas para admins da operação ou super admins. */
export function AdminOnlyGuard({ children }: { children: ReactNode }) {
  const { isAdmin, loading } = useAuth();
  const { data: isSuperAdmin, isLoading: saLoading } = useSuperAdmin();

  if (loading || saLoading) return null;
  if (!isAdmin && !isSuperAdmin) return <Navigate to="/dashboard/cod" replace />;
  return <>{children}</>;
}
