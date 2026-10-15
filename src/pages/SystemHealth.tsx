import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Activity, Database, Zap, Shield, RefreshCw, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

type Status = "ok" | "warning" | "error" | "unknown";

function StatusDot({ status }: { status: Status }) {
  const map = {
    ok: "bg-emerald-500",
    warning: "bg-amber-500",
    error: "bg-red-500",
    unknown: "bg-muted-foreground",
  } as const;
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${map[status]}`} />;
}

function StatusIcon({ status }: { status: Status }) {
  if (status === "ok") return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
  if (status === "warning") return <AlertTriangle className="h-4 w-4 text-amber-500" />;
  if (status === "error") return <XCircle className="h-4 w-4 text-red-500" />;
  return <Activity className="h-4 w-4 text-muted-foreground" />;
}

// ── Backend / DB health via last data-health-check snapshot ──
function useBackendHealth() {
  return useQuery({
    queryKey: ["sys-health-backend"],
    queryFn: async () => {
      const { data: snap } = await supabase
        .from("system_daily_snapshot")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const { data: logs } = await supabase
        .from("system_health_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);
      // Simple ping to check DB reachability
      const start = Date.now();
      const { error: pingErr } = await supabase.from("app_settings").select("key").limit(1);
      const latency = Date.now() - start;
      return {
        snapshot: snap,
        recentLogs: logs || [],
        dbLatency: latency,
        dbReachable: !pingErr,
      };
    },
    refetchInterval: 30_000,
  });
}

// ── Edge functions health (últimos erros) ──
function useEdgeHealth() {
  return useQuery({
    queryKey: ["sys-health-edge"],
    queryFn: async () => {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const [{ count: errors1h }, { count: errors24h }, { data: recent }] = await Promise.all([
        supabase.from("system_logs").select("id", { count: "exact", head: true }).eq("type", "EDGE_ERROR").gte("created_at", oneHourAgo),
        supabase.from("system_logs").select("id", { count: "exact", head: true }).eq("type", "EDGE_ERROR").gte("created_at", oneDayAgo),
        supabase.from("system_logs").select("*").eq("type", "EDGE_ERROR").order("created_at", { ascending: false }).limit(10),
      ]);
      return {
        errors1h: errors1h ?? 0,
        errors24h: errors24h ?? 0,
        recent: recent || [],
      };
    },
    refetchInterval: 30_000,
  });
}

// ── Integrações (RedTrack, Meta, Vturb, Newsbreak) ──
function useIntegrationsHealth() {
  return useQuery({
    queryKey: ["sys-health-integrations"],
    queryFn: async () => {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from("integration_logs")
        .select("integration, status, created_at, message")
        .gte("created_at", twoHoursAgo)
        .order("created_at", { ascending: false })
        .limit(500);
      const rows = data || [];
      const byIntegration = new Map<string, { total: number; errors: number; last: string; lastStatus: string }>();
      for (const r of rows) {
        const cur = byIntegration.get(r.integration) || { total: 0, errors: 0, last: r.created_at, lastStatus: r.status };
        cur.total++;
        if (r.status === "error") cur.errors++;
        if (new Date(r.created_at) > new Date(cur.last)) {
          cur.last = r.created_at;
          cur.lastStatus = r.status;
        }
        byIntegration.set(r.integration, cur);
      }
      return Array.from(byIntegration.entries()).map(([name, v]) => ({ name, ...v }));
    },
    refetchInterval: 30_000,
  });
}

// ── Meta API rate limits: detecta via mensagens de erro contendo "rate" / "user request limit" ──
function useMetaRateLimits() {
  return useQuery({
    queryKey: ["sys-health-meta-rl"],
    queryFn: async () => {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from("system_logs")
        .select("*")
        .eq("type", "EDGE_ERROR")
        .gte("created_at", twoHoursAgo)
        .or("message.ilike.%rate%,message.ilike.%request limit%,message.ilike.%throttl%,message.ilike.%#17%,message.ilike.%#4%")
        .order("created_at", { ascending: false })
        .limit(20);
      const { data: recentMeta } = await supabase
        .from("integration_logs")
        .select("integration, status, created_at")
        .in("integration", ["meta-ads-fast", "meta-hourly", "sync-meta-balance", "campaign-status"])
        .gte("created_at", twoHoursAgo)
        .order("created_at", { ascending: false });
      return {
        rateLimitEvents: data || [],
        recentMetaCalls: (recentMeta || []).length,
        metaErrors: (recentMeta || []).filter((r: any) => r.status === "error").length,
      };
    },
    refetchInterval: 30_000,
  });
}

export default function SystemHealth() {
  const navigate = useNavigate();
  const { data: isSA, isLoading: checking } = useSuperAdmin();
  const backend = useBackendHealth();
  const edge = useEdgeHealth();
  const integrations = useIntegrationsHealth();
  const meta = useMetaRateLimits();

  useEffect(() => {
    if (!checking && !isSA) navigate("/");
  }, [checking, isSA, navigate]);

  if (checking || !isSA) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  const refetchAll = () => {
    backend.refetch();
    edge.refetch();
    integrations.refetch();
    meta.refetch();
  };

  // Overall statuses
  const backendStatus: Status = !backend.data?.dbReachable
    ? "error"
    : (backend.data?.dbLatency ?? 0) > 2000
    ? "warning"
    : (backend.data?.snapshot?.overall_status as Status) || "ok";

  const edgeStatus: Status = (edge.data?.errors1h ?? 0) >= 15 ? "error" : (edge.data?.errors1h ?? 0) >= 5 ? "warning" : "ok";

  const metaStatus: Status = (meta.data?.rateLimitEvents.length ?? 0) > 5 ? "error" : (meta.data?.rateLimitEvents.length ?? 0) > 0 ? "warning" : "ok";

  const integrationsStatus: Status = (integrations.data || []).some((i) => i.errors / Math.max(i.total, 1) > 0.5)
    ? "error"
    : (integrations.data || []).some((i) => i.errors > 0)
    ? "warning"
    : "ok";

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="h-6 w-6" /> System Health
          </h1>
          <p className="text-sm text-muted-foreground">Status em tempo real do backend, edge functions e integrações. Auto-refresh: 30s.</p>
        </div>
        <Button variant="outline" size="sm" onClick={refetchAll}>
          <RefreshCw className="h-4 w-4 mr-2" /> Atualizar agora
        </Button>
      </div>

      {/* Overall status strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Backend / DB", status: backendStatus, icon: Database },
          { label: "Edge Functions", status: edgeStatus, icon: Zap },
          { label: "Integrações", status: integrationsStatus, icon: Activity },
          { label: "Meta API", status: metaStatus, icon: Shield },
        ].map((item) => (
          <Card key={item.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <item.icon className="h-5 w-5 text-muted-foreground" />
              <div className="flex-1 min-w-0">
                <div className="text-xs text-muted-foreground">{item.label}</div>
                <div className="flex items-center gap-2 mt-1">
                  <StatusDot status={item.status} />
                  <span className="text-sm font-medium capitalize">
                    {item.status === "ok" ? "Saudável" : item.status === "warning" ? "Atenção" : item.status === "error" ? "Crítico" : "—"}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Backend */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Database className="h-4 w-4" /> Backend & Banco
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Conectividade DB</span>
              <Badge variant={backend.data?.dbReachable ? "default" : "destructive"}>
                {backend.data?.dbReachable ? "Online" : "Offline"}
              </Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Latência ping</span>
              <span className="font-mono">{backend.data?.dbLatency ?? "—"} ms</span>
            </div>
            {backend.data?.snapshot && (
              <>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Snapshot (health-check)</span>
                  <Badge variant={backend.data.snapshot.overall_status === "ok" ? "default" : backend.data.snapshot.overall_status === "warning" ? "secondary" : "destructive"}>
                    {backend.data.snapshot.overall_status}
                  </Badge>
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Divergência Meta vs Dash</span>
                  <span>{Number(backend.data.snapshot.divergence_percent ?? 0).toFixed(1)}%</span>
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Erros de cálculo</span>
                  <span>{backend.data.snapshot.calculation_errors ?? 0}</span>
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Erros de decisão</span>
                  <span>{backend.data.snapshot.decision_errors ?? 0}</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Edge functions */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="h-4 w-4" /> Edge Functions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Erros última 1h</span>
              <Badge variant={(edge.data?.errors1h ?? 0) >= 5 ? "destructive" : "default"}>{edge.data?.errors1h ?? 0}</Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Erros últimas 24h</span>
              <Badge variant="outline">{edge.data?.errors24h ?? 0}</Badge>
            </div>
            <div className="pt-2 border-t">
              <div className="text-xs text-muted-foreground mb-2">Últimos 10 erros</div>
              <div className="space-y-1 max-h-48 overflow-auto">
                {(edge.data?.recent || []).length === 0 ? (
                  <div className="text-xs text-muted-foreground italic">Sem erros recentes ✅</div>
                ) : (
                  (edge.data?.recent || []).map((r: any) => (
                    <div key={r.id} className="text-xs border-l-2 border-red-500/50 pl-2 py-1">
                      <div className="text-muted-foreground">{formatDistanceToNow(new Date(r.created_at), { addSuffix: true, locale: ptBR })}</div>
                      <div className="truncate font-mono">{r.message?.slice(0, 120)}</div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Integrações */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-4 w-4" /> Integrações (últimas 2h)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {(integrations.data || []).length === 0 ? (
              <div className="text-xs text-muted-foreground italic">Sem atividade recente</div>
            ) : (
              (integrations.data || []).map((i) => {
                const errRate = i.errors / Math.max(i.total, 1);
                const st: Status = errRate > 0.5 ? "error" : i.errors > 0 ? "warning" : "ok";
                return (
                  <div key={i.name} className="flex items-center justify-between border-b last:border-0 py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <StatusIcon status={st} />
                      <span className="font-medium truncate">{i.name}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{i.total} calls</span>
                      {i.errors > 0 && <Badge variant="destructive" className="text-[10px]">{i.errors} err</Badge>}
                      <span>{formatDistanceToNow(new Date(i.last), { addSuffix: true, locale: ptBR })}</span>
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* Meta API rate limits */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="h-4 w-4" /> Meta API — Rate Limits
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Chamadas Meta (2h)</span>
              <Badge variant="outline">{meta.data?.recentMetaCalls ?? 0}</Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Erros Meta (2h)</span>
              <Badge variant={(meta.data?.metaErrors ?? 0) > 0 ? "destructive" : "default"}>{meta.data?.metaErrors ?? 0}</Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Eventos rate-limit detectados</span>
              <Badge variant={(meta.data?.rateLimitEvents.length ?? 0) > 0 ? "destructive" : "default"}>
                {meta.data?.rateLimitEvents.length ?? 0}
              </Badge>
            </div>
            <div className="pt-2 border-t">
              <div className="text-xs text-muted-foreground mb-2">Alertas rate-limit recentes</div>
              <div className="space-y-1 max-h-48 overflow-auto">
                {(meta.data?.rateLimitEvents || []).length === 0 ? (
                  <div className="text-xs text-muted-foreground italic">Nenhum throttle da Meta nas últimas 2h ✅</div>
                ) : (
                  (meta.data?.rateLimitEvents || []).map((r: any) => (
                    <div key={r.id} className="text-xs border-l-2 border-amber-500/50 pl-2 py-1">
                      <div className="text-muted-foreground">{formatDistanceToNow(new Date(r.created_at), { addSuffix: true, locale: ptBR })}</div>
                      <div className="truncate font-mono">{r.message?.slice(0, 140)}</div>
                    </div>
                  ))
                )}
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground pt-1">
              Detectado por padrões de erro (rate/throttl/request limit/#17/#4) nos logs de edge functions.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
