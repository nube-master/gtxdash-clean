import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { PacingHeader } from "@/components/pacing/PacingHeader";
import { LogEntryCard } from "@/components/pacing/LogEntryCard";
import { LogDetailPanel } from "@/components/pacing/LogDetailPanel";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  ChevronDown, ChevronRight, Download, Gauge, History as HistoryIcon, Search,
  Settings as SettingsIcon, Sliders, Target,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  toCSV, type LogEntry, type LogAction, type LogStatus,
} from "@/components/pacing/historyMock";
import { PROJECT_SLUGS, ALL_ACCOUNTS, type ProjectSlug } from "@/components/pacing/mockData";
import { usePacingActionLog } from "@/hooks/usePacingActionLog";
import { usePacingRules } from "@/hooks/usePacingRules";
import { useToggleCampaign } from "@/hooks/useToggleCampaign";
import { usePacingDateRange } from "@/contexts/PacingDateRangeContext";
import { EvaluationDiagnosticsCard } from "@/components/pacing/EvaluationDiagnosticsCard";




const SAO_PAULO_TZ = "America/Sao_Paulo";
const brtDateKey = (iso: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: SAO_PAULO_TZ, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(iso));
const todayBRTKey = () => brtDateKey(new Date().toISOString());
const addDaysKey = (key: string, days: number) => {
  const [y, m, d] = key.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d) + days * 86_400_000;
  const dt = new Date(t);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
};
function dateLabel(key: string): string {
  const today = todayBRTKey();
  if (key === today) return "HOJE";
  if (key === addDaysKey(today, -1)) return "ONTEM";
  const [y, m, d] = key.split("-");
  return `${d}/${m}/${y}`;
}

export default function PacingHistory() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const { rules } = usePacingRules();
  const ruleNameById = useMemo(() => {
    const m = new Map<string, string>();
    rules.forEach((r) => m.set(r.id, r.name));
    return m;
  }, [rules]);
  const { entries: allEntries, loading } = usePacingActionLog(ruleNameById);
  const { range: dateRange, startDate: brtStartDate, endDate: brtEndDate } = usePacingDateRange();
  const ruleFilter = params.get("rule") || "all";
  const accountFilter = params.get("account") || "all";
  const actionFilter = (params.get("action") as LogAction | "all") || "all";
  const statusFilter = (params.get("status") as LogStatus | "all") || "all";
  const projectsParam = params.get("projects") || "";
  const selectedProjects = useMemo<ProjectSlug[]>(
    () => (projectsParam ? (projectsParam.split(",") as ProjectSlug[]) : []),
    [projectsParam]
  );
  const search = params.get("q") || "";

  const setParam = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (!v || v === "all" || v === "") next.delete(k);
    else next.set(k, v);
    setParams(next, { replace: true });
  };

  const toggleProject = (p: ProjectSlug) => {
    const next = selectedProjects.includes(p)
      ? selectedProjects.filter((x) => x !== p)
      : [...selectedProjects, p];
    setParam("projects", next.join(","));
  };

  const [selected, setSelected] = useState<LogEntry | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [resumeConfirm, setResumeConfirm] = useState<LogEntry | null>(null);
  const [collapsedDays, setCollapsedDays] = useState<Record<string, boolean>>({});

  const filtered = useMemo(() => {
    // Janela exata em BRT vinda do seletor global. Comparamos por chave YYYY-MM-DD
    // (em São Paulo) pra evitar drift de fuso entre o browser e o dashboard.
    const toBRDateKey = (iso: string) =>
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Sao_Paulo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(iso));

    const q = search.trim().toLowerCase();
    return allEntries.filter((e) => {
      const key = toBRDateKey(e.ts);
      if (key < brtStartDate || key > brtEndDate) return false;
      if (ruleFilter !== "all" && e.ruleId !== ruleFilter) return false;
      if (accountFilter !== "all" && e.account !== accountFilter) return false;
      if (actionFilter !== "all" && e.action !== actionFilter) return false;
      if (statusFilter !== "all" && e.status !== statusFilter) return false;
      if (selectedProjects.length > 0 && !selectedProjects.includes(e.project)) return false;
      if (q && !`${e.campaign} ${e.ruleName} ${e.account}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [allEntries, brtStartDate, brtEndDate, ruleFilter, accountFilter, actionFilter, statusFilter, selectedProjects, search]);

  // stats (sempre últimas 24h, independente dos filtros)
  const stats24h = useMemo(() => {
    const since = Date.now() - 24 * 60 * 60 * 1000;
    const list = allEntries.filter((e) => new Date(e.ts).getTime() >= since);
    return {
      total: list.length,
      pauses: list.filter((e) => e.action === "pause" && e.status === "success").length,
      alerts: list.filter((e) => e.action === "alert").length,
      economy: list.reduce((sum, e) => sum + (e.economy || 0), 0),
    };
  }, [allEntries]);


  // agrupar por dia
  const grouped = useMemo(() => {
    const m = new Map<string, LogEntry[]>();
    for (const e of filtered) {
      const key = brtDateKey(e.ts);
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(e);
    }
    return [...m.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [filtered]);

  // colapsar dias mais antigos que ontem por default
  useEffect(() => {
    const init: Record<string, boolean> = {};
    grouped.forEach(([key], idx) => { init[key] = idx >= 2; });
    setCollapsedDays((prev) => Object.keys(prev).length ? prev : init);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grouped.length]);

  // handlers
  const openEntry = (e: LogEntry) => { setSelected(e); setPanelOpen(true); };

  const handleExportCSV = () => {
    const csv = toCSV(filtered);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pacing-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exportado ${filtered.length} linha${filtered.length === 1 ? "" : "s"}`);
  };

  const toggle = useToggleCampaign();
  const handleResume = (e: LogEntry) => setResumeConfirm(e);
  const confirmResume = () => {
    if (!resumeConfirm) return;
    if (!resumeConfirm.campaignId || !resumeConfirm.accountId) {
      toast.error("Faltam IDs da campanha para religar");
      setResumeConfirm(null);
      return;
    }
    toggle.mutate({
      campaign_id: resumeConfirm.campaignId,
      account_id: resumeConfirm.accountId,
      campaign_name: resumeConfirm.campaign,
      new_status: "ACTIVE",
    });
    setResumeConfirm(null);
  };

  return (
    <div className="space-y-4 px-4 md:px-6 pb-10">
      <PacingHeader />

      {/* Tabs nav */}
      <Tabs value="history" className="w-full">
        <TabsList className="grid grid-cols-6 w-full max-w-3xl">
          <TabsTrigger value="dashboard" onClick={() => navigate("/pacing")}>
            <Gauge className="size-3.5 mr-1.5" /> Dashboard
          </TabsTrigger>
          <TabsTrigger value="rules" onClick={() => navigate("/pacing/regras")}>
            <Sliders className="size-3.5 mr-1.5" /> Regras
          </TabsTrigger>
          <TabsTrigger value="groups" onClick={() => navigate("/pacing/budget-groups")}>
            <Target className="size-3.5 mr-1.5" /> Budget Groups
          </TabsTrigger>
          <TabsTrigger value="history">
            <HistoryIcon className="size-3.5 mr-1.5" /> Histórico
          </TabsTrigger>
          <TabsTrigger value="report" onClick={() => navigate("/pacing/relatorio")}>
            <HistoryIcon className="size-3.5 mr-1.5" /> Relatório
          </TabsTrigger>
          <TabsTrigger value="settings" onClick={() => navigate("/pacing/settings")}>
            <SettingsIcon className="size-3.5 mr-1.5" /> Config
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Diagnóstico das regras — saúde do controller em tempo real */}
      <EvaluationDiagnosticsCard />

      {/* Section header */}
      <div className="flex items-start justify-between flex-wrap gap-3 pt-2">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider">📜 Log de Ações</h2>
          <p className="text-xs text-muted-foreground mt-0.5 tabular-nums">
            {stats24h.total} ações nas últimas 24h ·{" "}
            <span className="text-foreground">{stats24h.pauses} pausas</span> ·{" "}
            <span className="text-foreground">{stats24h.alerts} alertas</span> ·{" "}
            economia estimada{" "}
            <span className="text-[hsl(var(--wr-positive,140_70%_45%))]">
              R$ {stats24h.economy.toLocaleString("pt-BR")}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExportCSV}>
            <Download className="size-3.5 mr-1.5" /> Export CSV
          </Button>
        </div>
      </div>

      {/* Filtros */}
      <div className="space-y-2.5">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Janela de data controlada pelo seletor global no header de Pacing */}


          <Select value={ruleFilter} onValueChange={(v) => setParam("rule", v)}>
            <SelectTrigger className="w-52 h-9 text-xs"><SelectValue placeholder="Todas regras" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas regras</SelectItem>
              {rules.map((r) => (
                <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={accountFilter} onValueChange={(v) => setParam("account", v)}>
            <SelectTrigger className="w-40 h-9 text-xs"><SelectValue placeholder="Todas contas" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas contas</SelectItem>
              {ALL_ACCOUNTS.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={actionFilter} onValueChange={(v) => setParam("action", v)}>
            <SelectTrigger className="w-36 h-9 text-xs"><SelectValue placeholder="Ação" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas ações</SelectItem>
              <SelectItem value="pause">Pausar</SelectItem>
              <SelectItem value="resume">Religar</SelectItem>
              <SelectItem value="alert">Alertar</SelectItem>
              <SelectItem value="reduce_budget">Reduzir budget</SelectItem>
              <SelectItem value="fail">Falha</SelectItem>
              <SelectItem value="snooze">Snooze</SelectItem>
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={(v) => setParam("status", v)}>
            <SelectTrigger className="w-44 h-9 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos status</SelectItem>
              <SelectItem value="success">Sucesso</SelectItem>
              <SelectItem value="fail">Falha</SelectItem>
              <SelectItem value="manual_resume">Religada manualmente</SelectItem>
              <SelectItem value="cooldown_skip">Skip por cooldown</SelectItem>
            </SelectContent>
          </Select>

          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setParam("q", e.target.value)}
              placeholder="buscar campanha..."
              className="pl-8 h-9 text-xs"
            />
          </div>
        </div>

        {/* Chips de projeto */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground mr-1">Projetos:</span>
          {PROJECT_SLUGS.map((p) => {
            const active = selectedProjects.includes(p);
            return (
              <button
                key={p}
                onClick={() => toggleProject(p)}
                className={cn(
                  "px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold border transition-colors",
                  active
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-transparent text-muted-foreground border-border/60 hover:border-foreground/40"
                )}
              >
                {p}
              </button>
            );
          })}
          {selectedProjects.length > 0 && (
            <button
              onClick={() => setParam("projects", null)}
              className="text-[10px] text-muted-foreground hover:text-foreground ml-1 underline"
            >
              limpar
            </button>
          )}
        </div>
      </div>

      {/* Lista agrupada por dia */}
      <div className="space-y-3">
        {loading ? (
          <>
            <Skeleton className="h-4 w-32 mb-2" />
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
          </>
        ) : grouped.length === 0 ? (
          <div className="rounded border border-dashed border-border/60 py-12 text-center">
            <p className="text-sm text-muted-foreground">Nenhuma ação no período/filtros selecionados.</p>
            <p className="text-[10px] text-muted-foreground mt-2">
              O daemon ainda não está rodando — ações reais aparecerão aqui quando começar a executar regras.
            </p>
          </div>
        ) : null}

        {grouped.map(([key, entries]) => {
          const collapsed = collapsedDays[key] ?? false;
          return (
            <Collapsible
              key={key}
              open={!collapsed}
              onOpenChange={(open) => setCollapsedDays((s) => ({ ...s, [key]: !open }))}
            >
              <CollapsibleTrigger className="flex items-center gap-2 w-full text-left py-1.5 px-1 hover:bg-accent/30 rounded">
                {collapsed ? <ChevronRight className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                <span className="text-xs font-semibold uppercase tracking-wider">
                  {dateLabel(key)}
                </span>
                <span className="text-[10px] text-muted-foreground tabular-nums">
                  ({entries.length} ações)
                </span>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="space-y-1.5 mt-2">
                  {entries.map((e) => (
                    <LogEntryCard
                      key={e.id}
                      entry={e}
                      onSelect={openEntry}
                      onResume={handleResume}
                      onSnooze={(ent, preset) => toast.success(`Snooze ${preset} aplicado em ${ent.campaign}`)}
                      onViewRule={(ent) => navigate(`/pacing/regras?rule=${ent.ruleId}`)}
                      onViewCampaign={(ent) => navigate(`/pacing?campaign=${encodeURIComponent(ent.campaign)}`)}
                    />
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </div>

      <LogDetailPanel entry={selected} open={panelOpen} onOpenChange={setPanelOpen} />

      <AlertDialog open={!!resumeConfirm} onOpenChange={(v) => !v && setResumeConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Religar {resumeConfirm?.campaign}?</AlertDialogTitle>
            <AlertDialogDescription>
              Estava pausada por: <span className="text-foreground">{resumeConfirm?.reason}</span>. Religar mesmo assim?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmResume}>Religar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
