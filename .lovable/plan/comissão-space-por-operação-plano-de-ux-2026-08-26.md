# Comissão SPACE por operação — plano de UX

## Contexto
SPACE Media recebe comissão sobre o resultado das operações. A comissão precisa ser configurável por operação e visível no drill-down (Detalhe OP).

## 1. Onde configurar
Aba **Settings** da operação (`/operations/<id>/settings`), seção "Comissão SPACE", visível apenas para super admin.
Atalho: botão discreto de engrenagem no card "Comissão SPACE" do drill-down que abre um modal com o mesmo formulário — assim quem está analisando o número ajusta sem trocar de tela.

Campos:
- % de comissão (decimal, 0–100)
- Base de cálculo: Lucro Líquido (fat − invest − impostos − aluguel − outros custos) ou Lucro Bruto (fat − invest)
- Toggles (só ativos quando a base é Lucro Líquido): incluir impostos (12,15%), incluir aluguel de conta (5,5%), incluir outros custos
- Outros custos (R$ fixo no período)

## 2. Onde aparece no drill-down
- **Card novo "COMISSÃO SPACE"** na grade de KPIs, ao lado de Lucro Bruto: valor em destaque + subtítulo `X% sobre <base> de R$ Y`.
- Estado não configurado: card em cinza com "Configurar" em vez de valor.
- **Coluna extra opcional** na tabela de breakdown diário ("Comissão"), calculada com o mesmo % aplicado ao lucro do dia — ligada por um toggle no cabeçalho da tabela para não poluir.

## 3. Histórico / auditoria
Tabela `space_commission_config_history` gravada por trigger em cada UPDATE (valores antigos e novos, `changed_by`, `changed_at`). Exibida num popover "histórico" dentro do formulário — lista simples: data, quem mudou, de X% para Y%.
Importante: o cálculo de períodos passados usa a configuração **vigente hoje** (não versionada por data) na v1. Se você quiser comissão retroativa fiel à época, aviso: isso vira versionamento por vigência (`valid_from`/`valid_to`) e muda o RPC.

## 4. Relatório mensal
Botão "Exportar comissão do mês" no consolidado multi-op: CSV com uma linha por operação (faturamento, investimento, deduções, base, %, valor da comissão) e linha de total. Sem envio automático por e-mail nesta fase.

## Detalhes técnicos
- Tabela `space_commission_config`: `operation_id` (único), `commission_pct`, `base_formula` (enum `net_profit` | `gross_profit`), `includes_taxes`, `includes_account_rental`, `includes_other_costs`, `other_costs_brl`, timestamps. RLS: leitura/escrita apenas super admin; GRANTs para `authenticated` e `service_role`.
- RPC `get_commission_calc(p_operation_id, p_start, p_end)` retorna `{ revenue, spend, taxes, rental, other_costs, base, pct, valor_comissao }`, reaproveitando a mesma fonte do drill-down (snapshot histórico + fontes live do dia) para não divergir dos cards.
- Frontend: hook `useCommissionCalc` + componente `SpaceCommissionCard` no `OperationDetail`, e `SpaceCommissionSettings` na aba de settings da operação.

## Perguntas antes de codar
1. A comissão retroativa deve usar a config atual (simples) ou versionada por data de vigência?
2. Impostos/aluguel usam os mesmos percentuais do Dashboard (12,15% e 5,5%) ou são configuráveis por operação?
3. "Outros custos" é valor fixo mensal ou por período consultado?
