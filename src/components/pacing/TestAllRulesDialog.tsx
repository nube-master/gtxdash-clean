import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Shield, Search, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PacingCampaign, PacingRuleV2 } from "@/components/pacing/mockData";
import { getMatchingRules, ruleMatchesCampaign } from "@/lib/pacingScope";

interface Props {
  open: boolean;
  onClose: () => void;
  rules: PacingRuleV2[];
  campaigns: PacingCampaign[];
}

export function TestAllRulesDialog({ open, onClose, rules, campaigns }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  const evalAt = useMemo(() => new Date(), [open]);
  const enabledRules = useMemo(() => rules.filter((r) => r.enabled), [rules]);

  const filteredCampaigns = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return campaigns;
    return campaigns.filter((c) => c.name.toLowerCase().includes(q));
  }, [campaigns, search]);

  // Para cada regra, listar campanhas matched
  const ruleMatches = useMemo(() => {
    return enabledRules.map((r) => {
      const matched = filteredCampaigns.filter((c) => ruleMatchesCampaign(r, c));
      return { rule: r, matched };
    });
  }, [enabledRules, filteredCampaigns]);

  const totalFires = ruleMatches.reduce((s, x) => s + x.matched.length, 0);

  const toggleExpand = (id: string) =>
    setExpanded((p) => {
      const n = new Set(p);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const expandAll = () => setExpanded(new Set(enabledRules.map((r) => r.id)));
  const collapseAll = () => setExpanded(new Set());

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-4xl max-h-[88vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <Shield className="size-4 text-primary" />
            Teste de avaliação · todas as regras ativas
          </DialogTitle>
          <DialogDescription className="text-xs">
            Avalia o scope de cada regra ATIVA contra as campanhas carregadas neste momento. Não dispara
            nenhuma ação no Meta — só mostra <b>quem casaria</b> agora.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-3 py-2 border-y border-border/60">
          <div className="flex-1 relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filtrar campanhas por nome (ex.: NDM, 1-250-1, top)…"
              className="pl-8 h-8 text-xs"
            />
          </div>
          <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={expandAll}>
            Expandir tudo
          </Button>
          <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={collapseAll}>
            Recolher
          </Button>
        </div>

        <div className="flex items-center justify-between text-[11px] text-muted-foreground py-1">
          <span>
            <b className="text-foreground">{enabledRules.length}</b> regra(s) ativa(s) ·{" "}
            <b className="text-foreground">{filteredCampaigns.length}</b> campanha(s) avaliada(s) ·{" "}
            <b className="text-foreground">{totalFires}</b> match(es) totais
          </span>
          <span className="tabular-nums">avaliado às {evalAt.toLocaleTimeString("pt-BR")}</span>
        </div>

        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="space-y-2 py-2">
            {ruleMatches.length === 0 && (
              <div className="text-xs text-muted-foreground text-center py-8">
                Nenhuma regra ativa configurada.
              </div>
            )}

            {ruleMatches.map(({ rule, matched }) => {
              const isOpen = expanded.has(rule.id);
              const empty = matched.length === 0;
              return (
                <div
                  key={rule.id}
                  className={cn(
                    "rounded-lg border bg-card",
                    empty ? "border-border/40" : "border-emerald-500/30"
                  )}
                >
                  <button
                    type="button"
                    onClick={() => toggleExpand(rule.id)}
                    className="w-full flex items-center justify-between px-3 py-2 hover:bg-muted/40"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {isOpen ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                      <span className="text-xs font-medium truncate text-left">{rule.name}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {/* scope compacto */}
                      <span className="text-[10px] text-muted-foreground">
                        {rule.scope.projects.length > 0 && `[${rule.scope.projects.join(",")}] `}
                        {rule.scope.nameContains && `name⊃"${rule.scope.nameContains}" `}
                        {rule.scope.phases.length > 0 && `phases:${rule.scope.phases.join(",")} `}
                        {rule.scope.appliesTo && `· ${rule.scope.appliesTo}`}
                      </span>
                      <span
                        className={cn(
                          "inline-flex items-center justify-center min-w-[28px] h-5 px-1.5 rounded text-[11px] font-semibold tabular-nums",
                          empty
                            ? "bg-muted text-muted-foreground"
                            : "bg-emerald-500/15 text-emerald-500 border border-emerald-500/30"
                        )}
                      >
                        {matched.length}
                      </span>
                    </div>
                  </button>

                  {isOpen && (
                    <div className="border-t border-border/40 px-3 py-2">
                      {empty ? (
                        <div className="text-[11px] text-muted-foreground py-2">
                          Nenhuma campanha casa com este scope no estado atual.
                        </div>
                      ) : (
                        <ul className="space-y-1 max-h-64 overflow-auto">
                          {matched.map((c) => (
                            <li
                              key={c.id}
                              className="flex items-center justify-between gap-2 text-[11px] py-1 border-b border-border/30 last:border-0"
                            >
                              <span className="font-mono break-all text-foreground flex-1 min-w-0">
                                {c.name}
                              </span>
                              <span className="text-muted-foreground shrink-0 tabular-nums">
                                {c.account} · spend {c.spend.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </ScrollArea>

        <div className="text-[10px] text-muted-foreground border-t border-border/60 pt-2">
          ⚠️ Esta simulação avalia apenas o <b>scope</b> (filtros: projeto, nome, fase, conta, mínimo, applies).
          Os <b>triggers</b> (CPA alvo, R$/hora, hora do dia, vendas) e <b>cooldowns</b> são avaliados pelo daemon
          a cada 2 min — use o botão "Testar" individual em /pacing/regras para simular trigger + cooldown.
        </div>
      </DialogContent>
    </Dialog>
  );
}
