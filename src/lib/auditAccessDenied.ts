import { supabase } from "@/integrations/supabase/client";

const LAST_OP_KEY = "tos_last_operation_id";
const recent = new Map<string, number>();
const DEDUPE_MS = 30_000;

/**
 * Registra tentativa de acesso a rota não permitida em audit_log_access_denied.
 * Fire-and-forget: nunca bloqueia nem quebra a renderização do guard.
 */
export function logAccessDenied(params: {
  userId: string;
  attemptedRoute: string;
  grantedRoutes: string[] | null;
}) {
  const { userId, attemptedRoute, grantedRoutes } = params;
  const key = `${userId}:${attemptedRoute}`;
  const now = Date.now();
  const last = recent.get(key);
  if (last && now - last < DEDUPE_MS) return;
  recent.set(key, now);

  let operationId: string | null = null;
  try {
    operationId = localStorage.getItem(LAST_OP_KEY);
  } catch {
    /* ignore */
  }

  void supabase
    .from("audit_log_access_denied")
    .insert({
      user_id: userId,
      attempted_route: attemptedRoute,
      granted_routes: grantedRoutes ?? [],
      operation_id: operationId,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
    })
    .then(
      () => {},
      () => {},
    );
}
