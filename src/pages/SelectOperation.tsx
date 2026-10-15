import { useEffect } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Loader2, LogOut, LayoutGrid, ArrowRight } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useOperation } from "@/contexts/OperationContext";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const STATUS_STYLES: Record<string, string> = {
  active: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30",
  ativo: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30",
  trial: "bg-amber-500/10 text-amber-500 border-amber-500/30",
};

export default function SelectOperation() {
  const { user, loading: authLoading, signOut } = useAuth();
  const { operations, operation, loading, switchOperation } = useOperation();
  const { data: isSuperAdmin } = useSuperAdmin();
  const navigate = useNavigate();

  useEffect(() => {
    document.title = "Selecione operação · GTX";
  }, []);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  // If op already selected and user did not explicitly land here, send home.
  // We only auto-redirect when there's no need to choose (single op auto-selected upstream).
  if (operation && operations.length === 1 && !isSuperAdmin) {
    return <Navigate to="/" replace />;
  }

  const handleSelect = (opId: string) => {
    switchOperation(opId, { reload: false });
    navigate("/", { replace: true });
    // Force a fresh load so all React Query caches rebind to the new op.
    setTimeout(() => window.location.reload(), 50);
  };

  const handleConsolidado = () => {
    navigate("/dashboard/consolidado", { replace: true });
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-5xl">
        <header className="text-center mb-10">
          <div
            className="inline-flex h-11 w-11 items-center justify-center rounded-lg mb-4 text-xl font-bold"
            style={{ background: "hsl(0 100% 56% / 0.1)", color: "hsl(0 100% 56%)" }}
          >
            G
          </div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-foreground">
            Selecione a operação
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Escolha em qual contexto você quer trabalhar.
          </p>
        </header>

        {operations.length === 0 ? (
          <div className="rounded-lg border border-border/60 bg-card p-8 text-center">
            <p className="text-sm text-muted-foreground">
              Você não pertence a nenhuma operação ativa.
            </p>
            <Button variant="outline" className="mt-4" onClick={() => signOut()}>
              Sair
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {operations
              .filter((op) => {
                if (isSuperAdmin) return true;
                const status = String(op.status || "").toLowerCase();
                return status !== "suspended" && status !== "suspenso" && status !== "suspensa";
              })
              .map((op) => {
              const status = String(op.status || "").toLowerCase();
              const badgeClass = STATUS_STYLES[status] || "bg-destructive/10 text-destructive border-destructive/30";
              const badgeLabel = status === "active" || status === "ativo"
                ? "Ativo"
                : status === "trial"
                  ? "Trial"
                  : status
                    ? "Suspenso"
                    : "—";
              const isCurrent = op.id === operation?.id;

              return (
                <button
                  key={op.id}
                  type="button"
                  onClick={() => handleSelect(op.id)}
                  className="group text-left rounded-xl border border-border/60 bg-card p-5 transition-all hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5 focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  <div className="flex items-start justify-between gap-3">
                    {op.logo_url ? (
                      <img src={op.logo_url} alt="" className="h-11 w-11 rounded-lg object-contain bg-muted/30 p-1" />
                    ) : (
                      <div className="h-11 w-11 rounded-lg flex items-center justify-center text-lg font-bold bg-primary/10 text-primary">
                        {op.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <Badge variant="outline" className={`text-[10px] font-mono ${badgeClass}`}>
                      {badgeLabel}
                    </Badge>
                  </div>
                  <h3 className="mt-4 text-base font-semibold text-foreground truncate">{op.name}</h3>
                  <p className="mt-1 text-xs text-muted-foreground truncate">{op.slug}</p>
                  <div className="mt-4 flex items-center justify-between text-xs">
                    <span className="text-muted-foreground uppercase tracking-wider">{op.plan}</span>
                    <span className="inline-flex items-center gap-1 text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                      {isCurrent ? "Continuar" : "Entrar"} <ArrowRight className="h-3.5 w-3.5" />
                    </span>
                  </div>
                </button>
              );
              })}

            {isSuperAdmin && (
              <button
                type="button"
                onClick={handleConsolidado}
                className="group text-left rounded-xl border border-primary/30 bg-primary/5 p-5 transition-all hover:border-primary hover:shadow-lg hover:shadow-primary/10 focus:outline-none focus:ring-2 focus:ring-primary/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="h-11 w-11 rounded-lg flex items-center justify-center bg-primary/15 text-primary">
                    <LayoutGrid className="h-5 w-5" />
                  </div>
                  <Badge variant="outline" className="text-[10px] font-mono bg-primary/10 text-primary border-primary/30">
                    SUPER ADMIN
                  </Badge>
                </div>
                <h3 className="mt-4 text-base font-semibold text-foreground">📊 Consolidado</h3>
                <p className="mt-1 text-xs text-muted-foreground">Visão agregada de todas as operações.</p>
                <div className="mt-4 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground uppercase tracking-wider">agregado</span>
                  <span className="inline-flex items-center gap-1 text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                    Abrir <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                </div>
              </button>
            )}
          </div>
        )}

        <footer className="mt-10 flex items-center justify-between text-xs text-muted-foreground">
          <span className="truncate">
            {user.email} {isSuperAdmin && <span className="text-primary">• super_admin</span>}
          </span>
          <button
            type="button"
            onClick={() => signOut()}
            className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" /> Sair
          </button>
        </footer>
      </div>
    </div>
  );
}
