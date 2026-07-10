-- Split text and voice interviews into parallel session modes.
ALTER TABLE public.interview_sessions
  ADD COLUMN IF NOT EXISTS interview_mode TEXT NOT NULL DEFAULT 'text';

UPDATE public.interview_sessions
SET interview_mode = 'voice'
WHERE voice_mode IS TRUE;

ALTER TABLE public.interview_sessions
  DROP CONSTRAINT IF EXISTS interview_sessions_interview_mode_check;

ALTER TABLE public.interview_sessions
  ADD CONSTRAINT interview_sessions_interview_mode_check
  CHECK (interview_mode IN ('text', 'voice'));

COMMENT ON COLUMN public.interview_sessions.interview_mode IS
  'Interview experience mode: text or voice';
