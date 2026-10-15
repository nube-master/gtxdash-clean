/**
 * Quiz question templates for talent bank job applications.
 * Each question has: id, section, text, type (radio | checkbox | text | select), and options (for choice types).
 */

export interface QuizQuestion {
  id: string;
  section: string;
  text: string;
  type: "radio" | "checkbox" | "text" | "select";
  options?: string[];
  required?: boolean;
}

export const GESTOR_TRAFEGO_QUESTIONS: QuizQuestion[] = [
  // SEÇÃO 2 — Experiência e Portfólio
  {
    id: "q_tempo_trafego",
    section: "Experiência e Portfólio",
    text: "Há quanto tempo você trabalha com tráfego pago?",
    type: "radio",
    required: true,
    options: [
      "Menos de 6 meses",
      "6 meses a 1 ano",
      "1 a 2 anos",
      "Mais de 2 anos",
    ],
  },
  {
    id: "q_plataformas",
    section: "Experiência e Portfólio",
    text: "Quais plataformas de anúncios você já gerenciou?",
    type: "checkbox",
    required: true,
    options: [
      "Meta Ads (Facebook/Instagram)",
      "Google Ads",
      "TikTok Ads",
      "Native Ads (Taboola / Outbrain)",
      "YouTube Ads",
      "Bing Ads",
    ],
  },
  {
    id: "q_afiliados",
    section: "Experiência e Portfólio",
    text: "Você já trabalhou com afiliados ou infoprodutos?",
    type: "radio",
    required: true,
    options: [
      "Sim, tenho boa experiência",
      "Sim, mas de forma limitada",
      "Não, mas tenho muito interesse",
    ],
  },
  {
    id: "q_vsl",
    section: "Experiência e Portfólio",
    text: "Você já rodou campanhas com VSL (Video Sales Letter)?",
    type: "radio",
    required: true,
    options: ["Sim", "Não"],
  },
  {
    id: "q_verba",
    section: "Experiência e Portfólio",
    text: "Qual o maior volume de verba mensal que você já gerenciou?",
    type: "radio",
    required: true,
    options: [
      "Até R$ 5.000",
      "R$ 5.000 a R$ 20.000",
      "R$ 20.000 a R$ 50.000",
      "R$ 50.000 a R$ 100.000",
      "R$ 100.000 a R$ 150.000",
      "Acima de R$ 150.000",
    ],
  },
  // SEÇÃO 3 — Disponibilidade
  {
    id: "q_disponibilidade",
    section: "Disponibilidade",
    text: "Qual é a sua disponibilidade de início?",
    type: "radio",
    required: true,
    options: [
      "Imediata",
      "Em até 2 semanas",
      "Em até 1 mês",
      "Mais de 1 mês",
    ],
  },
  // SEÇÃO 4 — Fit Cultural e Motivação
  {
    id: "q_porque_trafego",
    section: "Fit Cultural e Motivação",
    text: "Por que você quer trabalhar com tráfego para afiliados/infoprodutos especificamente?",
    type: "text",
    required: true,
  },
  {
    id: "q_campanha_nao_performa",
    section: "Fit Cultural e Motivação",
    text: "Como você lida com campanhas que não performam? Dê um exemplo real ou hipotético.",
    type: "text",
    required: true,
  },
  {
    id: "q_objetivo_12_meses",
    section: "Fit Cultural e Motivação",
    text: "Qual é o seu maior objetivo profissional nos próximos 12 meses?",
    type: "text",
    required: true,
  },
  {
    id: "q_porque_voce",
    section: "Fit Cultural e Motivação",
    text: "Por que você acredita que é a pessoa certa para trabalhar com a gente?",
    type: "text",
    required: true,
  },
];

/** Map of area → default quiz questions */
export const QUIZ_TEMPLATES: Record<string, QuizQuestion[]> = {
  "Gestor de Tráfego": GESTOR_TRAFEGO_QUESTIONS,
};
