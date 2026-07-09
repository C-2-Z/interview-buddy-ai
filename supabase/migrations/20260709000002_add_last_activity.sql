-- Add last_activity_at to interview_sessions for idle session detection
ALTER TABLE public.interview_sessions ADD COLUMN last_activity_at TIMESTAMPTZ;
