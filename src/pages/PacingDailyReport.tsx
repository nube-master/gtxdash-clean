import { Fragment, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PacingHeader } from "@/components/pacing/PacingHeader";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Download, FileText, AlertCircle, Moon, Sunrise, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";

const TZ = "America/Sao_Paulo";

function brtDateKey(iso: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(iso));
}
function brtHour(iso: string) {
  return Number(new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ, hour: "2-digit", hour12: false,
  }).format(new Date(iso)));
}
function todayBRT() { return brtDateKey(new Date().toISOString()); }

type Row = {
  id: string;
  rule_id: string | null;
  campaign_id: string | null;
  campaign_name: string | null;
  account_name: string | null;
  action_type: string | null;
  reason: string | null;
  spend_at_action: number | null;
  dry_run: boolean | null;
  success: boolean | null;
  error_message: string | null;
  triggered_at: string;
};
type Rule = { id: string; name: string; enabled: boolean; dry_run: boolean };

type Group = {
  rule_id: string | null;
  rule_name: string;
  enabled: boolean;
  dry_run_rule: boolean;
  actions: Row[];
  total: number;
  pauses: number;
  activations: number;
  success: number;
  failed: number;
  dryRunCount: number;
  uniqueCampaigns: number;
  spendSum: number;
  highlight?: "religar10h" | "madrugada" | null;
};

function detectHighlight(name: string): Group["highlight"] {
  const n = name.toLowerCase();
  if (n.includes("religar") && n.includes("10")) return "religar10h";
  if (n.includes("madrugada")) return "madrugada";
  return null;
}

function toCsv(groups: Group[], dayKey: string) {
  const head = ["rule", "enabled", "dry_run_rule", "campaign_id", "campaign_name", "account", "action", "spend_at_action_brl", "dry_run", "success", "error", "triggered_at_brt"];
  const lines = [head.join(",")];
  for (const g of groups) {
    for (const a of g.actions) {
      lines.push([
        JSON.stringify(g.rule_name),
        g.enabled,
        g.dry_run_rule,
        a.campaign_id ?? "",
        JSON.stringify(a.campaign_name ?? ""),
        JSON.stringify(a.account_name ?? ""),
        a.action_type ?? "",
        a.spend_at_action ?? 0,
        a.dry_run ?? false,
        a.success ?? false,
        JSON.stringify(a.error_message ?? ""),
        a.triggered_at,
      ].join(","));
    }
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = `pacing-relatorio-${dayKey}.csv`;
  link.click(); URL.revokeObjectURL(url);
}

export default function PacingDailyReport() {
  const navigate = useNavigate();
  const [day, setDay] = useState<string>(todayBRT());
  const [rows, setRows] = useState<Row[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      // BRT day window in UTC: BRT = UTC-3, so day 00h BRT = 03h UTC
      const [y, m, d] = day.split("-").map(Number);
      const startUtc = new Date(Date.UTC(y, m - 1, d, 3, 0, 0)).toISOString();
      const endUtc = new Date(Date.UTC(y, m - 1, d + 1, 3, 0, 0)).toISOString();
      const [logRes, rulesRes] = await Promise.all([
        (supabase as any).from("pacing_action_log")
          .select("id,rule_id,campaign_id,campaign_name,account_name,action_type,reason,spend_at_action,dry_run,success,error_message,triggered_at")
          .gte("triggered_at", startUtc).lt("triggered_at", endUtc)
          .order("triggered_at", { ascending: false }).limit(5000),
        (supabase as any).from("pacing_rules").select("id,name,enabled,dry_run"),
      ]);
      if (cancelled) return;
      if (logRes.error) toast.error("Erro ao carregar log", { description: logRes.error.message });
      if (rulesRes.error) toast.error("Erro ao carregar regras", { description: rulesRes.error.message });
      setRows((logRes.data ?? []) as Row[]);
      setRules((rulesRes.data ?? []) as Rule[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [day]);

  const ruleMap = useMemo(() => {
    const m = new Map<string, Rule>();
    for (const r of rules) m.set(r.id, r);
    return m;
  }, [rules]);

  const groups = useMemo<Group[]>(() => {
    const byRule = new Map<string, Row[]>();
    for (const r of rows) {
      const key = r.rule_id ?? "__null__";
      const list = byRule.get(key) ?? [];
      list.push(r);
      byRule.set(key, list);
    }
    const out: Group[] = [];
    for (const [key, actions] of byRule.entries()) {
      const rule = key !== "__null__" ? ruleMap.get(key) : undefined;
      const name = rule?.name ?? "(sem regra / manual)";
      const camps = new Set(actions.map((a) => a.campaign_id).filter(Boolean) as string[]);
      const spendSum = actions.reduce((s, a) => s + (Number(a.spend_at_action) || 0), 0);
      out.push({
        rule_id: key === "__null__" ? null : key,
        rule_name: name,
        enabled: rule?.enabled ?? false,
        dry_run_rule: rule?.dry_run ?? false,
        actions,
        total: actions.length,
        pauses: actions.filter((a) => (a.action_type || "").toLowerCase().includes("pause")).length,
        activations: actions.filter((a) => {
          const t = (a.action_type || "").toLowerCase();
          return t.includes("activate") || t.includes("resume") || t.includes("religar");
        }).length,
        success: actions.filter((a) => a.success === true).length,
        failed: actions.filter((a) => a.success === false).length,
        dryRunCount: actions.filter((a) => a.dry_run === true).length,
        uniqueCampaigns: camps.size,
        spendSum,
        highlight: detectHighlight(name),
      });
    }
    out.sort((a, b) => b.total - a.total);
    return out;
  }, [rows, ruleMap]);

  const totals = useMemo(() => {
    const all = groups.flatMap((g) => g.actions);
    return {
      total: all.length,
      pauses: all.filter((a) => (a.action_type || "").toLowerCase().includes("pause")).length,
      activations: all.filter((a) => {
        const t = (a.action_type || "").toLowerCase();
        return t.includes("activate") || t.includes("resume") || t.includes("religar");
      }).length,
      success: all.filter((a) => a.success === true).length,
      failed: all.filter((a) => a.success === false).length,
      dryRun: all.filter((a) => a.dry_run === true).length,
      uniqueCampaigns: new Set(all.map((a) => a.campaign_id).filter(Boolean) as string[]).size,
      spendSum: all.reduce((s, a) => s + (Number(a.spend_at_action) || 0), 0),
    };
  }, [groups]);

  const focusGroups = groups.filter((g) => g.highlight);

  const toggle = (id: string) => {
    setExpanded((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const brl = (n: number) =>
    n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });

  return (
    <div className="min-h-screen bg-background">
      <PacingHeader />
      <div className="container mx-auto px-4 py-6 space-y-6">
        <Tabs value="report" className="w-full">
          <TabsList className="grid grid-cols-6 w-full max-w-3xl">
            <TabsTrigger value="dashboard" onClick={() => navigate("/pacing")}>Dashboard</TabsTrigger>
            <TabsTrigger value="rules" onClick={() => navigate("/pacing/regras")}>Regras</TabsTrigger>
            <TabsTrigger value="groups" onClick={() => navigate("/pacing/budget-groups")}>Grupos</TabsTrigger>
            <TabsTrigger value="history" onClick={() => navigate("/pacing/historico")}>Histórico</TabsTrigger>
            <TabsTrigger value="report">Relatório</TabsTrigger>
            <TabsTrigger value="settings" onClick={() => navigate("/pacing/settings")}>Settings</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Dia (BRT)</label>
            <Input
              type="date"
              value={day}
              max={todayBRT()}
              onChange={(e) => setDay(e.target.value || todayBRT())}
              className="w-[180px]"
            />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setDay(todayBRT())}>Hoje</Button>
            <Button variant="outline" size="sm" onClick={() => {
              const [y, m, d] = day.split("-").map(Number);
              const t = new Date(Date.UTC(y, m - 1, d - 1));
              setDay(`${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`);
            }}>← Anterior</Button>
            <Button variant="outline" size="sm" disabled={day >= todayBRT()} onClick={() => {
              const [y, m, d] = day.split("-").map(Number);
              const t = new Date(Date.UTC(y, m - 1, d + 1));
              setDay(`${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`);
            }}>Próximo →</Button>
          </div>
          <Button
            variant="outline" size="sm" className="ml-auto"
            disabled={loading || groups.length === 0}
            onClick={() => toCsv(groups, day)}
          >
            <Download className="w-4 h-4 mr-2" /> Exportar CSV
          </Button>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          {[
            { label: "Ações", value: totals.total },
            { label: "Pausas", value: totals.pauses },
            { label: "Ativações", value: totals.activations },
            { label: "Sucesso", value: totals.success },
            { label: "Falha", value: totals.failed },
            { label: "Dry-run", value: totals.dryRun },
            { label: "Campanhas únicas", value: totals.uniqueCampaigns },
          ].map((k) => (
            <Card key={k.label}>
              <CardContent className="p-3">
                <div className="text-xs text-muted-foreground">{k.label}</div>
                <div className="text-2xl font-semibold">{loading ? <Skeleton className="h-7 w-12" /> : k.value}</div>
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardContent className="p-3 flex items-center justify-between">
            <div className="text-sm text-muted-foreground">Spend total que disparou ações</div>
            <div className="text-xl font-semibold">{loading ? <Skeleton className="h-6 w-24" /> : brl(totals.spendSum)}</div>
          </CardContent>
        </Card>

        {/* Foco: Religar 10h + Madrugada Lock */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="w-4 h-4" /> Validação — Religar 10h & Madrugada Lock
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <Skeleton className="h-20 w-full" />
            ) : focusGroups.length === 0 ? (
              <div className="text-sm text-muted-foreground flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                Nenhuma ação dessas regras neste dia. Confirme se estão <code className="px-1 bg-muted rounded">enabled=true</code> e fora do <code className="px-1 bg-muted rounded">dry_run</code>.
              </div>
            ) : (
              focusGroups.map((g) => {
                const Icon = g.highlight === "madrugada" ? Moon : Sunrise;
                const horas = g.actions.map((a) => brtHour(a.triggered_at));
                const minH = Math.min(...horas);
                const maxH = Math.max(...horas);
                const okWindow = g.highlight === "religar10h"
                  ? horas.every((h) => h === 10)
                  : horas.every((h) => h >= 3 && h < 9);
                return (
                  <div key={g.rule_id ?? g.rule_name} className="border rounded-md p-3 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Icon className="w-4 h-4" />
                      <span className="font-medium">{g.rule_name}</span>
                      {g.enabled ? <Badge variant="default">enabled</Badge> : <Badge variant="secondary">disabled</Badge>}
                      {g.dry_run_rule && <Badge variant="outline">dry-run</Badge>}
                      <Badge variant={okWindow ? "default" : "destructive"}>
                        Janela BRT {String(minH).padStart(2, "0")}h–{String(maxH).padStart(2, "0")}h {okWindow ? "✓" : "✗"}
                      </Badge>
                    </div>
                    <div className="text-sm grid grid-cols-2 md:grid-cols-5 gap-2">
                      <div><span className="text-muted-foreground">Ações: </span><b>{g.total}</b></div>
                      <div><span className="text-muted-foreground">Pausas: </span><b>{g.pauses}</b></div>
                      <div><span className="text-muted-foreground">Ativações: </span><b>{g.activations}</b></div>
                      <div><span className="text-muted-foreground">Campanhas: </span><b>{g.uniqueCampaigns}</b></div>
                      <div><span className="text-muted-foreground">Spend: </span><b>{brl(g.spendSum)}</b></div>
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* Por regra */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Por regra</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-40 w-full" />
            ) : groups.length === 0 ? (
              <div className="text-sm text-muted-foreground py-6 text-center">Sem ações registradas neste dia.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8" />
                    <TableHead>Regra</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                    <TableHead className="text-right">Pausa</TableHead>
                    <TableHead className="text-right">Ativ.</TableHead>
                    <TableHead className="text-right">Sucesso</TableHead>
                    <TableHead className="text-right">Falha</TableHead>
                    <TableHead className="text-right">Camps</TableHead>
                    <TableHead className="text-right">Spend disparo</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groups.map((g) => {
                    const key = g.rule_id ?? g.rule_name;
                    const open = expanded.has(key);
                    return (
                      <Fragment key={key}>
                        <TableRow key={key} className="cursor-pointer hover:bg-muted/50" onClick={() => toggle(key)}>
                          <TableCell>{open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}</TableCell>
                          <TableCell className="font-medium">{g.rule_name}</TableCell>
                          <TableCell className="text-right">{g.total}</TableCell>
                          <TableCell className="text-right">{g.pauses}</TableCell>
                          <TableCell className="text-right">{g.activations}</TableCell>
                          <TableCell className="text-right text-emerald-600">{g.success}</TableCell>
                          <TableCell className="text-right text-rose-600">{g.failed}</TableCell>
                          <TableCell className="text-right">{g.uniqueCampaigns}</TableCell>
                          <TableCell className="text-right">{brl(g.spendSum)}</TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              {g.enabled ? <Badge variant="default">on</Badge> : <Badge variant="secondary">off</Badge>}
                              {g.dry_run_rule && <Badge variant="outline">dry</Badge>}
                            </div>
                          </TableCell>
                        </TableRow>
                        {open && (
                          <TableRow key={`${key}-detail`}>
                            <TableCell />
                            <TableCell colSpan={9}>
                              <div className="max-h-72 overflow-auto rounded border">
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>Hora BRT</TableHead>
                                      <TableHead>Ação</TableHead>
                                      <TableHead>Campanha</TableHead>
                                      <TableHead>Conta</TableHead>
                                      <TableHead className="text-right">Spend</TableHead>
                                      <TableHead>Status</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {g.actions.map((a) => (
                                      <TableRow key={a.id}>
                                        <TableCell className="font-mono text-xs">
                                          {new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(new Date(a.triggered_at))}
                                        </TableCell>
                                        <TableCell>{a.action_type}</TableCell>
                                        <TableCell className="max-w-[280px] truncate" title={a.campaign_name ?? ""}>{a.campaign_name ?? a.campaign_id ?? "—"}</TableCell>
                                        <TableCell className="text-xs text-muted-foreground">{a.account_name ?? "—"}</TableCell>
                                        <TableCell className="text-right">{brl(Number(a.spend_at_action) || 0)}</TableCell>
                                        <TableCell>
                                          {a.dry_run ? <Badge variant="outline">dry</Badge> :
                                            a.success === true ? <Badge variant="default">ok</Badge> :
                                            a.success === false ? <Badge variant="destructive" title={a.error_message ?? ""}>erro</Badge> :
                                            <Badge variant="secondary">—</Badge>}
                                        </TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
