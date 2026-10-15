import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOperationId } from "@/contexts/OperationContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Pause, Play, Smartphone, Monitor, Tablet, Radio, Copy, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { resolveGeo, flagEmoji } from "@/lib/geoCoords";
import { cn } from "@/lib/utils";
import { usePitchAlertConfig, playPitchSound, showBrowserNotif } from "./usePitchAlerts";
import { PitchAlertSettings } from "./PitchAlertSettings";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

export type LiveLead = {
  session_id: string;
  player_id: string;
  player_name: string | null;
  product: string | null;
  country: string | null;
  state: string | null;
  city: string | null;
  device_type: string | null;
  current_second_in_video: number | null;
  pitch_reached: boolean;
  cta_clicked: boolean;
  exit_reason: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  ad_id: string | null;
  clickid: string | null;
  account_id: string | null;
  operation_id: string | null;
  started_at: string;
  last_seen_at: string;
};

export type LiveAdOption = { ad_id: string; utm_campaign: string | null; count: number };
export type LiveProductOption = { product: string; count: number };
export type LiveTopCampaign = {
  utm_campaign: string;
  viewers: number;
  ads: number;
  product: string | null;
  pitch?: number;
  cta?: number;
  pitch_rate?: number;
  cta_rate?: number;
};
export type LiveSummary24h = { total: number; pitch: number; cta: number; pitch_rate: number; cta_rate: number };

type Props = {
  filters: { player_id?: string; product?: string; ad_id?: string };
  active?: boolean;
  initialLeads?: LiveLead[];
  onAdsLoaded?: (ads: LiveAdOption[]) => void;
  onLeadsLoaded?: (leads: LiveLead[]) => void;
  onProductsLoaded?: (products: LiveProductOption[]) => void;
  onTopCampaignsLoaded?: (campaigns: LiveTopCampaign[]) => void;
  onSummaryLoaded?: (summary: LiveSummary24h) => void;
};

async function fetchLeads(filters: Props["filters"], operationId: string) {
  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token ?? ANON_KEY;
  const params = new URLSearchParams();
  if (filters.player_id && filters.player_id !== "all") params.set("player_id", filters.player_id);
  if (filters.product && filters.product !== "all") params.set("product", filters.product);
  if (filters.ad_id && filters.ad_id !== "all") params.set("ad_id", filters.ad_id);
  params.set("operation_id", operationId);
  params.set("limit", "50");
  const r = await fetch(`${SUPABASE_URL}/functions/v1/live-leads?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}`, apikey: ANON_KEY },
  });
  if (!r.ok) throw new Error(`live-leads ${r.status}`);
  return r.json() as Promise<{
    leads: LiveLead[];
    ads: LiveAdOption[];
    top_campaigns?: LiveTopCampaign[];
    products?: LiveProductOption[];
    summary_24h?: LiveSummary24h;
  }>;
}

function deviceIcon(type: string | null) {
  if (type === "mobile") return <Smartphone className="h-3.5 w-3.5" />;
  if (type === "desktop") return <Monitor className="h-3.5 w-3.5" />;
  if (type === "tablet") return <Tablet className="h-3.5 w-3.5" />;
  return null;
}

function fmtVideoTime(s: number | null | undefined) {
  if (!s || s <= 0) return "00:00";
  const total = Math.floor(s);
  const m = Math.floor(total / 60);
  const r = total % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

function fmtClock(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "America/Sao_Paulo" });
}

function statusBadge(lead: LiveLead) {
  if (lead.exit_reason === "cta_click" || lead.cta_clicked) return { label: "🟢 CTA", cls: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30" };
  if (lead.pitch_reached) return { label: "🟡 Pitch", cls: "bg-amber-500/15 text-amber-600 border-amber-500/30" };
  if (lead.exit_reason === "exited" || lead.exit_reason === "timeout") return { label: "⚪️ Saiu", cls: "bg-muted text-muted-foreground border-border" };
  return { label: "▶ Started", cls: "bg-primary/15 text-primary border-primary/30" };
}

export function LiveLeadsFeed({ filters, active = true, initialLeads = [], onAdsLoaded, onLeadsLoaded, onProductsLoaded, onTopCampaignsLoaded, onSummaryLoaded }: Props) {
  const operationId = useOperationId();
  const [leads, setLeads] = useState<LiveLead[]>(initialLeads);
  const [paused, setPaused] = useState(false);
  const [selected, setSelected] = useState<LiveLead | null>(null);
  const [highlightSession, setHighlightSession] = useState<string | null>(null);
  const [pitchPulseSet, setPitchPulseSet] = useState<Set<string>>(new Set());
  const knownPitchRef = useRef<Set<string>>(new Set());
  const firstLoadRef = useRef(true);
  const [alertCfg, setAlertCfg] = usePitchAlertConfig();
  const alertCfgRef = useRef(alertCfg);
  alertCfgRef.current = alertCfg;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const onAdsRef = useRef(onAdsLoaded);
  onAdsRef.current = onAdsLoaded;
  const onLeadsRef = useRef(onLeadsLoaded);
  onLeadsRef.current = onLeadsLoaded;
  const onProductsRef = useRef(onProductsLoaded);
  onProductsRef.current = onProductsLoaded;
  const onTopCampaignsRef = useRef(onTopCampaignsLoaded);
  onTopCampaignsRef.current = onTopCampaignsLoaded;
  const onSummaryRef = useRef(onSummaryLoaded);
  onSummaryRef.current = onSummaryLoaded;

  const refetch = useMemo(
    () => () => {
      if (pausedRef.current) return;
      if (!operationId) return;
      fetchLeads(filters, operationId)
        .then((j) => {
          // P4: detecta transições de pitch_reached false→true
          const cfg = alertCfgRef.current;
          const newPitches: LiveLead[] = [];
          for (const lead of j.leads) {
            if (lead.pitch_reached) {
              if (!knownPitchRef.current.has(lead.session_id)) {
                if (!firstLoadRef.current) newPitches.push(lead);
                knownPitchRef.current.add(lead.session_id);
              }
            }
          }
          if (newPitches.length && cfg.enabled) {
            if (cfg.sound) playPitchSound(cfg.volume);
            if (cfg.browserNotif) {
              const first = newPitches[0];
              const extra = newPitches.length > 1 ? ` (+${newPitches.length - 1})` : "";
              showBrowserNotif(
                "🎯 Pitch atingido",
                `${first.player_name || first.player_id}${extra} · ${first.country ?? ""}`,
              );
            }
            setPitchPulseSet((prev) => {
              const next = new Set(prev);
              newPitches.forEach((l) => next.add(l.session_id));
              return next;
            });
            // limpa highlight em 4s
            setTimeout(() => {
              setPitchPulseSet((prev) => {
                const next = new Set(prev);
                newPitches.forEach((l) => next.delete(l.session_id));
                return next;
              });
            }, 4000);
          }
          firstLoadRef.current = false;

          setLeads((prev) => {
            const prevTopId = prev[0]?.session_id;
            if (j.leads[0] && j.leads[0].session_id !== prevTopId) {
              setHighlightSession(j.leads[0].session_id);
              setTimeout(() => setHighlightSession((h) => (h === j.leads[0].session_id ? null : h)), 1500);
            }
            return j.leads;
          });
          onLeadsRef.current?.(j.leads ?? []);
          onAdsRef.current?.(j.ads ?? []);
          onProductsRef.current?.(j.products ?? []);
          onTopCampaignsRef.current?.(j.top_campaigns ?? []);
          if (j.summary_24h) onSummaryRef.current?.(j.summary_24h);
        })
        .catch(() => undefined);
    },
    [filters, operationId],
  );

  useEffect(() => {
    if (!active) return;
    if (!operationId) return;
    refetch();
    // Polling fixo a 10s — antes era 3s + refetch a cada INSERT/UPDATE em live_viewers,
    // o que disparava milhões de queries pesadas no banco (causa de timeouts globais).
    const interval = setInterval(refetch, 10000);
    return () => {
      clearInterval(interval);
    };
  }, [active, refetch, operationId]);

  useEffect(() => {
    if (!active) setLeads(initialLeads);
  }, [active, initialLeads]);

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-sm flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
          <Radio className="h-4 w-4 text-destructive shrink-0" />
          <span className="truncate">Leads ao vivo</span>
          <Badge variant="outline" className="text-[10px] shrink-0">{leads.length}</Badge>
          <span className="hidden sm:inline text-xs text-muted-foreground font-normal">· atualiza a cada 10s</span>
        </CardTitle>
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <PitchAlertSettings cfg={alertCfg} onChange={setAlertCfg} />
          <Button size="sm" variant={paused ? "default" : "outline"} onClick={() => setPaused((p) => !p)} className="px-2 sm:px-3">
            {paused ? <Play className="h-3.5 w-3.5 sm:mr-1" /> : <Pause className="h-3.5 w-3.5 sm:mr-1" />}
            <span className="hidden sm:inline">{paused ? "Retomar" : "Pausar"}</span>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {leads.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Nenhum lead nas últimas 24h.</div>
        ) : (
          <div className="max-h-[520px] overflow-auto divide-y">
            {leads.map((lead) => {
              const geo = resolveGeo(lead.country, lead.state);
              const status = statusBadge(lead);
              const adShort = lead.ad_id ? lead.ad_id.slice(-8) : null;
              const isHi = highlightSession === lead.session_id;
              const isPitchPulse = pitchPulseSet.has(lead.session_id);
              return (
                <button
                  key={lead.session_id}
                  onClick={() => setSelected(lead)}
                  className={cn(
                    "w-full text-left px-3 py-2 hover:bg-muted/40 transition-colors flex flex-col gap-1",
                    isHi && "bg-primary/10 animate-pulse",
                    isPitchPulse && "bg-amber-500/15 ring-2 ring-amber-500/60 animate-pulse",
                  )}
                >
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-mono text-muted-foreground tabular-nums">{fmtClock(lead.started_at)}</span>
                    <span className="font-medium truncate flex-1 flex items-center gap-1">
                      {isPitchPulse && <Sparkles className="h-3 w-3 text-amber-500" />}
                      {lead.player_name || lead.player_id}
                    </span>
                    <span className={cn("px-1.5 py-0.5 rounded border text-[10px] font-medium", status.cls)}>{status.label}</span>
                  </div>
                  <div className="flex items-center gap-2 sm:gap-3 text-[11px] text-muted-foreground flex-wrap">
                    <span className="flex items-center gap-1 min-w-0">
                      <span className="text-sm leading-none">{flagEmoji(geo?.iso2)}</span>
                      <span className="truncate max-w-[120px] sm:max-w-[140px]">{[lead.city, lead.state || lead.country].filter(Boolean).join(", ") || "—"}</span>
                    </span>
                    <span className="flex items-center gap-1">{deviceIcon(lead.device_type)} <span className="hidden sm:inline">{lead.device_type ?? "?"}</span></span>
                    <span className="font-mono tabular-nums">{fmtVideoTime(lead.current_second_in_video)}</span>
                    {lead.utm_campaign && (
                      <span className="truncate max-w-[140px] sm:max-w-[180px] font-mono text-[10px] bg-muted/50 px-1.5 py-0.5 rounded" title={lead.utm_campaign}>
                        {lead.utm_campaign}
                      </span>
                    )}
                    {adShort && (
                      <span className="font-mono text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded" title={`ad_id: ${lead.ad_id}`}>
                        ad: …{adShort}
                      </span>
                    )}
                    {lead.utm_term && (
                      <span className="hidden sm:inline truncate max-w-[100px] text-[10px]" title={lead.utm_term}>{lead.utm_term}</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </CardContent>

      <Dialog open={!!selected} onOpenChange={(v) => { if (!v) setSelected(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <Radio className="h-4 w-4 text-destructive" /> Detalhes do lead
            </DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-2 text-xs">
              {([
                ["Session", selected.session_id],
                ["VSL", selected.player_name || selected.player_id],
                ["Player ID", selected.player_id],
                ["Produto", selected.product],
                ["Localização", [selected.city, selected.state, selected.country].filter(Boolean).join(", ")],
                ["Device", selected.device_type],
                ["Tempo no vídeo", fmtVideoTime(selected.current_second_in_video)],
                ["Status", statusBadge(selected).label],
                ["Iniciado em", fmtClock(selected.started_at)],
                ["Visto por último", fmtClock(selected.last_seen_at)],
                ["utm_source", selected.utm_source],
                ["utm_medium", selected.utm_medium],
                ["utm_campaign", selected.utm_campaign],
                ["utm_content", selected.utm_content],
                ["utm_term (placement)", selected.utm_term],
                ["ad_id", selected.ad_id],
                ["clickid (rtkcid)", selected.clickid],
                ["account_id", selected.account_id],
              ] as [string, string | number | null | undefined][]).map(([k, v]) => (
                <div key={k} className="grid grid-cols-[140px_1fr] gap-2 items-start py-1 border-b border-border/40">
                  <span className="text-muted-foreground">{k}</span>
                  <div className="flex items-start gap-1 min-w-0">
                    <span className="font-mono text-foreground break-all flex-1">{v ?? "—"}</span>
                    {v && (
                      <button
                        className="text-muted-foreground hover:text-foreground"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigator.clipboard.writeText(String(v));
                          toast.success("Copiado");
                        }}
                      >
                        <Copy className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
