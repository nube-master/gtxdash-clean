import { useEffect } from "react";
import { cn } from "@/lib/utils";

/**
 * Modalidade da pausa manual — seletor compartilhado entre BulkToggleDialog
 * e o AlertDialog individual do CampaignTable.
 *
 * Dois modos:
 *  - sticky: cooldown 100 anos, só religa manual.
 *  - wake_up: cooldown expira no próximo HH:MM BRT escolhido; regras de
 *    activate (ex.: 📌 ATIVAR | TOP) conseguem religar.
 *
 * Persistência: o último HH:MM escolhido fica no localStorage pra a próxima
 * pausa já abrir com o horário que o operador usou por último (semana 05h,
 * fim-de-semana muda pra 04h com 1 clique).
 */

export type PauseModeValue =
  | { mode: "sticky" }
  | { mode: "wake_up"; hourBrt: number; minuteBrt: 0 | 30 };

const LS_HOUR = "pacing.pauseWakeUp.hourBrt";
const LS_MINUTE = "pacing.pauseWakeUp.minuteBrt";
const LS_MODE = "pacing.pauseWakeUp.mode";

export function loadDefaultPauseMode(): PauseModeValue {
  try {
    const mode = localStorage.getItem(LS_MODE);
    if (mode === "wake_up") {
      const h = Number(localStorage.getItem(LS_HOUR) ?? 5);
      const m = Number(localStorage.getItem(LS_MINUTE) ?? 0);
      const hour = Math.min(23, Math.max(0, isFinite(h) ? h : 5));
      const minute = m === 30 ? 30 : 0;
      return { mode: "wake_up", hourBrt: hour, minuteBrt: minute as 0 | 30 };
    }
  } catch { /* ignore */ }
  return { mode: "sticky" };
}

function saveDefaultPauseMode(v: PauseModeValue) {
  try {
    localStorage.setItem(LS_MODE, v.mode);
    if (v.mode === "wake_up") {
      localStorage.setItem(LS_HOUR, String(v.hourBrt));
      localStorage.setItem(LS_MINUTE, String(v.minuteBrt));
    }
  } catch { /* ignore */ }
}

const HOUR_PRESETS: Array<{ hour: number; minute: 0 | 30; label: string }> = [
  { hour: 4, minute: 0, label: "04:00" },
  { hour: 4, minute: 30, label: "04:30" },
  { hour: 5, minute: 0, label: "05:00" },
  { hour: 6, minute: 0, label: "06:00" },
  { hour: 7, minute: 0, label: "07:00" },
];

interface Props {
  value: PauseModeValue;
  onChange: (v: PauseModeValue) => void;
  disabled?: boolean;
  /** Compact = usado no AlertDialog individual (menos espaço). */
  compact?: boolean;
}

/** Próximo timestamp HH:MM BRT (UTC-3) em ISO — usado só pra preview no dialog. */
export function nextWakeUpPreviewBrt(hourBrt: number, minuteBrt: number): string {
  const now = new Date();
  const d = new Date();
  // BRT = UTC-3 (sem DST). HH BRT = (HH+3) UTC.
  const utcHour = hourBrt + 3;
  d.setUTCHours(utcHour % 24, minuteBrt, 0, 0);
  if (utcHour >= 24) d.setUTCDate(d.getUTCDate() + 1);
  if (d.getTime() <= now.getTime()) d.setUTCDate(d.getUTCDate() + 1);
  const fmt = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return fmt.format(d);
}

export function PauseModeSelector({ value, onChange, disabled, compact }: Props) {
  // Persiste sempre que muda
  useEffect(() => { saveDefaultPauseMode(value); }, [value]);

  const isWakeUp = value.mode === "wake_up";
  const currentHour = value.mode === "wake_up" ? value.hourBrt : 5;
  const currentMinute = value.mode === "wake_up" ? value.minuteBrt : 0;

  const setWakeUp = (hour: number, minute: 0 | 30) => {
    onChange({ mode: "wake_up", hourBrt: hour, minuteBrt: minute });
  };

  return (
    <div className={compact ? "space-y-1.5" : "space-y-2"}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
        Modalidade da pausa
      </div>

      {/* Sticky */}
      <button
        type="button"
        onClick={() => onChange({ mode: "sticky" })}
        disabled={disabled}
        className={cn(
          "w-full text-left rounded-md border px-3 py-2 transition-all",
          !isWakeUp
            ? "border-destructive/50 bg-destructive/10 ring-1 ring-destructive/30"
            : "border-border/60 bg-muted/20 hover:bg-muted/40"
        )}
      >
        <div className="text-xs font-semibold text-foreground">🔒 Sticky — só religa manual</div>
        <div className="text-[10px] text-muted-foreground mt-0.5">
          Nenhuma regra automática religa. Precisa Religar manual.
        </div>
      </button>

      {/* Wake up */}
      <button
        type="button"
        onClick={() => setWakeUp(currentHour, currentMinute as 0 | 30)}
        disabled={disabled}
        className={cn(
          "w-full text-left rounded-md border px-3 py-2 transition-all",
          isWakeUp
            ? "border-amber-500/50 bg-amber-500/10 ring-1 ring-amber-500/30"
            : "border-border/60 bg-muted/20 hover:bg-muted/40"
        )}
      >
        <div className="text-xs font-semibold text-foreground">
          ⏰ Pausar até HH:MM BRT — auto-religa
        </div>
        <div className="text-[10px] text-muted-foreground mt-0.5">
          Cooldown expira no horário escolhido; regras de <i>activate</i> (ATIVAR|TOP) conseguem religar.
        </div>
      </button>

      {/* Time picker + presets — só quando wake_up */}
      {isWakeUp && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2.5 space-y-2">
          <div className="flex items-center gap-2">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold shrink-0">
              Religar às
            </label>
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={0}
                max={23}
                value={currentHour}
                disabled={disabled}
                onChange={(e) => {
                  const raw = parseInt(e.target.value, 10);
                  const h = isNaN(raw) ? 0 : Math.min(23, Math.max(0, raw));
                  setWakeUp(h, currentMinute as 0 | 30);
                }}
                className="w-12 h-7 rounded border border-border/60 bg-background text-center text-xs tabular-nums focus:outline-none focus:ring-1 focus:ring-amber-500/40"
              />
              <span className="text-xs text-muted-foreground">:</span>
              <select
                value={currentMinute}
                disabled={disabled}
                onChange={(e) => setWakeUp(currentHour, Number(e.target.value) as 0 | 30)}
                className="h-7 rounded border border-border/60 bg-background text-center text-xs tabular-nums focus:outline-none focus:ring-1 focus:ring-amber-500/40 px-1"
              >
                <option value={0}>00</option>
                <option value={30}>30</option>
              </select>
              <span className="text-[10px] text-muted-foreground ml-1">BRT</span>
            </div>
          </div>

          <div className="flex flex-wrap gap-1">
            {HOUR_PRESETS.map((p) => {
              const active = p.hour === currentHour && p.minute === currentMinute;
              return (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => setWakeUp(p.hour, p.minute)}
                  disabled={disabled}
                  className={cn(
                    "h-6 px-2 rounded text-[10px] font-mono font-semibold tabular-nums transition-colors border",
                    active
                      ? "bg-amber-500 text-white border-amber-500"
                      : "bg-background border-border/60 text-muted-foreground hover:border-amber-500/60 hover:text-foreground"
                  )}
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          <div className="text-[10px] text-muted-foreground leading-tight">
            Próximo religamento: <b className="text-foreground tabular-nums">
              {nextWakeUpPreviewBrt(currentHour, currentMinute)}
            </b>
            {" · "}
            <span className="text-amber-500/90">
              ATIVAR|TOP roda 05:00 BRT — escolha ≤ 04:30 pra pegar o mesmo dia.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
