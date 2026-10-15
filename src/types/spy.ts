/**
 * Spy v2 — types & enums
 */

export const SPY_CATEGORY_TABS = [
  "inicio",
  "white",
  "favoritos",
] as const;
export type SpyCategoryTab = (typeof SPY_CATEGORY_TABS)[number];

export const SPY_CATEGORY_LABELS: Record<SpyCategoryTab, string> = {
  inicio: "Início",
  white: "White",
  favoritos: "Favoritos",
};

export const SPY_TRAFFIC = [
  "Facebook",
  "Instagram",
  "Google",
  "TikTok",
  "YouTube",
  "Native Ads",
] as const;
export type SpyTraffic = (typeof SPY_TRAFFIC)[number];

export const SPY_ATTRIBUTES = [
  "Nutracêutico",
  "Infoproduto",
  "Escalando",
  "VSL",
  "Alta Conversão",
  "Quiz",
  "Landing Page",
] as const;
export type SpyAttribute = (typeof SPY_ATTRIBUTES)[number];

export const SPY_NICHOS = [
  "Memória",
  "Ofertas +18",
  "Diabetes",
  "Próstata",
  "Outros",
  "Rejuvenescimento",
  "Emagrecimento",
  "Quiz",
  "Advertorial & Pré-Advertorial",
  "Renda Extra",
  "Low Ticket",
  "Prosperidade",
  "Neuropatia",
  "Disfunção Erétil",
  "Cérebro",
  "Sedução Sexual",
  "Dores",
  "Fungos",
  "Longevidade",
  "Relacionamento",
  "Melasma",
  "Saúde Bucal",
  "Mau Hálito",
  "Refluxo",
  "Zumbido",
  "Sobrevivência",
  "Calvície",
  "Hipertensão",
  "Investimento",
  "Desenvolvimento Pessoal",
  "Sexualidade",
  "Viagens",
  "Hobby",
  "Pet",
  "Maternidade",
  "Constipação",
  "Religião",
  "Tireoide",
  "Produtividade",
  "Miçangas de Luxo",
  "Menopausa",
  "Massa Muscular",
] as const;
export type SpyNicho = (typeof SPY_NICHOS)[number];

// "Subnicho" reposicionado como "Tipo" no UI
export const SPY_SUBNICHOS = [
  "Info",
  "Nutra - Encapsulado",
  "Produto Físico",
  "Quiz",
  "Low Ticket",
] as const;
export type SpySubnicho = (typeof SPY_SUBNICHOS)[number];

export const SPY_IDIOMAS = ["Inglês", "Português", "Espanhol", "Italiano", "Francês", "Alemão"] as const;
export type SpyIdioma = (typeof SPY_IDIOMAS)[number];

export const SPY_ORDER = [
  { value: "recentes", label: "Mais Recentes" },
  { value: "popularidade", label: "Popularidade" },
  { value: "mais_ads", label: "Mais Ads" },
  { value: "menos_ads", label: "Menos Ads" },
] as const;
export type SpyOrder = (typeof SPY_ORDER)[number]["value"];

export const SPY_STATUS = ["hot", "qualified", "watching", "dismissed"] as const;
export type SpyStatus = (typeof SPY_STATUS)[number];

export interface SpyOffer {
  id: string;
  operation_id: string;
  offer_name: string;
  product_name: string | null;
  domain: string | null;
  primary_advertiser: string | null;
  primary_advertiser_page_id: string | null;
  hero_creative_url: string | null;
  hero_thumbnail_url: string | null;
  category_tab: Exclude<SpyCategoryTab, "favoritos">;
  nicho: string | null;
  subnicho: string | null;
  idioma: string | null;
  geo_main: string | null;
  trafego: SpyTraffic;
  atributos: string[];
  active_ads_count: number;
  total_ads_count: number;
  advertiser_count: number;
  days_running_max: number | null;
  oldest_active_ad_at: string | null;
  status: SpyStatus;
  escalando: boolean;
  score: number | null;
  fit_gtx: string | null;
  cloaker_detected: boolean;
  payout_estimated_usd: number | null;
  source: "apify" | "manual" | "enzo" | "notion";
  source_meta: unknown;
  notion_id: string | null;
  notes: string | null;
  saved_count: number;
  view_count: number;
  first_seen_at: string;
  last_updated_at: string;
  created_at: string;
  last_constant_growth_alert_at: string | null;
  last_constant_growth_pct: number | null;
  last_emerging_growth_alert_at: string | null;
  last_emerging_growth_pct: number | null;
  last_dead_alert_at: string | null;
}

export interface SpyOfferFilters {
  tab: SpyCategoryTab;
  search: string;
  subnicho: string | null;
  idioma: string | null;
  trafego: SpyTraffic | null;
  nicho: string | null;
  status: SpyStatus[];
  order: SpyOrder;
}

export const DEFAULT_SPY_FILTERS: SpyOfferFilters = {
  tab: "inicio",
  search: "",
  subnicho: null,
  idioma: null,
  trafego: null,
  nicho: null,
  status: [],
  order: "recentes",
};

export const SPY_STATUS_LABELS: Record<SpyStatus, string> = {
  hot: "🔥 Escalando",
  qualified: "Promissora",
  watching: "Acompanhando",
  dismissed: "Descartada",
};

export const SPY_PAGE_SIZE = 24;

