INSERT INTO public.offers (apelido_interno, produto_real, tipo, nicho, geo, vendor, status)
VALUES ('VIT-RRT', 'Vitalis Visão', 'afiliacao', 'outro', 'MX', 'outro', 'em_teste')
ON CONFLICT DO NOTHING;