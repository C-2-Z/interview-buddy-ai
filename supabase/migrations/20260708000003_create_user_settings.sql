-- User settings table for storing preferences and encrypted API keys
CREATE TABLE IF NOT EXISTS public.user_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  model_provider TEXT NOT NULL DEFAULT 'deepseek',
  model_name TEXT DEFAULT NULL,
  openai_api_key TEXT DEFAULT NULL,
  anthropic_api_key TEXT DEFAULT NULL,
  deepseek_api_key TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Row-level security: users can only access their own settings
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own settings"
  ON public.user_settings
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Auto-create a settings row when a user signs up (via trigger)
CREATE OR REPLACE FUNCTION public.handle_new_user_settings()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_settings (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if exists, then create
DROP TRIGGER IF EXISTS on_auth_user_created_settings ON auth.users;
CREATE TRIGGER on_auth_user_created_settings
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_settings();

-- Ensure existing users have a settings row
INSERT INTO public.user_settings (user_id)
SELECT id FROM auth.users
ON CONFLICT (user_id) DO NOTHING;

COMMENT ON TABLE public.user_settings IS 'User preferences and encrypted API keys for AI providers';
COMMENT ON COLUMN public.user_settings.model_provider IS 'Default AI provider: deepseek, openai, anthropic';
COMMENT ON COLUMN public.user_settings.model_name IS 'Default model name override';
COMMENT ON COLUMN public.user_settings.openai_api_key IS 'Encrypted OpenAI API key';
COMMENT ON COLUMN public.user_settings.anthropic_api_key IS 'Encrypted Anthropic API key';
COMMENT ON COLUMN public.user_settings.deepseek_api_key IS 'Encrypted DeepSeek API key';
