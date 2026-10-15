import type { Offer } from "@/types/offers";

/**
 * Detecta "ofertas gêmeas" — mesmo nicho + geo + status ativo.
 * Retorna grupos com 2+ ofertas (canibalização potencial).
 */
export function detectOfferTwins(offers: Offer[]): Map<string, Offer[]> {
  const groups = new Map<string, Offer[]>();
  offers.forEach((o) => {
    if (!["ativa", "em_teste"].includes(o.status)) return;
    const key = `${o.nicho}|${o.geo}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(o);
  });
  // só retorna grupos com 2+ offers
  const twins = new Map<string, Offer[]>();
  groups.forEach((arr, key) => {
    if (arr.length >= 2) twins.set(key, arr);
  });
  return twins;
}

/** Sugere matar offers ativas com ROI 7d < 0.7x AND spend 7d > R$ 5k */
export function suggestKill(
  offer: Offer,
  spend7d: number,
  roi7d: number | null,
): { suggest: boolean; reason?: string } {
  if (!["ativa", "em_teste"].includes(offer.status)) return { suggest: false };
  if (spend7d < 5000) return { suggest: false };
  if (roi7d == null || roi7d >= 0.7) return { suggest: false };
  return {
    suggest: true,
    reason: `Spend R$ ${spend7d.toFixed(0)} em 7d com ROI ${roi7d.toFixed(2)}x — perda acumulada`,
  };
}
