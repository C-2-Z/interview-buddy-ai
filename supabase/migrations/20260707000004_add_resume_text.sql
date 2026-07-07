-- Phase 4 / C2: Add resume_text column to interview_sessions
ALTER TABLE public.interview_sessions
  ADD COLUMN resume_text TEXT DEFAULT NULL;
