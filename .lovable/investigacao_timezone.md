# Investigação Técnica: Discrepância de Gasto "Hoje" (Cards vs Pacing)

O problema relatado (Cards mostrando gasto defasado/zerado na virada do dia enquanto o Pacing está correto) foi rastreado para uma divergência de fontes e tratamento de timezone entre as duas camadas.

### 1. Fontes de Dados (Onde reside o erro)

*   **Pacing (Correto):** Usa a Edge Function `sync-meta-today` que popula a tabela `traffic_data` (com granularidade de anúncio) e a RPC `get_live_pacing_campaigns`. Esta RPC usa `now() AT TIME ZONE 'America/Sao_Paulo'` diretamente no SQL para filtrar o dia, garantindo alinhamento perfeito com o horário de Brasília.
*   **Cards (Errado):** Usam o hook `useDashboardTotals`, que por sua vez chama a Edge Function `dashboard-totals`.
    *   **O Bug:** O `useDashboardTotals` tenta ser "inteligente" demais com cache e fallbacks. Ele verifica se o dia acabou no frontend usando `Intl.DateTimeFormat` (São Paulo), mas a Edge Function `dashboard-totals` e o hook `useRealtimeSpend` nem sempre invalidam o cache no momento exato da virada.
    *   **Midnight Guard incompleto:** Embora tenhamos o "Midnight Guard" no backend para evitar vazamento de spend entre 00h-01h, o frontend fica "preso" no cache do dia anterior (24h de stale time em alguns casos ou falta de invalidação forçada).

### 2. Comparativo de Implementação (DIFF Lógico)

| Característica | Pacing (`get_live_pacing_campaigns`) | Dashboard Cards (`dashboard-totals`) |
| :--- | :--- | :--- |
| **Janela de Tempo** | `(now() AT TIME ZONE 'America/Sao_Paulo')::date` | Parâmetros `?start=...&end=...` passados pelo frontend |
| **Fonte Autorativa** | `traffic_data` (Agregação Ad-level) | `meta_spend_realtime_safe` com fallback para `traffic_data_hourly` |
| **Timezone** | Server-side (PostgreSQL) | Misto (Frontend gera data, Backend processa) |
| **Invalidade de Cache** | 8s (Live Mode) | 15s-20s (sem gatilho de meia-noite) |

### 3. Fatores Críticos das Contas EDD
As 14 contas da Escola do Dólar estão espalhadas por fusos (NY, Almaty, Berlin, Rome, SP).
*   A API do Meta com `date_preset=today` retorna o gasto no timezone da conta.
*   Se o Dashboard pede "gasto de hoje" às 00:05 BRT:
    *   Contas em **Almaty** (UTC+5) já estão no meio do dia.
    *   Contas em **NY** (UTC-5) ainda estão no dia anterior.
*   **O Pacing resolve isso** agregando via `traffic_data_hourly` que normaliza cada hora para BRT antes de somar.
*   **Os Cards falham** porque muitas vezes confiam no `meta_spend_realtime_safe` que armazena o valor total do `date_preset=today` da Meta sem a normalização horária fina que o Pacing faz.

### 4. Plano de Correção (FIX)

Para unificar os valores e garantir precisão na virada do dia:

1.  **Unificação da Fonte:** Alterar o `useDashboardTotals` para, em visualizações de "Hoje", ignorar o snapshot estático e usar a mesma lógica de agregação horária normalizada que o Pacing utiliza.
2.  **Midnight Invalidation:** Adicionar um listener no `DateRangeContext` que dispara um `queryClient.invalidateQueries` global para todas as chaves de dashboard/pacing assim que o evento `tos:midnight-tick` é detectado no frontend.
3.  **Refactor Backend:** Ajustar a Edge Function `dashboard-totals` para, quando `start == end == hoje_brt`, utilizar obrigatoriamente a função `get_spend_normalized_sp` (que já faz o de-para de timezones por hora) em vez de confiar no saldo bruto da conta.

**Aguardando aprovação para aplicar as alterações de código.**
