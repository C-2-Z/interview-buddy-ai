-- Add model_provider and model_name columns to interview_sessions
-- for multi-model support (DeepSeek / GPT-4o / Claude)

ALTER TABLE public.interview_sessions
  ADD COLUMN IF NOT EXISTS model_provider text NOT NULL DEFAULT 'deepseek',
  ADD COLUMN IF NOT EXISTS model_name text;

-- Add to type definitions for the generated types
COMMENT ON COLUMN public.interview_sessions.model_provider IS 'AI provider: deepseek, openai, anthropic';
COMMENT ON COLUMN public.interview_sessions.model_name IS 'Model name, e.g. gpt-4o, claude-3-sonnet-20240229';
