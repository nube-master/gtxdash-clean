import { useEffect, useState } from "react";
import { Maximize2, X } from "lucide-react";
import { ViewerGlobe, type GlobePalette } from "./ViewerGlobe";
import { LiveLeadsFeed, type LiveLead, type LiveTopCampaign, type LiveSummary24h } from "./LiveLeadsFeed";
import { TopCampaignsCard } from "./TopCampaignsCard";
import { ConversionSummaryCard } from "./ConversionSummaryCard";

type LocAgg = { country: string; state: string | null; count: number; pct: number };

interface Props {
  open: boolean;
  onClose: () => void;
  locations: LocAgg[];
  palette: GlobePalette;
  totalViewers: number;
  filters: { player_id?: string; product?: string; ad_id?: string };
  initialLeads?: LiveLead[];
  initialTopCampaigns?: LiveTopCampaign[];
  initialSummary?: LiveSummary24h | null;
}

export function AoVivoTheaterMode({ open, onClose, locations, palette, totalViewers, filters, initialLeads = [], initialTopCampaigns = [], initialSummary = null }: Props) {
  const [globeSize, setGlobeSize] = useState(560);
  const [topCampaigns, setTopCampaigns] = useState<LiveTopCampaign[]>(initialTopCampaigns);
  const [summary24h, setSummary24h] = useState<LiveSummary24h | null>(initialSummary);

  useEffect(() => {
    if (!open) return;
    setTopCampaigns(initialTopCampaigns);
    setSummary24h(initialSummary);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onResize = () => {
      const h = window.innerHeight;
      const halfW = window.innerWidth / 2;
      setGlobeSize(Math.min(halfW - 80, h - 160, 900));
    };
    onResize();
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  }, [open, onClose, initialTopCampaigns, initialSummary]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] bg-background flex flex-col"
      style={{ paddingTop: "env(safe-area-inset-top, 0)" }}
    >
      {/* Header bar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border/50 bg-sidebar/80 backdrop-blur">
        <div className="flex items-center gap-3">
          <span className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75 animate-ping" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-destructive" />
          </span>
          <div>
            <div className="text-xs uppercase tracking-widest text-muted-foreground">Modo Apresentação · Ao Vivo</div>
            <div className="text-2xl font-bold tabular-nums">{totalViewers} <span className="text-sm font-normal text-muted-foreground">viewers ao vivo</span></div>
          </div>
        </div>
        <button
          onClick={onClose}
          className="h-9 w-9 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground border border-border/50 bg-muted/30 hover:bg-muted/60 transition-colors"
          title="Sair (ESC)"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Split: Globo (left) | Feed ao vivo (right) */}
      <div className="flex-1 grid grid-cols-2 min-h-0">
        {/* Left: Globe */}
        <div className="relative flex items-center justify-center border-r border-border/50 bg-gradient-to-br from-background to-muted/20 overflow-hidden">
          <ViewerGlobe locations={locations} size={globeSize} palette={palette} />
          <div className="absolute top-4 left-4 text-xs uppercase tracking-widest text-muted-foreground">
            Globo · Origem dos viewers
          </div>
          <div className="absolute bottom-4 left-4 right-4 flex flex-wrap gap-3 text-[10px] text-muted-foreground">
            {locations.slice(0, 8).map((l, i) => (
              <span key={i} className="px-2 py-1 rounded-full bg-background/60 backdrop-blur border border-border/40">
                {l.country}{l.state ? ` · ${l.state}` : ""} · {l.count}
              </span>
            ))}
          </div>
        </div>

        {/* Right: Live leads feed + UTMs + conversion */}
        <div className="flex flex-col min-h-0 overflow-hidden">
          <div className="px-6 py-3 border-b border-border/50 text-xs uppercase tracking-widest text-muted-foreground">
            Feed ao vivo · UTMs · Conversão
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <ConversionSummaryCard summary={summary24h} />
            <LiveLeadsFeed
              filters={filters}
              initialLeads={initialLeads}
              onTopCampaignsLoaded={setTopCampaigns}
              onSummaryLoaded={setSummary24h}
            />
            <TopCampaignsCard campaigns={topCampaigns} />
          </div>
        </div>
      </div>
    </div>
  );
}

export function TheaterModeButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="h-9 px-3 rounded-md flex items-center gap-2 text-xs font-medium text-foreground border border-primary/20 bg-primary/10 hover:bg-primary/20 transition-colors"
      title="Modo Apresentação (split-screen fullscreen)"
    >
      <Maximize2 className="h-3.5 w-3.5" />
      Apresentação
    </button>
  );
}
