import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";

const TRIGGERS = [
  {
    key: "linear_pacing",
    title: "Linear Pacing",
    metric: "spend acumulado vs. teto diário × horário",
    description:
      "Compara o gasto acumulado do dia contra o quanto deveria ter gasto proporcionalmente ao horário (ex.: às 12h ≈ 50% do teto). Dispara quando consome mais do que o múltiplo configurado (tolerância) do esperado. Pode combinar com 'sem venda' nos últimos N minutos.",
  },
  {
    key: "group_cap",
    title: "Group Cap",
    metric: "soma de spend/hora de todas as campanhas do grupo",
    description:
      "Soma o gasto da última hora de todas as campanhas pertencentes ao mesmo budget group. Se o total do grupo ultrapassar o teto por hora configurado (ex.: R$ 370/h), a regra dispara para qualquer campanha daquele grupo.",
  },
  {
    key: "daily_cap",
    title: "Daily Cap",
    metric: "spend acumulado vs. teto diário",
    description:
      "Verifica se o gasto acumulado do dia estourou o teto diário (com tolerância, ex.: 1.0× ou 1.2×). É o freio de arrumação para impedir que a campanha passe do orçamento do dia. Funciona tanto em CBO quanto em ABO.",
  },
  {
    key: "acceleration_no_sale",
    title: "Aceleração + sem venda",
    metric: "delta de spend nos últimos 5 minutos",
    description:
      "Mede o aumento repentino de gasto nos últimos 5 minutos. Dispara se a campanha consumir mais do que o percentual configurado do teto diário em apenas 5 minutos — geralmente para capturar campanhas que 'explodem' de gasto sem trazer venda.",
  },
  {
    key: "metric_threshold",
    title: "Métrica (CPC / CPA / CTR / ROAS / ROI / Profit)",
    metric: "qualquer métrica derivada do dia da campanha",
    description:
      "Disparo genérico baseado nas Condições Extras. Pausa/alerta quando uma métrica calculada hoje cruza um limite. Ex.: 'cpc > R$ 16' pausa campanhas com CPC acima do teto; 'cpa > 600 AND sales >= 1' pausa quando o custo por venda fica caro. CPC usa link clicks (inline_link_clicks), CPA usa vendas autoritativas do dashboard.",
  },
];

const TARGET_RESOLUTION = {
  title: "Como o sistema descobre o Teto Diário (R$)",
  steps: [
    { label: "1. Override manual", desc: "Se você definiu um teto pela tabela do dashboard (botão ✏️ na coluna Teto Diário), ele sempre ganha." },
    { label: "2. CBO do Meta", desc: "Se a campanha tem orçamento diário configurado no Meta (CBO), esse valor é usado." },
    { label: "3. Teto padrão da regra", desc: "Se a campanha é ABO (sem CBO), o sistema usa o 'Teto Diário Padrão' definido na regra que se aplica a ela." },
    { label: "4. Sem teto", desc: "Se nenhum dos três estiver configurado, a regra não dispara para essa campanha (sem como medir o pace)." },
  ],
};

export function TriggerGlossary() {
  const [open, setOpen] = useState(false);

  return (
    <Card className="border-border/60 bg-card">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button className="flex w-full items-center justify-between px-4 py-3 text-left">
            <div className="flex items-center gap-2">
              <BookOpen className="size-4 text-muted-foreground" />
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Glossário de Triggers
              </span>
            </div>
            <ChevronDown
              className={cn(
                "size-4 text-muted-foreground transition-transform",
                open && "rotate-180"
              )}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-4 pb-4 space-y-3">
            <p className="text-[11px] text-muted-foreground">
              Cada regra do Pacing Controller é disparada por um trigger. Abaixo, o que cada um mede e quando dispara:
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {TRIGGERS.map((t) => (
                <div
                  key={t.key}
                  className="rounded border border-border/60 bg-muted/20 p-3 space-y-1"
                >
                  <div className="text-xs font-semibold text-foreground">{t.title}</div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Métrica: {t.metric}
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    {t.description}
                  </p>
                </div>
              ))}
            </div>

            <div className="rounded border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
              <div className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                {TARGET_RESOLUTION.title}
              </div>
              <ol className="space-y-1">
                {TARGET_RESOLUTION.steps.map((s) => (
                  <li key={s.label} className="text-[11px] leading-relaxed">
                    <span className="font-semibold text-foreground">{s.label}:</span>{" "}
                    <span className="text-muted-foreground">{s.desc}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
