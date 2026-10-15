// Kill Squad — helpers pra identificar campanhas candidatas a matar
// e classificar por região (EU/US). Compartilhado entre filtro e dialog.

import { detectOfferTag } from "@/hooks/useOfferTags";

export type KillRegion = "eu" | "us";

// Projetos que caem em cada região (match por prefixo case-insensitive)
const EU_PREFIXES = [
  "BS-COD", "DA-COD", "TDM-COD", "CB-COD",
  "VIT-RRT",
];

const US_PREFIXES = [
  "NDM", "NDR", "NDB",   // Neurodyne family
  "MMP", "MMPB",         // Memopryl
  "LDR",                 // Lipodryne
  "CRT", "CST", "AILULA",// Core Strength family
  "NEURO",
];

/** Classifica projeto em região. Null = não é COD/Nutra reconhecido. */
export function regionOfProject(project: string | null | undefined): KillRegion | null {
  if (!project) return null;
  const up = project.toUpperCase();
  if (EU_PREFIXES.some((p) => up.startsWith(p))) return "eu";
  if (US_PREFIXES.some((p) => up.startsWith(p))) return "us";
  return null;
}

/** Extrai região de uma campanha pelo nome + offerTags disponíveis. */
export function regionOfCampaign(campaignName: string, offerTags: string[]): KillRegion | null {
  const project = detectOfferTag(campaignName, offerTags);
  return regionOfProject(project);
}

// Thresholds default (editáveis via app_settings.kill_squad_thresholds no futuro)
export const KILL_THRESHOLDS: Record<KillRegion, {
  spendNoSaleBrl: number;   // spend 3d sem venda → mata
  cpa3dMaxBrl: number;      // cpa 3d > isso → mata (mesmo com venda)
}> = {
  eu: { spendNoSaleBrl: 220, cpa3dMaxBrl: 400 },
  us: { spendNoSaleBrl: 800, cpa3dMaxBrl: 800 },
};

/** Retorna motivo textual ou null se NÃO é candidata a matar. */
export function killReason(input: {
  region: KillRegion;
  spend3d: number;
  sales3d: number;   // contagem de vendas 3d
  cpa3d: number;     // já calculado (0 se sem vendas)
  campaignName: string;
  status: string;    // "paused" | qualquer outro
}): string | null {
  const { region, spend3d, sales3d, cpa3d, campaignName } = input;
  // pré-condições (aceita ativas E pausadas — pausadas também recebem rename+cooldown)
  if (!hasTopTag(campaignName)) return null;

  const t = KILL_THRESHOLDS[region];
  if (sales3d <= 0 && spend3d >= t.spendNoSaleBrl) {
    return `Sem venda em 3d + spend R$ ${spend3d.toFixed(0)} ≥ R$ ${t.spendNoSaleBrl}`;
  }
  if (sales3d > 0 && cpa3d > t.cpa3dMaxBrl) {
    return `CPA 3d R$ ${cpa3d.toFixed(0)} > teto R$ ${t.cpa3dMaxBrl}`;
  }
  return null;
}


/** Detecta tag "top" em qualquer formato: [top], - top, -top (case-insensitive). */
export function hasTopTag(name: string): boolean {
  return /\[top\]|(^|[\s\-_])top\s*$|-\s*top\b/i.test(name);
}

/** Renomeia tag top → xxx preservando formato ([top]→[xxx], "- top"→"- xxx"). Idempotente. */
export function renameTopToXxx(name: string): string {
  if (/\[xxx\]|-\s*xxx\b/i.test(name)) return name;
  if (/\[top\]/i.test(name)) return name.replace(/\[top\]/i, "[xxx]");
  return name.replace(/(-\s*)top\b/i, "$1xxx");
}

/** Reverte xxx → top (undo). */
export function renameXxxToTop(name: string): string {
  if (/\[top\]|-\s*top\b/i.test(name)) return name;
  if (/\[xxx\]/i.test(name)) return name.replace(/\[xxx\]/i, "[top]");
  return name.replace(/(-\s*)xxx\b/i, "$1top");
}
