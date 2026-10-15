export default function TermsOfUse() {
  return (
    <div className="min-h-screen bg-background text-foreground px-4 py-12 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">Termos de Uso</h1>
      <p className="text-sm text-muted-foreground mb-8">Última atualização: 15 de fevereiro de 2026</p>

      <section className="space-y-6 text-sm leading-relaxed">
        <div>
          <h2 className="text-lg font-semibold mb-2">1. Aceitação dos Termos</h2>
          <p>Ao acessar e utilizar a plataforma WarRoom (doravante "Plataforma"), operada pela GTX MIDIA LTDA, inscrita no CNPJ sob o nº 60.323.567/0001-20, você concorda integralmente com os presentes Termos de Uso. Caso não concorde, não utilize a Plataforma.</p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">2. Descrição do Serviço</h2>
          <p>A Plataforma é uma ferramenta de gestão e inteligência de campanhas publicitárias que permite:</p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>Visualização de dashboards e relatórios de performance de campanhas no Meta Ads (Facebook e Instagram).</li>
            <li>Análise de métricas de criativos, VSLs e unit economics.</li>
            <li>Planejamento e projeção de metas de vendas e investimento.</li>
            <li>Integração com plataformas de terceiros (Meta Ads, Vturb, CartPanda) para coleta automatizada de dados.</li>
          </ul>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">3. Cadastro e Acesso</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>O acesso à Plataforma é restrito a usuários cadastrados pela equipe administrativa da GTX MIDIA.</li>
            <li>Cada usuário é responsável pela segurança de suas credenciais de acesso (e-mail e senha).</li>
            <li>É proibido compartilhar credenciais com terceiros.</li>
            <li>A GTX MIDIA reserva-se o direito de suspender ou revogar o acesso a qualquer momento, sem aviso prévio.</li>
          </ul>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">4. Uso Permitido</h2>
          <p>O usuário compromete-se a utilizar a Plataforma exclusivamente para fins profissionais legítimos relacionados à gestão de campanhas publicitárias. É expressamente proibido:</p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>Utilizar a Plataforma para fins ilegais ou não autorizados.</li>
            <li>Tentar acessar áreas restritas ou dados de outros usuários.</li>
            <li>Realizar engenharia reversa, descompilação ou qualquer forma de extração do código-fonte.</li>
            <li>Sobrecarregar a infraestrutura com requisições automatizadas excessivas.</li>
          </ul>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">5. Integrações com Terceiros</h2>
          <p>A Plataforma integra-se com serviços de terceiros (Meta Platforms, Vturb, CartPanda). Ao conectar suas contas desses serviços, você:</p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>Autoriza a coleta e armazenamento dos dados necessários para operação da Plataforma.</li>
            <li>Reconhece que a disponibilidade e precisão dos dados dependem das APIs desses serviços.</li>
            <li>Concorda que a GTX MIDIA não se responsabiliza por alterações, indisponibilidades ou limitações impostas por esses terceiros.</li>
          </ul>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">6. Propriedade Intelectual</h2>
          <p>Todo o conteúdo, código, design, marcas e materiais da Plataforma são de propriedade exclusiva da GTX MIDIA LTDA ou de seus licenciadores, protegidos pela legislação brasileira de propriedade intelectual.</p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">7. Limitação de Responsabilidade</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>A Plataforma é fornecida "como está", sem garantias de qualquer tipo.</li>
            <li>A GTX MIDIA não se responsabiliza por decisões tomadas com base nos dados exibidos na Plataforma.</li>
            <li>A GTX MIDIA não garante disponibilidade ininterrupta do serviço.</li>
            <li>Em nenhuma hipótese a GTX MIDIA será responsável por danos indiretos, incidentais ou consequenciais.</li>
          </ul>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">8. Privacidade</h2>
          <p>O tratamento de dados pessoais é regido pela nossa <a href="/privacy" className="text-primary underline">Política de Privacidade</a>, que é parte integrante destes Termos.</p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">9. Modificações</h2>
          <p>A GTX MIDIA reserva-se o direito de alterar estes Termos a qualquer momento. As alterações entram em vigor imediatamente após a publicação na Plataforma. O uso continuado após alterações constitui aceitação dos novos termos.</p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">10. Foro</h2>
          <p>Fica eleito o foro da Comarca de Curitiba, Estado do Paraná, para dirimir quaisquer controvérsias decorrentes destes Termos, com renúncia expressa a qualquer outro, por mais privilegiado que seja.</p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">11. Contato</h2>
          <p>E-mail: <a href="mailto:contato@gtxmidia.site" className="text-primary underline">contato@gtxmidia.site</a></p>
          <p>GTX MIDIA LTDA — CNPJ: 60.323.567/0001-20</p>
          <p>Rua Primo Lourenço Tosin, 723 — Curitiba, PR — 81050-290</p>
        </div>
      </section>
    </div>
  );
}
