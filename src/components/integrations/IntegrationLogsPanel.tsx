import { RefreshCw, CheckCircle2, XCircle, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface Log {
  id: string;
  integration: string;
  status: string;
  message: string | null;
  records_processed: number | null;
  created_at: string;
}

function getStatusIcon(status: string) {
  if (status === "success") return <CheckCircle2 className="h-4 w-4 text-[hsl(var(--warroom-positive))]" />;
  if (status === "error") return <XCircle className="h-4 w-4 text-destructive" />;
  return <Clock className="h-4 w-4 text-[hsl(var(--warroom-warning))]" />;
}

function getStatusBadge(status: string) {
  const variants: Record<string, string> = {
    success: "bg-[hsl(var(--warroom-positive))]/15 text-[hsl(var(--warroom-positive))] border-[hsl(var(--warroom-positive))]/30",
    error: "bg-destructive/15 text-destructive border-destructive/30",
    skipped: "bg-[hsl(var(--warroom-warning))]/15 text-[hsl(var(--warroom-warning))] border-[hsl(var(--warroom-warning))]/30",
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-mono border ${variants[status] || variants.skipped}`}>
      {getStatusIcon(status)}
      {status}
    </span>
  );
}

export function IntegrationLogsPanel({ logs }: { logs: Log[] | undefined }) {
  return (
    <Card className="warroom-card">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Logs de Integração</CardTitle>
          <Badge variant="outline" className="text-xs font-mono">
            {logs?.length ?? 0} registros
          </Badge>
        </div>
        <CardDescription className="text-xs">
          Histórico das últimas sincronizações e webhooks recebidos
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!logs?.length ? (
          <div className="text-center py-8 text-muted-foreground">
            <RefreshCw className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Nenhum log ainda.</p>
            <p className="text-xs mt-1">Os logs aparecerão quando dados forem recebidos.</p>
          </div>
        ) : (
          <div className="rounded-md border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs font-mono">Integração</TableHead>
                  <TableHead className="text-xs font-mono">Status</TableHead>
                  <TableHead className="text-xs font-mono">Mensagem</TableHead>
                  <TableHead className="text-xs font-mono">Registros</TableHead>
                  <TableHead className="text-xs font-mono">Data</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-xs font-medium">{log.integration}</TableCell>
                    <TableCell>{getStatusBadge(log.status)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[300px] truncate">
                      {log.message}
                    </TableCell>
                    <TableCell className="text-xs font-mono">{log.records_processed}</TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground">
                      {new Date(log.created_at).toLocaleString("pt-BR")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
