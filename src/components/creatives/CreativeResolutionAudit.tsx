import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { useOperationId } from "@/contexts/OperationContext";
import {
  extractCreativeIdFromText,
  extractSecondBracketTag,
  isValidCreativePattern,
  resolveCreativeId,
} from "@/lib/creativeUtils";


type Bucket =
  | "valid_campaign"      // padrão bateu no campaign_name/utm_campaign
  | "valid_ad_fallback"   // padrão só apareceu no ad_name/utm_content
  | "rejected_structure"  // 2ª tag era estrutura (BID-CAP/CBO/…) — mas resolveu via outro caminho
  | "sem_id";             // nenhum padrão encontrado

const BUCKET_META: Record<Bucket, { label: string; color: string }> = {
  valid_campaign: { label: "Criativo válido (campanha)", color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  valid_ad_fallback: { label: "Recuperado via ad_name/utm_content", color: "bg-sky-500/15 text-sky-400 border-sky-500/30" },
  rejected_structure: { label: "2ª tag rejeitada (estrutura)", color: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  sem_id: { label: "SEM_ID (sem padrão)", color: "bg-rose-500/15 text-rose-400 border-rose-500/30" },
};

function classify(campaign?: string | null, utm?: string | null, adName?: string | null, utmContent?: string | null): {
  bucket: Bucket;
  resolved: string;
  reason?: string;
} {
  const patternInCampaign = extractCreativeIdFromText(campaign) ?? extractCreativeIdFromText(utm);
  if (patternInCampaign) return { bucket: "valid_campaign", resolved: patternInCampaign };

  const raw2 = extractSecondBracketTag(campaign) ?? extractSecondBracketTag(utm);
  const rejectedStructure = !!raw2 && !isValidCreativePattern(raw2);

  const patternInAd = extractCreativeIdFromText(adName) ?? extractCreativeIdFromText(utmContent);
  if (patternInAd) {
    return {
      bucket: rejectedStructure ? "valid_ad_fallback" : "valid_ad_fallback",
      resolved: patternInAd,
      reason: rejectedStructure ? `2ª tag "${raw2}" descartada` : undefined,
    };
  }

  if (rejectedStructure) {
    return { bucket: "rejected_structure", resolved: "SEM_ID", reason: `2ª tag: "${raw2}"` };
  }
  return { bucket: "sem_id", resolved: "SEM_ID" };
}

function useAuditData(operationId: string | null) {
  return useQuery({
    queryKey: ["creative-resolution-audit-month", operationId],
    enabled: !!operationId,
    queryFn: async () => {
      // Primeiro dia do mês em BRT
      const now = new Date();
      const brtOffsetMs = -3 * 60 * 60 * 1000;
      const brtNow = new Date(now.getTime() + brtOffsetMs);
      const monthStart = new Date(Date.UTC(brtNow.getUTCFullYear(), brtNow.getUTCMonth(), 1)).toISOString().slice(0, 10);

      const PAGE = 1000;
      // Traffic
      const traffic: Array<{ campaign_name: string | null; ad_name: string | null; spend: number }> = [];
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from("traffic_data")
          .select("campaign_name, ad_name, spend:spend_brl")
          .eq("operation_id", operationId!)
          .gte("date", monthStart)
          .range(from, from + PAGE - 1);
        if (error) throw error;
        if (!data?.length) break;
        traffic.push(...(data as any));
        if (data.length < PAGE) break;
        from += PAGE;
      }

      // Sales
      const sales: Array<{ utm_campaign: string | null; utm_content: string | null; revenue: number }> = [];
      from = 0;
      while (true) {
        const { data, error } = await supabase
          .from("sales_data")
          .select("utm_campaign, utm_content, revenue")
          .eq("operation_id", operationId!)
          .gte("date", monthStart)
          .range(from, from + PAGE - 1);
        if (error) throw error;
        if (!data?.length) break;
        sales.push(...(data as any));
        if (data.length < PAGE) break;
        from += PAGE;
      }

      return { traffic, sales, monthStart };
    },
    staleTime: 5 * 60 * 1000,
  });
}


interface BucketAgg {
  events: number;
  spend: number;
  revenue: number;
  samples: Array<{ text: string; resolved: string; reason?: string }>;
}

export function CreativeResolutionAudit() {
  const operationId = useOperationId();
  const { data, isLoading } = useAuditData(operationId ?? null);


  const stats = useMemo(() => {
    const init = (): BucketAgg => ({ events: 0, spend: 0, revenue: 0, samples: [] });
    const buckets: Record<Bucket, BucketAgg> = {
      valid_campaign: init(),
      valid_ad_fallback: init(),
      rejected_structure: init(),
      sem_id: init(),
    };
    let totalEvents = 0;

    if (data) {
      for (const t of data.traffic) {
        const c = classify(t.campaign_name, null, t.ad_name, null);
        const b = buckets[c.bucket];
        b.events++;
        b.spend += Number(t.spend) || 0;
        totalEvents++;
        if (b.samples.length < 5 && t.campaign_name) {
          const key = `${t.campaign_name} | ad=${t.ad_name || "—"}`;
          if (!b.samples.find((s) => s.text === key)) {
            b.samples.push({ text: key, resolved: c.resolved, reason: c.reason });
          }
        }
      }
      for (const s of data.sales) {
        const c = classify(s.utm_campaign, null, null, s.utm_content);
        const b = buckets[c.bucket];
        b.events++;
        b.revenue += Number(s.revenue) || 0;
        totalEvents++;
        if (b.samples.length < 5 && s.utm_campaign) {
          const key = `${s.utm_campaign} | content=${s.utm_content || "—"}`;
          if (!b.samples.find((x) => x.text === key)) {
            b.samples.push({ text: key, resolved: c.resolved, reason: c.reason });
          }
        }
      }
    }

    return { buckets, totalEvents };
  }, [data]);

  return (
    <Card className="border-border/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          Auditoria de Resolução de Criativos
          {data?.monthStart && (
            <span className="text-xs font-normal text-muted-foreground">
              (desde {new Date(data.monthStart).toLocaleDateString("pt-BR")})
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Auditando eventos do mês…
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              {(Object.keys(BUCKET_META) as Bucket[]).map((k) => {
                const b = stats.buckets[k];
                const pct = stats.totalEvents > 0 ? (b.events / stats.totalEvents) * 100 : 0;
                const meta = BUCKET_META[k];
                return (
                  <div key={k} className={`rounded-lg border p-3 ${meta.color}`}>
                    <div className="text-[11px] uppercase tracking-wide opacity-80">{meta.label}</div>
                    <div className="text-2xl font-bold mt-1">{b.events.toLocaleString("pt-BR")}</div>
                    <div className="text-[11px] opacity-70">{pct.toFixed(1)}% do total</div>
                    <div className="text-[11px] mt-1 opacity-80">
                      Spend R$ {b.spend.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}
                      {b.revenue > 0 && (
                        <> · Rev R$ {b.revenue.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}</>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="space-y-4">
              {(Object.keys(BUCKET_META) as Bucket[]).map((k) => {
                const b = stats.buckets[k];
                if (!b.samples.length) return null;
                const meta = BUCKET_META[k];
                return (
                  <div key={k}>
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="outline" className={meta.color}>{meta.label}</Badge>
                      <span className="text-xs text-muted-foreground">amostras</span>
                    </div>
                    <ul className="space-y-1 text-xs font-mono text-muted-foreground">
                      {b.samples.map((s, i) => (
                        <li key={i} className="border-l-2 border-border/50 pl-2">
                          <span className="text-foreground/80">{s.text}</span>
                          <span className="mx-2 opacity-50">→</span>
                          <span className="text-emerald-400">{s.resolved}</span>
                          {s.reason && <span className="ml-2 text-amber-400/80">({s.reason})</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>

            <div className="mt-6 text-[11px] text-muted-foreground">
              Total analisado: <strong>{stats.totalEvents.toLocaleString("pt-BR")}</strong> eventos
              (tráfego + vendas) do mês corrente. Consulta amostra `resolveCreativeId` — mesma
              lógica usada no ranking.
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
