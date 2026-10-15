import { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/** Features that can be toggled per operation */
export type OperationFeature =
  | "dashboard"
  | "analytics"
  | "campaigns"
  | "meta_ia"
  | "jarvis"
  | "creatives"
  | "vsls"
  | "performance_vsl"
  | "ao_vivo"
  | "vendas"
  | "central_financeira"
  | "planning"
  | "cashflow"
  | "contingencia"
  | "academy"
  | "talent_bank"
  | "war_room"
  | "integrations"
  | "acessos"
  | "pacing_controller";

/** All available features with labels */
export const ALL_FEATURES: { key: OperationFeature; label: string }[] = [
  { key: "dashboard", label: "Dashboard" },
  { key: "analytics", label: "Analytics" },
  { key: "campaigns", label: "Campanhas" },
  { key: "meta_ia", label: "Meta IA" },
  { key: "jarvis", label: "Jarvis" },
  { key: "creatives", label: "Criativos" },
  { key: "vsls", label: "VSLs" },
  { key: "performance_vsl", label: "Performance VSL" },
  { key: "ao_vivo", label: "Ao Vivo" },
  { key: "vendas", label: "Vendas" },
  { key: "central_financeira", label: "Central Financeira" },
  { key: "planning", label: "Planejamento" },
  { key: "cashflow", label: "Fluxo de Caixa" },
  { key: "contingencia", label: "Contingência" },
  { key: "academy", label: "Academy" },
  { key: "talent_bank", label: "Banco de Talentos" },
  { key: "war_room", label: "War Room" },
  { key: "integrations", label: "Integrações" },
  { key: "acessos", label: "Acessos" },
  { key: "pacing_controller", label: "Pacing Controller" },
];

/** Default features for new operations */
export const DEFAULT_FEATURES: OperationFeature[] = [
  "dashboard", "analytics", "campaigns", "meta_ia",
  "creatives", "vsls", "performance_vsl", "ao_vivo", "vendas", "central_financeira",
  "planning", "cashflow", "contingencia",
  "war_room", "integrations", "acessos", "pacing_controller",
];

interface OperationData {
  id: string;
  name: string;
  slug: string;
  status: string;
  plan: string;
  enabled_features: OperationFeature[];
  max_meta_accounts: number | null;
  max_members: number | null;
  logo_url: string | null;
}

interface OperationContextValue {
  /** Current operation (resolved from membership or impersonation) */
  operation: OperationData | null;
  /** The operation_id to use in all queries */
  operationId: string | null;
  /** All operations the user belongs to */
  operations: OperationData[];
  /** User's role within the current operation */
  userRole: string | null;
  /** Whether we're still loading */
  loading: boolean;
  /** Whether super admin is impersonating */
  isImpersonating: boolean;
  /**
   * True when the user has memberships but no operation is selected.
   * Triggered for super_admins without lastOp or users with N ops without lastOp.
   * ProtectedRoute uses this to redirect to /select-operation.
   */
  needsSelection: boolean;
  /** Check if a feature is enabled for the current operation */
  isFeatureEnabled: (feature: OperationFeature) => boolean;
  /** Switch to a different operation */
  switchOperation: (opId: string, opts?: { reload?: boolean }) => void;
  /** Refresh operation data */
  refetch: () => Promise<void>;
}

const OperationContext = createContext<OperationContextValue>({
  operation: null,
  operationId: null,
  operations: [],
  userRole: null,
  loading: true,
  isImpersonating: false,
  needsSelection: false,
  isFeatureEnabled: () => true,
  switchOperation: () => {},
  refetch: async () => {},
});

const LAST_OP_KEY = "tos_last_operation_id";

export function OperationProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [operations, setOperations] = useState<OperationData[]>([]);
  const [operation, setOperation] = useState<OperationData | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isImpersonating, setIsImpersonating] = useState(false);
  const [memberships, setMemberships] = useState<Map<string, string>>(new Map());

  const fetchOperation = useCallback(async () => {
    if (!user?.id) {
      setOperation(null);
      setOperations([]);
      setUserRole(null);
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const toOperationData = (op: any): OperationData => ({
        id: op.id,
        name: op.name,
        slug: op.slug,
        status: op.status,
        plan: op.plan,
        enabled_features: op.enabled_features ?? [...DEFAULT_FEATURES],
        max_meta_accounts: op.max_meta_accounts ?? null,
        max_members: op.max_members ?? null,
        logo_url: op.logo_url ?? null,
      });

      const applyOperations = (ops: OperationData[], roleMap: Map<string, string>, impersonating = false, preferredOpId?: string) => {
        setOperations(ops);
        setMemberships(roleMap);
        setIsImpersonating(impersonating);

        const lastOpId = preferredOpId || localStorage.getItem(LAST_OP_KEY);
        // Filtro estrito: se não for impersonation, só considera operações onde o usuário tem vínculo real
        const userOps = impersonating ? ops : ops.filter(o => roleMap.has(o.id));
        const lastOp = lastOpId ? userOps.find(o => o.id === lastOpId) : null;

        // F9-DIA3: fallback ops[0] REMOVIDO. Regra:
        // - Impersonation: já resolvido antes (return early).
        // - Se lastOp válido → seleciona.
        // - Se user comum com 1 única op → auto-seleciona.
        // - Caso contrário (SA sem lastOp, user com N ops sem lastOp) → needsSelection.
        const singleOp = userOps.length === 1 ? userOps.at(0) ?? null : null;
        const autoSelect = !lastOp && !impersonating && singleOp ? singleOp : null;
        const selected = lastOp || autoSelect;

        if (selected) {
          setOperation(selected);
          setUserRole(roleMap.get(selected.id) || (impersonating ? "super_admin" : null));
          localStorage.setItem(LAST_OP_KEY, selected.id);
        } else {
          setOperation(null);
          setUserRole(impersonating ? "super_admin" : null);
        }
      };

      const { data: superAdmin } = await supabase
        .from("super_admins")
        .select("user_id, is_restricted")
        .eq("user_id", user.id)
        .maybeSingle();

      // Check for super admin impersonation
      const impRaw = localStorage.getItem("sa_impersonate");
      let impersonatedOperationId: string | undefined;
      if (impRaw) {
        try {
          const imp = JSON.parse(impRaw);
          impersonatedOperationId = imp?.id;
          if (imp?.id && !superAdmin) {
            const { data: op } = await supabase
              .from("operations")
              .select("id, name, slug, status, plan, enabled_features, max_meta_accounts, max_members, logo_url")
              .eq("id", imp.id)
              .single();
            if (op) {
              const opData = toOperationData(op);
              setOperation(opData);
              setOperations([opData]);
              setUserRole("super_admin");
              setIsImpersonating(true);
              setLoading(false);
              return;
            }
          }
        } catch { /* ignore parse errors */ }
      }

      if (superAdmin && !superAdmin.is_restricted) {
        const { data: allOperations } = await supabase
          .from("operations")
          .select("id, name, slug, status, plan, enabled_features, max_meta_accounts, max_members, logo_url")
          .order("name", { ascending: true });

        // Apenas marca como impersonating se houver um ID explícito no localStorage.
        // Se for Super Admin geral sem ID, ele entra no fluxo de SelectOperation mas vê TUDO.
        const isActuallyImpersonating = !!impersonatedOperationId;
        
        if (allOperations && allOperations.length > 0) {
          const ops = allOperations.map(toOperationData);
          applyOperations(ops, new Map(ops.map((op) => [op.id, "super_admin"])), isActuallyImpersonating, impersonatedOperationId);
          return;
        }
      }

      // Normal flow: fetch ALL user's operation memberships.
      // Fetch memberships and operations separately; the nested PostgREST relationship
      // can fail silently for some non-super-admin sessions and leave operationId null.
      const { data: allMemberships, error: membershipsError } = await supabase
        .from("operation_members")
        .select("operation_id, role")
        .eq("user_id", user.id)
        .eq("status", "active");

      if (membershipsError) {
        console.error("[OperationContext] Error fetching memberships:", membershipsError);
      }

      if (allMemberships && allMemberships.length > 0) {
        const operationIds = allMemberships.map((m) => m.operation_id).filter(Boolean);
        const roleMap = new Map(allMemberships.map((m) => [m.operation_id, m.role]));

        const { data: memberOperations, error: operationsError } = await supabase
          .from("operations")
          .select("id, name, slug, status, plan, enabled_features, max_meta_accounts, max_members, logo_url")
          .in("id", operationIds)
          // Usuários normais só enxergam operações ativas (suspensas/arquivadas/deletadas somem)
          .in("status", ["active", "trial"]);

        if (operationsError) {
          console.error("[OperationContext] Error fetching member operations:", operationsError);
        }

        const ops = (memberOperations ?? []).map(toOperationData);

        applyOperations(ops, roleMap);
      } else {
        const { data: ownedOperations } = await supabase
          .from("operations")
          .select("id, name, slug, status, plan, enabled_features, max_meta_accounts, max_members, logo_url")
          .eq("owner_user_id", user.id)
          .in("status", ["active", "trial"])
          .order("name", { ascending: true });

        if (ownedOperations && ownedOperations.length > 0) {
          const ops = ownedOperations.map(toOperationData);
          applyOperations(ops, new Map(ops.map((op) => [op.id, "owner"])));
          return;
        }

        setOperation(null);
        setOperations([]);
        setUserRole(null);
        setIsImpersonating(false);
      }
    } catch (e) {
      console.error("[OperationContext] Error fetching operation:", e);
      setOperation(null);
      setOperations([]);
      setUserRole(null);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  const switchOperation = useCallback((opId: string, opts?: { reload?: boolean }) => {
    const op = operations.find(o => o.id === opId);
    if (op) {
      setOperation(op);
      setUserRole(memberships.get(op.id) || null);
      localStorage.setItem(LAST_OP_KEY, op.id);
      try { window.dispatchEvent(new CustomEvent("tos:op-changed", { detail: { operationId: op.id } })); } catch { /* ignore */ }
      if (opts?.reload !== false) {
        // Force reload all queries by reloading the page
        window.location.reload();
      }
    }
  }, [operations, memberships]);

  useEffect(() => {
    if (!authLoading) {
      fetchOperation();
    }
  }, [authLoading, fetchOperation]);

  // Listen for impersonation changes (storage event from other tabs)
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === "sa_impersonate") fetchOperation();
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, [fetchOperation]);

  const isFeatureEnabled = useCallback((feature: OperationFeature) => {
    if (!operation) return true;
    return (operation.enabled_features ?? []).includes(feature);
  }, [operation]);

  const needsSelection = !loading && !operation && operations.length > 0;

  const value = useMemo<OperationContextValue>(
    () => ({
      operation,
      operationId: operation?.id || null,
      operations,
      userRole,
      loading,
      isImpersonating,
      needsSelection,
      isFeatureEnabled,
      switchOperation,
      refetch: fetchOperation,
    }),
    [operation, operations, userRole, loading, isImpersonating, needsSelection, isFeatureEnabled, switchOperation, fetchOperation]
  );

  return (
    <OperationContext.Provider value={value}>
      {children}
    </OperationContext.Provider>
  );
}


/**
 * Access the current operation context.
 * Use `operationId` in all Supabase queries to scope data.
 */
export function useOperation() {
  return useContext(OperationContext);
}

/**
 * Convenience hook: returns the operation_id or null.
 * Use in query keys and .eq('operation_id', ...) filters.
 */
export function useOperationId(): string | null {
  const { operationId } = useContext(OperationContext);
  return operationId;
}
