-- Ensure the user_settings shape is consistent across earlier migration paths.
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS model_name TEXT DEFAULT NULL;

COMMENT ON COLUMN public.user_settings.model_name IS 'Default model name override';

