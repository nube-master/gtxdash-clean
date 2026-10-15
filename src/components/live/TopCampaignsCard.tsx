import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Target } from "lucide-react";
import { cn } from "@/lib/utils";

export type TopCampaign = {
  utm_campaign: string;
  viewers: number;
  ads: number;
  product: string | null;
  pitch?: number;
  cta?: number;
  pitch_rate?: number;
  cta_rate?: number;
};

type Props = {
  campaigns: TopCampaign[];
};

function rateColor(rate: number, kind: "pitch" | "cta") {
  // pitch: bom > 30; cta: bom > 5
  const good = kind === "pitch" ? 30 : 5;
  const ok = kind === "pitch" ? 15 : 2;
  if (rate >= good) return "text-emerald-600";
  if (rate >= ok) return "text-amber-600";
  if (rate > 0) return "text-muted-foreground";
  return "text-muted-foreground/50";
}

function decodeUtm(raw: string): string {
  if (!raw) return raw;
  try {
    // Substitui '+' por espaço antes de decodificar (padrão form-urlencoded)
    return decodeURIComponent(raw.replace(/\+/g, " "));
  } catch {
    return raw;
  }
}

export function TopCampaignsCard({ campaigns }: Props) {
  const max = campaigns[0]?.viewers ?? 1;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" />
          Top campanhas ativas (últimos 60 min)
          <Badge variant="outline" className="ml-1 text-[10px]">{campaigns.length}</Badge>
          <span className="ml-auto text-[10px] text-muted-foreground font-normal">
            % Pitch · % CTA
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {campaigns.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">Nenhuma campanha ativa nos últimos 60 min.</div>
        ) : (
          <div className="divide-y">
            {campaigns.map((c) => {
              const pct = Math.max(2, Math.round((c.viewers / max) * 100));
              const pitchRate = c.pitch_rate ?? 0;
              const ctaRate = c.cta_rate ?? 0;
              return (
                <div key={c.utm_campaign} className="px-3 py-2 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-[11px] truncate" title={decodeUtm(c.utm_campaign)}>
                      {decodeUtm(c.utm_campaign)}
                    </div>
                    <div className="mt-1 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-0.5 shrink-0 min-w-[140px]">
                    <span className="text-sm font-semibold tabular-nums">
                      {c.viewers} <span className="text-[10px] text-muted-foreground font-normal">viewers</span>
                    </span>
                    <span className="text-[10px] text-muted-foreground tabular-nums flex items-center gap-2">
                      <span className={cn("font-medium", rateColor(pitchRate, "pitch"))} title={`${c.pitch ?? 0} chegou no pitch`}>
                        {pitchRate}%P
                      </span>
                      <span className={cn("font-medium", rateColor(ctaRate, "cta"))} title={`${c.cta ?? 0} clicou no CTA`}>
                        {ctaRate}%C
                      </span>
                      <span>·</span>
                      <span>{c.ads} ad{c.ads === 1 ? "" : "s"}</span>
                      {c.product ? <span>· {c.product}</span> : null}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
