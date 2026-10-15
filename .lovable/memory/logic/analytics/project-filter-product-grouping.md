---
name: Analytics Project Filter — Product Grouping
description: Filtro de projetos no /analytics expande seleção e colapsa chips por produto_real
type: feature
---
**Regra:** Em `src/pages/Analytics.tsx`, ofertas com o mesmo `offers.produto_real` formam um grupo. Selecionar qualquer apelido do grupo (ex: NDM) faz `effectiveProjectCodes` incluir todos os irmãos (NDM + NTD → produto_real "NeuroDyne"), aplicando o filtro em sales/traffic/VSL/ICs/PnL. Os chips de projetos ativos também são colapsados: um chip canônico (maior spend) por produto_real, com sales/spend somados do grupo.

**Implementação:** memos `produtoRealGroups` (apelido↔produto_real) + `effectiveProjectCodes` (Set expandido). `activeProjectStats` agrupa via `produto_real` antes de renderizar.

**Exemplos atuais:** Memopryl (MMP+MMPB), NeuroDyne (NDM+NTD), NeuroMind Pro (NMP-BG01/02/03). NDR fica solto (produto_real distinto "NeuroDyne Retargeting").
