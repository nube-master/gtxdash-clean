import { useCallback, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Megaphone,
  MonitorPlay,
  Wallet,
  ShoppingCart,
  Building2,
  Tag,
  TrendingUp,
  AlertTriangle,
  Download,
  Share2,
} from "lucide-react";
import { toast } from "sonner";
import type { CreativeRow } from "@/lib/creativeUtils";
import { CreativeLifecycleCurve } from "./CreativeLifecycleCurve";

interface Props {
  creative: CreativeRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filterTestMode?: string;
}

function fmtCurrency(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 }).format(v);
}

function Section({ icon: Icon, title, count, children }: { icon: React.ElementType; title: string; count?: number; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Icon className="h-3.5 w-3.5 text-primary" />
        <span className="text-xs font-semibold uppercase tracking-wider text-foreground">{title}</span>
        {count != null && (
          <Badge variant="outline" className="text-[9px] font-mono ml-auto">{count}</Badge>
        )}
      </div>
      {children}
    </div>
  );
}

export function CreativeDiagnosticsModal({ creative, open, onOpenChange, filterTestMode }: Props) {
  const c = creative;

  const campaignList = useMemo(() => {
    if (!c) return [];
    let list = Array.from(c.campaignNames);
    if (filterTestMode === "f1") {
      list = list.filter(name => /\bF1\b/i.test(name));
    }
    return list.sort();
  }, [c, filterTestMode]);

  const adList = useMemo(() => {
    if (!c) return [];
    return [...c.adNames].sort();
  }, [c]);

  const accountList = useMemo(() => {
    if (!c) return [];
    return Array.from(c.accountIds).sort();
  }, [c]);

  const exportCsv = useCallback(() => {
    if (!c) return;
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const rows: string[][] = [
      ["Campo", "Valor"],
      ["Criativo", c.creativeId],
      ["Projeto", c.project.label],
      ["Investimento", c.spend.toFixed(2)],
      ["Faturamento", c.revenue.toFixed(2)],
      ["Vendas", String(c.sales)],
      ["ROI", c.roi.toFixed(2)],
      ["Impressões", String(c.impressions)],
      ["Cliques", String(c.clicks)],
      ["CTR", c.ctr.toFixed(2)],
      ["CPC", c.cpc.toFixed(2)],
      ["CPM", c.cpm.toFixed(2)],
      ["Hook Rate", c.hookRate.toFixed(1)],
      ["Hold Rate", c.holdRate.toFixed(1)],
      ["3s Views", String(c.video3sViews)],
      ["Video 25%", String(c.video25)],
      ["Video 50%", String(c.video50)],
      ["Video 75%", String(c.video75)],
      ["Video 100%", String(c.video100)],
      ["AOV", c.avgTicket.toFixed(2)],
      ["CAC", c.sales > 0 ? (c.spend / c.sales).toFixed(2) : "0"],
      ["Score", c.creativeScore.toFixed(0)],
      ["Copy", c.copyWriter || ""],
      ["Editor", c.editor || ""],
      ["Campanhas", campaignList.join(" | ")],
      ["Anúncios", adList.join(" | ")],
      ["Contas", accountList.join(" | ")],
      ["Integridade", c.integrity.status],
    ];
    const csv = rows.map(r => r.map(esc).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `diag_${c.creativeId}_${c.project.tag || "sem-tag"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [c, campaignList, adList, accountList]);

  if (!c) return null;

  const hasIntegrityIssues = c.integrity.status !== "ok";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg sm:max-w-2xl max-h-[92vh] p-0 gap-0 bg-card border-border overflow-hidden flex flex-col">
        <DialogHeader className="p-5 pb-3">
          <DialogTitle className="flex items-center gap-2 text-base">
            <span className="font-mono font-bold">{c.creativeId}</span>
            {c.project.tag && (
              <span className={`inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold ${c.project.className}`}>
                {c.project.label}
              </span>
            )}
            {!c.project.tag && (
              <Badge variant="outline" className="text-[10px] font-mono text-amber-500 border-amber-500/30">
                Sem Tag
              </Badge>
            )}
          </DialogTitle>
          <p className="text-xs text-muted-foreground font-mono mt-1 flex items-center gap-2">
            <span>Diagnóstico de agregação • {accountList.length} conta(s) · {campaignList.length} campanha(s) · {adList.length} anúncio(s)</span>
            <div className="ml-auto flex gap-1">
              <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1" onClick={() => {
                const url = new URL(window.location.href);
                url.pathname = "/creatives";
                url.searchParams.set("creative", c.creativeId);
                navigator.clipboard.writeText(url.toString());
                toast.success("Link de compartilhamento copiado!");
              }}>
                <Share2 className="h-3 w-3" />
                Compartilhar
              </Button>
              <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1" onClick={exportCsv}>
                <Download className="h-3 w-3" />
                CSV
              </Button>
            </div>
          </p>
        </DialogHeader>

        <Separator />

        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="p-5 space-y-5">
            {/* Summary KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Investimento", value: fmtCurrency(c.spend), icon: Wallet },
                { label: "Faturamento", value: c.revenue > 0 ? fmtCurrency(c.revenue) : "—", icon: ShoppingCart },
                { label: "Vendas", value: String(c.sales), icon: TrendingUp },
                { label: "ROI", value: c.roi > 0 ? `${c.roi.toFixed(2)}x` : "—", icon: TrendingUp },
              ].map((kpi) => (
                <div key={kpi.label} className="rounded-lg border border-border bg-muted/20 p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <kpi.icon className="h-3 w-3 text-muted-foreground" />
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{kpi.label}</span>
                  </div>
                  <span className="text-sm font-mono font-bold text-foreground">{kpi.value}</span>
                </div>
              ))}
            </div>

            {/* Integrity Issues */}
            {hasIntegrityIssues && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-1">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                  <span className="text-xs font-semibold text-destructive">
                    {c.integrity.status === "cross_project_conflict" && "Conflito Cross-Projeto"}
                    {c.integrity.status === "mismatch_project" && "Divergência de Projeto"}
                    {c.integrity.status === "missing_meta_data" && "Dados Meta Ausentes"}
                    {c.integrity.status === "missing_utm" && "UTM Ausente"}
                  </span>
                </div>
                {c.integrity.details.map((d, i) => (
                  <p key={i} className="text-[11px] text-muted-foreground">{d}</p>
                ))}
              </div>
            )}

            {/* Team */}
            {(c.copyWriter || c.editor) && (
              <div className="flex gap-4">
                {c.copyWriter && (
                  <div className="text-xs">
                    <span className="text-muted-foreground">Copy: </span>
                    <span className="font-semibold text-foreground">✍️ {c.copyWriter}</span>
                  </div>
                )}
                {c.editor && (
                  <div className="text-xs">
                    <span className="text-muted-foreground">Editor: </span>
                    <span className="font-semibold text-foreground">🎬 {c.editor}</span>
                  </div>
                )}
              </div>
            )}

            <Separator />

            {/* Campaigns */}
            <Section icon={Megaphone} title="Campanhas Agregadas" count={campaignList.length}>
              <ScrollArea className={campaignList.length > 6 ? "max-h-[200px]" : ""}>
                <div className="space-y-1 pr-2">
                  {campaignList.map((name) => (
                    <div
                      key={name}
                      className="rounded border border-border bg-muted/10 px-3 py-1.5 text-[11px] font-mono text-muted-foreground truncate"
                      title={name}
                    >
                      {name}
                    </div>
                  ))}
                  {campaignList.length === 0 && (
                    <p className="text-[11px] text-muted-foreground italic">Nenhuma campanha encontrada</p>
                  )}
                </div>
              </ScrollArea>
            </Section>

            <Separator />

            {/* Ad Names */}
            <Section icon={MonitorPlay} title="Anúncios (Ad Names)" count={adList.length}>
              <div className="space-y-1">
                {adList.map((name) => (
                  <div
                    key={name}
                    className="rounded border border-border bg-muted/10 px-3 py-1.5 text-[11px] font-mono text-muted-foreground truncate"
                    title={name}
                  >
                    {name}
                  </div>
                ))}
                {adList.length === 0 && (
                  <p className="text-[11px] text-muted-foreground italic">Nenhum anúncio encontrado</p>
                )}
              </div>
            </Section>

            <Separator />

            {/* Accounts */}
            <Section icon={Building2} title="Contas de Anúncio" count={accountList.length}>
              <div className="flex flex-wrap gap-1.5">
                {accountList.map((id) => (
                  <Badge key={id} variant="outline" className="text-[10px] font-mono text-muted-foreground">
                    {id}
                  </Badge>
                ))}
                {accountList.length === 0 && (
                  <p className="text-[11px] text-muted-foreground italic">Nenhuma conta</p>
                )}
              </div>
            </Section>

            <Separator />

            {/* Advanced Metrics */}
            <Section icon={Tag} title="Métricas Detalhadas">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px] font-mono">
                {[
                  { label: "Impressões", value: c.impressions.toLocaleString("pt-BR") },
                  { label: "Cliques", value: c.clicks.toLocaleString("pt-BR") },
                  { label: "CTR", value: `${c.ctr.toFixed(2)}%` },
                  { label: "CPC", value: fmtCurrency(c.cpc) },
                  { label: "CPM", value: fmtCurrency(c.cpm) },
                  { label: "Hook Rate", value: c.isVideo ? `${c.hookRate.toFixed(1)}%` : "N/A" },
                  { label: "Hold Rate", value: `${c.holdRate.toFixed(1)}%` },
                  { label: "3s Views", value: c.video3sViews.toLocaleString("pt-BR") },
                  { label: "Video 25%", value: c.video25.toLocaleString("pt-BR") },
                  { label: "Video 50%", value: c.video50.toLocaleString("pt-BR") },
                  { label: "Video 75%", value: c.video75.toLocaleString("pt-BR") },
                  { label: "Video 100%", value: c.video100.toLocaleString("pt-BR") },
                  { label: "AOV", value: c.avgTicket > 0 ? fmtCurrency(c.avgTicket) : "—" },
                  { label: "CAC", value: c.sales > 0 ? fmtCurrency(c.spend / c.sales) : "—" },
                  { label: "Score", value: c.creativeScore.toFixed(0) },
                ].map((m) => (
                  <div key={m.label} className="flex justify-between gap-2">
                    <span className="text-muted-foreground">{m.label}</span>
                    <span className="text-foreground font-semibold">{m.value}</span>
                  </div>
                ))}
              </div>
            </Section>

            {/* Diagnostic */}
            {c.diagnostic && (
              <>
                <Separator />
                <div className="rounded-lg border border-border bg-muted/20 p-3">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Diagnóstico IA</p>
                  <p className="text-xs text-foreground">{c.diagnostic}</p>
                </div>
              </>
            )}

            <Separator />

            {/* Lifecycle Curve */}
            <CreativeLifecycleCurve
              creativeId={c.creativeId}
              enabled={open}
              adNames={adList}
              campaignNames={campaignList}
              projectCode={c.project.tag}
              reference={{
                spend: c.spend,
                revenue: c.revenue,
                sales: c.sales,
                roas: c.roi,
              }}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
