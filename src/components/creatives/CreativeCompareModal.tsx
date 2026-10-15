import { useRef, useCallback, useState } from "react";
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
import { ArrowUp, ArrowDown, Minus, Download, Image, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { CreativeRow } from "@/lib/creativeUtils";

interface Props {
  creatives: [CreativeRow, CreativeRow] | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function fmtCurrency(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 }).format(v);
}

function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(v);
}

interface MetricRowProps {
  label: string;
  a: number;
  b: number;
  format?: "currency" | "pct" | "number" | "roi";
  higherIsBetter?: boolean;
}

function formatVal(v: number, format: string) {
  if (format === "currency") return fmtCurrency(v);
  if (format === "pct") return `${v.toFixed(1)}%`;
  if (format === "roi") return v > 0 ? `${v.toFixed(2)}x` : "—";
  return fmt(v);
}

function DeltaIcon({ better }: { better: boolean | null }) {
  if (better === null) return <Minus className="h-3 w-3 text-muted-foreground" />;
  return better ? <ArrowUp className="h-3 w-3 text-wr-positive" /> : <ArrowDown className="h-3 w-3 text-destructive" />;
}

function MetricRow({ label, a, b, format = "number", higherIsBetter = true }: MetricRowProps) {
  const diff = a - b;
  const aWins = higherIsBetter ? diff > 0 : diff < 0;
  const bWins = higherIsBetter ? diff < 0 : diff > 0;
  const tie = diff === 0;

  return (
    <div className="grid grid-cols-[1fr_100px_60px_100px_1fr] items-center gap-1 py-1.5">
      <div className="text-right">
        <span className={`text-xs font-mono font-semibold ${aWins ? "text-wr-positive" : tie ? "text-foreground" : "text-foreground"}`}>
          {formatVal(a, format)}
        </span>
      </div>
      <div className="flex justify-center">
        <DeltaIcon better={tie ? null : aWins} />
      </div>
      <div className="text-center text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
        {label}
      </div>
      <div className="flex justify-center">
        <DeltaIcon better={tie ? null : bWins} />
      </div>
      <div className="text-left">
        <span className={`text-xs font-mono font-semibold ${bWins ? "text-wr-positive" : tie ? "text-foreground" : "text-foreground"}`}>
          {formatVal(b, format)}
        </span>
      </div>
    </div>
  );
}

export function CreativeCompareModal({ creatives, open, onOpenChange }: Props) {
  const captureRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);

  const exportAsImage = useCallback(async () => {
    if (!captureRef.current || !creatives) return;
    setExporting(true);
    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(captureRef.current, {
        backgroundColor: "#0a0a0a",
        scale: 2,
        useCORS: true,
      });
      const link = document.createElement("a");
      link.download = `comparacao-${creatives[0].creativeId}-vs-${creatives[1].creativeId}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
      toast.success("Imagem exportada com sucesso");
    } catch {
      toast.error("Erro ao exportar imagem");
    } finally {
      setExporting(false);
    }
  }, [creatives]);

  const exportAsPdf = useCallback(async () => {
    if (!captureRef.current || !creatives) return;
    setExporting(true);
    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(captureRef.current, {
        backgroundColor: "#0a0a0a",
        scale: 2,
        useCORS: true,
      });
      const imgData = canvas.toDataURL("image/png");
      const imgWidth = canvas.width;
      const imgHeight = canvas.height;

      // Create a simple PDF using a printable window
      const printWindow = window.open("", "_blank");
      if (!printWindow) {
        toast.error("Permita pop-ups para exportar PDF");
        setExporting(false);
        return;
      }
      printWindow.document.write(`
        <html>
          <head>
            <title>Comparação ${creatives[0].creativeId} vs ${creatives[1].creativeId}</title>
            <style>
              @page { margin: 20px; }
              body { margin: 0; display: flex; justify-content: center; align-items: flex-start; background: #0a0a0a; }
              img { max-width: 100%; height: auto; }
            </style>
          </head>
          <body>
            <img src="${imgData}" width="${imgWidth / 2}" height="${imgHeight / 2}" />
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.onload = () => {
        printWindow.print();
      };
      toast.success("PDF pronto para impressão");
    } catch {
      toast.error("Erro ao exportar PDF");
    } finally {
      setExporting(false);
    }
  }, [creatives]);

  if (!creatives) return null;
  const [a, b] = creatives;

  const metrics: MetricRowProps[] = [
    { label: "Score", a: a.creativeScore, b: b.creativeScore },
    { label: "ROI", a: a.roi, b: b.roi, format: "roi" },
    { label: "Vendas", a: a.sales, b: b.sales },
    { label: "Invest.", a: a.spend, b: b.spend, format: "currency", higherIsBetter: false },
    { label: "Fatur.", a: a.revenue, b: b.revenue, format: "currency" },
    { label: "Lucro", a: a.profit, b: b.profit, format: "currency" },
    { label: "Hook %", a: a.hookRate, b: b.hookRate, format: "pct" },
    { label: "Hold %", a: a.holdRate, b: b.holdRate, format: "pct" },
    { label: "CTR", a: a.ctr, b: b.ctr, format: "pct" },
    { label: "CPC", a: a.cpc, b: b.cpc, format: "currency", higherIsBetter: false },
    { label: "CPM", a: a.cpm, b: b.cpm, format: "currency", higherIsBetter: false },
    { label: "CAC", a: a.sales > 0 ? a.spend / a.sales : 0, b: b.sales > 0 ? b.spend / b.sales : 0, format: "currency", higherIsBetter: false },
    { label: "Impr.", a: a.impressions, b: b.impressions },
    { label: "Cliques", a: a.clicks, b: b.clicks },
    { label: "3s Views", a: a.video3sViews, b: b.video3sViews },
  ];

  const winsA = metrics.filter(m => {
    const diff = m.a - m.b;
    return m.higherIsBetter !== false ? diff > 0 : diff < 0;
  }).length;
  const winsB = metrics.filter(m => {
    const diff = m.a - m.b;
    return m.higherIsBetter !== false ? diff < 0 : diff > 0;
  }).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg sm:max-w-2xl max-h-[85vh] p-0 gap-0 bg-card border-border">
        <DialogHeader className="p-5 pb-3">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-base">Comparação de Criativos</DialogTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Análise lado-a-lado das métricas de performance
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-[10px] gap-1"
                onClick={exportAsImage}
                disabled={exporting}
              >
                {exporting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Image className="h-3 w-3" />}
                PNG
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-[10px] gap-1"
                onClick={exportAsPdf}
                disabled={exporting}
              >
                {exporting ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileText className="h-3 w-3" />}
                PDF
              </Button>
            </div>
          </div>
        </DialogHeader>

        <Separator />

        <ScrollArea className="max-h-[calc(85vh-100px)]">
          <div ref={captureRef} className="p-5 space-y-4">
            {/* Headers */}
            <div className="grid grid-cols-[1fr_100px_60px_100px_1fr] items-center gap-1">
              <div className="text-right">
                <div className="flex items-center justify-end gap-1.5">
                  <span className="font-mono font-bold text-sm text-foreground">{a.creativeId}</span>
                  {a.project.tag && (
                    <span className={`inline-flex items-center rounded border px-1 py-0 font-mono text-[9px] font-semibold ${a.project.className}`}>
                      {a.project.label}
                    </span>
                  )}
                </div>
                <Badge variant={winsA > winsB ? "default" : "outline"} className="mt-1 text-[9px]">
                  {winsA} vitória{winsA !== 1 ? "s" : ""}
                </Badge>
              </div>
              <div />
              <div className="text-center text-[10px] text-muted-foreground font-semibold uppercase">VS</div>
              <div />
              <div className="text-left">
                <div className="flex items-center gap-1.5">
                  <span className="font-mono font-bold text-sm text-foreground">{b.creativeId}</span>
                  {b.project.tag && (
                    <span className={`inline-flex items-center rounded border px-1 py-0 font-mono text-[9px] font-semibold ${b.project.className}`}>
                      {b.project.label}
                    </span>
                  )}
                </div>
                <Badge variant={winsB > winsA ? "default" : "outline"} className="mt-1 text-[9px]">
                  {winsB} vitória{winsB !== 1 ? "s" : ""}
                </Badge>
              </div>
            </div>

            <Separator />

            {/* Metrics */}
            <div className="space-y-0 divide-y divide-border">
              {metrics.map((m) => (
                <MetricRow key={m.label} {...m} />
              ))}
            </div>

            <Separator />

            {/* Summary */}
            <div className="rounded-lg border border-border bg-muted/20 p-3 text-center">
              <p className="text-xs text-muted-foreground">
                {winsA > winsB ? (
                  <><span className="font-bold text-wr-positive">{a.creativeId}</span> vence em {winsA} de {metrics.length} métricas</>
                ) : winsB > winsA ? (
                  <><span className="font-bold text-wr-positive">{b.creativeId}</span> vence em {winsB} de {metrics.length} métricas</>
                ) : (
                  <>Empate — ambos vencem em {winsA} métricas</>
                )}
              </p>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
