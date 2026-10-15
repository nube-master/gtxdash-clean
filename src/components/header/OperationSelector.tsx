import { useOperation } from "@/contexts/OperationContext";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import { Building2, ChevronDown, Check, Settings2, Users, LogOut, LayoutGrid } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";

export function OperationSelector() {
  const { operation, operations, switchOperation } = useOperation();
  const { signOut } = useAuth();
  const { data: isSuperAdmin } = useSuperAdmin();
  const navigate = useNavigate();

  const opName = operation?.name || "Operação";
  const normalizedStatus = String(operation?.status || "").toLowerCase();
  const statusBadge = normalizedStatus === "active" || normalizedStatus === "ativo"
    ? {
        label: "Ativo",
        className: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30",
      }
    : normalizedStatus === "trial"
      ? {
          label: "Trial",
          className: "bg-amber-500/10 text-amber-500 border-amber-500/30",
        }
      : normalizedStatus
        ? {
            label: "Suspenso",
            className: "bg-destructive/10 text-destructive border-destructive/30",
          }
        : null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="h-8 px-2 md:px-2.5 rounded-md text-xs flex items-center gap-1 md:gap-1.5 transition-colors border border-border/50 bg-secondary/50 hover:bg-secondary shrink-0 max-w-[160px] md:max-w-[320px]">
          {operation?.logo_url ? (
            <img src={operation.logo_url} alt="" className="h-5 w-5 rounded object-contain shrink-0" />
          ) : (
            <span className="h-5 w-5 rounded flex items-center justify-center text-[9px] font-bold shrink-0 bg-primary/15 text-primary">
              {opName.charAt(0).toUpperCase()}
            </span>
          )}
          <span className="font-medium text-foreground truncate">
            {opName}
          </span>
          {statusBadge && (
            <Badge
              variant="outline"
              className={`hidden md:inline-flex text-[7px] px-1 py-0 h-3.5 font-mono ml-0.5 ${statusBadge.className}`}
            >
              {statusBadge.label}
            </Badge>
          )}
          <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {operations.length > 1 && (operation || isSuperAdmin) && (
          <>
            <div className="px-2 py-1.5">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                Trocar operação
              </p>
            </div>
            {operations
              .filter((op) => {
                // If the user is Super Admin, they see everything
                if (isSuperAdmin) return true;
                // Otherwise, hide suspended operations
                const status = String(op.status || "").toLowerCase();
                return status !== "suspended" && status !== "suspenso" && status !== "suspensa";
              })
              .map((op) => (
                <DropdownMenuItem
                key={op.id}
                onClick={() => op.id !== operation?.id && switchOperation(op.id)}
                className="flex items-center justify-between text-xs cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  {op.logo_url ? (
                    <img src={op.logo_url} alt="" className="h-5 w-5 rounded object-contain shrink-0" />
                  ) : (
                    <span className="h-5 w-5 rounded flex items-center justify-center text-[9px] font-bold shrink-0 bg-primary/15 text-primary">
                      {op.name.charAt(0).toUpperCase()}
                    </span>
                  )}
                  <span className="truncate">{op.name}</span>
                </div>
                {op.id === operation?.id && (
                  <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                )}
              </DropdownMenuItem>
            ))}
            <DropdownMenuItem
              onClick={() => navigate("/select-operation")}
              className="gap-2 text-xs text-muted-foreground"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              Ver todas operações
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem onClick={() => navigate("/integrations")} className="gap-2 text-xs">
          <Settings2 className="h-3.5 w-3.5" />
          Configurações da operação
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => navigate("/admin/users")} className="gap-2 text-xs">
          <Users className="h-3.5 w-3.5" />
          Gerenciar usuários
        </DropdownMenuItem>
        {isSuperAdmin && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => navigate("/dashboard/consolidado")}
              className="gap-2 text-xs font-medium text-primary focus:text-primary"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              📊 Ver Consolidado (todas ops)
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => signOut()} className="gap-2 text-xs text-destructive focus:text-destructive">
          <LogOut className="h-3.5 w-3.5" />
          Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
