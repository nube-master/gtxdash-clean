export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-background text-foreground px-4 py-12 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">Política de Privacidade</h1>
      <p className="text-sm text-muted-foreground mb-8">Última atualização: 15 de fevereiro de 2026</p>

      <section className="space-y-6 text-sm leading-relaxed">
        <div>
          <h2 className="text-lg font-semibold mb-2">1. Identificação do Controlador</h2>
          <p>GTX MIDIA LTDA (doravante "GTX MIDIA"), inscrita no CNPJ sob o nº 60.323.567/0001-20, é a controladora dos dados pessoais coletados por meio da plataforma de gestão de campanhas publicitárias (doravante "Plataforma").</p>
          <p className="mt-1">Endereço: Rua Primo Lourenço Tosin, 723 — CASA 10 COND VILLA VERONA I CD — Curitiba, Paraná 81050-290, Brasil</p>
          <p className="mt-1">Telefone: +55 41 99668-4828</p>
          <p className="mt-1">Site: <a href="https://gtxmidia.site/" className="text-primary underline" target="_blank" rel="noopener noreferrer">https://gtxmidia.site/</a></p>
          <p className="mt-1">Contato: <a href="mailto:contato@gtxmidia.site" className="text-primary underline">contato@gtxmidia.site</a></p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">2. Dados Coletados</h2>
          <p>Ao utilizar a Plataforma, coletamos:</p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li><strong>Dados de cadastro:</strong> nome, e-mail e senha (armazenada de forma criptografada).</li>
            <li><strong>Dados da conta Meta:</strong> ao conectar sua conta via Facebook Login for Business, acessamos seu nome de usuário, Business Managers, Ad Accounts e Pages que você autorizar.</li>
            <li><strong>Dados de campanhas:</strong> métricas de desempenho (impressões, cliques, gastos, conversões, CTR, CPM) das contas publicitárias selecionadas.</li>
            <li><strong>Dados de uso:</strong> informações sobre como você interage com a Plataforma para fins de melhoria do serviço.</li>
          </ul>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">3. Finalidade do Tratamento</h2>
          <p>Os dados são utilizados exclusivamente para:</p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>Permitir o gerenciamento de campanhas publicitárias no Facebook e Instagram.</li>
            <li>Exibir dashboards e relatórios de performance das campanhas.</li>
            <li>Criar, editar e otimizar anúncios nas contas selecionadas.</li>
            <li>Fornecer sugestões de otimização por meio de inteligência artificial.</li>
          </ul>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">4. Compartilhamento de Dados</h2>
          <p>A GTX MIDIA não vende, aluga ou compartilha seus dados pessoais com terceiros para fins de marketing. Os dados podem ser compartilhados apenas:</p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>Com a Meta Platforms, Inc., por meio da Graph API, para execução das funcionalidades da Plataforma.</li>
            <li>Com provedores de infraestrutura (hosting), exclusivamente para operação técnica do serviço.</li>
            <li>Quando exigido por lei ou ordem judicial.</li>
          </ul>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">5. Armazenamento e Segurança</h2>
          <p>Os dados são armazenados em servidores seguros. Senhas são criptografadas com bcrypt. Tokens de acesso da Meta são armazenados de forma segura e utilizados exclusivamente para as operações autorizadas pelo usuário.</p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">6. Retenção de Dados</h2>
          <p>Os dados são mantidos enquanto sua conta estiver ativa. Dados de métricas de campanhas são retidos por até 12 meses após a última sincronização. Após o encerramento da conta, todos os dados são excluídos em até 30 dias.</p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">7. Seus Direitos</h2>
          <p>Em conformidade com a LGPD (Lei Geral de Proteção de Dados), você tem direito a:</p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>Acessar seus dados pessoais.</li>
            <li>Corrigir dados incompletos ou desatualizados.</li>
            <li>Solicitar a exclusão dos seus dados.</li>
            <li>Revogar o consentimento a qualquer momento, desconectando sua conta Meta nas configurações da Plataforma.</li>
            <li>Solicitar a portabilidade dos seus dados.</li>
          </ul>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">8. Revogação de Acesso</h2>
          <p>Você pode revogar o acesso da Plataforma aos seus dados da Meta a qualquer momento:</p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li><strong>Na Plataforma:</strong> acesse Configurações e clique em "Desconectar conta Meta".</li>
            <li><strong>No Facebook:</strong> acesse Configurações &gt; Segurança e login &gt; Apps e sites e remova o acesso da Plataforma.</li>
          </ul>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">9. Contato</h2>
          <p>Para exercer seus direitos ou esclarecer dúvidas sobre esta política, entre em contato:</p>
          <p className="mt-1">E-mail: <a href="mailto:contato@gtxmidia.site" className="text-primary underline">contato@gtxmidia.site</a></p>
          <p>Empresa: GTX MIDIA LTDA — CNPJ: 60.323.567/0001-20</p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">10. Alterações nesta Política</h2>
          <p>Esta política pode ser atualizada periodicamente. Notificaremos os usuários sobre alterações significativas por e-mail ou por aviso na Plataforma.</p>
        </div>
      </section>
    </div>
  );
}
