# Coletor genérico H&W e Webhook Logs

## Objetivo
Subir agora uma entrada pública e segura para coletar o primeiro payload real da H&W, sem alimentar vendas nem disparar notificações nesta fase.

## Implementação
1. Criar `webhook_logs` com isolamento por operação, hash único do payload, dados brutos, campos inferidos, resultado do processamento e índices para histórico/filtros.
2. Criar `webhook-hw`:
   - aceita `POST` somente para a operação GTX informada;
   - valida `webhook_token` quando a integração tiver token configurado;
   - preserva integralmente JSON ou texto recebido;
   - infere campos comuns sem exigir nenhum deles;
   - deduplica pelo hash do payload;
   - registra sucesso, erro, órfão ou duplicado;
   - sempre responde HTTP 200 ao `POST`;
   - expõe `GET /health` com o último recebimento.
3. Adicionar a integração H&W e uma visualização “Webhook Logs” na área de Integrações, sempre filtrada pela operação selecionada, com período, origem, status, paginação e detalhes completos do payload/resultado.
4. Publicar a função e validar com chamadas manuais: health, payload válido, payload repetido e payload quebrado.
5. Abrir a tela GTX e validar visualmente os registros e os detalhes do JSON.

## Limites desta fase
- Não gravar na tabela de vendas.
- Não disparar push.
- Não tentar reprocessar para vendas antes do mapeamento definitivo do primeiro payload real.

## Detalhes técnicos
- Datas armazenadas como `timestamptz`; exibição e agrupamento em `America/Sao_Paulo`.
- A função usa credencial interna somente no servidor; a interface lê os logs pelas regras de acesso da operação.
- O hash considera operação, origem e corpo bruto, evitando colisão entre operações.
