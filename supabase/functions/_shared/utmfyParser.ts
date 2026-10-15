/**
 * UTMfy SCK parser — extrai IDs Meta Ads do formato posicional gravado no `sck`
 * do Hotmart quando o checkout é gerado pelo UTMfy.
 *
 * Formato:
 *   {source} | {campaign_id}hQwK21wXxR{campaign_name…} | {adset_id}hQwK21wXxR{adset_name…}
 *          | {ad_id}hQwK21wXxR{ad_name…} | {placement_id}hQwK21wXxR{placement_name…}
 *
 * Os IDs vêm INTEIROS (só nomes ficam truncados com "…" pela Hotmart).
 */

const SEP = "hQwK21wXxR";
const META_ID_RE = /^\d{10,20}$/;

export interface UtmfyParsed {
  source: string | null;
  campaign_id: string | null;
  campaign_name: string | null;
  adset_id: string | null;
  adset_name: string | null;
  ad_id: string | null;
  ad_name: string | null;
  placement_id: string | null;
  placement_name: string | null;
}

function splitBlock(block: string): { id: string | null; name: string | null } {
  if (!block) return { id: null, name: null };
  if (block.includes(SEP)) {
    const [id, ...rest] = block.split(SEP);
    const name = rest.join(SEP).replace(/\.{2,}$/, "").trim() || null;
    return { id: META_ID_RE.test(id.trim()) ? id.trim() : null, name };
  }
  return { id: null, name: block.replace(/\.{2,}$/, "").trim() || null };
}

export function parseUtmfySck(sck: string | null | undefined): UtmfyParsed | null {
  if (!sck || typeof sck !== "string" || !sck.includes(SEP)) return null;
  const parts = sck.split("|").map((p) => p.trim());
  // Posições UTMfy fixas: 0=source, 1=campaign, 2=adset, 3=ad, 4=placement
  const s = splitBlock(parts[0] || "");
  const c = splitBlock(parts[1] || "");
  const a = splitBlock(parts[2] || "");
  const d = splitBlock(parts[3] || "");
  const p = splitBlock(parts[4] || "");
  return {
    source: s.id || s.name,
    campaign_id: c.id,
    campaign_name: c.name,
    adset_id: a.id,
    adset_name: a.name,
    ad_id: d.id,
    ad_name: d.name,
    placement_id: p.id,
    placement_name: p.name,
  };
}
