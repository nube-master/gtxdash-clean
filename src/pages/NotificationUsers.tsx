import { useOperation } from "@/contexts/OperationContext";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, BellRing, ShieldCheck } from "lucide-react";
import { PushRecipientMatrix } from "@/components/notifications/PushRecipientMatrix";

export default function NotificationUsers() {
  const { operation, userRole } = useOperation();
  const { isAdmin } = useAuth();

  const canManage = isAdmin || userRole === "owner" || userRole === "admin";

  if (!operation?.id) {
    return (
      <div className="full-width-page w-full">
        <Alert variant="destructive" className="max-w-2xl">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Nenhuma operação selecionada</AlertTitle>
          <AlertDescription>
            Selecione uma operação no topo — os alertas são liberados por operação.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!canManage) {
    return (
      <div className="full-width-page w-full">
        <Alert variant="destructive" className="max-w-2xl">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Acesso restrito</AlertTitle>
          <AlertDescription>
            Só administradores e owners da operação gerenciam quem recebe notificações.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="full-width-page w-full space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <BellRing className="h-5 w-5 text-primary" />
            Notificações &amp; Usuários
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Escolha quais alertas cada pessoa da equipe recebe nesta operação. Nada é enviado por
            padrão — o usuário só passa a receber o que você ligar aqui.
          </p>
        </div>
        <Badge
          variant="outline"
          className="bg-primary/10 border-primary/30 text-primary text-xs px-3 py-1.5"
        >
          Operação ativa: <span className="font-semibold ml-1">{operation.name}</span>
        </Badge>
      </div>

      <Card className="bg-emerald-500/5 border-emerald-500/20">
        <CardContent className="p-4 flex items-start gap-3">
          <ShieldCheck className="h-5 w-5 text-emerald-500 mt-0.5 flex-shrink-0" />
          <div className="text-xs space-y-1 text-muted-foreground">
            <div className="font-semibold text-emerald-500">Como funciona</div>
            <ul className="space-y-0.5 list-disc list-inside">
              <li>Cada pessoa ativa o push no aparelho dela em “App no celular e notificações”.</li>
              <li>Sem nenhum tipo ligado aqui, ela fica em silêncio total (padrão seguro).</li>
              <li>As permissões são por operação — ligar em {operation.name} não afeta as outras.</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      <PushRecipientMatrix operationId={operation.id} operationName={operation.name} />
    </div>
  );
}
