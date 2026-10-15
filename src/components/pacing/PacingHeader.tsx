import { Button } from "@/components/ui/button";
import { Pause, Play, Plus, Settings, RefreshCw, Percent, Tags } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQueryClient, useIsFetching } from "@tanstack/react-query";
import { LivenessIndicator } from "./LivenessIndicator";
import { PacingDateRangeSelector } from "./PacingDateRangeSelector";
import { LiveModeToggle } from "./LiveModeToggle";
import { usePacingRealtimeWatcher } from "@/hooks/usePacingRealtimeWatcher";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { ProductMarginsDialog } from "./ProductMarginsDialog";

interface Props {
  onNewRule?: () => void;
  title?: string;
}

export function PacingHeader({ onNewRule, title }: Props) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fetching = useIsFetching({ queryKey: ["live-pacing-campaigns"] });
  const [lastSync, setLastSync] = useState<number>(Date.now());
  const [, force] = useState(0);
  const [marginsOpen, setMarginsOpen] = useState(false);
  // Watcher Realtime — só atua quando o modo Live está ligado e a janela é "Hoje".
  usePacingRealtimeWatcher();

  useEffect(() => {
    if (fetching === 0) setLastSync(Date.now());
  }, [fetching]);

  // tick a cada 5s pra atualizar "há Xs"
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 5000);
    return () => clearInterval(t);
  }, []);

  const secs = Math.max(0, Math.floor((Date.now() - lastSync) / 1000));
  const ago = secs < 60 ? `${secs}s` : `${Math.floor(secs / 60)}m${secs % 60 ? ` ${secs % 60}s` : ""}`;

  const handleRefresh = async () => {
    const projectId = (import.meta as any).env?.VITE_SUPABASE_PROJECT_ID;
    if (projectId) {
      fetch(`https://${projectId}.supabase.co/functions/v1/sync-meta-today`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive: true,
      }).catch(() => {});
    }
    await qc.invalidateQueries({ queryKey: ["live-pacing-campaigns"] });
    toast.success("Atualizando spend da Meta...");
  };

  return (
    <div className="sticky top-0 z-20 -mx-4 px-4 md:-mx-6 md:px-6 py-3 border-b border-border/60 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-lg font-bold leading-none">{title || "Meta Ads"}</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Campanha Conjunto</p>
          </div>
          <div className="hidden md:block"><LivenessIndicator /></div>
        </div>
        <div className="flex items-center gap-2">
          <LiveModeToggle />
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={fetching > 0}
            title={`Última atualização: há ${ago}`}
          >
            <RefreshCw className={`size-3.5 mr-1.5 ${fetching > 0 ? "animate-spin" : ""}`} />
            <span className="tabular-nums">{ago}</span>
          </Button>
          {onNewRule && (
            <Button size="sm" onClick={onNewRule}>
              <Plus className="size-3.5 mr-1.5" /> Nova Regra
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            title="Margens por produto (Semáforo ROAS)"
            onClick={() => setMarginsOpen(true)}
          >
            <Percent className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            title="Auditoria de tags (spend com tag quebrada)"
            onClick={() => navigate("/pacing/tag-audit")}
          >
            <Tags className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate("/pacing/settings")}>
            <Settings className="size-4" />
          </Button>
        </div>
      </div>
      <ProductMarginsDialog open={marginsOpen} onOpenChange={setMarginsOpen} />
    </div>
  );
}
