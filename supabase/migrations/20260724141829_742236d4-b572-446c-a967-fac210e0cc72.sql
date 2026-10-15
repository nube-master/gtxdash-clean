
DO $$
DECLARE
  t RECORD;
  op RECORD;
  new_id uuid;
  ops uuid[] := ARRAY[
    '0b758a2b-1b92-4769-b47b-416c567e320d'::uuid, -- GTX
    '1dd606e3-dac2-4064-b863-9784307c9e98'::uuid  -- ESCOLA DO DÓLAR
  ];
BEGIN
  FOR t IN
    SELECT * FROM public.notification_templates
    WHERE id IN (
      'd4daf2c5-488c-43bc-b5e7-fffa9d2d340f',
      'd9a18847-b023-4c9b-abaa-aeee83c1485a'
    )
  LOOP
    FOREACH new_id IN ARRAY ops
    LOOP
      DECLARE clone_id uuid;
      BEGIN
        INSERT INTO public.notification_templates
          (name, type, title_template, body_template, available_variables,
           is_active, is_system, project_scope, operation_id)
        VALUES
          (t.name, t.type, t.title_template, t.body_template, t.available_variables,
           t.is_active, t.is_system, t.project_scope, new_id)
        RETURNING id INTO clone_id;

        -- Re-aponta prefs existentes desta operação para o novo template clonado
        UPDATE public.recipient_notification_prefs
        SET template_id = clone_id
        WHERE template_id = t.id
          AND operation_id = new_id;
      END;
    END LOOP;

    -- Remove sobras de prefs órfãs (outras ops que não têm clone) e o template global
    DELETE FROM public.recipient_notification_prefs WHERE template_id = t.id;
    DELETE FROM public.notification_templates WHERE id = t.id;
  END LOOP;
END $$;
