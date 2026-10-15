import { useQuery } from "@tanstack/react-query";
import { Brain, Flame, Target, AlertCircle, MousePointerClick, Heart, Users, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { useState } from "react";

interface Props {
  offerId: string;
  copyIntelSummary: any;
  copyIntelAnalyzedAt: string | null;
  onRefresh: () => void;
}

interface Insight {
  id: string;
  ad_id: string;
  hook_type: string | null;
  hook_text: string | null;
  angle: string | null;
  promise: string | null;
  pain_point: string | null;
  cta_style: string | null;
  emotional_trigger: string | null;
  target_audience: string | null;
  score_persuasao: number | null;
  analyzed_at: string;
}

const SECTIONS = [
  { key: "top_hooks", label: "Ganchos", icon: Flame, color: "text-orange-500" },
  { key: "top_angles", label: "Angles", icon: Target, color: "text-blue-500" },
  { key: "top_pains", label: "Dores", icon: AlertCircle, color: "text-red-500" },
  { key: "top_ctas", label: "Estilos de CTA", icon: MousePointerClick, color: "text-purple-500" },
  { key: "top_triggers", label: "Gatilhos emocionais", icon: Heart, color: "text-pink-500" },
  { key: "top_audiences", label: "Público-alvo", icon: Users, color: "text-emerald-500" },
];

export function SpyCopyIntelTab({ offerId, copyIntelSummary, copyIntelAnalyzedAt, onRefresh }: Props) {
  const [running, setRunning] = useState(false);

  const { data: insights = [] } = useQuery({
    queryKey: ["spy-ad-insights", offerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("spy_ad_insights" as any)
        .select("*")
        .eq("offer_id", offerId)
        .order("score_persuasao", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data as unknown as Insight[]) ?? [];
    },
  });

  async function handleRun(force = false) {
    setRunning(true);
    toast.loading("Analisando copies via IA…", { id: "copy-intel" });
    const { data, error } = await supabase.functions.invoke("spy-analyze-copy", {
      body: { offer_id: offerId, force },
    });
    setRunning(false);
    if (error || !data?.ok) {
      toast.error(error?.message ?? data?.error ?? "Erro na análise", { id: "copy-intel" });
      return;
    }
    toast.success(`${data.analyzed} novas ads analisadas (${data.total_insights} no total)`, { id: "copy-intel" });
    onRefresh();
  }

  const summary = copyIntelSummary || {};
  const hasSummary = summary?.total_analyzed > 0;

  return (
    <div className="space-y-4">
      {/* Header com ação */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-primary" />
          <div>
            <p className="text-sm font-semibold">Copy Intelligence</p>
            <p className="text-[11px] text-muted-foreground">
              {hasSummary
                ? `${summary.total_analyzed} ads analisadas · score médio ${summary.avg_score ?? "—"}/100`
                : "Nenhuma análise gerada ainda"}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => handleRun(false)} disabled={running}>
            <Sparkles className="h-3.5 w-3.5 mr-1.5" />
            Analisar novas
          </Button>
          <Button size="sm" variant="ghost" onClick={() => handleRun(true)} disabled={running}>
            Reanalisar tudo
          </Button>
        </div>
      </div>

      {!hasSummary ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          Clique em <strong>Analisar novas</strong> pra processar as ads ATIVAS desta oferta via IA.
        </Card>
      ) : (
        <>
          {/* Score persuasão */}
          {typeof summary.avg_score === "number" && (
            <Card className="p-4 bg-gradient-to-br from-primary/5 to-transparent">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-muted-foreground">Score Médio de Persuasão</p>
                <span className="text-2xl font-bold tabular-nums">{summary.avg_score}</span>
              </div>
              <Progress value={summary.avg_score} className="h-2" />
            </Card>
          )}

          {/* Grids de top items */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {SECTIONS.map((s) => {
              const items: Array<{ value: string; count: number }> = summary[s.key] ?? [];
              if (!items.length) return null;
              const max = items[0].count;
              const Icon = s.icon;
              return (
                <Card key={s.key} className="p-3">
                  <div className="flex items-center gap-1.5 mb-2">
                    <Icon className={`h-3.5 w-3.5 ${s.color}`} />
                    <p className="text-xs font-semibold">{s.label}</p>
                  </div>
                  <div className="space-y-1.5">
                    {items.map((it) => (
                      <div key={it.value} className="space-y-0.5">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="truncate pr-2">{it.value}</span>
                          <span className="text-muted-foreground tabular-nums shrink-0">{it.count}</span>
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

          {/* Top ads por score */}
          {insights.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Top {Math.min(insights.length, 10)} ads por persuasão
              </p>
              <div className="space-y-2">
                {insights.slice(0, 10).map((i) => (
                  <Card key={i.id} className="p-3">
                    <div className="flex items-start justify-between gap-3 mb-1.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {i.hook_type && <Badge variant="secondary" className="text-[10px]">{i.hook_type}</Badge>}
                        {i.cta_style && <Badge variant="outline" className="text-[10px]">CTA: {i.cta_style}</Badge>}
                        {i.emotional_trigger && <Badge variant="outline" className="text-[10px]">{i.emotional_trigger}</Badge>}
                      </div>
                      {typeof i.score_persuasao === "number" && (
                        <span className="text-sm font-bold tabular-nums shrink-0">{i.score_persuasao}</span>
                      )}
                    </div>
                    {i.hook_text && <p className="text-xs italic line-clamp-2">"{i.hook_text}"</p>}
                    {i.angle && <p className="text-[11px] text-muted-foreground mt-1"><strong>Angle:</strong> {i.angle}</p>}
                    {i.pain_point && <p className="text-[11px] text-muted-foreground"><strong>Dor:</strong> {i.pain_point}</p>}
                  </Card>
                ))}
              </div>
            </div>
          )}

          {copyIntelAnalyzedAt && (
            <p className="text-[10px] text-muted-foreground text-right">
              Última análise: {new Date(copyIntelAnalyzedAt).toLocaleString("pt-BR")}
            </p>
          )}
        </>
      )}
    </div>
  );
}
