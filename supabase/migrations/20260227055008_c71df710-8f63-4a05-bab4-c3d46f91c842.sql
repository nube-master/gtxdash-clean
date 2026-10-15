
-- Add project_scope column to notification_templates
-- Defaults to 'TODOS' (geral) for backward compatibility
ALTER TABLE public.notification_templates
ADD COLUMN project_scope text NOT NULL DEFAULT 'TODOS';

-- Add a comment for documentation
COMMENT ON COLUMN public.notification_templates.project_scope IS 'Project scope for metrics: TODOS (geral), NDM, NDR, LDG, NDB';
