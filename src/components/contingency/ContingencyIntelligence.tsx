import { useMemo, useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  History, AlertTriangle, Heart, Clock, Zap, TrendingUp, GitBranch,
  ArrowDown, ArrowUp, Minus, ChevronDown, ChevronUp, BarChart3,
  Download, Edit2, Save, Loader2, CalendarDays, Shield, Timer,
} from "lucide-react";
import { useAccountStatusHistory, type StatusLogEntry } from "@/hooks/useAccountStatusHistory";
import { useAccountStatuses } from "@/hooks/useAccountStatuses";
import { useSpendByAccount } from "@/hooks/useSpendByAccount";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, subDays, differenceInDays, getDay } from "date-fns";
import { toast } from "sonner";

/* ─── Helpers ───────────────────────────────────────────────────────── */

const STATUS_LABELS: Record<number, string> = {
  1: "Ativa", 2: "Desabilitada", 3: "Pendente", 7: "Em Revisão",
  9: "Período de Graça", 100: "Fechamento Pendente", 101: "Fechada",
};

const DAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function statusLabel(s: number | null): string {
  if (s === null) return "—";
  return STATUS_LABELS[s] || `Status ${s}`;
}

function fmtCur(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v);
}

function SectionHeader({ title, icon: Icon, right }: { title: string; icon: React.ElementType; right?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-6 w-6 rounded-md bg-primary/10 flex items-center justify-center">
        <Icon className="h-3.5 w-3.5 text-primary" />
      </div>
      <h2 className="text-xs font-semibold uppercase tracking-widest text-foreground">{title}</h2>
      <div className="flex-1 h-[1px] bg-border" />
      {right && <span className="text-[10px] text-muted-foreground">{right}</span>}
    </div>
  );
}

/* ─── BM Editor Dialog ──────────────────────────────────────────────── */

function BmEditorDialog({ accounts }: { accounts: any[] }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [edits, setEdits] = useState<Map<string, string>>(new Map());

  const { data: bms } = useQuery({
    queryKey: ["business-managers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("business_managers").select("bm_id, name, status");
      if (error) throw error;
      return data || [];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (changes: Map<string, string>) => {
      for (const [accountId, bmId] of changes) {
        const { error } = await supabase
          .from("meta_ad_accounts" as any)
          .update({ bm_id: bmId || null })
          .eq("account_id", accountId);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("BMs atualizados com sucesso!");
      queryClient.invalidateQueries({ queryKey: ["account-statuses"] });
      queryClient.invalidateQueries({ queryKey: ["meta-ad-accounts-infra"] });
      setEdits(new Map());
      setOpen(false);
    },
    onError: (err) => toast.error("Erro ao salvar: " + String(err)),
  });

  const getBmForAccount = (accId: string) => {
    if (edits.has(accId)) return edits.get(accId)!;
    const acc = accounts.find(a => a.account_id === accId);
    return acc?.bm_id || "";
  };

  const setBm = (accId: string, bmId: string) => {
    const next = new Map(edits);
    next.set(accId, bmId);
    setEdits(next);
  };

  const filtered = accounts.filter(a => {
    if (!search) return true;
    const q = search.toLowerCase();
    return a.account_name?.toLowerCase().includes(q) || a.account_id?.includes(q);
  });

  const bmOptions = bms || [];
  const hasChanges = edits.size > 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="text-[10px] h-7 gap-1.5">
          <Edit2 className="h-3 w-3" />
          Editar BMs
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-sm">Vincular Contas a Business Managers</DialogTitle>
        </DialogHeader>
        <Input
          placeholder="Buscar conta..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="h-8 text-xs mb-2"
        />
        <div className="flex-1 overflow-y-auto border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[10px] w-[40%]">Conta</TableHead>
                <TableHead className="text-[10px] w-[20%]">Status</TableHead>
                <TableHead className="text-[10px] w-[40%]">Business Manager</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(acc => (
                <TableRow key={acc.account_id}>
                  <TableCell className="text-xs py-1.5">
                    <div className="truncate max-w-[200px]" title={acc.account_name}>{acc.account_name}</div>
                  </TableCell>
                  <TableCell className="py-1.5">
                    <Badge variant="outline" className={`text-[9px] ${acc.account_status === 1 ? "text-wr-positive border-wr-positive/30" : "text-destructive border-destructive/30"}`}>
                      {statusLabel(acc.account_status)}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-1.5" onClick={e => e.stopPropagation()}>
                    <Select value={getBmForAccount(acc.account_id)} onValueChange={v => setBm(acc.account_id, v)}>
                      <SelectTrigger className="h-7 text-[10px]">
                        <SelectValue placeholder="Selecionar BM..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">Nenhum</SelectItem>
                        {bmOptions.map(bm => (
                          <SelectItem key={bm.bm_id} value={bm.bm_id}>
                            {bm.name || bm.bm_id}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {hasChanges && (
          <div className="flex justify-end pt-2">
            <Button size="sm" onClick={() => saveMutation.mutate(edits)} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
              Salvar {edits.size} alteração{edits.size > 1 ? "ões" : ""}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ─── Component ─────────────────────────────────────────────────────── */

export default function ContingencyIntelligence() {
  const { data: statusLog } = useAccountStatusHistory(30);
  const { data: accounts } = useAccountStatuses();
  const { data: spendByAccountData } = useSpendByAccount();
  const [historyPeriod, setHistoryPeriod] = useState<7 | 14 | 30>(7);
  const [expandedBm, setExpandedBm] = useState<string | null>(null);

  const analysis = useMemo(() => {
    const log = statusLog || [];
    const accs = accounts || [];
    const spendRows = spendByAccountData || [];

    const now = new Date();
    const periodStart = subDays(now, historyPeriod);

    // ── 1. Histórico de quedas ──────────────────────────────────────
    const periodEvents = log.filter(e => new Date(e.changed_at) >= periodStart);
    const fell = periodEvents.filter(e => e.old_status === 1 && e.new_status !== 1);
    const reactivated = periodEvents.filter(e => e.old_status !== 1 && e.old_status !== null && e.new_status === 1);

    // Group falls by day for sparkline
    const fallsByDay = new Map<string, number>();
    for (let d = 0; d < historyPeriod; d++) {
      const day = format(subDays(now, d), "yyyy-MM-dd");
      fallsByDay.set(day, 0);
    }
    for (const e of fell) {
      const day = format(new Date(e.changed_at), "yyyy-MM-dd");
      fallsByDay.set(day, (fallsByDay.get(day) || 0) + 1);
    }
    const dailyFalls = Array.from(fallsByDay.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, count]) => ({ date, count }));

    // ── Drop Heatmap by day-of-week ─────────────────────────────────
    const fallsByDow = [0, 0, 0, 0, 0, 0, 0]; // Sun-Sat
    const allFalls30d = log.filter(e => new Date(e.changed_at) >= subDays(now, 30) && e.old_status === 1 && e.new_status !== 1);
    for (const e of allFalls30d) {
      const dow = getDay(new Date(e.changed_at));
      fallsByDow[dow]++;
    }
    const maxDow = Math.max(...fallsByDow, 1);

    // ── 2. Concentração de risco ────────────────────────────────────
    const spendByAccount = new Map<string, number>();
    const spendByBm = new Map<string, number>();
    for (const r of spendRows) {
      spendByAccount.set(r.account_id, (spendByAccount.get(r.account_id) || 0) + r.spend);
    }
    const totalSpend = Array.from(spendByAccount.values()).reduce((s, v) => s + v, 0);

    const bmMap = new Map<string, string>();
    for (const a of accs) {
      if (a.bm_id) bmMap.set(a.account_id, a.bm_id);
    }
    for (const [accId, spend] of spendByAccount) {
      const bm = bmMap.get(accId) || "sem_bm";
      spendByBm.set(bm, (spendByBm.get(bm) || 0) + spend);
    }

    const topAccount = Array.from(spendByAccount.entries()).sort((a, b) => b[1] - a[1])[0];
    const topBm = Array.from(spendByBm.entries()).sort((a, b) => b[1] - a[1])[0];
    const accountConcentration = topAccount && totalSpend > 0 ? (topAccount[1] / totalSpend) * 100 : 0;
    const bmConcentration = topBm && totalSpend > 0 ? (topBm[1] / totalSpend) * 100 : 0;
    const riskLevel: "baixo" | "medio" | "alto" = 
      accountConcentration > 40 || bmConcentration > 50 ? "alto" :
      accountConcentration > 25 || bmConcentration > 35 ? "medio" : "baixo";

    // ── 3. Score de saúde por conta ─────────────────────────────────
    const accountScores = accs.map(a => {
      let score = 50;
      if (a.account_status === 1) score += 25;
      else if (a.account_status === 2 || a.account_status === 101) score -= 30;
      else score -= 15;

      const spend = spendByAccount.get(a.account_id) || 0;
      if (spend > 100) score += 10;
      if (spend > 500) score += 5;

      const recentFalls = log.filter(e => e.account_id === a.account_id && e.old_status === 1 && e.new_status !== 1 && new Date(e.changed_at) >= subDays(now, 30));
      score -= recentFalls.length * 15;

      // Aging bonus: accounts created long ago without falls get a bonus
      const firstSeen = log.find(e => e.account_id === a.account_id && e.old_status === null);
      let ageDays = 0;
      if (firstSeen) {
        ageDays = differenceInDays(now, new Date(firstSeen.changed_at));
        if (a.account_status === 1 && ageDays > 30 && recentFalls.length === 0) score += 10;
      }

      return { ...a, score: Math.max(0, Math.min(100, score)), ageDays };
    }).sort((a, b) => a.score - b.score);

    // ── 4. Tempo médio de vida ──────────────────────────────────────
    const accountFirstSeen = new Map<string, Date>();
    const accountFellAt = new Map<string, Date[]>();
    for (const e of log) {
      if (e.old_status === null) {
        accountFirstSeen.set(e.account_id, new Date(e.changed_at));
      }
      if (e.old_status === 1 && e.new_status !== 1) {
        if (!accountFellAt.has(e.account_id)) accountFellAt.set(e.account_id, []);
        accountFellAt.get(e.account_id)!.push(new Date(e.changed_at));
      }
    }
    const lifespans: number[] = [];
    for (const [accId, falls] of accountFellAt) {
      const start = accountFirstSeen.get(accId);
      if (start) {
        const firstFall = falls.sort((a, b) => a.getTime() - b.getTime())[0];
        lifespans.push(differenceInDays(firstFall, start));
      }
    }
    const avgLifespan = lifespans.length > 0 ? Math.round(lifespans.reduce((s, v) => s + v, 0) / lifespans.length) : null;

    // ── 5. Contas ociosas com potencial ─────────────────────────────
    const activeNoSpend = accs.filter(a => a.account_status === 1 && (spendByAccount.get(a.account_id) || 0) === 0);
    const avgSpendPerAccount = totalSpend > 0 && spendByAccount.size > 0 ? totalSpend / spendByAccount.size : 0;

    // ── 6. Projeção de necessidade ──────────────────────────────────
    const weeklyFallRate = fell.length / (historyPeriod / 7);
    const monthlyFallProjection = Math.round(weeklyFallRate * 4.3);
    const activeCount = accs.filter(a => a.account_status === 1).length;

    // ── 7. Mapa BM → Contas ─────────────────────────────────────────
    const bmAccounts = new Map<string, { accounts: typeof accs; totalSpend: number }>();
    for (const a of accs) {
      const bm = a.bm_id || "sem_bm";
      if (!bmAccounts.has(bm)) bmAccounts.set(bm, { accounts: [], totalSpend: 0 });
      const entry = bmAccounts.get(bm)!;
      entry.accounts.push(a);
      entry.totalSpend += spendByAccount.get(a.account_id) || 0;
    }
    const bmList = Array.from(bmAccounts.entries())
      .map(([id, data]) => ({ id, ...data, pct: totalSpend > 0 ? (data.totalSpend / totalSpend) * 100 : 0 }))
      .sort((a, b) => b.totalSpend - a.totalSpend);

    // ── 8. Comparativo semanal ──────────────────────────────────────
    const weekAgoStart = subDays(now, 7);
    const fellThisWeek = log.filter(e => new Date(e.changed_at) >= weekAgoStart && e.old_status === 1 && e.new_status !== 1);
    const reactivatedThisWeek = log.filter(e => new Date(e.changed_at) >= weekAgoStart && e.old_status !== 1 && e.old_status !== null && e.new_status === 1);
    const estimatedPrevActive = activeCount + fellThisWeek.length - reactivatedThisWeek.length;
    const weeklyDelta = activeCount - estimatedPrevActive;

    return {
      fell, reactivated, dailyFalls, periodEvents,
      accountConcentration, bmConcentration, riskLevel,
      topAccount, topBm, totalSpend,
      accountScores,
      avgLifespan, lifespans,
      activeNoSpend, avgSpendPerAccount,
      weeklyFallRate, monthlyFallProjection, activeCount,
      bmList,
      weeklyDelta, estimatedPrevActive, fellThisWeek, reactivatedThisWeek,
      fallsByDow, maxDow, allFalls30d,
      spendByAccount,
    };
  }, [statusLog, accounts, spendByAccountData, historyPeriod]);

  const riskColors = { baixo: "text-wr-positive", medio: "text-amber-400", alto: "text-destructive" };
  const riskBg = { baixo: "bg-wr-positive/10 border-wr-positive/30", medio: "bg-amber-400/10 border-amber-400/30", alto: "bg-destructive/10 border-destructive/30" };

  // ── Export CSV ────────────────────────────────────────────────────
  const handleExport = useCallback(() => {
    const accs = accounts || [];
    const scores = analysis.accountScores;
    const scoreMap = new Map(scores.map(s => [s.account_id, s]));

    const headers = ["Conta", "ID", "Status", "Categoria", "Moeda", "BM", "Score", "Gasto (BRL)", "Dias Ativo"];
    const rows = accs.map(a => {
      const sc = scoreMap.get(a.account_id);
      return [
        a.account_name,
        a.account_id,
        statusLabel(a.account_status),
        a.category,
        a.currency,
        a.bm_id || "Sem BM",
        sc?.score ?? "—",
        (analysis.spendByAccount.get(a.account_id) || 0).toFixed(2),
        sc?.ageDays ?? "—",
      ].join(",");
    });

    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `contingencia_${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Relatório exportado!");
  }, [accounts, analysis]);

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Inteligência de Contingência"
        icon={BarChart3}
        right={
          <div className="flex items-center gap-2">
            {accounts && <BmEditorDialog accounts={accounts} />}
            <Button variant="outline" size="sm" className="text-[10px] h-7 gap-1.5" onClick={handleExport}>
              <Download className="h-3 w-3" />
              Exportar CSV
            </Button>
          </div>
        }
      />

      {/* ── Row 1: KPI Cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* 1. Quedas no período */}
        <Card className="bg-card border border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <History className="h-3.5 w-3.5 text-destructive" />
              <span className="text-[10px] text-muted-foreground uppercase">Quedas ({historyPeriod}d)</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold font-data text-destructive">{analysis.fell.length}</span>
              <span className="text-[10px] text-muted-foreground">caíram</span>
            </div>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-sm font-semibold font-data text-wr-positive">{analysis.reactivated.length}</span>
              <span className="text-[10px] text-muted-foreground">reativadas</span>
            </div>
            <div className="flex items-end gap-[2px] mt-3 h-6">
              {analysis.dailyFalls.map((d, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-sm transition-all"
                  style={{
                    height: `${Math.max(d.count > 0 ? (d.count / Math.max(...analysis.dailyFalls.map(x => x.count), 1)) * 100 : 4, 4)}%`,
                    background: d.count > 0 ? "hsl(var(--destructive))" : "hsl(var(--muted))",
                    opacity: d.count > 0 ? 1 : 0.3,
                  }}
                  title={`${d.date}: ${d.count} queda${d.count !== 1 ? "s" : ""}`}
                />
              ))}
            </div>
            <div className="flex gap-1 mt-2">
              {([7, 14, 30] as const).map(p => (
                <button
                  key={p}
                  onClick={() => setHistoryPeriod(p)}
                  className={`px-2 py-0.5 rounded text-[9px] font-medium transition-all ${
                    historyPeriod === p
                      ? "bg-primary/15 text-primary border border-primary/40"
                      : "bg-secondary/30 text-muted-foreground border border-border hover:text-foreground"
                  }`}
                >
                  {p}d
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Comparativo semanal */}
        <Card className="bg-card border border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="h-3.5 w-3.5 text-primary" />
              <span className="text-[10px] text-muted-foreground uppercase">Comparativo Semanal</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-data text-muted-foreground">{analysis.estimatedPrevActive}</span>
              <span className="text-[10px] text-muted-foreground">→</span>
              <span className="text-2xl font-bold font-data">{analysis.activeCount}</span>
              <span className="text-[10px] text-muted-foreground">ativas</span>
            </div>
            <div className={`flex items-center gap-1 mt-2 text-xs font-medium ${
              analysis.weeklyDelta > 0 ? "text-wr-positive" :
              analysis.weeklyDelta < 0 ? "text-destructive" : "text-muted-foreground"
            }`}>
              {analysis.weeklyDelta > 0 ? <ArrowUp className="h-3 w-3" /> :
               analysis.weeklyDelta < 0 ? <ArrowDown className="h-3 w-3" /> :
               <Minus className="h-3 w-3" />}
              {analysis.weeklyDelta > 0 ? "+" : ""}{analysis.weeklyDelta} na semana
            </div>
            <div className="mt-2 text-[10px] text-muted-foreground space-y-0.5">
              <div>↓ {analysis.fellThisWeek.length} caíram</div>
              <div>↑ {analysis.reactivatedThisWeek.length} reativadas</div>
            </div>
          </CardContent>
        </Card>

        {/* Projeção de necessidade */}
        <Card className="bg-card border border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="h-3.5 w-3.5 text-amber-400" />
              <span className="text-[10px] text-muted-foreground uppercase">Projeção Mensal</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold font-data text-amber-400">{analysis.monthlyFallProjection}</span>
              <span className="text-[10px] text-muted-foreground">contas/mês</span>
            </div>
            <p className="text-[10px] text-muted-foreground mt-2">
              Taxa: ~{analysis.weeklyFallRate.toFixed(1)} quedas/semana
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {analysis.activeNoSpend.length > 0
                ? `${analysis.activeNoSpend.length} conta${analysis.activeNoSpend.length > 1 ? "s" : ""} disponível${analysis.activeNoSpend.length > 1 ? "is" : ""} como reserva`
                : "⚠ Sem contas reserva disponíveis"}
            </p>
          </CardContent>
        </Card>

        {/* Tempo médio de vida */}
        <Card className="bg-card border border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="h-3.5 w-3.5 text-blue-400" />
              <span className="text-[10px] text-muted-foreground uppercase">Vida Média</span>
            </div>
            {analysis.avgLifespan !== null ? (
              <>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold font-data">{analysis.avgLifespan}</span>
                  <span className="text-[10px] text-muted-foreground">dias</span>
                </div>
                <p className="text-[10px] text-muted-foreground mt-2">
                  Baseado em {analysis.lifespans.length} conta{analysis.lifespans.length > 1 ? "s" : ""} que caí{analysis.lifespans.length > 1 ? "ram" : "u"}
                </p>
              </>
            ) : (
              <div className="text-sm text-muted-foreground mt-2">
                <p className="font-medium">Coletando dados...</p>
                <p className="text-[10px] mt-1">O histórico começou agora. Em alguns dias teremos dados suficientes.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Row 2: Drop Heatmap + Concentração de Risco ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Drop Heatmap by Day-of-Week */}
        <Card className="bg-card border border-border">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <CalendarDays className="h-4 w-4 text-amber-400" />
              <span className="text-xs font-semibold uppercase tracking-wider">Padrão de Quedas por Dia</span>
              <Badge variant="outline" className="text-[8px] ml-auto">últimos 30d</Badge>
            </div>
            <div className="flex items-end gap-2 h-24">
              {analysis.fallsByDow.map((count, i) => {
                const pct = count > 0 ? (count / analysis.maxDow) * 100 : 5;
                const isHigh = count > 0 && count === analysis.maxDow;
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <span className={`text-[10px] font-bold font-data ${isHigh ? "text-destructive" : "text-muted-foreground"}`}>
                      {count > 0 ? count : ""}
                    </span>
                    <div
                      className="w-full rounded-t-sm transition-all"
                      style={{
                        height: `${pct}%`,
                        minHeight: 4,
                        background: count > 0
                          ? isHigh
                            ? "hsl(var(--destructive))"
                            : `hsl(var(--destructive) / ${0.3 + (count / analysis.maxDow) * 0.7})`
                          : "hsl(var(--muted))",
                      }}
                    />
                    <span className={`text-[9px] font-mono ${isHigh ? "text-destructive font-bold" : "text-muted-foreground"}`}>
                      {DAY_LABELS[i]}
                    </span>
                  </div>
                );
              })}
            </div>
            {analysis.allFalls30d.length > 0 && (
              <p className="text-[10px] text-muted-foreground mt-3 text-center">
                Dia com mais quedas: <span className="font-semibold text-destructive">{DAY_LABELS[analysis.fallsByDow.indexOf(analysis.maxDow)]}</span>
                {" · "}{analysis.allFalls30d.length} quedas total nos últimos 30 dias
              </p>
            )}
          </CardContent>
        </Card>

        {/* Concentração de risco */}
        <Card className="bg-card border border-border">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-400" />
                <span className="text-xs font-semibold uppercase tracking-wider">Concentração de Risco</span>
              </div>
              <Badge variant="outline" className={`text-[9px] font-bold ${riskBg[analysis.riskLevel]}`}>
                <span className={riskColors[analysis.riskLevel]}>
                  {analysis.riskLevel === "baixo" ? "BAIXO" : analysis.riskLevel === "medio" ? "MÉDIO" : "ALTO"}
                </span>
              </Badge>
            </div>

            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                  <span>Maior conta: {analysis.topAccount ? analysis.topAccount[0].slice(0, 15) : "—"}</span>
                  <span className={analysis.accountConcentration > 40 ? "text-destructive font-medium" : ""}>
                    {analysis.accountConcentration.toFixed(1)}% do gasto
                  </span>
                </div>
                <div className="h-2 bg-secondary/30 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      analysis.accountConcentration > 40 ? "bg-destructive" :
                      analysis.accountConcentration > 25 ? "bg-amber-400" : "bg-wr-positive"
                    }`}
                    style={{ width: `${Math.min(analysis.accountConcentration, 100)}%` }}
                  />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                  <span>Maior BM: {analysis.topBm ? analysis.topBm[0].slice(0, 15) : "—"}</span>
                  <span className={analysis.bmConcentration > 50 ? "text-destructive font-medium" : ""}>
                    {analysis.bmConcentration.toFixed(1)}% do gasto
                  </span>
                </div>
                <div className="h-2 bg-secondary/30 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      analysis.bmConcentration > 50 ? "bg-destructive" :
                      analysis.bmConcentration > 35 ? "bg-amber-400" : "bg-wr-positive"
                    }`}
                    style={{ width: `${Math.min(analysis.bmConcentration, 100)}%` }}
                  />
                </div>
              </div>
              {analysis.riskLevel === "alto" && (
                <p className="text-[10px] text-destructive bg-destructive/5 rounded-md p-2 border border-destructive/20">
                  ⚠ Risco alto: se a conta/BM principal cair, mais de 40% do gasto será comprometido. Considere distribuir melhor.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Row 3: Score de Saúde (with aging badges) + Mapa BM ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Score de saúde com aging badges */}
        <Card className="bg-card border border-border">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <Heart className="h-4 w-4 text-primary" />
              <span className="text-xs font-semibold uppercase tracking-wider">Score de Saúde por Conta</span>
            </div>
            <Tabs defaultValue="worst" className="space-y-3">
              <TabsList className="bg-secondary/50 h-7">
                <TabsTrigger value="worst" className="text-[10px] h-5">⚠ Piores</TabsTrigger>
                <TabsTrigger value="best" className="text-[10px] h-5">✓ Melhores</TabsTrigger>
              </TabsList>
              {(["worst", "best"] as const).map(tab => (
                <TabsContent key={tab} value={tab}>
                  <div className="space-y-2 max-h-[200px] overflow-y-auto">
                    {(tab === "worst"
                      ? analysis.accountScores.slice(0, 8)
                      : [...analysis.accountScores].reverse().slice(0, 8)
                    ).map(a => {
                      const color = a.score >= 70 ? "text-wr-positive" : a.score >= 40 ? "text-amber-400" : "text-destructive";
                      const bg = a.score >= 70 ? "bg-wr-positive" : a.score >= 40 ? "bg-amber-400" : "bg-destructive";
                      // Aging badge
                      const agingBadge = a.ageDays >= 90
                        ? { label: "Veterana", cls: "text-blue-400 border-blue-400/30 bg-blue-400/5" }
                        : a.ageDays >= 30
                        ? { label: "Madura", cls: "text-wr-positive border-wr-positive/30 bg-wr-positive/5" }
                        : a.ageDays >= 7
                        ? { label: "Nova", cls: "text-amber-400 border-amber-400/30 bg-amber-400/5" }
                        : null;
                      return (
                        <div key={a.account_id} className="flex items-center gap-3">
                          <div className="w-8 text-right">
                            <span className={`text-xs font-bold font-data ${color}`}>{a.score}</span>
                          </div>
                          <div className="flex-1 h-1.5 bg-secondary/30 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${bg}`} style={{ width: `${a.score}%` }} />
                          </div>
                          <span className="text-[10px] truncate max-w-[120px]" title={a.account_name}>
                            {a.account_name}
                          </span>
                          {agingBadge && (
                            <Badge variant="outline" className={`text-[7px] px-1 py-0 h-3.5 shrink-0 ${agingBadge.cls}`}>
                              <Timer className="h-2 w-2 mr-0.5" />
                              {agingBadge.label}
                            </Badge>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          </CardContent>
        </Card>

        {/* Mapa BM → Contas */}
        <Card className="bg-card border border-border">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <GitBranch className="h-4 w-4 text-primary" />
              <span className="text-xs font-semibold uppercase tracking-wider">Dependência BM → Contas</span>
            </div>
            <div className="space-y-2 max-h-[280px] overflow-y-auto">
              {analysis.bmList.map(bm => {
                const isHigh = bm.pct > 40;
                const isOpen = expandedBm === bm.id;
                const activeInBm = bm.accounts.filter(a => a.account_status === 1).length;
                return (
                  <div key={bm.id} className="rounded-lg border border-border overflow-hidden">
                    <button
                      onClick={() => setExpandedBm(isOpen ? null : bm.id)}
                      className="w-full flex items-center gap-3 p-3 hover:bg-secondary/30 transition-colors text-left"
                    >
                      <div className={`h-2 w-2 rounded-full shrink-0 ${isHigh ? "bg-destructive" : "bg-wr-positive"}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium font-mono truncate">
                            {bm.id === "sem_bm" ? "Sem BM" : `BM ${bm.id}`}
                          </span>
                          <Badge variant="outline" className="text-[8px]">
                            {bm.accounts.length} contas
                          </Badge>
                          {isHigh && (
                            <Badge variant="outline" className="text-[8px] border-destructive/30 text-destructive bg-destructive/5">
                              RISCO
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                          <span>{fmtCur(bm.totalSpend)} ({bm.pct.toFixed(0)}%)</span>
                          <span className="text-wr-positive">{activeInBm} ativas</span>
                        </div>
                      </div>
                      {isOpen ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
                    </button>
                    {isOpen && (
                      <div className="border-t border-border px-3 py-2 space-y-1 bg-secondary/10">
                        {bm.accounts.map(a => (
                          <div key={a.account_id} className="flex items-center gap-2 text-[10px]">
                            <div className={`h-1.5 w-1.5 rounded-full ${a.account_status === 1 ? "bg-wr-positive" : "bg-destructive"}`} />
                            <span className="truncate flex-1">{a.account_name}</span>
                            <span className="font-mono text-muted-foreground">{a.currency}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Row 4: Eventos Recentes ── */}
      <Card className="bg-card border border-border">
        <CardContent className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <History className="h-4 w-4 text-primary" />
            <span className="text-xs font-semibold uppercase tracking-wider">Eventos Recentes</span>
          </div>
          <div className="space-y-2 max-h-[280px] overflow-y-auto">
            {analysis.periodEvents.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">
                Nenhum evento de mudança de status no período.
                <br />
                <span className="text-[10px]">O histórico começou agora — eventos futuros aparecerão aqui.</span>
              </p>
            ) : (
              analysis.periodEvents.slice(0, 20).map((e, i) => {
                const isFall = e.old_status === 1 && e.new_status !== 1;
                const isReactivation = e.old_status !== 1 && e.old_status !== null && e.new_status === 1;
                return (
                  <div key={i} className="flex items-start gap-3 py-2 border-b border-border last:border-0">
                    <div className={`mt-0.5 h-5 w-5 rounded-full flex items-center justify-center shrink-0 ${
                      isFall ? "bg-destructive/10" :
                      isReactivation ? "bg-wr-positive/10" : "bg-muted/50"
                    }`}>
                      {isFall ? <ArrowDown className="h-2.5 w-2.5 text-destructive" /> :
                       isReactivation ? <ArrowUp className="h-2.5 w-2.5 text-wr-positive" /> :
                       <Minus className="h-2.5 w-2.5 text-muted-foreground" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{e.account_name || e.account_id}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {statusLabel(e.old_status)} → {statusLabel(e.new_status)}
                      </p>
                    </div>
                    <span className="text-[9px] text-muted-foreground font-mono shrink-0">
                      {format(new Date(e.changed_at), "dd/MM HH:mm")}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
