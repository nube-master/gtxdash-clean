import { } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Video, ImageIcon, Copy, ExternalLink, Loader2, Share2 } from "lucide-react";
import { type CreativeRow } from "@/lib/creativeUtils";
import { toast } from "sonner";
import { useCreativePreview } from "@/hooks/useCreativePreview";
import { CreativeLifecycleCurve } from "@/components/creatives/CreativeLifecycleCurve";
import { Separator } from "@/components/ui/separator";

interface Props {
  creative: CreativeRow | null;
  open: boolean;
  onClose: () => void;
}

function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(v);
}
function fmtCurrency(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v);
}
function fmtPct(v: number) {
  return v.toFixed(1) + "%";
}

export function CreativeDetailModal({ creative: c, open, onClose }: Props) {
  const adName = c?.adNames[0];
  const accountId = c ? Array.from(c.accountIds)[0] : undefined;
  const { preview, loading: previewLoading } = useCreativePreview(adName, accountId, open && !!c);

  if (!c) return null;

  const structureLabel = c.isScaleStructure
    ? { label: "Escala", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" }
    : c.isF3
    ? { label: "Escala (F3)", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" }
    : c.isTestStructure
    ? { label: "Teste", cls: "bg-amber-500/15 text-amber-400 border-amber-500/30" }
    : null;

  const handleCopyLink = () => {
    if (preview?.preview_link) {
      navigator.clipboard.writeText(preview.preview_link);
      toast.success("Link do preview copiado!");
    } else {
      const text = `Criativo: ${c.creativeId} | ROI: ${c.roi.toFixed(2)}x | Vendas: ${c.sales}`;
      navigator.clipboard.writeText(text);
      toast.success("Informações copiadas!");
    }
  };

  const handleShare = () => {
    const url = new URL(window.location.href);
    url.pathname = "/creatives";
    url.searchParams.set("creative", c.creativeId);
    navigator.clipboard.writeText(url.toString());
    toast.success("Link de compartilhamento copiado!");
  };

  const hasVideo = preview?.video_url;
  const hasThumbnail = preview?.thumbnail_url;

  const metrics = [
    { label: "Hook", value: fmtPct(c.hookRate) },
    { label: "CTR", value: fmtPct(c.ctr) },
    { label: "Hold", value: fmtPct(c.holdRate) },
    { label: "Invest.", value: fmtCurrency(c.spend) },
    { label: "Fatur.", value: fmtCurrency(c.revenue) },
    { label: "Lucro", value: fmtCurrency(c.profit), color: c.profit >= 0 ? "text-emerald-400" : "text-destructive" },
    { label: "ROI", value: c.roi.toFixed(2) + "x", color: c.roi >= 1 ? "text-emerald-400" : "text-destructive" },
  ];

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md max-h-[92vh] p-0 overflow-y-auto gap-0">
        {/* Header */}
        <DialogHeader className="px-4 pt-4 pb-2">
          <DialogTitle className="flex items-center gap-2 text-sm">
            {c.creativeId}
            {c.project.tag && (
              <span className={`inline-flex rounded-full border px-1.5 py-0.5 text-[9px] font-semibold ${c.project.className}`}>
                {c.project.label}
              </span>
            )}
            {structureLabel && (
              <span className={`inline-flex rounded-full border px-1.5 py-0.5 text-[9px] font-semibold ${structureLabel.cls}`}>
                {structureLabel.label}
              </span>
            )}
          </DialogTitle>
          <DialogDescription className="text-[10px] font-mono truncate">
            {c.adNames[0] || "Sem nome de anúncio"}
          </DialogDescription>
        </DialogHeader>

        {/* Video area */}
        <div className="bg-black flex items-center justify-center">
          {previewLoading ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              <p className="text-[10px] text-muted-foreground">Buscando preview...</p>
            </div>
          ) : hasVideo ? (
            <video
              src={preview!.video_url!}
              controls
              muted
              playsInline
              preload="metadata"
              className="w-full max-h-[55vh] object-contain"
            />
          ) : hasThumbnail ? (
            <img
              src={preview!.thumbnail_url!}
              alt={c.creativeId}
              className="w-full max-h-[55vh] object-contain"
            />
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
              {c.isVideo ? (
                <Video className="h-6 w-6 opacity-40" />
              ) : (
                <ImageIcon className="h-6 w-6 opacity-40" />
              )}
              <p className="text-[10px]">
                {"Preview indisponível"}
              </p>
            </div>
          )}
        </div>

        {/* Info + Actions */}
        <div className="px-4 pt-3 pb-4 space-y-3">
          {(c.copyWriter || c.editor) && (
            <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
              {c.copyWriter && (
                <span>✍️ <span className="text-foreground font-medium">{c.copyWriter}</span></span>
              )}
              {c.editor && (
                <span>🎬 <span className="text-foreground font-medium">{c.editor}</span></span>
              )}
            </div>
          )}

          <div className="grid grid-cols-4 gap-1.5">
            {metrics.map((m) => (
              <div key={m.label} className="rounded-md bg-muted/40 px-2 py-1.5 text-center">
                <p className="text-[8px] text-muted-foreground uppercase tracking-wider leading-none mb-0.5">{m.label}</p>
                <p className={`text-[11px] font-bold leading-none ${m.color || "text-foreground"}`}>{m.value}</p>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1 h-8 text-xs" onClick={handleShare}>
              <Share2 className="h-3 w-3 mr-1" />
              Compartilhar
            </Button>
            <Button variant="outline" size="sm" className="flex-1 h-8 text-xs" onClick={handleCopyLink}>
              <Copy className="h-3 w-3 mr-1" />
              {preview?.preview_link ? "Copiar Link" : "Copiar Info"}
            </Button>
            {preview?.preview_link && (
              <Button variant="outline" size="sm" className="flex-1 h-8 text-xs" asChild>
                <a href={preview.preview_link} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-3 w-3 mr-1" />
                  Ver no Meta
                </a>
              </Button>
            )}
          </div>

          <Separator className="my-1" />

          <CreativeLifecycleCurve
            creativeId={c.creativeId}
            enabled={open}
            reference={{
              spend: c.spend,
              revenue: c.revenue,
              sales: c.sales,
              roas: c.roi,
            }}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
