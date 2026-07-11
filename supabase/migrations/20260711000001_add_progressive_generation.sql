-- Progressive interview generation and reliable background-job outbox.
ALTER TABLE public.interview_sessions
  ADD COLUMN IF NOT EXISTS generation_status TEXT NOT NULL DEFAULT 'ready',
  ADD COLUMN IF NOT EXISTS generated_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS requested_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS generation_error TEXT,
  ADD COLUMN IF NOT EXISTS generation_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS generation_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS report_status TEXT NOT NULL DEFAULT 'idle';

ALTER TABLE public.interview_sessions
  DROP CONSTRAINT IF EXISTS interview_sessions_generation_status_check;
ALTER TABLE public.interview_sessions
  ADD CONSTRAINT interview_sessions_generation_status_check
  CHECK (generation_status IN ('queued', 'generating', 'ready', 'failed'));

ALTER TABLE public.interview_sessions
  DROP CONSTRAINT IF EXISTS interview_sessions_report_status_check;
ALTER TABLE public.interview_sessions
  ADD CONSTRAINT interview_sessions_report_status_check
  CHECK (report_status IN ('idle', 'queued', 'generating', 'ready', 'failed'));

UPDATE public.interview_sessions s
SET generated_count = q.question_count,
    requested_count = q.question_count
FROM (
  SELECT session_id, count(*)::int AS question_count
  FROM public.interview_questions
  GROUP BY session_id
) q
WHERE s.id = q.session_id
  AND s.generated_count = 0;

CREATE UNIQUE INDEX IF NOT EXISTS idx_questions_session_order_unique
  ON public.interview_questions(session_id, order_index);
CREATE INDEX IF NOT EXISTS idx_questions_skill_recent
  ON public.interview_questions(skill_id, created_at DESC)
  WHERE skill_id IS NOT NULL AND topic_summary IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sessions_cleanup
  ON public.interview_sessions(status, last_activity_at)
  WHERE status = 'in_progress';

CREATE TABLE IF NOT EXISTS public.background_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.interview_sessions(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL CHECK (job_type IN ('question_generation', 'report_generation')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'dispatched', 'completed', 'failed')),
  attempts INT NOT NULL DEFAULT 0,
  available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  dispatched_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(session_id, job_type)
);

ALTER TABLE public.background_jobs ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.background_jobs TO authenticated;
GRANT ALL ON public.background_jobs TO service_role;
CREATE POLICY "Users read own background jobs" ON public.background_jobs
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.interview_sessions s
    WHERE s.id = session_id AND s.user_id = auth.uid()
  ));
CREATE POLICY "Users create own background jobs" ON public.background_jobs
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.interview_sessions s
    WHERE s.id = session_id AND s.user_id = auth.uid()
  ));
CREATE POLICY "Users update own background jobs" ON public.background_jobs
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.interview_sessions s
    WHERE s.id = session_id AND s.user_id = auth.uid()
  ));

CREATE OR REPLACE FUNCTION public.create_progressive_interview_session(p_session JSONB)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  INSERT INTO public.interview_sessions (
    user_id, skill_id, position, difficulty, interview_mode,
    job_description, model_provider, model_name, user_api_key,
    target_company, resume_text, question_type_config, resume_id,
    generation_status, generated_count, requested_count
  ) VALUES (
    auth.uid(), NULLIF(p_session->>'skill_id', ''),
    p_session->>'position', p_session->>'difficulty',
    COALESCE(p_session->>'interview_mode', 'text'),
    NULLIF(p_session->>'job_description', ''),
    COALESCE(NULLIF(p_session->>'model_provider', ''), 'deepseek'),
    NULLIF(p_session->>'model_name', ''), NULLIF(p_session->>'user_api_key', ''),
    NULLIF(p_session->>'target_company', ''), NULLIF(p_session->>'resume_text', ''),
    p_session->'question_type_config', NULLIF(p_session->>'resume_id', '')::uuid,
    'queued', 0, LEAST(10, GREATEST(3, COALESCE((p_session->>'requested_count')::int, 5)))
  ) RETURNING id INTO next_id;

  INSERT INTO public.background_jobs (session_id, job_type)
  VALUES (next_id, 'question_generation');
  RETURN next_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_progressive_interview_session(JSONB) TO authenticated;
