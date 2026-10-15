import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOperation } from "@/contexts/OperationContext";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertTriangle, CheckCircle2, HelpCircle, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { useState } from "react";

interface VturbRow {
  date: string;
  vsl_id: string;
  vsl_name: string;
  utm_campaign: string;
  views: number;
  conversions: number;
  is_mock: boolean;
}

type UtmKind = "real" | "filename" | "total" | "empty" | "mock";

function classifyUtm(row: VturbRow): UtmKind {
  if (row.is_mock) return "mock";
  const utm = (row.utm_campaign || "").trim();
  if (!utm || utm === "(sem utm)") return "empty";
  if (utm === "(total)") return "total";
  // Filename detection: contains video extension OR matches the vsl_name normalized
  const hasExt = /\.(mp4|mov|webm|m4v|avi)\b/i.test(utm);
  const normalizedName = (row.vsl_name || "").trim().toLowerCase();
  const normalizedUtm = utm.toLowerCase();
  if (hasExt || (normalizedName && normalizedUtm === normalizedName)) return "filename";
  return "real";
}

const KIND_META: Record<UtmKind, { label: string; color: string; icon: typeof CheckCircle2; help: string }> = {
  real: {
    label: "UTM real",
    color: "bg-[hsl(var(--warroom-positive))]/10 text-[hsl(var(--warroom-positive))] border-[hsl(var(--warroom-positive))]/30",
    icon: CheckCircle2,
    help: "Sessão chegou com utm_campaign válido na URL — espelha o que aparece em 'Origem do Tráfego' do Vturb.",
  },
  filename: {
    label: "Filename (sem UTM)",
    color: "bg-[hsl(var(--warroom-warning))]/10 text-[hsl(var(--warroom-warning))] border-[hsl(var(--warroom-warning))]/30",
    icon: AlertTriangle,
    help: "Vturb não recebeu utm_campaign na URL e está usando o nome do arquivo do vídeo como fallback. Adicione ?utm_campaign=... no link da campanha.",
  },
  total: {
    label: "Agregado total",
    color: "bg-muted/40 text-muted-foreground border-border",
    icon: HelpCircle,
    help: "Linha agregada (todas as UTMs juntas). Gerada como fallback quando o group_by falha.",
  },
  empty: {
    label: "Vazio",
    color: "bg-destructive/10 text-destructive border-destructive/30",
    icon: AlertTriangle,
    help: "Vturb retornou utm_campaign null/empty. Indica falha no parsing ou sessão sem nenhum query param.",
  },
  mock: {
    label: "Mock",
    color: "bg-primary/10 text-primary border-primary/30",
    icon: HelpCircle,
    help: "Dado simulado (modo mock). Não veio do Vturb real.",
  },
};

export function VturbUtmDiagnostic() {
  const { operationId } = useOperation();
  const [resyncing, setResyncing] = useState(false);

  const { data: rows, isLoading, refetch } = useQuery({
    queryKey: ["vturb-utm-diagnostic", operationId],
    queryFn: async () => {
      let q = supabase
        .from("vturb_performance_daily")
        .select("date, vsl_id, vsl_name, utm_campaign, views, conversions, is_mock")
        .gte("date", new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10))
        .order("date", { ascending: false })
        .order("views", { ascending: false })
        .limit(500);
      if (operationId) q = q.eq("operation_id", operationId);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as VturbRow[];
    },
    refetchInterval: 60_000,
  });

  const handleResync = async () => {
    setResyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("sync-vturb-v2", {
        body: { days: 2 },
      });
      if (error) throw error;
      toast.success(`Sync iniciado: ${data?.records ?? 0} registros`);
      setTimeout(() => refetch(), 2000);
    } catch (err) {
      toast.error("Falha no sync: " + (err instanceof Error ? err.message : "erro"));
    } finally {
      setResyncing(false);
    }
  };

  // Counts (excluding mock + total aggregate rows from the breakdown stats)
  const breakdownRows = (rows || []).filter((r) => !r.is_mock && r.utm_campaign !== "(total)");
  const counts: Record<UtmKind, number> = { real: 0, filename: 0, total: 0, empty: 0, mock: 0 };
  let viewsByKind = { real: 0, filename: 0, total: 0, empty: 0, mock: 0 };
  for (const r of breakdownRows) {
    const k = classifyUtm(r);
    counts[k]++;
    viewsByKind[k] += r.views || 0;
  }
  const totalRows = breakdownRows.length || 1;
  const totalViews = Object.values(viewsByKind).reduce((s, n) => s + n, 0) || 1;
  const realPct = (viewsByKind.real / totalViews) * 100;
  const filenamePct = (viewsByKind.filename / totalViews) * 100;

  // Affected VSLs: ones where filename > real
  const byVsl = new Map<string, { name: string; real: number; filename: number; empty: number; views: number }>();
  for (const r of breakdownRows) {
    const k = classifyUtm(r);
    if (k === "total" || k === "mock") continue;
    const cur = byVsl.get(r.vsl_id) || { name: r.vsl_name, real: 0, filename: 0, empty: 0, views: 0 };
    cur.views += r.views || 0;
    if (k === "real") cur.real += r.views || 0;
    if (k === "filename") cur.filename += r.views || 0;
    if (k === "empty") cur.empty += r.views || 0;
    byVsl.set(r.vsl_id, cur);
  }
  const problemVsls = Array.from(byVsl.values())
    .filter((v) => v.filename > 0 || v.empty > 0)
    .sort((a, b) => b.views - a.views)
    .slice(0, 20);

  return (
    <div className="space-y-5">
      <div className="bg-muted/30 rounded-lg p-4 space-y-2 border border-border/50">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold text-foreground">Diagnóstico de UTMs (últimos 3 dias)</h4>
            <p className="text-xs text-muted-foreground mt-0.5">
              Verifica se o Vturb está retornando UTMs reais ou caindo no fallback do nome do arquivo.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={handleResync} disabled={resyncing} className="gap-2 shrink-0">
            {resyncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Re-sincronizar
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-10 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin mr-2" /> Carregando diagnóstico...
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {(["real", "filename", "empty", "total"] as UtmKind[]).map((k) => {
              const meta = KIND_META[k];
              const Icon = meta.icon;
              const pct = ((counts[k] / totalRows) * 100).toFixed(0);
              return (
                <Tooltip key={k}>
                  <TooltipTrigger asChild>
                    <Card className="p-3 cursor-help hover:border-primary/30 transition-colors">
                      <div className="flex items-center gap-2 mb-1.5">
                        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-[11px] font-medium text-muted-foreground">{meta.label}</span>
                      </div>
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-xl font-bold tabular-nums">{counts[k]}</span>
                        <span className="text-[11px] text-muted-foreground">linhas ({pct}%)</span>
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5 tabular-nums">
                        {viewsByKind[k].toLocaleString("pt-BR")} views
                      </div>
                    </Card>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs text-xs">
                    {meta.help}
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>

          {/* Health bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-foreground">Saúde da atribuição UTM (por views)</span>
              <span className="font-mono tabular-nums">
                <span className="text-[hsl(var(--warroom-positive))]">{realPct.toFixed(1)}%</span>
                {" reais · "}
                <span className="text-[hsl(var(--warroom-warning))]">{filenamePct.toFixed(1)}%</span>
                {" filename"}
              </span>
            </div>
            <div className="flex h-2 rounded-full overflow-hidden bg-muted/50">
              {realPct > 0 && <div className="bg-[hsl(var(--warroom-positive))]" style={{ width: `${realPct}%` }} />}
              {filenamePct > 0 && <div className="bg-[hsl(var(--warroom-warning))]" style={{ width: `${filenamePct}%` }} />}
              {((viewsByKind.empty / totalViews) * 100) > 0 && (
                <div className="bg-destructive" style={{ width: `${(viewsByKind.empty / totalViews) * 100}%` }} />
              )}
            </div>
          </div>

          {/* Problem table */}
          {problemVsls.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                VSLs sem UTM real ({problemVsls.length})
              </h4>
              <Card className="overflow-hidden">
                <ScrollArea className="max-h-80">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/40 sticky top-0">
                      <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                        <th className="px-3 py-2 font-medium">VSL</th>
                        <th className="px-3 py-2 font-medium text-right">Views totais</th>
                        <th className="px-3 py-2 font-medium text-right">Real</th>
                        <th className="px-3 py-2 font-medium text-right">Filename</th>
                        <th className="px-3 py-2 font-medium text-right">Vazio</th>
                      </tr>
                    </thead>
                    <tbody>
                      {problemVsls.map((v) => {
                        const realPctV = (v.real / (v.views || 1)) * 100;
                        return (
                          <tr key={v.name} className="border-t border-border/40 hover:bg-muted/20">
                            <td className="px-3 py-2 truncate max-w-xs" title={v.name}>{v.name}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{v.views.toLocaleString("pt-BR")}</td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {v.real > 0 ? (
                                <span className="text-[hsl(var(--warroom-positive))]">
                                  {v.real.toLocaleString("pt-BR")} ({realPctV.toFixed(0)}%)
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {v.filename > 0 ? (
                                <span className="text-[hsl(var(--warroom-warning))]">{v.filename.toLocaleString("pt-BR")}</span>
                              ) : "—"}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {v.empty > 0 ? <span className="text-destructive">{v.empty}</span> : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </ScrollArea>
              </Card>
            </div>
          )}

          {/* Diagnosis & next steps */}
          <Card className="p-4 bg-[hsl(var(--warroom-warning))]/5 border-[hsl(var(--warroom-warning))]/30">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-4 w-4 text-[hsl(var(--warroom-warning))] shrink-0 mt-0.5" />
              <div className="space-y-2 text-xs">
                <p className="font-semibold text-foreground">Por que algumas sessões não têm utm_campaign?</p>
                <p className="text-muted-foreground leading-relaxed">
                  O Vturb usa o <strong>nome do arquivo do vídeo</strong> como fallback quando a sessão chega
                  sem o parâmetro <code className="px-1 py-0.5 rounded bg-muted text-foreground">utm_campaign</code> na URL.
                  Isso acontece quando:
                </p>
                <ul className="list-disc list-inside space-y-0.5 text-muted-foreground ml-1">
                  <li>O link da campanha no Meta Ads não inclui <code className="px-1 py-0.5 rounded bg-muted text-foreground">?utm_campaign={"{{campaign.name}}"}</code></li>
                  <li>O usuário acessou direto a página (sem clicar em anúncio)</li>
                  <li>Tracking pixel/redirect dropou os query params</li>
                  <li>RedTrack/CartPanda interceptou a URL antes do Vturb capturar</li>
                </ul>
                <p className="text-muted-foreground leading-relaxed pt-1">
                  <strong className="text-foreground">Solução:</strong> garanta que <em>todos</em> os anúncios do Meta usem o template de URL com{" "}
                  <code className="px-1 py-0.5 rounded bg-muted text-foreground">utm_campaign={"{{campaign.name}}"}</code>{" "}
                  e <code className="px-1 py-0.5 rounded bg-muted text-foreground">utm_content={"{{ad.name}}"}</code>.
                </p>
              </div>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
