import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO, startOfDay, endOfDay } from "date-fns";
import { useOperation } from "@/contexts/OperationContext";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { FileText, Clock, TrendingUp, TrendingDown, AlertTriangle, CheckCircle, Send, XCircle, Settings, LayoutTemplate, Users, Bell, CalendarIcon, ShieldCheck, RefreshCw } from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, ReferenceLine, CartesianGrid } from "recharts";
import { NotificationSettings } from "@/components/notifications/NotificationSettings";
import { TemplateManager } from "@/components/notifications/TemplateManager";
import { RecipientManager } from "@/components/notifications/RecipientManager";
import { LiveToastSettings } from "@/components/notifications/LiveToastSettings";
import { ReconciliationHistory } from "@/components/notifications/ReconciliationHistory";
import { GuerraEstruturas02Live } from "@/components/notifications/GuerraEstruturas02Live";

type Report = {
  id: string;
  created_at: string;
  report_type: string;
  period_hours: number;
  report_text: string | null;
  metrics: Record<string, any> | null;
  pushcut_status: string | null;
};

function statusBadge(metrics: Record<string, any> | null) {
  const status = metrics?.status || "";
  if (status.includes("ATENÇÃO")) return { label: "Atenção", icon: AlertTriangle, cls: "bg-destructive/15 text-destructive border-destructive/30" };
  if (status.includes("AQUECIDO")) return { label: "Aquecido", icon: TrendingUp, cls: "bg-wr-positive/15 text-wr-positive border-wr-positive/30" };
  if (status.includes("ESTÁVEL")) return { label: "Estável", icon: CheckCircle, cls: "bg-blue-500/15 text-blue-400 border-blue-500/30" };
  return { label: "Normal", icon: TrendingDown, cls: "bg-muted/20 text-muted-foreground border-muted/30" };
}

function pushBadge(status: string | null) {
  if (status === "sent") return { label: "Enviado", icon: Send, cls: "bg-wr-positive/15 text-wr-positive border-wr-positive/30" };
  if (status === "failed") return { label: "Falhou", icon: XCircle, cls: "bg-destructive/15 text-destructive border-destructive/30" };
  return { label: "Pendente", icon: Clock, cls: "bg-amber-500/15 text-amber-400 border-amber-500/30" };
}

function formatBRL(v: number) {
  return `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function WarRoomReports() {
  const { operation } = useOperation();
  const [filterType, setFilterType] = useState("all");
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  const { data: reports, isLoading } = useQuery({
    queryKey: ["war-room-reports", selectedDate.toDateString(), operation?.id],
    queryFn: async () => {
      const dayStart = startOfDay(selectedDate).toISOString();
      const dayEnd = endOfDay(selectedDate).toISOString();
      let query = supabase
        .from("automated_reports_log")
        .select("*")
        .gte("created_at", dayStart)
        .lte("created_at", dayEnd)
        .order("created_at", { ascending: false });
      if (operation?.id) query = query.eq("operation_id", operation.id);
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as Report[];
    },
  });

  const filtered = useMemo(() => {
    if (!reports) return [];
    if (filterType === "all") return reports;
    return reports.filter((r) => r.report_type === filterType);
  }, [reports, filterType]);

  const summary = useMemo(() => {
    if (!reports?.length) return null;
    const total = reports.length;
    const sent = reports.filter((r) => r.pushcut_status === "sent").length;
    const alerts = reports.filter((r) => r.metrics?.status?.includes("ATENÇÃO")).length;
    const avgRoas = reports.reduce((sum, r) => sum + (r.metrics?.roas || 0), 0) / total;
    return { total, sent, alerts, avgRoas };
  }, [reports]);

  const chartData = useMemo(() => {
    if (!filtered?.length) return [];
    return [...filtered]
      .reverse()
      .filter((r) => r.metrics?.roas != null)
      .map((r) => ({
        time: format(parseISO(r.created_at), "dd/MM HH:mm"),
        roas: Number((r.metrics?.roas || 0).toFixed(2)),
        lucro: Math.round(r.metrics?.lucro || 0),
        receita: Math.round(r.metrics?.receita || 0),
        type: r.report_type,
      }));
  }, [filtered]);

  return (
    <div className="full-width-page w-full">
    <Tabs defaultValue="reports" className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pushcut & Relatórios</h1>
          <p className="text-sm text-muted-foreground mt-1">Histórico de relatórios, templates e configurações de notificações</p>
        </div>
        <div className="flex items-center gap-3">
          <TabsList className="bg-secondary/30 border border-border/30">
            <TabsTrigger value="reports" className="text-xs gap-1.5 data-[state=active]:bg-card">
              <FileText className="h-3.5 w-3.5" />
              Relatórios
            </TabsTrigger>
            <TabsTrigger value="templates" className="text-xs gap-1.5 data-[state=active]:bg-card">
              <LayoutTemplate className="h-3.5 w-3.5" />
              Templates
            </TabsTrigger>
            <TabsTrigger value="recipients" className="text-xs gap-1.5 data-[state=active]:bg-card">
              <Users className="h-3.5 w-3.5" />
              Destinatários
            </TabsTrigger>
            <TabsTrigger value="settings" className="text-xs gap-1.5 data-[state=active]:bg-card">
              <Settings className="h-3.5 w-3.5" />
              Configurações
            </TabsTrigger>
            <TabsTrigger value="toast" className="text-xs gap-1.5 data-[state=active]:bg-card">
              <Bell className="h-3.5 w-3.5" />
              Toast Live
            </TabsTrigger>
            <TabsTrigger value="reconciliation" className="text-xs gap-1.5 data-[state=active]:bg-card">
              <ShieldCheck className="h-3.5 w-3.5" />
              Reconciliação
            </TabsTrigger>
          </TabsList>
        </div>
      </div>

      <TabsContent value="reports" className="space-y-6 mt-0">
        {/* Reports Filters */}

        {/* Filters */}
        <div className="flex items-center gap-3 justify-end">
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-[130px] h-9 text-xs bg-card border-border/50">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="pulse-1h">Pulse 1H</SelectItem>
              <SelectItem value="guerra-estruturas">Guerra Estruturas</SelectItem>
              <SelectItem value="guerra-estruturas-02">Guerra Estruturas 02</SelectItem>
              <SelectItem value="guerra-fase-teste">Guerra Fase TESTE</SelectItem>
              <SelectItem value="guerra-fase-pre">Guerra Fase PRÉ-ESCALA</SelectItem>
              <SelectItem value="guerra-fase-escala">Guerra Fase ESCALA</SelectItem>
            </SelectContent>
          </Select>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-[160px] h-9 text-xs bg-card border-border/50 justify-start text-left font-normal",
                  !selectedDate && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                {format(selectedDate, "dd/MM/yyyy", { locale: ptBR })}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(d) => d && setSelectedDate(d)}
                disabled={(date) => date > new Date()}
                initialFocus
                className={cn("p-3 pointer-events-auto")}
              />
            </PopoverContent>
          </Popover>
        </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-card/50 border-border/30">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <FileText className="h-3.5 w-3.5" />
                Relatórios
              </div>
              <p className="text-2xl font-bold">{summary.total}</p>
            </CardContent>
          </Card>
          <Card className="bg-card/50 border-border/30">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <Send className="h-3.5 w-3.5" />
                Enviados
              </div>
              <p className="text-2xl font-bold text-wr-positive">{summary.sent}</p>
            </CardContent>
          </Card>
          <Card className="bg-card/50 border-border/30">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <AlertTriangle className="h-3.5 w-3.5" />
                Alertas
              </div>
              <p className="text-2xl font-bold text-destructive">{summary.alerts}</p>
            </CardContent>
          </Card>
          <Card className="bg-card/50 border-border/30">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <TrendingUp className="h-3.5 w-3.5" />
                ROAS Médio
              </div>
              <p className="text-2xl font-bold">{summary.avgRoas.toFixed(2)}x</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ROAS Evolution Chart */}
      {chartData.length >= 2 && (
        <Card className="bg-card/50 border-border/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Evolução do ROAS por Relatório</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="roasGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                  <XAxis dataKey="time" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}x`} />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                    formatter={(value: number, name: string) => {
                      if (name === "roas") return [`${value}x`, "ROAS"];
                      if (name === "lucro") return [`R$ ${value.toLocaleString("pt-BR")}`, "Lucro"];
                      if (name === "receita") return [`R$ ${value.toLocaleString("pt-BR")}`, "Receita"];
                      return [value, name];
                    }}
                  />
                  <ReferenceLine y={1} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" opacity={0.5} label={{ value: "Break-even", position: "insideTopRight", fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                  <Area type="monotone" dataKey="roas" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#roasGrad)" dot={{ r: 3, fill: "hsl(var(--primary))", strokeWidth: 0 }} activeDot={{ r: 5 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Report List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground text-sm">Carregando relatórios...</div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <FileText className="h-10 w-10 mb-3 opacity-40" />
          <p className="text-sm">Nenhum relatório encontrado no período.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((report) => {
            const sb = statusBadge(report.metrics);
            const pb = pushBadge(report.pushcut_status);
            const date = parseISO(report.created_at);
            const metrics = report.metrics || {};

            return (
              <Card key={report.id} className="bg-card/50 border-border/30 hover:border-border/60 transition-colors">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className="text-[10px] font-mono uppercase">
                        {report.report_type}
                      </Badge>
                      <Badge variant="outline" className={`text-[10px] ${sb.cls}`}>
                        <sb.icon className="h-3 w-3 mr-1" />
                        {sb.label}
                      </Badge>
                      <Badge variant="outline" className={`text-[10px] ${pb.cls}`}>
                        <pb.icon className="h-3 w-3 mr-1" />
                        {pb.label}
                      </Badge>
                    </div>
                    <span className="text-xs text-muted-foreground font-mono">
                      {format(date, "dd/MM/yyyy HH:mm", { locale: ptBR })}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex flex-wrap gap-3 mb-4">
                    {metrics.receita != null && (
                      <div className="text-xs">
                        <span className="text-muted-foreground">Receita:</span>{" "}
                        <span className="font-semibold">{formatBRL(metrics.receita)}</span>
                      </div>
                    )}
                    {metrics.vendas != null && (
                      <div className="text-xs">
                        <span className="text-muted-foreground">Vendas:</span>{" "}
                        <span className="font-semibold">{metrics.vendas}</span>
                      </div>
                    )}
                    {metrics.roas != null && (
                      <div className="text-xs">
                        <span className="text-muted-foreground">ROAS:</span>{" "}
                        <span className={`font-semibold ${metrics.roas >= 1 ? "text-wr-positive" : "text-destructive"}`}>
                          {metrics.roas.toFixed(2)}x
                        </span>
                      </div>
                    )}
                    {metrics.investimento != null && (
                      <div className="text-xs">
                        <span className="text-muted-foreground">Investimento:</span>{" "}
                        <span className="font-semibold">{formatBRL(metrics.investimento)}</span>
                      </div>
                    )}
                    {metrics.lucro != null && (
                      <div className="text-xs">
                        <span className="text-muted-foreground">Lucro:</span>{" "}
                        <span className={`font-semibold ${metrics.lucro >= 0 ? "text-wr-positive" : "text-destructive"}`}>
                          {formatBRL(metrics.lucro)}
                        </span>
                      </div>
                    )}
                    {metrics.ticket_medio != null && (
                      <div className="text-xs">
                        <span className="text-muted-foreground">AOV:</span>{" "}
                        <span className="font-semibold">{formatBRL(metrics.ticket_medio)}</span>
                      </div>
                    )}
                  </div>

                  {metrics.analyses?.length > 0 && (
                    <div className="space-y-1 mb-4">
                      {metrics.analyses.map((a: string, i: number) => (
                        <p key={i} className="text-xs text-muted-foreground pl-2 border-l-2 border-primary/30">
                          {a}
                        </p>
                      ))}
                    </div>
                  )}

                  {report.report_text && (
                    <details className="group">
                      <summary className="text-[11px] text-muted-foreground cursor-pointer hover:text-foreground transition-colors select-none">
                        Ver relatório completo ▸
                      </summary>
                      <ScrollArea className="mt-3 max-h-[300px]">
                        <pre className="text-[11px] leading-relaxed font-mono text-muted-foreground whitespace-pre-wrap bg-muted/5 rounded-lg p-4 border border-border/20">
                          {report.report_text}
                        </pre>
                      </ScrollArea>
                    </details>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
      </TabsContent>

      <TabsContent value="templates" className="mt-0">
        <TemplateManager />
      </TabsContent>

      <TabsContent value="recipients" className="mt-0">
        <RecipientManager />
      </TabsContent>

      <TabsContent value="settings" className="mt-0">
        <NotificationSettings />
      </TabsContent>

      <TabsContent value="toast" className="mt-0">
        <LiveToastSettings />
      </TabsContent>

      <TabsContent value="reconciliation" className="mt-0">
        <ReconciliationHistory />
      </TabsContent>
    </Tabs>
    </div>
  );
}
