UPDATE notification_templates 
SET 
  title_template = '🏦 TOP CONTAS DO DIA 🔥',
  body_template = E'🥇 {{conta_1}} — +R${{lucro_1}}\n🥈 {{conta_2}} — +R${{lucro_2}}\n🥉 {{conta_3}} — +R${{lucro_3}}',
  available_variables = ARRAY['conta_1','lucro_1','conta_2','lucro_2','conta_3','lucro_3'],
  updated_at = now()
WHERE type = 'ranking_contas';