import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { FileText, Sparkles, Loader2, Download, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Props {
  offerId: string;
  offerName: string;
  briefingMd?: string | null;
  briefingGeneratedAt?: string | null;
  onUpdate: () => void;
}

export function SpyBriefingTab({ offerId, offerName, briefingMd, briefingGeneratedAt, onUpdate }: Props) {
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  async function handleGenerate() {
    setLoading(true);
    toast.loading("Gerando briefing com IA…", { id: "brief" });
    const { data, error } = await supabase.functions.invoke("spy-generate-briefing", {
      body: { offer_id: offerId },
    });
    setLoading(false);
    if (error || !data?.ok) {
      toast.error(data?.error ?? error?.message ?? "Erro ao gerar briefing", { id: "brief" });
      return;
    }
    toast.success("Briefing gerado", { id: "brief" });
    onUpdate();
  }

  function handleDownload() {
    if (!briefingMd) return;
    const blob = new Blob([briefingMd], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `briefing-${offerName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function handleCopy() {
    if (!briefingMd) return;
    await navigator.clipboard.writeText(briefingMd);
    setCopied(true);
    toast.success("Briefing copiado");
    setTimeout(() => setCopied(false), 2000);
  }

  if (!briefingMd) {
    return (
      <Card className="p-8 flex flex-col items-center justify-center text-center gap-3 border-dashed">
        <FileText className="h-10 w-10 text-muted-foreground/40" />
        <div>
          <p className="text-sm font-medium">Nenhum briefing gerado ainda</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-md">
            A IA vai consolidar a análise da oferta, ads ativos e padrões de copy em um documento pronto para o copywriter.
          </p>
        </div>
        <Button size="sm" onClick={handleGenerate} disabled={loading}>
          {loading ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1.5" />}
          {loading ? "Gerando…" : "Gerar Briefing Enzo"}
        </Button>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 text-purple-400" />
          {briefingGeneratedAt && (
            <span>
              Gerado {formatDistanceToNow(new Date(briefingGeneratedAt), { addSuffix: true, locale: ptBR })}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="outline" onClick={handleCopy}>
            {copied ? <Check className="h-3.5 w-3.5 mr-1.5" /> : <Copy className="h-3.5 w-3.5 mr-1.5" />}
            {copied ? "Copiado" : "Copiar"}
          </Button>
          <Button size="sm" variant="outline" onClick={handleDownload}>
            <Download className="h-3.5 w-3.5 mr-1.5" /> Baixar .md
          </Button>
          <Button size="sm" onClick={handleGenerate} disabled={loading}>
            {loading ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1.5" />}
            Regerar
          </Button>
        </div>
      </div>

      <Card className="p-6 prose prose-sm prose-invert max-w-none prose-headings:font-semibold prose-h1:text-2xl prose-h2:text-lg prose-h2:mt-6 prose-h2:mb-2 prose-h2:text-purple-300 prose-h3:text-base prose-strong:text-foreground prose-ul:my-2 prose-li:my-0.5">
        <ReactMarkdown>{briefingMd}</ReactMarkdown>
      </Card>
    </div>
  );
}
