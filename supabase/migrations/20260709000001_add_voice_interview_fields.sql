-- Voice interview v1: keep text and voice turns in interview_messages.
ALTER TABLE public.interview_sessions
  ADD COLUMN IF NOT EXISTS voice_mode BOOLEAN DEFAULT false;

ALTER TABLE public.interview_messages
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'text',
  ADD COLUMN IF NOT EXISTS audio_url TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS interrupted BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS turn_id TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS stt_confidence NUMERIC DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_messages_turn_id
  ON public.interview_messages(turn_id);
