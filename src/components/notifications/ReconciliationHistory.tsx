import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO } from "date-fns";
import { useOperation } from "@/contexts/OperationContext";
import { ptBR } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ShieldCheck, CheckCircle, AlertTriangle, RefreshCw, Package } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

type ReconcileLog = {
  id: string;
  created_at: string;
  integration: string;
  status: string;
  records_processed: number | null;
  message: string | null;
};

function parseMessage(msg: string | null) {
  if (!msg) return { date: null, cbCount: 0, rtBefore: 0, rtAfter: 0, inserted: 0 };
  // "Auto-reconciled 4 sales for 2026-03-07. CB=219 RT=215→219"
  const matchReconcile = msg.match(/Auto-reconciled (\d+) sales for ([\d-]+)\. CB=(\d+) RT=(\d+)→(\d+)/);
  if (matchReconcile) {
    return {
      date: matchReconcile[2],
      inserted: parseInt(matchReconcile[1]),
      cbCount: parseInt(matchReconcile[3]),
      rtBefore: parseInt(matchReconcile[4]),
      rtAfter: parseInt(matchReconcile[5]),
    };
  }
  return { date: null, cbCount: 0, rtBefore: 0, rtAfter: 0, inserted: 0 };
}

export function ReconciliationHistory() {
  const { operation } = useOperation();
  const { data: logs, isLoading } = useQuery({
    queryKey: ["reconciliation-logs", operation?.id],
    queryFn: async () => {
      let query = supabase
        .from("integration_logs")
        .select("*")
        .eq("integration", "reconciler")
        .order("created_at", { ascending: false })
        .limit(50);
      if (operation?.id) query = query.eq("operation_id", operation.id);
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as ReconcileLog[];
    },
    refetchInterval: 60_000,
  });

  const totalInserted = logs?.reduce((sum, l) => sum + (l.records_processed || 0), 0) || 0;
  const totalEvents = logs?.length || 0;
  const successCount = logs?.filter((l) => l.status === "success").length || 0;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-card/50 border-border/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <RefreshCw className="h-3.5 w-3.5" />
              Execuções
            </div>
            <p className="text-2xl font-bold">{totalEvents}</p>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <CheckCircle className="h-3.5 w-3.5" />
              Sucesso
            </div>
            <p className="text-2xl font-bold text-emerald-400">{successCount}</p>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <Package className="h-3.5 w-3.5" />
              Vendas Inseridas
            </div>
            <p className="text-2xl font-bold text-primary">{totalInserted}</p>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <AlertTriangle className="h-3.5 w-3.5" />
              Erros
            </div>
            <p className="text-2xl font-bold text-destructive">{totalEvents - successCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Logs list */}
      <Card className="border-border/50 bg-card/80">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <ShieldCheck className="h-4 w-4 text-primary" />
            Histórico de Reconciliação Automática
            <Badge variant="outline" className="ml-auto text-[10px] border-border/50 text-muted-foreground">
              Últimas 50 execuções
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!logs?.length ? (
            <div className="text-center py-12 text-muted-foreground">
              <ShieldCheck className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Nenhuma reconciliação registrada ainda.</p>
              <p className="text-xs mt-1">O reconciliador automático executa a cada 30 minutos.</p>
            </div>
          ) : (
            <ScrollArea className="max-h-[500px]">
              <div className="space-y-2">
                {logs.map((log) => {
                  const parsed = parseMessage(log.message);
                  const isSuccess = log.status === "success";
                  const inserted = log.records_processed || 0;

                  return (
                    <div
                      key={log.id}
                      className="flex items-start gap-3 p-3 rounded-lg border border-border/20 bg-muted/5 hover:bg-muted/10 transition-colors"
                    >
                      {/* Status icon */}
                      <div className={`mt-0.5 rounded-full p-1.5 ${isSuccess ? "bg-emerald-500/15" : "bg-destructive/15"}`}>
                        {isSuccess ? (
                          <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />
                        ) : (
                          <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                        )}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-medium text-foreground">
                            {inserted > 0 ? `+${inserted} venda${inserted > 1 ? "s" : ""} inserida${inserted > 1 ? "s" : ""}` : "Sem gap detectado"}
                          </span>
                          {parsed.date && (
                            <Badge variant="outline" className="text-[9px] border-border/30 text-muted-foreground">
                              {parsed.date}
                            </Badge>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground truncate">
                          {log.message}
                        </p>
                        {parsed.cbCount > 0 && (
                          <div className="flex gap-3 mt-1.5">
                            <span className="text-[10px] text-muted-foreground">
                              CB: <span className="font-medium text-foreground">{parsed.cbCount}</span>
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              RT: <span className="font-medium text-foreground">{parsed.rtBefore}</span> → <span className="font-medium text-emerald-400">{parsed.rtAfter}</span>
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Timestamp */}
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                        {format(parseISO(log.created_at), "dd/MM HH:mm", { locale: ptBR })}
                      </span>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
