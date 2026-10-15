// Bloco 4 F9 — Guard cliente-lateral para subscriptions realtime multitenant.
// Filtra payloads cuja operation_id não bate com a operação atual antes de rodar
// qualquer handler (evita vazamento cross-tenant e reduz custo/flash de UI).
//
// Instrumentação opcional: setar `localStorage.rt_instrument = "1"` no console
// para logar cada guard-drop e cada handler-fire com origem/tabela.

export type RtPayload = {
  new?: Record<string, any> | null;
  old?: Record<string, any> | null;
  eventType?: string;
};

function instrumented(): boolean {
  try {
    return typeof window !== "undefined" && window.localStorage?.getItem("rt_instrument") === "1";
  } catch {
    return false;
  }
}

/**
 * Retorna true se o payload deve ser IGNORADO (op mismatch).
 * Se currentOpId for null ou payload não tiver operation_id, aceita
 * (fallback conservador — RLS ainda protege leitura).
 */
export function shouldSkipRtPayload(payload: RtPayload, currentOpId: string | null, source: string): boolean {
  if (!currentOpId) return false;
  const rowOp = (payload?.new?.operation_id ?? payload?.old?.operation_id) as string | null | undefined;
  if (rowOp && rowOp !== currentOpId) {
    if (instrumented()) {
      // eslint-disable-next-line no-console
      console.debug(`[RT-GUARD DROP] ${source} rowOp=${rowOp} currentOp=${currentOpId}`);
    }
    return true;
  }
  if (instrumented()) {
    // eslint-disable-next-line no-console
    console.debug(`[RT-GUARD FIRE] ${source} evt=${payload?.eventType ?? "?"} rowOp=${rowOp ?? "null"}`);
  }
  return false;
}
