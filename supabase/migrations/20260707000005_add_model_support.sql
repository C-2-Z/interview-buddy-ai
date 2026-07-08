-- D1: Add model_provider, model_name, user_api_key columns to interview_sessions
-- + Create user_settings table for storing user API keys

ALTER TABLE public.interview_sessions
  ADD COLUMN IF NOT EXISTS model_provider TEXT DEFAULT 'deepseek',
  ADD COLUMN IF NOT EXISTS model_name TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS user_api_key TEXT DEFAULT NULL;

CREATE TABLE IF NOT EXISTS public.user_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  model_provider TEXT DEFAULT 'deepseek',
  deepseek_api_key TEXT DEFAULT NULL,
  openai_api_key TEXT DEFAULT NULL,
  anthropic_api_key TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.user_settings TO authenticated;
GRANT ALL ON public.user_settings TO service_role;

CREATE POLICY "Users manage own settings" ON public.user_settings FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_user_settings_user ON public.user_settings(user_id);
