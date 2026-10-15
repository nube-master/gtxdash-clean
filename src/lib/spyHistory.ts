// Utilitários compartilhados de agregação de histórico do Spy.
// Regras:
//  - Agrupamento de dias é SEMPRE em BRT (UTC-3), independente do TZ do browser.
//  - Quando há mais de um dia distinto: reduz para o último snapshot de cada dia.
//  - Quando há apenas um dia (ou nenhum): mantém cada snapshot como ponto próprio,
//    para que o usuário consiga acompanhar a progressão intradiária (ex.: 80 → 202).

export interface HistoryPoint {
  snapshot_at: string;
  active_ads_count: number | null;
  total_ads_count: number | null;
}

export interface SeriesPoint {
  /** Chave estável (yyyy-MM-dd ou yyyy-MM-ddTHH:mm) */
  key: string;
  /** Label curto para o eixo X (dd/MM ou dd/MM HH:mm) */
  label: string;
  /** Timestamp epoch ms (ordenação) */
  ts: number;
  active: number;
  total: number;
  /** True quando agregado por dia (último snapshot do dia) */
  daily: boolean;
}

const BRT_OFFSET_MS = -3 * 60 * 60 * 1000;

function brtDateKey(iso: string): string {
  // Desloca para BRT e extrai YYYY-MM-DD em UTC (já deslocado).
  const d = new Date(new Date(iso).getTime() + BRT_OFFSET_MS);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function brtHourLabel(iso: string): string {
  const d = new Date(new Date(iso).getTime() + BRT_OFFSET_MS);
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mi = String(d.getUTCMinutes()).padStart(2, "0");
  return `${dd}/${mm} ${hh}:${mi}`;
}

function dayLabel(key: string): string {
  // key = yyyy-MM-dd → dd/MM
  const [, m, d] = key.split("-");
  return `${d}/${m}`;
}

export function buildSeries(history: HistoryPoint[]): SeriesPoint[] {
  if (!history.length) return [];

  // Conta dias BRT distintos.
  const days = new Set(history.map((h) => brtDateKey(h.snapshot_at)));
  const multipleDays = days.size > 1;

  if (multipleDays) {
    // Último snapshot de cada dia BRT.
    const byDay = new Map<string, SeriesPoint>();
    for (const h of history) {
      const key = brtDateKey(h.snapshot_at);
      const ts = new Date(h.snapshot_at).getTime();
      const existing = byDay.get(key);
      if (!existing || ts > existing.ts) {
        byDay.set(key, {
          key,
          label: dayLabel(key),
          ts,
          active: h.active_ads_count ?? 0,
          total: h.total_ads_count ?? 0,
          daily: true,
        });
      }
    }
    return Array.from(byDay.values()).sort((a, b) => a.ts - b.ts);
  }

  // Único dia → expõe cada snapshot (progressão intradiária).
  return [...history]
    .sort((a, b) => new Date(a.snapshot_at).getTime() - new Date(b.snapshot_at).getTime())
    .map((h) => {
      const ts = new Date(h.snapshot_at).getTime();
      return {
        key: h.snapshot_at,
        label: brtHourLabel(h.snapshot_at),
        ts,
        active: h.active_ads_count ?? 0,
        total: h.total_ads_count ?? 0,
        daily: false,
      };
    });
}
