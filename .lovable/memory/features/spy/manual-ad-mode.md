---
name: spy-manual-ad-mode
description: Modo manual do Spy — usuário cola URL de ad da Meta Library, função extrai metadata via fetch e salva em spy_manual_ad. Análise IA via Lovable AI Gateway (Gemini 2.5 Flash). Solução pra Meta API ads_archive só retornar ads políticos, não comerciais
type: feature
---
# Spy Manual Ad Mode

## Por que existe
A Meta Ad Library API (`ads_archive`) só retorna ads classificados como POLITICAL_AND_ISSUE_ADS. Ads comerciais (suplementos, e-commerce — caso da maioria dos concorrentes do GTX) aparecem visualmente na Library do navegador mas a API retorna count: 0 mesmo com token válido e filtros corretos. Confirmado em 2026-05-01 com Carol/Sugar US.

## Arquitetura
- **Tabela**: `spy_manual_ad` (operation_id, advertiser_id, library_url, ad_copy/title/cta, thumbnail_url, ai_analysis jsonb). RLS via `spy_user_in_operation`. Unique index em (advertiser_id, library_url) com upsert.
- **Edge function `spy-import-manual-ad`**: recebe URL `facebook.com/ads/library/?id=X`, extrai `id` da query, faz fetch de `render_ad/?id=X` e parseia copy/title/cta/thumbnail via regex. Sempre grava registro mesmo se parse falhar (Meta bloqueia muito).
- **Edge function `spy-analyze-manual-ad`**: lê `ad_copy + ad_title + notes`, manda pra Gemini 2.5 Flash via Lovable AI Gateway (`google/gemini-2.5-flash`). System prompt pede JSON estruturado: angulo, gancho, cta, publico_alvo, tom, promessa, objecoes_quebradas, elementos_persuasao, score_originalidade, ideias_teste.
- **UI**: aba "Ads Manuais" no `SpyRadarDetail.tsx` (default). Componente `SpyManualAdsPanel` com input de URL + grid de cards. Cada card permite editar (suprir copy quando parse falha), analisar IA, ver análise em dialog estruturado, deletar (soft delete via deleted_at).

## Hooks
`src/hooks/useSpyManualAds.ts`: `useSpyManualAds`, `useImportManualAd`, `useAnalyzeManualAd`, `useUpdateManualAd`, `useDeleteManualAd`.

## Limitações conhecidas
- Meta frequentemente bloqueia o fetch de `render_ad` sem cookie autenticado → parse vem vazio. Usuário precisa editar e colar copy manualmente.
- O `meta_ad_id` é extraído só se URL tiver `?id=`. URLs `view_all_page_id` (página inteira) não têm ID específico — usuário cola URLs individuais de cada ad.
