# Onboarding — ESCOLA DO DÓLAR 🇧🇷

> Operação `escola-do-dolar` · BRL · America/Sao_Paulo · plano enterprise
> Owner: Gabriel Vidal · Status: aguardando setup antes de liberar o dashboard

Checklist obrigatório antes do go-live. Cada bloco tem critério de aceite objetivo — só marca ✅ quando o critério for verdadeiro em produção.

---

## 1. Acesso & Governança
- [ ] Gabriel loga e seleciona **ESCOLA DO DÓLAR** em `/select-operation` (confirma que operação aparece no seletor).
- [ ] Confirmar em `operation_members` que Gabriel está `active` como `admin`.
- [ ] Adicionar demais membros (analistas/mídia) com role apropriada (`admin`/`member`) — nunca `owner` duplicado.
- [ ] Validar `user_page_permissions` para cada membro novo (sidebar respeita `enabled_features`).
- [ ] STRICT tenant isolation já está global — validar que membros só enxergam dados desta op (abrir `/dashboard` com conta membro comum).

## 2. Conexões de Dados
### 2.1 Meta Ads
- [ ] Conectar tokens em `/integrations` (Meta Business Login).
- [ ] Cadastrar cada `meta_ad_accounts` com `is_active=true` e `operation_id` correto.
- [ ] Definir `currency` da conta (BRL/USD) — dispara ou não o imposto 12,15%.
- [ ] Rodar `sync-meta-today` manual e confirmar spend > 0 em `/dashboard`.
- [ ] Confirmar `sync-meta-ad-pages` popula Fanpages (usada em Campaigns).

### 2.2 Plataforma de Vendas (ClickBank / CartPanda / Sphere / Digistore)
- [ ] Cadastrar credenciais em `operation_credentials`.
- [ ] Configurar webhook público apontando pro endpoint correto por plataforma.
- [ ] Registrar `nickname`/`vendor` em `account_utm_aliases` para roteamento multitenant.
- [ ] Validar recebimento: uma venda real deve cair em `sales_data` **e** `clickbank_audit` (quando aplicável) com `operation_id` desta op.

### 2.3 RedTrack
- [ ] Cadastrar API key + domínio de tracking.
- [ ] Rodar `pull-conversions` manual e confirmar eventos em `redtrack_events` com `is_transaction=1`.
- [ ] Auditar atribuição 3-tier (RT → Meta `aff_sub2` → traffic_data) no primeiro dia com volume.

### 2.4 Vturb (opcional, se houver VSL)
- [ ] Cadastrar players em `vsl_players` com `utm_campaign` mapeado.
- [ ] Confirmar `vsl_data` populando via `sync-vturb`.

### 2.5 Newsbreak / MGID (se aplicável)
- [ ] Cadastrar `newsbreak_ad_accounts` com Access-Token.
- [ ] Confirmar `sync-newsbreak` gravando `spend` em USD.

## 3. Regras Financeiras
- [ ] Definir **câmbio**: confirmar `exchange_rates_cache` populado (cron PTAX 9h BRT) — sem isso, USD→BRL quebra.
- [ ] `operations.apply_meta_tax`: **true** se houver conta gastando em BRL; **false** caso contrário.
- [ ] Configurar **Account Rent** (5-6%) em `cashflow_settings` se aplicável.
- [ ] Cadastrar **margens por produto** em `product_margin_settings`:
  - `margin_pct` real por produto (0..1)
  - `be_buffer_pct` (default 0.10) — dispara semáforo ROAS em `/pacing`
- [ ] Revisar `fee_mapping` (taxas de gateway/plataforma) para o P&L bater.
- [ ] Cadastrar `fixed_costs` e `variable_costs` recorrentes.

## 4. Metas & Planejamento
- [ ] `planning_goals`: `revenue_goal`, `margin_goal`, `cpa_goal` diários preenchidos.
- [ ] `monthly_goals`: meta consolidada do mês.
- [ ] `channel_performance_goals` por canal (Meta / Newsbreak / MGID).
- [ ] Validar em `/planning` que pacing calcula projeção sem NaN.

## 5. Pacing & Automação
- [ ] Definir `pacing_settings` global (thresholds base).
- [ ] Cadastrar `pacing_rules` iniciais (scale/cut) — começar em modo **dry-run** por 48h.
- [ ] Configurar `pacing_budget_groups` se houver campanhas agrupadas.
- [ ] Após 48h dry-run limpo → ativar execução real.

## 6. Notificações
- [ ] Criar `notification_recipients` reais (Pushcut webhook URL — **não** email).
- [ ] Ativar templates relevantes em `notification_settings`:
  - Venda paga / comissão aprovada
  - ROAS anomaly
  - Meta permission alerts
  - Reconciliation alerts
- [ ] Testar envio manual de 1 template pra cada recipient.

## 7. Revisão Final (double-check antes do go-live)
- [ ] `/dashboard` (hoje): spend, revenue, sales, ROAS, lucro líquido — todos coerentes com skyTotals.
- [ ] `/analytics` (7d): projetos aparecem com apelidos corretos, sem "outros" inflado.
- [ ] `/pacing`: campanhas listadas, semáforo ROAS colorindo conforme margem.
- [ ] `/war-room`: live sales toast dispara em venda real (sem duplicata).
- [ ] `/reconciliation`: primeira execução PTAX + extrato de cartão sem erro.
- [ ] Rodar suite F10 estendida (34/34) filtrando por `operation_id` da ESCOLA DO DÓLAR — confirmar isolamento.

---

## Critério de liberação
Dashboard só é liberado para o time quando **todos os checkboxes das seções 1–7 estiverem marcados** e Gabriel assinar o go-live nesta doc (data + commit).

- Go-live aprovado por: _________________
- Data: _________________
- Commit de referência: _________________
