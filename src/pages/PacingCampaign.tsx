import { useParams, useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ArrowLeft, Pause, Play, Sliders } from "lucide-react";
import { LiveBadge } from "@/components/pacing/LiveBadge";
import { EventTimeline } from "@/components/pacing/EventTimeline";
import { StatusDot } from "@/components/pacing/StatusDot";
import { mockCampaigns, mockRules } from "@/components/pacing/mockData";
import { useLivePacingEvents } from "@/hooks/useLivePacingEvents";
import { usePacingRules } from "@/hooks/usePacingRules";
import { CampaignPacingHistoryTab } from "@/components/pacing/CampaignPacingHistoryTab";
import { useMemo } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceLine } from "recharts";
import { toast } from "sonner";

export default function PacingCampaign() {
  const { id } = useParams();
  const navigate = useNavigate();
  const campaign = mockCampaigns.find((c) => c.id === id) ?? mockCampaigns[0];

  const { rules } = usePacingRules();
  const ruleNameById = useMemo(() => new Map(rules.map((r) => [r.id, r.name])), [rules]);
  const { events: liveEvents } = useLivePacingEvents({ campaignName: campaign.name, limit: 100, ruleNameById });

  const pacingData = Array.from({ length: 24 }, (_, h) => ({
    hour: `${h.toString().padStart(2, "0")}h`,
    spend: Math.round((h / 23) * campaign.spend * (0.6 + Math.random() * 0.5)),
    target: Math.round((h / 23) * campaign.spend * 0.95),
  }));

  return (
    <div className="space-y-4 px-4 md:px-6 pb-10">
      <div className="sticky top-0 z-20 -mx-4 px-4 md:-mx-6 md:px-6 py-3 border-b border-border/60 bg-background/95 backdrop-blur">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate(-1)}><ArrowLeft className="size-4" /></Button>
            <div>
              <h1 className="text-lg font-bold leading-none">{campaign.name}</h1>
              <div className="flex items-center gap-3 text-xs text-muted-foreground tabular-nums mt-1">
                <LiveBadge status={campaign.status} />
                <span>Pace <span className="text-foreground font-semibold">{campaign.pacePct}%</span></span>
                <span>CPA <span className="text-foreground font-semibold">{campaign.cpa ? `R$ ${campaign.cpa.toFixed(2)}` : "—"}</span></span>
                <span>ROAS <span className="text-foreground font-semibold">{campaign.roas.toFixed(2)}</span></span>
                <span className="hidden md:inline">last sync 30s</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => toast.success(`${campaign.name} pausada`)}>
              <Pause className="size-3.5 mr-1.5" /> Pause
            </Button>
            <Button variant="outline" size="sm" onClick={() => toast.success("Resume forçado")}>
              <Play className="size-3.5 mr-1.5" /> Force Resume
            </Button>
            <Button variant="outline" size="sm">
              <Sliders className="size-3.5 mr-1.5" /> Edit Limits
            </Button>
          </div>
        </div>
      </div>

      <Tabs defaultValue="pacing">
        <TabsList>
          <TabsTrigger value="pacing">Pacing</TabsTrigger>
          <TabsTrigger value="rules">Regras Aplicáveis</TabsTrigger>
          <TabsTrigger value="history">Histórico</TabsTrigger>
          <TabsTrigger value="logs">Logs API</TabsTrigger>
        </TabsList>

        <TabsContent value="pacing" className="mt-4 space-y-4">
          <Card className="p-4 bg-card border-border/60">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Pacing 24h (spend acumulado × target)
            </h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={pacingData}>
                  <defs>
                    <linearGradient id="spendG" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="hour" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={(v) => `R$${v}`} />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                    formatter={(v: number) => `R$ ${v}`}
                  />
                  <ReferenceLine y={campaign.spend} stroke="hsl(var(--wr-warning))" strokeDasharray="4 4" label={{ value: "Target", fill: "hsl(var(--wr-warning))", fontSize: 10, position: "right" }} />
                  <Area type="monotone" dataKey="spend" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#spendG)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="rules" className="mt-4">
          <Card className="p-4 bg-card border-border/60">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Regras aplicáveis a esta campanha
            </h2>
            <ul className="space-y-2 text-sm">
              {mockRules.slice(0, 3).map((r) => (
                <li key={r.id} className="flex items-center gap-3 py-2 border-b border-border/40 last:border-0">
                  <StatusDot status={r.active ? "ok" : "paused"} />
                  <span className="font-semibold">{r.name}</span>
                  <span className="text-xs text-muted-foreground ml-auto tabular-nums">
                    {r.condition}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="mt-4 space-y-4">
          <CampaignPacingHistoryTab campaignId={id ?? campaign.id} ruleNameById={ruleNameById} />
          <Card className="p-4 bg-card border-border/60">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Eventos ao vivo
            </h3>
            <EventTimeline events={liveEvents} />
          </Card>
        </TabsContent>

        <TabsContent value="logs" className="mt-4">
          <Card className="p-4 bg-card border-border/60">
            <p className="text-sm text-muted-foreground">Logs da Meta Marketing API serão exibidos aqui (Fase 3).</p>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
