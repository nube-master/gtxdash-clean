import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

export type AppRole = "admin" | "gestor_trafego" | "visualizador" | "editor";

const LAST_OP_KEY = "tos_last_operation_id";

interface AuthState {
  user: User | null;
  session: Session | null;
  roles: AppRole[];
  displayName: string;
  avatarUrl: string | null;
  allowedPages: string[] | null;
  permissionsByOperation: Record<string, string[]>;
  activeOperationId: string | null;
  loading: boolean;
  /** true only after user permissions/roles have actually been fetched */
  permsLoaded: boolean;
  fetchFailed?: boolean;
}

interface AuthContextValue extends AuthState {
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  hasRole: (role: AppRole) => boolean;
  isAdmin: boolean;
  canAccessPage: (path: string) => boolean;
  refetchMeta: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

type MetaResult = {
  displayName: string;
  avatarUrl: string | null;
  roles: AppRole[];
  allowedPages: string[] | null;
  permissionsByOperation: Record<string, string[]>;
  fetchFailed?: boolean;
};

function readActiveOpId(): string | null {
  try {
    return typeof window !== "undefined" ? localStorage.getItem(LAST_OP_KEY) : null;
  } catch {
    return null;
  }
}

function deriveAllowedPages(
  isAdmin: boolean,
  permsMap: Record<string, string[]>,
  activeOpId: string | null,
  legacyAllowed: string[] | null,
): string[] | null {
  if (isAdmin) return null;
  // Prefer scoped map when we know the active op.
  if (activeOpId && permsMap[activeOpId]) return permsMap[activeOpId];
  // Fallback legacy: single global row (backward compat).
  if (legacyAllowed && legacyAllowed.length > 0) return legacyAllowed;
  // Fail-closed: user HAS restriction rows, just not for this op → deny everything
  // except the always-allowed personal pages. Never fall back to full access.
  if (Object.keys(permsMap).length > 0) return [];
  return null; // no restriction row at all → full access
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    roles: [],
    displayName: "",
    avatarUrl: null,
    allowedPages: null,
    permissionsByOperation: {},
    activeOperationId: readActiveOpId(),
    loading: true,
    permsLoaded: false,
  });

  const fetchUserMeta = useCallback(async (userId: string): Promise<MetaResult> => {
    try {
      const { data: session } = await supabase.auth.getSession();
      if (session?.session?.access_token) {
        const res = await supabase.functions.invoke("user-meta", {
          headers: { Authorization: `Bearer ${session.session.access_token}` },
        });
        if (res.data && !res.error) {
          const permsMap = (res.data.permissionsByOperation || {}) as Record<string, string[]>;
          const roles = (res.data.roles || []) as AppRole[];
          const isAdmin = roles.includes("admin");
          const activeOp = readActiveOpId();
          return {
            displayName: res.data.displayName || "",
            avatarUrl: res.data.avatarUrl || null,
            roles,
            permissionsByOperation: permsMap,
            allowedPages: deriveAllowedPages(isAdmin, permsMap, activeOp, res.data.allowedPages ?? null),
          };
        }
        console.warn("[AuthContext] Edge function failed:", res.error);
      }
    } catch (e) {
      console.warn("[AuthContext] Edge function error:", e);
    }

    try {
      const [profileRes, rolesRes, permsRes] = await Promise.all([
        supabase.from("profiles").select("display_name, avatar_url").eq("user_id", userId).single(),
        supabase.from("user_roles").select("role").eq("user_id", userId),
        supabase.from("user_page_permissions").select("operation_id, allowed_pages").eq("user_id", userId),
      ]);

      const hasError = [profileRes, rolesRes, permsRes].some(r => r.error);
      if (hasError) {
        return { displayName: "", avatarUrl: null, roles: [], allowedPages: null, permissionsByOperation: {}, fetchFailed: true };
      }

      const roles = (rolesRes.data || []).map((r: any) => r.role as AppRole);
      const isSuperAdmin = (rolesRes.data || []).some((r: any) => r.role === 'admin'); // For UI global roles
      const permsMap: Record<string, string[]> = {};
      for (const row of (permsRes.data || []) as Array<{ operation_id: string; allowed_pages: string[] }>) {
        if (row?.operation_id && Array.isArray(row?.allowed_pages)) {
          permsMap[row.operation_id] = row.allowed_pages;
        }
      }
      const activeOp = readActiveOpId();
      return {
        displayName: profileRes.data?.display_name || "",
        avatarUrl: (profileRes.data as any)?.avatar_url || null,
        roles,
        permissionsByOperation: permsMap,
        allowedPages: deriveAllowedPages(isSuperAdmin, permsMap, activeOp, null),
      };
    } catch {
      return { displayName: "", avatarUrl: null, roles: [], allowedPages: null, permissionsByOperation: {}, fetchFailed: true };
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    let initialized = false;

    const initializeAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!isMounted) return;

        if (session?.user) {
          const meta = await fetchUserMeta(session.user.id);
          if (isMounted) {
            setState({
              user: session.user,
              session,
              activeOperationId: readActiveOpId(),
              ...meta,
              loading: false,
              permsLoaded: true,
            });
          }
        } else {
          if (isMounted) setState(s => ({ ...s, loading: false, permsLoaded: false }));
        }
      } catch {
        if (isMounted) setState(s => ({ ...s, loading: false }));
      } finally {
        initialized = true;
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!isMounted || !initialized) return;
        if (session?.user) {
          setTimeout(async () => {
            if (!isMounted) return;
            try {
              const meta = await fetchUserMeta(session.user.id);
              if (isMounted) {
                setState({
                  user: session.user,
                  session,
                  activeOperationId: readActiveOpId(),
                  ...meta,
                  loading: false,
                  permsLoaded: true,
                });
              }
            } catch {
              if (isMounted) {
                setState({
                  user: session.user,
                  session,
                  roles: [],
                  displayName: "",
                  avatarUrl: null,
                  allowedPages: null,
                  permissionsByOperation: {},
                  activeOperationId: readActiveOpId(),
                  loading: false,
                  permsLoaded: true,
                });
              }
            }
          }, 0);
        } else {
          setState({
            user: null,
            session: null,
            roles: [],
            displayName: "",
            avatarUrl: null,
            allowedPages: null,
            permissionsByOperation: {},
            activeOperationId: null,
            loading: false,
            permsLoaded: false,
          });
        }
      }
    );

    initializeAuth();

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [fetchUserMeta]);

  // React to operation changes: OperationContext dispatches "tos:op-changed"
  // whenever the active operation is picked or switched.
  useEffect(() => {
    const handler = () => {
      setState(s => {
        const activeOp = readActiveOpId();
        const isAdmin = s.roles.includes("admin");
        return {
          ...s,
          activeOperationId: activeOp,
          allowedPages: deriveAllowedPages(isAdmin, s.permissionsByOperation, activeOp, null),
        };
      });
    };
    window.addEventListener("tos:op-changed", handler);
    window.addEventListener("storage", (e) => {
      if (e.key === LAST_OP_KEY) handler();
    });
    return () => {
      window.removeEventListener("tos:op-changed", handler);
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message || null };
  };

  const signOut = async () => {
    try {
      localStorage.removeItem("tos_last_operation_id");
      localStorage.removeItem("sa_impersonate");
    } catch { /* ignore */ }
    await supabase.auth.signOut();
  };

  const hasRole = (role: AppRole) => state.roles.includes(role);
  const isAdmin = state.roles.includes("admin");

  // Páginas pessoais liberadas para qualquer usuário logado (inclusive Visualizador)
  const ALWAYS_ALLOWED_PAGES = ["/notifications", "/profile"];

  const canAccessPage = (path: string) => {
    if (ALWAYS_ALLOWED_PAGES.includes(path)) return true;
    // Fail-closed while permissions are still loading: never render gated UI first.
    if (!state.permsLoaded) return false;
    if (isAdmin) return true;
    if (!state.allowedPages) return true;
    if (state.allowedPages.includes(path)) return true;
    return state.allowedPages.some(
      (allowed) => allowed !== "/" && path.startsWith(allowed + "/")
    );
  };

  const refetchMeta = async () => {
    if (!state.user) return;
    setState(s => ({ ...s, loading: true }));
    try {
      const meta = await fetchUserMeta(state.user.id);
      setState(s => ({ ...s, ...meta, activeOperationId: readActiveOpId(), loading: false, permsLoaded: true }));
    } catch {
      setState(s => ({ ...s, loading: false }));
    }
  };

  return (
    <AuthContext.Provider value={{ ...state, signIn, signOut, hasRole, isAdmin, canAccessPage, refetchMeta }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
