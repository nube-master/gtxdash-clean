import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PacingHeader } from "@/components/pacing/PacingHeader";
import { RuleCard } from "@/components/pacing/RuleCard";
import { RuleEditorPanel } from "@/components/pacing/RuleEditorPanel";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Search, Gauge, Sliders, History, Settings as SettingsIcon, Target } from "lucide-react";
import { type PacingRuleV2 } from "@/components/pacing/mockData";
import { usePacingRules } from "@/hooks/usePacingRules";
import { useSimulateRule } from "@/hooks/useSimulateRule";
import { usePacingRuleMatchCounts } from "@/hooks/usePacingRuleMatchCounts";
import { RuleSimulationDialog } from "@/components/pacing/RuleSimulationDialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type SortKey = "fired" | "recent" | "name";
type StatusFilter = "all" | "active" | "paused";

export default function PacingRules() {
  const navigate = useNavigate();
  const { rules, loading, createRule, updateRule, toggleEnabled, deleteRule } = usePacingRules();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("fired");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [editing, setEditing] = useState<PacingRuleV2 | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<PacingRuleV2 | null>(null);
  const [simRule, setSimRule] = useState<PacingRuleV2 | null>(null);
  const { loading: simLoading, result: simResult, simulate, reset: resetSim } = useSimulateRule();
  const matchCounts = usePacingRuleMatchCounts(rules);
  const [ligaTudoRule, setLigaTudoRule] = useState<PacingRuleV2 | null>(null);
  const [ligaTudoRunning, setLigaTudoRunning] = useState(false);
  const [ligaTudoPreview, setLigaTudoPreview] = useState<{
    loading: boolean;
    error: string | null;
    campaigns: Array<{ id: string; name: string }>;
    matched: number;
  }>({ loading: false, error: null, campaigns: [], matched: 0 });

  const handleSimulate = async (r: PacingRuleV2) => {
    setSimRule(r);
    resetSim();
    await simulate(r.id);
  };

  const handleLigaTudo = (r: PacingRuleV2) => setLigaTudoRule(r);

  // Ao abrir o diálogo, dispara dry-run (simulate + liga_tudo) pra prévia.
  useEffect(() => {
    if (!ligaTudoRule) {
      setLigaTudoPreview({ loading: false, error: null, campaigns: [], matched: 0 });
      return;
    }
    let cancelled = false;
    setLigaTudoPreview({ loading: true, error: null, campaigns: [], matched: 0 });
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("pacing-controller", {
          body: {
            simulate: true,
            liga_tudo: true,
            simulate_rule_ids: [ligaTudoRule.id],
            triggered_by: "liga_tudo_preview",
          },
        });
        if (error) throw error;
        if (!data?.success) throw new Error(data?.error ?? "preview falhou");
        const wouldFire = (data?.would_fire ?? []) as Array<{ campaign_id: string; campaign_name: string; rule_id: string | null }>;
        const scoped = wouldFire.filter((w) => !w.rule_id || w.rule_id === ligaTudoRule.id);
        const uniq = new Map<string, string>();
        for (const w of scoped) uniq.set(w.campaign_id, w.campaign_name);
        const matched = (data?.rule_stats ?? []).reduce((a: number, s: any) => a + (s.campaigns_matched ?? 0), 0);
        if (!cancelled) {
          setLigaTudoPreview({
            loading: false,
            error: null,
            campaigns: Array.from(uniq.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
            matched,
          });
        }
      } catch (err: any) {
        if (!cancelled) {
          setLigaTudoPreview({ loading: false, error: err?.message ?? String(err), campaigns: [], matched: 0 });
        }
      }
    })();
    return () => { cancelled = true; };
  }, [ligaTudoRule]);

  const [ligaTudoReport, setLigaTudoReport] = useState<{
    ruleName: string;
    fired: Array<{ id: string; name: string }>;
    blocked: Array<{ id: string; name: string; reason: string }>;
    matched: number;
    stats: { paused: number; reduced: number; alerted: number; resumed: number };
  } | null>(null);

  const confirmLigaTudo = async () => {
    if (!ligaTudoRule) return;
    setLigaTudoRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("pacing-controller", {
        body: { liga_tudo: true, only_rule_ids: [ligaTudoRule.id], triggered_by: "liga_tudo_manual" },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error ?? "falhou");
      const fired = (data?.rule_stats ?? data?.liga_tudo_report?.rule_stats ?? []).reduce((a: number, s: any) => a + (s.campaigns_fired ?? 0), 0);
      const matched = (data?.rule_stats ?? data?.liga_tudo_report?.rule_stats ?? []).reduce((a: number, s: any) => a + (s.campaigns_matched ?? 0), 0);
      toast.success(`Liga Tudo: ${fired} ligadas de ${matched} candidatas`);

      // Monta o relatório detalhado.
      const report = data?.liga_tudo_report;
      if (report) {
        const attempted = (report.attempted ?? []) as Array<{ campaign_id: string; campaign_name: string; rule_id: string | null }>;
        const scopedAttempted = attempted.filter((a) => !a.rule_id || a.rule_id === ligaTudoRule.id);
        const firedMap = new Map<string, string>();
        for (const a of scopedAttempted) firedMap.set(a.campaign_id, a.campaign_name);
        const blockedAll: Array<{ id: string; name: string; reason: string }> = [];
        for (const s of (report.rule_stats ?? []) as any[]) {
          if (s.rule_id && s.rule_id !== ligaTudoRule.id) continue;
          for (const b of (s.blocked ?? []) as Array<{ campaignId: string; campaignName: string; reason: string }>) {
            blockedAll.push({ id: b.campaignId, name: b.campaignName, reason: b.reason });
          }
        }
        setLigaTudoReport({
          ruleName: ligaTudoRule.name,
          fired: Array.from(firedMap.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
          blocked: blockedAll.sort((a, b) => a.name.localeCompare(b.name)),
          matched,
          stats: data?.stats ?? { paused: 0, reduced: 0, alerted: 0, resumed: 0 },
        });
      }
      setLigaTudoRule(null);
    } catch (err: any) {
      toast.error("Erro no Liga Tudo", { description: err?.message ?? String(err) });
    } finally {
      setLigaTudoRunning(false);
    }
  };


  const total = rules.length;
  const activeCount = rules.filter((r) => r.enabled).length;
  const pausedCount = total - activeCount;

  const filtered = useMemo(() => {
    let list = rules;
    if (statusFilter === "active") list = list.filter((r) => r.enabled);
    else if (statusFilter === "paused") list = list.filter((r) => !r.enabled);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((r) => r.name.toLowerCase().includes(q));
    }
    const sorted = [...list].sort((a, b) => {
      if (sort === "fired") return b.firedToday - a.firedToday;
      if (sort === "name") return a.name.localeCompare(b.name);
      const ax = a.lastFiredAt ? new Date(a.lastFiredAt).getTime() : 0;
      const bx = b.lastFiredAt ? new Date(b.lastFiredAt).getTime() : 0;
      return bx - ax;
    });
    return sorted;
  }, [rules, search, sort, statusFilter]);

  const openCreate = () => { setEditing(null); setPanelOpen(true); };
  const openEdit = (r: PacingRuleV2) => { setEditing(r); setPanelOpen(true); };

  const handleSave = async (saved: PacingRuleV2) => {
    if (editing) {
      await updateRule(editing.id, saved);
    } else {
      await createRule(saved);
    }
    setPanelOpen(false);
  };

  const handleDuplicate = async (r: PacingRuleV2) => {
    await createRule({
      ...r,
      id: "",
      name: `${r.name} (cópia)`,
      enabled: false,
      firedToday: 0,
      firedTotal: 0,
      lastFiredAt: null,
    });
  };

  const handleHistory = (r: PacingRuleV2) => navigate(`/pacing/historico?rule=${r.id}`);

  const handleDelete = async () => {
    if (!confirmDelete) return;
    await deleteRule(confirmDelete.id);
    setConfirmDelete(null);
  };

  return (
    <div className="space-y-4 px-4 md:px-6 pb-10">
      <PacingHeader onNewRule={openCreate} />

      <Tabs value="rules" className="w-full">
        <TabsList className="grid grid-cols-5 w-full max-w-2xl">
          <TabsTrigger value="dashboard" onClick={() => navigate("/pacing")}>
            <Gauge className="size-3.5 mr-1.5" /> Dashboard
          </TabsTrigger>
          <TabsTrigger value="rules"><Sliders className="size-3.5 mr-1.5" /> Regras</TabsTrigger>
          <TabsTrigger value="groups" onClick={() => navigate("/pacing/budget-groups")}>
            <Target className="size-3.5 mr-1.5" /> Budget Groups
          </TabsTrigger>
          <TabsTrigger value="history" onClick={() => navigate("/pacing/historico")}>
            <History className="size-3.5 mr-1.5" /> Histórico
          </TabsTrigger>
          <TabsTrigger value="settings" onClick={() => navigate("/pacing/settings")}>
            <SettingsIcon className="size-3.5 mr-1.5" /> Config
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="flex items-center justify-between flex-wrap gap-3 pt-2">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider">Regras Automáticas</h2>
          <p className="text-xs text-muted-foreground mt-0.5 tabular-nums">
            {total} {total === 1 ? "regra" : "regras"} ·{" "}
            <span className="text-[hsl(var(--wr-positive))]">{activeCount} ativas</span> ·{" "}
            <span className="text-muted-foreground">{pausedCount} pausadas</span>
          </p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="size-3.5 mr-1.5" /> Nova Regra
        </Button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="buscar regra..."
            className="pl-8 h-9 text-xs"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
          <SelectTrigger className="w-36 h-9 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas ({total})</SelectItem>
            <SelectItem value="active">Ativas ({activeCount})</SelectItem>
            <SelectItem value="paused">Pausadas ({pausedCount})</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
          <SelectTrigger className="w-44 h-9 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="fired">Mais disparada</SelectItem>
            <SelectItem value="recent">Mais recente</SelectItem>
            <SelectItem value="name">Nome A-Z</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2.5">
        {loading ? (
          <>
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-28 w-full" />)}
          </>
        ) : filtered.length === 0 ? (
          <div className="rounded border border-dashed border-border/60 py-12 text-center">
            <p className="text-sm text-muted-foreground">
              {search ? "Nenhuma regra encontrada." : "Nenhuma regra criada ainda."}
            </p>
            {!search && (
              <Button size="sm" variant="outline" className="mt-3" onClick={openCreate}>
                <Plus className="size-3.5 mr-1.5" /> Criar primeira regra
              </Button>
            )}
          </div>
        ) : (
          filtered.map((r) => (
            <RuleCard
              key={r.id}
              rule={{ ...r, matchedCampaigns: matchCounts[r.id] ?? r.matchedCampaigns }}
              onToggle={(id, next) => toggleEnabled(id, next)}
              onEdit={openEdit}
              onDuplicate={handleDuplicate}
              onHistory={handleHistory}
              onDelete={(rule) => setConfirmDelete(rule)}
              onSimulate={handleSimulate}
              onLigaTudo={handleLigaTudo}
            />
          ))
        )}
      </div>

      <RuleEditorPanel
        open={panelOpen}
        rule={editing}
        onClose={() => setPanelOpen(false)}
        onSave={handleSave}
      />

      <RuleSimulationDialog
        open={!!simRule}
        onClose={() => setSimRule(null)}
        ruleName={simRule?.name ?? ""}
        loading={simLoading}
        result={simResult}
      />


      <AlertDialog open={!!confirmDelete} onOpenChange={(v) => !v && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deletar regra {confirmDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Deletar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!ligaTudoRule} onOpenChange={(v) => !v && !ligaTudoRunning && setLigaTudoRule(null)}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>⚡ Liga Tudo — {ligaTudoRule?.name}?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                <p>
                  Executa a regra ignorando o filtro de <b>spend ontem</b> — religa todas as campanhas
                  do escopo, mesmo as sem gasto ontem. <b>Pausa manual sticky</b> continua bloqueada.
                </p>
                <div className="rounded border border-border/60 bg-muted/30 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wider mb-2">
                    Prévia (dry-run)
                  </div>
                  {ligaTudoPreview.loading ? (
                    <p className="text-xs text-muted-foreground">Calculando…</p>
                  ) : ligaTudoPreview.error ? (
                    <p className="text-xs text-destructive">Erro: {ligaTudoPreview.error}</p>
                  ) : ligaTudoPreview.campaigns.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Nenhuma campanha seria reativada
                      {ligaTudoPreview.matched > 0 ? ` (${ligaTudoPreview.matched} bateram no escopo mas foram bloqueadas por cooldown/sticky)` : ""}.
                    </p>
                  ) : (
                    <>
                      <p className="text-xs mb-2 tabular-nums">
                        <span className="text-[hsl(var(--wr-positive))] font-semibold">
                          {ligaTudoPreview.campaigns.length}
                        </span>{" "}
                        campanha{ligaTudoPreview.campaigns.length === 1 ? "" : "s"} será
                        {ligaTudoPreview.campaigns.length === 1 ? "" : "ão"} reativada
                        {ligaTudoPreview.campaigns.length === 1 ? "" : "s"}
                        {ligaTudoPreview.matched > ligaTudoPreview.campaigns.length &&
                          ` · ${ligaTudoPreview.matched - ligaTudoPreview.campaigns.length} bloqueadas por cooldown/sticky`}
                      </p>
                      <div className="max-h-56 overflow-y-auto space-y-0.5 font-mono text-[11px] leading-relaxed">
                        {ligaTudoPreview.campaigns.slice(0, 200).map((c) => (
                          <div key={c.id} className="truncate text-foreground/80">{c.name}</div>
                        ))}
                        {ligaTudoPreview.campaigns.length > 200 && (
                          <div className="text-muted-foreground pt-1">
                            … e mais {ligaTudoPreview.campaigns.length - 200}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={ligaTudoRunning}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); confirmLigaTudo(); }}
              disabled={ligaTudoRunning || ligaTudoPreview.loading || ligaTudoPreview.campaigns.length === 0}
            >
              {ligaTudoRunning
                ? "Ligando…"
                : ligaTudoPreview.loading
                  ? "Aguarde…"
                  : ligaTudoPreview.campaigns.length === 0
                    ? "Nada pra ligar"
                    : `Ligar ${ligaTudoPreview.campaigns.length} agora`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!ligaTudoReport} onOpenChange={(v) => !v && setLigaTudoReport(null)}>
        <AlertDialogContent className="max-w-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>
              📋 Relatório Liga Tudo — {ligaTudoReport?.ruleName}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                {ligaTudoReport && (() => {
                  const stickyBlocked = ligaTudoReport.blocked.filter((b) => /sticky|manual/i.test(b.reason));
                  const otherBlocked = ligaTudoReport.blocked.filter((b) => !/sticky|manual/i.test(b.reason));
                  const skipped = Math.max(0, ligaTudoReport.matched - ligaTudoReport.fired.length - ligaTudoReport.blocked.length);
                  return (
                    <>
                      <div className="grid grid-cols-4 gap-2 tabular-nums">
                        <div className="rounded border border-border/60 bg-muted/30 p-2 text-center">
                          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Candidatas</div>
                          <div className="text-lg font-semibold">{ligaTudoReport.matched}</div>
                        </div>
                        <div className="rounded border border-[hsl(var(--wr-positive))]/40 bg-[hsl(var(--wr-positive))]/10 p-2 text-center">
                          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Ativadas</div>
                          <div className="text-lg font-semibold text-[hsl(var(--wr-positive))]">{ligaTudoReport.fired.length}</div>
                        </div>
                        <div className="rounded border border-amber-500/40 bg-amber-500/10 p-2 text-center">
                          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Sticky</div>
                          <div className="text-lg font-semibold text-amber-500">{stickyBlocked.length}</div>
                        </div>
                        <div className="rounded border border-border/60 bg-muted/30 p-2 text-center">
                          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Skipped</div>
                          <div className="text-lg font-semibold text-muted-foreground">{otherBlocked.length + skipped}</div>
                        </div>
                      </div>

                      {ligaTudoReport.fired.length > 0 && (
                        <div className="rounded border border-border/60 bg-muted/20 p-2">
                          <div className="text-[11px] font-semibold uppercase tracking-wider mb-1.5 text-[hsl(var(--wr-positive))]">
                            ✓ Reativadas ({ligaTudoReport.fired.length})
                          </div>
                          <div className="max-h-40 overflow-y-auto space-y-0.5 font-mono text-[11px] leading-relaxed">
                            {ligaTudoReport.fired.slice(0, 300).map((c) => (
                              <div key={c.id} className="truncate text-foreground/80">{c.name}</div>
                            ))}
                            {ligaTudoReport.fired.length > 300 && (
                              <div className="text-muted-foreground pt-1">… e mais {ligaTudoReport.fired.length - 300}</div>
                            )}
                          </div>
                        </div>
                      )}

                      {stickyBlocked.length > 0 && (
                        <div className="rounded border border-amber-500/30 bg-amber-500/5 p-2">
                          <div className="text-[11px] font-semibold uppercase tracking-wider mb-1.5 text-amber-500">
                            🔒 Bloqueadas por sticky ({stickyBlocked.length})
                          </div>
                          <div className="max-h-32 overflow-y-auto space-y-1 text-[11px] leading-relaxed">
                            {stickyBlocked.slice(0, 200).map((b) => (
                              <div key={b.id} className="flex flex-col">
                                <span className="font-mono truncate text-foreground/80">{b.name}</span>
                                <span className="text-muted-foreground text-[10px] pl-2">↳ {b.reason}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {otherBlocked.length > 0 && (
                        <div className="rounded border border-border/60 bg-muted/20 p-2">
                          <div className="text-[11px] font-semibold uppercase tracking-wider mb-1.5 text-muted-foreground">
                            ⊘ Outros bloqueios ({otherBlocked.length})
                          </div>
                          <div className="max-h-32 overflow-y-auto space-y-1 text-[11px] leading-relaxed">
                            {otherBlocked.slice(0, 200).map((b) => (
                              <div key={b.id} className="flex flex-col">
                                <span className="font-mono truncate text-foreground/80">{b.name}</span>
                                <span className="text-muted-foreground text-[10px] pl-2">↳ {b.reason}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setLigaTudoReport(null)}>Fechar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
