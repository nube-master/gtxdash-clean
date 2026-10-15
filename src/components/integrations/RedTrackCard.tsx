import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOperation } from "@/contexts/OperationContext";
import { Activity, CheckCircle2, XCircle, Clock, RefreshCw, Loader2, Zap } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

async function callHealthCheck(action: string, extra?: Record<string, string>, operationId?: string) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error("Não autenticado");
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  const params = new URLSearchParams({ action, ...(extra || {}) });
  if (operationId) params.append("operation_id", operationId);
  
  const res = await fetch(`https://${projectId}.supabase.co/functions/v1/health-check?${params}`, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });
  return res.json();
}

export function RedTrackCard() {
  const { operationId } = useOperation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const { data: lastLog } = useQuery({
    queryKey: ["integration-log-redtrack"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("integration_logs")
        .select("*")
        .eq("integration", "redtrack")
        .order("created_at", { ascending: false })
        .limit(1);
      if (error) throw error;
      return data?.[0] || null;
    },
    refetchInterval: 300_000,
  });

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const json = await callHealthCheck("redtrack-test", {}, operationId || undefined);
      setTestResult({ ok: json.success, msg: json.message || json.error || "Unknown" });
      toast({
        title: json.success ? "✅ Conexão OK" : "❌ Falha na conexão",
        description: json.message || json.error,
      });
    } catch (err) {
      setTestResult({ ok: false, msg: (err as Error).message });
      toast({ title: "Erro", description: (err as Error).message, variant: "destructive" });
    }
    setTesting(false);
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const today = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Sao_Paulo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());

      const json = await callHealthCheck("redtrack-sync", { date_from: today, date_to: today }, operationId || undefined);
      toast({
        title: json.success ? "✅ Sincronização concluída" : "❌ Erro na sincronização",
        description: json.success
          ? `${json.records} eventos sincronizados (${json.errors || 0} erros)`
          : json.error,
      });
      queryClient.invalidateQueries({ queryKey: ["integration-log-redtrack"] });
      queryClient.invalidateQueries({ queryKey: ["redtrack-events"] });
      queryClient.invalidateQueries({ queryKey: ["integration-logs"] });
    } catch (err) {
      toast({ title: "Erro", description: (err as Error).message, variant: "destructive" });
    }
    setSyncing(false);
  };

  const getStatusBadge = (status?: string) => {
    if (!status) return <Badge variant="outline" className="text-xs font-mono">não configurado</Badge>;
    const variants: Record<string, string> = {
      success: "bg-[hsl(var(--warroom-positive))]/15 text-[hsl(var(--warroom-positive))] border-[hsl(var(--warroom-positive))]/30",
      error: "bg-destructive/15 text-destructive border-destructive/30",
    };
    const icon = status === "success"
      ? <CheckCircle2 className="h-3.5 w-3.5" />
      : status === "error"
      ? <XCircle className="h-3.5 w-3.5" />
      : <Clock className="h-3.5 w-3.5" />;
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-mono border ${variants[status] || ""}`}>
        {icon}
        {status}
      </span>
    );
  };

  return (
    <Card className="warroom-card">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-[hsl(var(--warroom-positive))]/10 border border-[hsl(var(--warroom-positive))]/20">
              <Activity className="h-5 w-5 text-[hsl(var(--warroom-positive))]" />
            </div>
            <div>
              <CardTitle className="text-base">RedTrack</CardTitle>
              <CardDescription className="text-xs">
                API de conversões — puxa ICs, vendas e receita automaticamente
              </CardDescription>
            </div>
          </div>
          {getStatusBadge(lastLog?.status)}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={handleTest} disabled={testing}>
            {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            Testar Conexão
          </Button>
          <Button size="sm" onClick={handleSync} disabled={syncing}>
            {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Sincronizar Agora
          </Button>
        </div>

        {testResult && (
          <div className={`text-xs p-2 rounded-md border ${testResult.ok ? "bg-[hsl(var(--warroom-positive))]/10 border-[hsl(var(--warroom-positive))]/30 text-[hsl(var(--warroom-positive))]" : "bg-destructive/10 border-destructive/30 text-destructive"}`}>
            {testResult.ok ? "✅" : "❌"} {testResult.msg}
          </div>
        )}

        {lastLog && (
          <div className="text-xs text-muted-foreground space-y-1">
            <p>
              <span className="font-medium">Última sync:</span>{" "}
              {new Date(lastLog.created_at).toLocaleString("pt-BR")}
            </p>
            <p>
              <span className="font-medium">Registros:</span> {lastLog.records_processed}
            </p>
            {lastLog.message && (
              <p className="truncate max-w-md">
                <span className="font-medium">Mensagem:</span> {lastLog.message}
              </p>
            )}
          </div>
        )}

        <div className="bg-muted/30 rounded-lg p-4 space-y-3 border border-border/50">
          <h4 className="text-sm font-semibold text-foreground">Como funciona:</h4>
          <ol className="text-xs text-muted-foreground space-y-2.5 list-decimal list-inside">
            <li>Acesse sua conta no RedTrack</li>
            <li>Vá em <strong>Settings → API Access</strong> e copie sua API Key</li>
            <li>Use o <strong>"Assistente de configuração"</strong> acima para salvar a chave</li>
            <li>Clique <strong>"Testar Conexão"</strong> para validar o acesso</li>
            <li>Clique <strong>"Sincronizar Agora"</strong> para puxar conversões do dia</li>
          </ol>
          <p className="text-xs text-muted-foreground mt-2">
            <strong>UTMs:</strong> Os campos sub1-sub5 do RedTrack são mapeados para utm_source, utm_campaign, utm_medium, utm_content e utm_term.
            O cruzamento com Meta Ads usa o formato <code className="font-mono bg-muted px-1 rounded">campaign.name|campaign.id</code> na utm_campaign.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
