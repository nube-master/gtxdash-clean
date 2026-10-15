import { useOperation } from "@/contexts/OperationContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Bell, Users, LayoutTemplate, ShieldCheck, AlertTriangle } from "lucide-react";
import { RecipientManager } from "@/components/notifications/RecipientManager";
import { TemplateManager } from "@/components/notifications/TemplateManager";

export default function NotificacoesPushcut() {
  const { operation } = useOperation();

  if (!operation?.id) {
    return (
      <div className="full-width-page w-full">
        <Alert variant="destructive" className="max-w-2xl">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Nenhuma operação selecionada</AlertTitle>
          <AlertDescription>
            Selecione uma operação no topo antes de gerenciar destinatários Pushcut — sem
            contexto de operação não há como garantir isolamento entre GTX e Escola do Dólar.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="full-width-page w-full space-y-5">
      {/* Header + operação ativa */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            Notificações Pushcut
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Destinatários e templates escopados por operação — cada operação enxerga e envia
            somente o que pertence a ela.
          </p>
        </div>
        <Badge
          variant="outline"
          className="bg-primary/10 border-primary/30 text-primary text-xs px-3 py-1.5"
        >
          Operação ativa: <span className="font-semibold ml-1">{operation.name}</span>
        </Badge>
      </div>

      {/* Garantia de isolamento */}
      <Card className="bg-emerald-500/5 border-emerald-500/20">
        <CardContent className="p-4 flex items-start gap-3">
          <ShieldCheck className="h-5 w-5 text-emerald-500 mt-0.5 flex-shrink-0" />
          <div className="text-xs space-y-1">
            <div className="font-semibold text-emerald-500">
              Isolamento entre operações garantido
            </div>
            <ul className="text-muted-foreground space-y-0.5 list-disc list-inside">
              <li>
                Destinatários e vínculos são filtrados por{" "}
                <code className="text-[10px] bg-muted/50 px-1 rounded">operation_id</code>{" "}
                em toda query.
              </li>
              <li>
                Trigger no banco (<code className="text-[10px] bg-muted/50 px-1 rounded">
                  enforce_notification_pref_tenant_scope
                </code>
                ) bloqueia fisicamente qualquer vínculo cruzado entre operações.
              </li>
              <li>
                Alertas Pushcut buscam destinatários apenas por{" "}
                <code className="text-[10px] bg-muted/50 px-1 rounded">
                  operation_id = {operation.id.slice(0, 8)}…
                </code>
                .
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="recipients" className="space-y-4">
        <TabsList className="bg-secondary/30 border border-border/30">
          <TabsTrigger value="recipients" className="text-xs gap-1.5 data-[state=active]:bg-card">
            <Users className="h-3.5 w-3.5" />
            Destinatários
          </TabsTrigger>
          <TabsTrigger value="templates" className="text-xs gap-1.5 data-[state=active]:bg-card">
            <LayoutTemplate className="h-3.5 w-3.5" />
            Templates
          </TabsTrigger>
        </TabsList>

        <TabsContent value="recipients" className="mt-0">
          <RecipientManager />
        </TabsContent>

        <TabsContent value="templates" className="mt-0">
          <TemplateManager />
        </TabsContent>
      </Tabs>
    </div>
  );
}
