/** Educational tooltips for KPI metrics */
export const KPI_TOOLTIPS: Record<string, string> = {
  // Financial
  "Investido": "porque esta aparecendo esses gastos no dia de hoje? 16/08? nao gastamos isso hoje!!!",
  "Fat. Bruto": "Receita total de vendas aprovadas, incluindo front-end e upsell.",
  "Lucro Bruto": "Receita menos o investimento em ads (sem custos operacionais).",
  "Lucro Líquido": "Lucro após deduzir impostos, taxas e custos variáveis.",
  "ROAS": "Return on Ad Spend — receita gerada por cada R$1 investido em ads.",
  "ROI": "Return on Investment — retorno líquido sobre o investimento total.",
  "Ticket Médio": "Valor médio por venda aprovada (front-end).",
  "AOV": "Average Order Value — valor médio por venda aprovada (front-end).",
  "CAC": "Custo de Aquisição de Cliente — quanto você gastou em anúncios para gerar cada venda.",
  "Imposto Meta": "Imposto de 12.15% sobre gastos em BRL no Meta Ads.",
  "Aluguel de Contas": "Custo proporcional do aluguel das contas de anúncios.",
  "Margem Líquida": "Percentual do faturamento que se converte em lucro líquido.",

  // Funnel
  "Impressões": "Número total de vezes que seus anúncios foram exibidos.",
  "Cliques": "Total de cliques nos anúncios.",
  "LP Views": "Visualizações na landing page (visitantes únicos).",
  "Plays": "Quantidade de plays únicos no vídeo de vendas (VSL).",
  "Pitch %": "Percentual de visitantes da landing page que chegaram até o momento do pitch (oferta) no VSL. Quanto maior, mais engajado está o tráfego.",
  "Audiência Pitch": "Estimativa de pessoas que assistiram até o pitch de vendas.",
  "Conversões": "Total de vendas front-end aprovadas no período.",
  "CTR": "Click-Through Rate — percentual de pessoas que clicaram no anúncio em relação ao total que o viram.",
  "Connect Rate": "Taxa de conexão da página — percentual de cliques que efetivamente carregaram a landing page. Quedas indicam problemas de velocidade ou links quebrados.",
  "ICs (RedTrack)": "Iniciações de checkout rastreadas pelo RedTrack. Representa visitantes que chegaram à página de checkout mas podem não ter finalizado a compra.",
  "Custo por IC": "Custo médio por Initial Checkout.",
  "Conv. Checkout": "Taxa de conversão do checkout — percentual de pessoas que iniciaram o checkout e finalizaram a compra.",
  "ICs": "Quantidade de Initiate Checkouts rastreados pela Meta ou RedTrack — visitantes que chegaram à página de checkout.",
  "Custo/IC": "Custo médio por Initiate Checkout — quanto você gastou em ads para gerar cada IC.",
  "Conv. CK %": "Taxa de conversão do checkout — percentual de ICs que se tornaram vendas aprovadas.",
  "Impressões (Meta)": "Número total de vezes que seus anúncios foram exibidos, puxado diretamente da API do Meta.",
  "Cliques (Meta)": "Total de cliques únicos nos anúncios (link clicks), puxado da API do Meta.",

  // Traffic metrics
  "CPM": "Custo por mil impressões — quanto você paga para seu anúncio ser exibido 1.000 vezes.",
  "CPC": "Custo por clique — quanto você paga em média por cada clique no anúncio.",

  // Dashboard modules
  "Health Score": "Índice de 0 a 100 que mede a saúde geral da operação, composto por ROAS (25pts), Margem (25pts), Crescimento (20pts), Diversificação (15pts) e Estabilidade (15pts).",
  "Market Pulse": "Alerta automático baseado na combinação de Lucro, Margem, ROAS e CPA do dia. Classifica a operação em: Ótimo, Atenção ou Crítico.",
  // Ao Vivo
  "Vendas hoje": "Quantidade de vendas front-end ($200–$260 USD) atribuídas a viewers do live hoje.",
  "Revenue": "Soma em USD das vendas atribuídas a viewers do live no dia.",
  "CR live": "Conversion Rate ao vivo = vendas atribuídas ÷ viewers únicos no período. Mede a eficiência do tráfego live.",
  "Cobertura": "Percentual de vendas que conseguimos atribuir a uma sessão de viewer (matched). Baixa cobertura indica vazamento no pixel/clickid.",
  "TTS p50": "Tempo até a venda (Time To Sale) no percentil 50 — metade das vendas aconteceu em menos tempo que este valor.",
  "TTS p90": "Tempo até a venda (Time To Sale) no percentil 90 — 90% das vendas aconteceram em menos tempo que este valor.",
  "TTS médio": "Tempo médio entre a sessão do viewer e a conversão. Quanto menor, mais 'quente' está o tráfego.",
  "Órfãs": "Vendas que chegaram mas não conseguimos vincular a nenhuma sessão de viewer (sem clickid ou sessão expirada). Sinal de vazamento no rastreamento.",
};
