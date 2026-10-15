import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Monitor, Users, Crown, Zap, Loader2, BarChart3 } from "lucide-react";
import { useBreakdownData } from "@/hooks/useBreakdownData";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useDateRange } from "@/contexts/DateRangeContext";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";

function fmt(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 }).format(value);
}

function fmtNum(value: number) {
  return new Intl.NumberFormat("pt-BR").format(Math.round(value));
}

/* ── Placement formatting ── */
function formatPlacement(platform: string, position: string): string {
  const platformMap: Record<string, string> = {
    facebook: "Facebook",
    instagram: "Instagram",
    audience_network: "Audience Network",
    messenger: "Messenger",
  };
  const posMap: Record<string, string> = {
    feed: "Feed",
    story: "Stories",
    reels: "Reels",
    explore: "Explore",
    search: "Search",
    right_hand_column: "Coluna Direita",
    instant_article: "Artigo Instantâneo",
    marketplace: "Marketplace",
    video_feeds: "Video Feeds",
    rewarded_video: "Rewarded Video",
    instream_video: "Vídeo In-Stream",
    an_classic: "AN Classic",
  };
  const p = platformMap[platform] || platform;
  const pos = posMap[position] || position;
  return `${p} ${pos}`;
}

/* ── Gender formatting ── */
function formatGender(g: string): string {
  if (g === "male") return "Masculino";
  if (g === "female") return "Feminino";
  return "Desconhecido";
}

/* ── Custom tooltip ── */
function BreakdownTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[hsl(220,12%,11%)] border border-border rounded-lg p-3 shadow-xl text-[11px] space-y-1">
      <p className="font-medium text-foreground mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color }}>
          {p.name}: {p.dataKey === "roas" ? `${p.value.toFixed(2)}x` : fmt(p.value)}
        </p>
      ))}
    </div>
  );
}

export function MetaAdsIntelligence() {
  const { data: breakdowns, isLoading } = useBreakdownData();
  const { dateRange } = useDateRange();
  const [start, end] = dateRange;
  const [syncing, setSyncing] = useState(false);
  const queryClient = useQueryClient();

  const handleSync = async () => {
    setSyncing(true);
    toast.info("Sincronizando breakdowns Meta Ads...");
    try {
      const { data, error } = await supabase.functions.invoke("sync-meta-breakdowns", {
        body: { date_from: start, date_to: end },
      });
      if (error) throw error;
      toast.success(`Breakdowns sincronizados: ${data?.records || 0} registros`);
      queryClient.invalidateQueries({ queryKey: ["traffic-breakdowns"] });
    } catch (err: any) {
      toast.error(`Erro: ${err.message || "Falha desconhecida"}`);
    } finally {
      setSyncing(false);
    }
  };

  const { placements, ages, genders } = useMemo(() => {
    const rows = breakdowns || [];

    // Placements
    const placementMap = new Map<string, { spend: number; revenue: number; conversions: number; clicks: number; impressions: number }>();
    const ageMap = new Map<string, { spend: number; revenue: number; conversions: number; clicks: number; impressions: number }>();
    const genderMap = new Map<string, { spend: number; revenue: number; conversions: number; clicks: number; impressions: number }>();

    for (const r of rows) {
      if (r.breakdown_type === "placement" && r.publisher_platform) {
        const key = formatPlacement(r.publisher_platform, r.platform_position || "");
        const existing = placementMap.get(key) || { spend: 0, revenue: 0, conversions: 0, clicks: 0, impressions: 0 };
        existing.spend += Number(r.spend);
        existing.revenue += Number(r.revenue);
        existing.conversions += Number(r.conversions);
        existing.clicks += Number(r.clicks);
        existing.impressions += Number(r.impressions);
        placementMap.set(key, existing);
      }

      if (r.breakdown_type === "demographic") {
        if (r.age) {
          const existing = ageMap.get(r.age) || { spend: 0, revenue: 0, conversions: 0, clicks: 0, impressions: 0 };
          existing.spend += Number(r.spend);
          existing.revenue += Number(r.revenue);
          existing.conversions += Number(r.conversions);
          existing.clicks += Number(r.clicks);
          existing.impressions += Number(r.impressions);
          ageMap.set(r.age, existing);
        }
        if (r.gender) {
          const gKey = formatGender(r.gender);
          const existing = genderMap.get(gKey) || { spend: 0, revenue: 0, conversions: 0, clicks: 0, impressions: 0 };
          existing.spend += Number(r.spend);
          existing.revenue += Number(r.revenue);
          existing.conversions += Number(r.conversions);
          existing.clicks += Number(r.clicks);
          existing.impressions += Number(r.impressions);
          genderMap.set(gKey, existing);
        }
      }
    }

    const mapToArray = (map: Map<string, any>) =>
      Array.from(map.entries())
        .map(([name, d]) => ({
          name,
          spend: d.spend,
          revenue: d.revenue,
          conversions: d.conversions,
          roas: d.spend > 0 ? d.revenue / d.spend : 0,
          cpa: d.conversions > 0 ? d.spend / d.conversions : 0,
          cvr: d.clicks > 0 ? (d.conversions / d.clicks) * 100 : 0,
        }))
        .sort((a, b) => b.revenue - a.revenue);

    return {
      placements: mapToArray(placementMap),
      ages: mapToArray(ageMap),
      genders: mapToArray(genderMap),
    };
  }, [breakdowns]);

  const hasData = placements.length > 0 || ages.length > 0 || genders.length > 0;

  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <h2 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Inteligência Meta Ads</h2>
        <div className="flex-1 h-[1px]" style={{ background: "rgba(255,30,30,0.15)" }} />
        <button
          onClick={handleSync}
          disabled={syncing}
          className="h-7 px-3 rounded-md flex items-center gap-1.5 text-[10px] font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {syncing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
          {syncing ? "Sincronizando..." : "Sync Breakdowns"}
        </button>
      </div>
      <p className="text-[10px] text-muted-foreground mb-3 -mt-1">Breakdown avançado por posicionamento e demografia — período selecionado</p>

      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          <span className="text-xs">Carregando breakdowns...</span>
        </div>
      ) : !hasData ? (
        <Card className="bg-card border border-border">
          <CardContent className="p-8 text-center">
            <BarChart3 className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground mb-2">Nenhum dado de breakdown disponível</p>
            <p className="text-[10px] text-muted-foreground mb-4">Clique em "Sync Breakdowns" para puxar dados de posicionamento e demografia da Meta.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {/* Card 1 — Posicionamento Campeão */}
          <Card className="bg-card border border-border relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: "hsl(0, 100%, 56%)" }} />
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-4">
                <div className="h-7 w-7 rounded-md bg-secondary flex items-center justify-center text-muted-foreground">
                  <Monitor className="h-3.5 w-3.5" />
                </div>
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Posicionamento Campeão</span>
              </div>

              {placements.length > 0 ? (
                <>
                  <div className="space-y-2.5 mb-4">
                    {placements.slice(0, 5).map((p, i) => (
                      <div key={p.name} className={`flex items-center justify-between gap-2 ${i === 0 ? "bg-primary/5 -mx-2 px-2 py-1.5 rounded-md border border-primary/10" : ""}`}>
                        <div className="flex items-center gap-2 min-w-0">
                          {i === 0 && <Crown className="h-3 w-3 text-primary shrink-0" />}
                          <span className={`text-xs truncate ${i === 0 ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                            {i + 1}. {p.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 shrink-0 text-[10px] font-data">
                          <span className="text-foreground">{fmt(p.revenue)}</span>
                          <span className={p.roas >= 1 ? "text-wr-positive" : "text-destructive"}>{p.roas.toFixed(2)}x</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* Mini bar chart */}
                  <div className="h-[120px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={placements.slice(0, 5)} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 8%, 16%)" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 9, fill: "hsl(220, 6%, 50%)" }} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} axisLine={false} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 9, fill: "hsl(220, 6%, 50%)" }} width={80} axisLine={false} tickLine={false} />
                        <Tooltip content={<BreakdownTooltip />} />
                        <Bar dataKey="revenue" name="Receita" radius={[0, 4, 4, 0]}>
                          {placements.slice(0, 5).map((_, idx) => (
                            <Cell key={idx} fill={idx === 0 ? "hsl(0, 100%, 56%)" : "hsl(220, 10%, 30%)"} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">Sem dados de posicionamento</p>
              )}
            </CardContent>
          </Card>

          {/* Card 2 — Idade Mais Lucrativa */}
          <Card className="bg-card border border-border relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: "hsl(0, 100%, 56%)" }} />
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-4">
                <div className="h-7 w-7 rounded-md bg-secondary flex items-center justify-center text-muted-foreground">
                  <Users className="h-3.5 w-3.5" />
                </div>
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Idade Mais Lucrativa</span>
              </div>

              {ages.length > 0 ? (
                <>
                  {/* Leader highlight */}
                  <div className="bg-primary/5 rounded-md border border-primary/10 p-3 mb-4">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Crown className="h-3 w-3 text-primary" />
                      <span className="text-xs font-semibold text-foreground">Faixa líder: {ages[0].name}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 mt-2">
                      <div>
                        <p className="text-[9px] text-muted-foreground uppercase">Receita</p>
                        <p className="text-sm font-bold font-data text-foreground">{fmt(ages[0].revenue)}</p>
                      </div>
                      <div>
                        <p className="text-[9px] text-muted-foreground uppercase">ROAS</p>
                        <p className={`text-sm font-bold font-data ${ages[0].roas >= 1 ? "text-wr-positive" : "text-destructive"}`}>{ages[0].roas.toFixed(2)}x</p>
                      </div>
                      <div>
                        <p className="text-[9px] text-muted-foreground uppercase">Conversão</p>
                        <p className="text-sm font-bold font-data text-foreground">{ages[0].cvr.toFixed(1)}%</p>
                      </div>
                    </div>
                  </div>

                  {/* Age bar chart */}
                  <div className="h-[140px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={ages}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 8%, 16%)" />
                        <XAxis dataKey="name" tick={{ fontSize: 9, fill: "hsl(220, 6%, 50%)" }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 9, fill: "hsl(220, 6%, 50%)" }} axisLine={false} tickLine={false} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                        <Tooltip content={<BreakdownTooltip />} />
                        <Bar dataKey="revenue" name="Receita" radius={[4, 4, 0, 0]}>
                          {ages.map((a, idx) => (
                            <Cell key={idx} fill={idx === 0 ? "hsl(0, 100%, 56%)" : "hsl(220, 10%, 30%)"} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">Sem dados de idade</p>
              )}
            </CardContent>
          </Card>

          {/* Card 3 — Gênero Mais Lucrativo */}
          <Card className="bg-card border border-border relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: "hsl(0, 100%, 56%)" }} />
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-4">
                <div className="h-7 w-7 rounded-md bg-secondary flex items-center justify-center text-muted-foreground">
                  <Users className="h-3.5 w-3.5" />
                </div>
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Gênero Mais Lucrativo</span>
              </div>

              {genders.length > 0 ? (
                <div className="space-y-3">
                  {genders.map((g, i) => {
                    const totalRevenue = genders.reduce((s, x) => s + x.revenue, 0);
                    const sharePct = totalRevenue > 0 ? (g.revenue / totalRevenue) * 100 : 0;
                    const isLeader = i === 0;
                    return (
                      <div key={g.name} className={`rounded-md p-3 ${isLeader ? "bg-primary/5 border border-primary/10" : "bg-secondary/30"}`}>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-1.5">
                            {isLeader && <Crown className="h-3 w-3 text-primary" />}
                            <span className={`text-xs font-semibold ${isLeader ? "text-foreground" : "text-muted-foreground"}`}>{g.name}</span>
                          </div>
                          <span className="text-[10px] font-data text-muted-foreground">{sharePct.toFixed(0)}% da receita</span>
                        </div>
                        <div className="grid grid-cols-4 gap-2">
                          <div>
                            <p className="text-[9px] text-muted-foreground uppercase">Receita</p>
                            <p className="text-xs font-bold font-data text-foreground">{fmt(g.revenue)}</p>
                          </div>
                          <div>
                            <p className="text-[9px] text-muted-foreground uppercase">ROAS</p>
                            <p className={`text-xs font-bold font-data ${g.roas >= 1 ? "text-wr-positive" : "text-destructive"}`}>{g.roas.toFixed(2)}x</p>
                          </div>
                          <div>
                            <p className="text-[9px] text-muted-foreground uppercase">Conv.</p>
                            <p className="text-xs font-bold font-data text-foreground">{fmtNum(g.conversions)}</p>
                          </div>
                          <div>
                            <p className="text-[9px] text-muted-foreground uppercase">CPA</p>
                            <p className="text-xs font-bold font-data text-foreground">{fmt(g.cpa)}</p>
                          </div>
                        </div>
                        {/* Progress bar */}
                        <div className="mt-2 h-1.5 bg-secondary rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${sharePct}%`, background: isLeader ? "hsl(0, 100%, 56%)" : "hsl(220, 10%, 40%)" }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Sem dados de gênero</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
