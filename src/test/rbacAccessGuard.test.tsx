import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

// --- mocks -------------------------------------------------------------
const insertMock = vi.fn(() => Promise.resolve({ error: null }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({ insert: insertMock }) },
}));

vi.mock("@/hooks/useNeedsOnboarding", () => ({
  useNeedsOnboarding: () => ({ data: false, isLoading: false }),
}));
vi.mock("@/contexts/OperationContext", () => ({
  useOperation: () => ({ needsSelection: false, loading: false }),
}));
vi.mock("@/hooks/useSuperAdmin", () => ({ useSuperAdmin: () => ({ data: false }) }));

const authState = {
  user: { id: "user-restrito" },
  loading: false,
  permsLoaded: true,
  roles: ["visualizador"],
  isAdmin: false,
  allowedPages: ["/creatives"],
  fetchFailed: false,
  refetchMeta: vi.fn(),
  canAccessPage: (p: string) => false,
};

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => authState,
}));

import { ProtectedRoute } from "@/components/ProtectedRoute";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/creatives"
          element={
            <ProtectedRoute>
              <div>PAGINA CRIATIVOS</div>
            </ProtectedRoute>
          }
        />
        <Route
          path="*"
          element={
            <ProtectedRoute>
              <div>CONTEUDO SENSIVEL: INVESTIDO / LUCRO / ROAS</div>
            </ProtectedRoute>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

const ALLOWED = ["/creatives", "/notifications", "/profile"];

describe("RBAC fail-closed guard", () => {
  beforeEach(() => {
    insertMock.mockClear();
    authState.loading = false;
    authState.permsLoaded = true;
    authState.allowedPages = ["/creatives"];
    authState.isAdmin = false;
    authState.canAccessPage = (p: string) => ALLOWED.includes(p);
  });

  it("não renderiza conteúdo enquanto as permissões não carregam (sem flash de dados)", () => {
    authState.permsLoaded = false;
    authState.canAccessPage = () => false;
    renderAt("/");
    expect(screen.queryByText(/CONTEUDO SENSIVEL/)).toBeNull();
  });

  it("usuário restrito a Criativos não vê nenhuma página proibida via URL direta", () => {
    for (const rota of ["/", "/analytics", "/campaigns", "/meta-ads", "/central-financeira"]) {
      const { unmount } = renderAt(rota);
      expect(screen.queryByText(/CONTEUDO SENSIVEL/)).toBeNull();
      unmount();
    }
  });

  it("renderiza a página permitida (/creatives)", () => {
    renderAt("/creatives");
    expect(screen.getByText(/PAGINA CRIATIVOS/)).toBeTruthy();
  });

  it("registra tentativa negada em audit_log_access_denied", async () => {
    authState.allowedPages = [];
    renderAt("/planning");
    await waitFor(() => expect(insertMock).toHaveBeenCalled());
    const payload = (insertMock.mock.calls as any[])[0][0] as any;
    expect(payload.user_id).toBe("user-restrito");
    expect(payload.attempted_route).toBe("/planning");
    expect(Array.isArray(payload.granted_routes)).toBe(true);
  });
});
