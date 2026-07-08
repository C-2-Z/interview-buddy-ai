-- C0: Add skill support columns to interview_sessions and interview_questions
ALTER TABLE public.interview_sessions
  ADD COLUMN skill_id TEXT DEFAULT NULL;

ALTER TABLE public.interview_questions
  ADD COLUMN skill_id TEXT DEFAULT NULL,
  ADD COLUMN topic_summary TEXT DEFAULT NULL;
