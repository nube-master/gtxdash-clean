/**
 * Mapeamento automático de NICHO a partir do nome/identificação do produto.
 *
 * Regras = lista ordenada de { niche, keywords[] }.
 * A primeira regra cujo alguma keyword aparece no nome normalizado vence.
 * Regras customizadas (criadas pelo usuário) têm prioridade sobre as default.
 */

export type NicheRule = {
  id: string;
  niche: string;
  keywords: string[];
};

export const NICHE_LABELS: Record<string, string> = {
  brain_memory: "Cérebro / Memória",
  blood_sugar: "Glicemia / Diabetes",
  weight_loss: "Emagrecimento",
  mens_health: "Saúde Masculina",
  womens_health: "Saúde Feminina",
  heart_bp: "Coração / Pressão",
  prostate: "Próstata",
  tinnitus: "Zumbido / Audição",
  vision: "Visão",
  joint_pain: "Dores / Articulações",
  skin_beauty: "Pele / Beleza",
  hair_loss: "Cabelo",
  dental: "Dental / Bucal",
  sleep: "Sono",
  energy: "Energia",
  immunity: "Imunidade",
  digestive: "Digestivo / Intestino",
  kidney_liver: "Rim / Fígado",
  anti_aging: "Anti-Aging",
  muscle: "Massa Muscular",
  detox: "Detox",
  thyroid: "Tireoide",
  financial: "Financeiro",
  spiritual: "Espiritual",
  survival: "Survival",
  pet: "Pet",
  outro: "Outro",
};

export const NICHE_COLORS: Record<string, string> = {
  brain_memory: "bg-violet-500/15 text-violet-400 border-violet-500/30",
  blood_sugar: "bg-red-500/15 text-red-400 border-red-500/30",
  weight_loss: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  mens_health: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  womens_health: "bg-pink-500/15 text-pink-400 border-pink-500/30",
  heart_bp: "bg-rose-500/15 text-rose-400 border-rose-500/30",
  prostate: "bg-indigo-500/15 text-indigo-400 border-indigo-500/30",
  tinnitus: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  vision: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
  joint_pain: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  skin_beauty: "bg-fuchsia-500/15 text-fuchsia-400 border-fuchsia-500/30",
  hair_loss: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  dental: "bg-sky-500/15 text-sky-400 border-sky-500/30",
  sleep: "bg-slate-500/15 text-slate-400 border-slate-500/30",
  energy: "bg-lime-500/15 text-lime-400 border-lime-500/30",
  immunity: "bg-teal-500/15 text-teal-400 border-teal-500/30",
  digestive: "bg-green-500/15 text-green-400 border-green-500/30",
  kidney_liver: "bg-amber-600/15 text-amber-500 border-amber-600/30",
  anti_aging: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  muscle: "bg-stone-500/15 text-stone-400 border-stone-500/30",
  detox: "bg-emerald-600/15 text-emerald-500 border-emerald-600/30",
  thyroid: "bg-cyan-600/15 text-cyan-500 border-cyan-600/30",
  financial: "bg-yellow-600/15 text-yellow-500 border-yellow-600/30",
  spiritual: "bg-indigo-400/15 text-indigo-300 border-indigo-400/30",
  survival: "bg-orange-600/15 text-orange-500 border-orange-600/30",
  pet: "bg-blue-400/15 text-blue-300 border-blue-400/30",
  outro: "bg-muted text-muted-foreground border-border",
};

/** Regras padrão (PT / EN / ES) — ordem importa. */
export const DEFAULT_NICHE_RULES: NicheRule[] = [
  { id: "d_blood_sugar", niche: "blood_sugar", keywords: ["glic", "diabet", "sugar", "glucos", "insulin", "azucar", "glp1", "glp-1"] },
  { id: "d_weight_loss", niche: "weight_loss", keywords: ["slim", "keto", "emagre", "weight", "fat burn", "burn", "adelgaz", "peso", "lipo"] },
  { id: "d_brain", niche: "brain_memory", keywords: ["neuro", "brain", "memor", "cerebr", "cogni", "mind", "focus", "nootrop"] },
  { id: "d_prostate", niche: "prostate", keywords: ["prostat", "prostate"] },
  { id: "d_mens", niche: "mens_health", keywords: ["ereti", "erect", "potenc", "libido", "testoster", "male", "viril", "penis"] },
  { id: "d_womens", niche: "womens_health", keywords: ["menopaus", "femin", "women", "mujer", "ovar", "utero", "hormon fem"] },
  { id: "d_heart", niche: "heart_bp", keywords: ["cardio", "heart", "pressao", "presion", "blood pressure", "hipertens", "colesterol", "cholesterol"] },
  { id: "d_tinnitus", niche: "tinnitus", keywords: ["tinnit", "zumbid", "audi", "hearing", "ear", "oido", "ouvid"] },
  { id: "d_vision", niche: "vision", keywords: ["vision", "visao", "eye", "ocular", "olho", "retina", "catarat"] },
  { id: "d_joint", niche: "joint_pain", keywords: ["joint", "artic", "artrit", "artros", "dor ", "pain", "flex", "coluna", "back pain"] },
  { id: "d_skin", niche: "skin_beauty", keywords: ["skin", "pele", "collagen", "colagen", "beauty", "wrinkl", "ruga", "derma", "piel"] },
  { id: "d_hair", niche: "hair_loss", keywords: ["hair", "cabel", "calvi", "capil", "alopec", "pelo"] },
  { id: "d_dental", niche: "dental", keywords: ["dent", "teeth", "tooth", "gum", "oral", "gengiv", "sorriso"] },
  { id: "d_sleep", niche: "sleep", keywords: ["sleep", "sono", "insomn", "dormir", "melatonin", "rest"] },
  { id: "d_energy", niche: "energy", keywords: ["energy", "energia", "fadiga", "fatigue", "vital"] },
  { id: "d_immunity", niche: "immunity", keywords: ["immun", "imun", "defesa", "defense"] },
  { id: "d_digestive", niche: "digestive", keywords: ["gut", "digest", "intestin", "probiotic", "colon", "constipa", "bloat", "estomag"] },
  { id: "d_kidney", niche: "kidney_liver", keywords: ["liver", "figad", "kidney", "rim ", "renal", "hepat"] },
  { id: "d_thyroid", niche: "thyroid", keywords: ["thyroid", "tireoi", "tiroid"] },
  { id: "d_muscle", niche: "muscle", keywords: ["muscle", "muscul", "protein", "whey", "massa", "anabol"] },
  { id: "d_detox", niche: "detox", keywords: ["detox", "cleanse", "parasit", "toxin", "limpeza"] },
  { id: "d_antiaging", niche: "anti_aging", keywords: ["anti aging", "anti-aging", "aging", "rejuven", "longev", "nmn"] },
  { id: "d_financial", niche: "financial", keywords: ["money", "renda", "invest", "trading", "cripto", "crypto", "dolar", "dollar", "forex", "profit"] },
  { id: "d_spiritual", niche: "spiritual", keywords: ["manifest", "espirit", "spiritual", "prayer", "oracao", "angel", "tarot", "zodiac"] },
  { id: "d_survival", niche: "survival", keywords: ["surviv", "prepper", "blackout", "solar", "off grid", "off-grid"] },
  { id: "d_pet", niche: "pet", keywords: ["dog", "cat ", "pet ", "canin", "felin", "cachorr", "gato"] },
];

const STORAGE_KEY = "gtx_niche_rules_v1";

export function normalizeProductName(raw: string | null | undefined): string {
  return (raw ?? "")
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_\-.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function loadCustomNicheRules(): NicheRule[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((r) => r && typeof r.niche === "string" && Array.isArray(r.keywords));
  } catch {
    return [];
  }
}

export function saveCustomNicheRules(rules: NicheRule[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
  window.dispatchEvent(new CustomEvent("niche-rules-changed"));
}

export function getNicheRules(): NicheRule[] {
  // customizadas primeiro (prioridade)
  return [...loadCustomNicheRules(), ...DEFAULT_NICHE_RULES];
}

/** Detecta o nicho de um nome de produto. Retorna "outro" quando não bate nenhuma regra. */
export function detectNiche(productName: string | null | undefined, rules: NicheRule[] = getNicheRules()): string {
  const name = normalizeProductName(productName);
  if (!name) return "outro";
  for (const rule of rules) {
    for (const kw of rule.keywords) {
      const k = normalizeProductName(kw);
      if (k && name.includes(k)) return rule.niche;
    }
  }
  return "outro";
}

export function nicheLabel(niche: string): string {
  return NICHE_LABELS[niche] ?? niche;
}

export function nicheColor(niche: string): string {
  return NICHE_COLORS[niche] ?? NICHE_COLORS.outro;
}
