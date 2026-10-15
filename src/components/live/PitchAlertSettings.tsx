import { Bell, BellOff, Volume2, VolumeX } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  ensureBrowserNotifPermission,
  playPitchSound,
  type PitchAlertConfig,
} from "./usePitchAlerts";
import { toast } from "sonner";

type Props = {
  cfg: PitchAlertConfig;
  onChange: (cfg: PitchAlertConfig) => void;
};

export function PitchAlertSettings({ cfg, onChange }: Props) {
  const set = (patch: Partial<PitchAlertConfig>) => onChange({ ...cfg, ...patch });

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          {cfg.enabled ? <Bell className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5 text-muted-foreground" />}
          Alertas
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-4">
        <div>
          <div className="text-sm font-semibold">Alertas no pitch</div>
          <div className="text-xs text-muted-foreground">Avisa quando alguém atinge o pitch da VSL.</div>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-xs">Ativar</span>
          <Switch checked={cfg.enabled} onCheckedChange={(v) => set({ enabled: v })} />
        </div>

        <div className="flex items-center justify-between">
          <span className="text-xs flex items-center gap-1.5">
            {cfg.sound ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
            Som
          </span>
          <Switch checked={cfg.sound} disabled={!cfg.enabled} onCheckedChange={(v) => set({ sound: v })} />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Volume</span>
            <span className="tabular-nums">{Math.round(cfg.volume * 100)}%</span>
          </div>
          <Slider
            value={[cfg.volume * 100]}
            onValueChange={([v]) => set({ volume: (v ?? 0) / 100 })}
            disabled={!cfg.enabled || !cfg.sound}
            max={100}
            step={5}
          />
          <Button
            variant="ghost"
            size="sm"
            className="w-full h-7 text-xs"
            disabled={!cfg.sound}
            onClick={() => playPitchSound(cfg.volume)}
          >
            Testar som
          </Button>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-xs">Notificação do navegador</span>
          <Switch
            checked={cfg.browserNotif}
            disabled={!cfg.enabled}
            onCheckedChange={async (v) => {
              if (v) {
                const p = await ensureBrowserNotifPermission();
                if (p !== "granted") {
                  toast.error("Permissão de notificação negada pelo navegador.");
                  return;
                }
              }
              set({ browserNotif: v });
            }}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
