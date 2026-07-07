-- Phase 4 / C1: Add target_company column to interview_sessions
ALTER TABLE public.interview_sessions
  ADD COLUMN target_company TEXT DEFAULT NULL;
