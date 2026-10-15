import { Film, Flame, Target, AlertCircle, MousePointerClick, Heart, Users, Sparkles, FileText, Lightbulb, CheckCircle2, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { useState } from "react";

interface Props {
  offerId: string;
  vslIntelSummary: any;
  vslIntelAnalyzedAt: string | null;
  vslIntelSourceFiles: any;
  onRefresh: () => void;
}

const SECTIONS = [
  { key: "top_hooks", label: "Ganchos", icon: Flame, color: "text-orange-500" },
  { key: "top_angles", label: "Angles", icon: Target, color: "text-blue-500" },
  { key: "top_pains", label: "Dores", icon: AlertCircle, color: "text-red-500" },
  { key: "top_ctas", label: "Estilos de CTA", icon: MousePointerClick, color: "text-purple-500" },
  { key: "top_triggers", label: "Gatilhos emocionais", icon: Heart, color: "text-pink-500" },
  { key: "top_audiences", label: "Público-alvo", icon: Users, color: "text-emerald-500" },
];

export function SpyVslIntelTab({
  offerId,
  vslIntelSummary,
  vslIntelAnalyzedAt,
  vslIntelSourceFiles,
  onRefresh,
}: Props) {
  const [running, setRunning] = useState(false);

  async function handleRun() {
    setRunning(true);
    toast.loading("Analisando transcrição da VSL via IA…", { id: "vsl-intel" });
    const { data, error } = await supabase.functions.invoke("spy-analyze-vsl", {
      body: { offer_id: offerId },
    });
    setRunning(false);
    if (error || !data?.ok) {
      toast.error(error?.message ?? data?.error ?? "Erro na análise", { id: "vsl-intel" });
      return;
    }
    toast.success(`Análise gerada a partir de ${data.files_used?.length ?? 0} arquivo(s)`, {
      id: "vsl-intel",
    });
    onRefresh();
  }

  const summary = vslIntelSummary || {};
  const hasSummary = !!summary?.top_hooks?.length || !!summary?.top_angles?.length;
  const usedFiles: Array<{ file_name: string; chars: number }> = Array.isArray(vslIntelSourceFiles)
    ? vslIntelSourceFiles
    : [];

  return (
    <div className="space-y-4">
      {/* Header com ação */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Film className="h-4 w-4 text-primary" />
          <div>
            <p className="text-sm font-semibold">Análise VSL</p>
            <p className="text-[11px] text-muted-foreground">
              {hasSummary
                ? `Framework extraído da transcrição · ${usedFiles.length} arquivo(s)`
                : "Nenhuma análise gerada ainda. Suba a transcrição na pasta 'Transcrição'."}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={handleRun} disabled={running}>
            <Sparkles className="h-3.5 w-3.5 mr-1.5" />
            {hasSummary ? "Reanalisar" : "Analisar VSL"}
          </Button>
        </div>
      </div>

      {!hasSummary ? (
        <Card className="p-6 text-center text-sm text-muted-foreground space-y-2">
          <p>
            Suba a transcrição da VSL (arquivo <code>.txt</code>, <code>.md</code>, <code>.srt</code> ou{" "}
            <code>.vtt</code>) na pasta <strong>Transcrição</strong> e clique em{" "}
            <strong>Analisar VSL</strong>.
          </p>
          <p className="text-[11px]">
            A IA vai extrair ganchos, ângulos, dores, gatilhos, CTAs e público-alvo — mesma estrutura
            do Copy Intel, mas baseada no roteiro da VSL.
          </p>
        </Card>
      ) : (
        <>
          {/* Painel de Insights: Resumo + Alegações + Pontos de virada */}
          {(summary.executive_summary ||
            summary.key_claims?.length ||
            summary.turning_points?.length) && (
            <Card className="p-4 bg-gradient-to-br from-primary/5 via-transparent to-transparent border-primary/20">
              <div className="flex items-center gap-1.5 mb-3">
                <Lightbulb className="h-4 w-4 text-primary" />
                <p className="text-sm font-semibold">Insights da VSL</p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {summary.executive_summary && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                      <FileText className="h-3 w-3" /> Resumo
                    </p>
                    <p className="text-[12px] leading-relaxed text-foreground/90">
                      {summary.executive_summary}
                    </p>
                  </div>
                )}

                {summary.key_claims?.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" /> Principais alegações
                    </p>
                    <ul className="space-y-1.5">
                      {summary.key_claims.map((c: any, i: number) => (
                        <li key={i} className="flex items-start gap-1.5 text-[12px]">
                          <CheckCircle2 className="h-3 w-3 mt-0.5 text-emerald-500 shrink-0" />
                          <span className="leading-snug">{c.value}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {summary.turning_points?.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                      <Zap className="h-3 w-3" /> Pontos de virada
                    </p>
                    <ul className="space-y-2">
                      {summary.turning_points.map((t: any, i: number) => (
                        <li key={i} className="text-[12px] leading-snug">
                          <p className="font-medium text-foreground/90">{t.moment}</p>
                          <p className="text-muted-foreground">{t.description}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </Card>
          )}


          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            {typeof summary.avg_score === "number" && (
              <Card className="p-4 bg-gradient-to-br from-primary/5 to-transparent lg:col-span-1">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-medium text-muted-foreground">Score de Persuasão</p>
                  <span className="text-2xl font-bold tabular-nums">{summary.avg_score}</span>
                </div>
                <Progress value={summary.avg_score} className="h-2" />
              </Card>
            )}
            {(summary.big_idea || summary.promise || summary.mechanism) && (
              <Card className="p-4 lg:col-span-2 space-y-2">
                {summary.big_idea && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Big Idea</p>
                    <p className="text-sm font-medium">{summary.big_idea}</p>
                  </div>
                )}
                {summary.promise && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Promessa</p>
                    <p className="text-sm">{summary.promise}</p>
                  </div>
                )}
                {summary.mechanism && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Mecanismo</p>
                    <p className="text-sm">{summary.mechanism}</p>
                  </div>
                )}
              </Card>
            )}
          </div>

          {/* Grids de top items */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {SECTIONS.map((s) => {
              const items: Array<{ value: string; count: number }> = summary[s.key] ?? [];
              if (!items.length) return null;
              const max = Math.max(...items.map((i) => i.count), 1);
              const Icon = s.icon;
              return (
                <Card key={s.key} className="p-3">
                  <div className="flex items-center gap-1.5 mb-2">
                    <Icon className={`h-3.5 w-3.5 ${s.color}`} />
                    <p className="text-xs font-semibold">{s.label}</p>
                  </div>
                  <div className="space-y-1.5">
                    {items.map((it, idx) => (
                      <div key={`${it.value}-${idx}`} className="space-y-0.5">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="truncate pr-2">{it.value}</span>
                          <span className="text-muted-foreground tabular-nums shrink-0">
                            {it.count}
                          </span>
                        </div>
                        <div className="h-1 rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full ${s.color.replace("text-", "bg-")}/40`}
                            style={{ width: `${(it.count / max) * 100}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              );
            })}
          </div>

          {/* Estrutura narrativa */}
          {summary.structure_summary && (
            <Card className="p-4">
              <p className="text-xs font-semibold mb-2 flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5 text-primary" /> Estrutura narrativa
              </p>
              <pre className="text-[12px] whitespace-pre-wrap font-sans text-muted-foreground">
                {summary.structure_summary}
              </pre>
            </Card>
          )}

          {/* Arquivos usados */}
          {usedFiles.length > 0 && (
            <div className="flex flex-wrap gap-2 items-center text-[11px] text-muted-foreground">
              <span>Fontes:</span>
              {usedFiles.map((f) => (
                <span
                  key={f.file_name}
                  className="px-2 py-0.5 rounded-md bg-muted border border-border"
                >
                  {f.file_name} · {(f.chars / 1000).toFixed(1)}k chars
                </span>
              ))}
            </div>
          )}

          {vslIntelAnalyzedAt && (
            <p className="text-[10px] text-muted-foreground text-right">
              Última análise: {new Date(vslIntelAnalyzedAt).toLocaleString("pt-BR")}
            </p>
          )}
        </>
      )}
    </div>
  );
}
