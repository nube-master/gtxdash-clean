import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Settings2, Trash2 } from "lucide-react";
import { useNicheRules } from "@/hooks/useNicheRules";
import { NICHE_LABELS, DEFAULT_NICHE_RULES, detectNiche, nicheLabel } from "@/lib/productNiche";
import { NicheBadge } from "./NicheBadge";

export function NicheRulesDialog({ trigger }: { trigger?: React.ReactNode }) {
  const { custom, addRule, removeRule, rules } = useNicheRules();
  const [niche, setNiche] = useState("weight_loss");
  const [kw, setKw] = useState("");
  const [test, setTest] = useState("");

  const submit = () => {
    const keywords = kw.split(",").map((k) => k.trim()).filter(Boolean);
    if (!keywords.length) return;
    addRule(niche, keywords);
    setKw("");
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm" className="h-7 text-[11px] gap-1">
            <Settings2 className="h-3 w-3" /> Regras de nicho
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-sm">Mapeamento automático de nicho</DialogTitle>
        </DialogHeader>

        <p className="text-[11px] text-muted-foreground -mt-2">
          O nicho é detectado pelo nome/identificação do produto. Suas regras têm prioridade sobre as{" "}
          {DEFAULT_NICHE_RULES.length} regras padrão.
        </p>

        <div className="space-y-2">
          <div className="text-[11px] font-semibold text-muted-foreground">Nova regra</div>
          <div className="flex gap-2">
            <Select value={niche} onValueChange={setNiche}>
              <SelectTrigger className="h-8 w-44 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-64">
                {Object.entries(NICHE_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k} className="text-xs">
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={kw}
              onChange={(e) => setKw(e.target.value)}
              placeholder="palavras-chave, separadas, por vírgula"
              className="h-8 text-xs"
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
            <Button size="sm" className="h-8" onClick={submit}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        <div className="space-y-1.5 max-h-52 overflow-auto">
          <div className="text-[11px] font-semibold text-muted-foreground">Minhas regras ({custom.length})</div>
          {custom.length === 0 && (
            <div className="text-[11px] text-muted-foreground italic">Nenhuma regra personalizada ainda.</div>
          )}
          {custom.map((r) => (
            <div key={r.id} className="flex items-center gap-2 rounded border border-border/50 px-2 py-1.5">
              <NicheBadge niche={r.niche} />
              <span className="flex-1 truncate text-[11px] font-mono text-muted-foreground">
                {r.keywords.join(", ")}
              </span>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeRule(r.id)}>
                <Trash2 className="h-3 w-3 text-destructive" />
              </Button>
            </div>
          ))}
        </div>

        <div className="space-y-1.5 border-t border-border/50 pt-3">
          <div className="text-[11px] font-semibold text-muted-foreground">Testar nome de produto</div>
          <div className="flex items-center gap-2">
            <Input
              value={test}
              onChange={(e) => setTest(e.target.value)}
              placeholder="ex: GLUCO-FIX 6 bottles"
              className="h-8 text-xs"
            />
            {test && <NicheBadge niche={detectNiche(test, rules)} />}
          </div>
          {test && (
            <div className="text-[10px] text-muted-foreground">
              Detectado como <strong>{nicheLabel(detectNiche(test, rules))}</strong>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
