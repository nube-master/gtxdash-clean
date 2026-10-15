export type OfferStatus = "ativa" | "em_teste" | "pausada" | "morta" | "arquivada";
export type OfferVendor = "clickbank" | "buygoods" | "cartpanda" | "hotmart" | "kiwify" | "monetizze" | "cod_europa" | "outro";
export type OfferNicho =
  | "brain_memory" | "vision" | "hearing" | "blood_sugar" | "glp1" | "blood_sugar_glp1" | "weight_loss"
  | "mens_health_ed" | "womens_health" | "heart_bp" | "prostate" | "tinnitus" | "joint_pain"
  | "skin_beauty" | "hair_loss" | "dental" | "sleep" | "energy" | "immunity" | "digestive" | "kidney_liver"
  | "anti_aging" | "muscle" | "detox" | "thyroid" | "spiritual" | "survival" | "pet" | "financial" | "outro";
export type OfferGeo =
  | "BR" | "US" | "UK" | "DE" | "FR" | "ES" | "IT" | "CA" | "AU"
  | "HU" | "PL" | "RO" | "NL" | "PT" | "MX"
  | "SK" | "CZ" | "AT" | "CH" | "BE" | "IE" | "SE" | "NO" | "DK" | "FI"
  | "GR" | "BG" | "HR" | "SI" | "LT" | "LV" | "EE" | "LU"
  | "AR" | "CL" | "CO" | "PE" | "UY" | "EC" | "PY" | "BO" | "VE" | "CR" | "PA" | "DO" | "GT"
  | "NZ" | "ZA" | "IN" | "JP" | "KR" | "SG" | "MY" | "PH" | "TH" | "ID" | "VN" | "TR" | "IL" | "AE" | "SA";
export type OfferTipo = "propria" | "afiliacao" | "spy_capturada";

export interface Offer {
  id: string;
  apelido_interno: string;
  produto_real: string;
  tipo: OfferTipo;
  nicho: OfferNicho;
  geo: OfferGeo;
  vendor: OfferVendor;
  vendor_id: string | null;
  nickname_afiliado: string | null;
  link_checkout: string | null;
  ticket_front_brl: number | null;
  ticket_front_usd: number | null;
  cpa_target_brl: number | null;
  margem_pct: number | null;
  comissao_pct: number | null;
  status: OfferStatus;
  data_inicio: string | null;
  data_morte: string | null;
  motivo_morte: string | null;
  landing_pages: string[] | null;
  sales_page_url: string | null;
  preview_image_url: string | null;
  preview_image_updated_at: string | null;
  pixel_id: string | null;
  vsl_player: string | null;
  vsl_url: string | null;
  notas: string | null;
  tags: string[] | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export interface OfferStatusHistoryEntry {
  id: string;
  offer_id: string;
  status_anterior: OfferStatus | null;
  status_novo: OfferStatus;
  motivo: string | null;
  changed_at: string;
  changed_by: string | null;
}
