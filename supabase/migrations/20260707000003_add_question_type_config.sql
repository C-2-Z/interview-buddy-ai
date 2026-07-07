-- Phase 4 / C3: Add question_type_config column to interview_sessions
ALTER TABLE public.interview_sessions
  ADD COLUMN question_type_config JSONB DEFAULT NULL;
