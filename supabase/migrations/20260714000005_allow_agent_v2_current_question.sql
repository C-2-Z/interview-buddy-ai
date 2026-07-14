-- Agent v2 first-question migration: allow the shared question projection columns for both graph versions.
ALTER TABLE public.interview_sessions
  DROP CONSTRAINT IF EXISTS interview_sessions_current_question_contract_check;

ALTER TABLE public.interview_sessions
  ADD CONSTRAINT interview_sessions_current_question_contract_check
  CHECK (
    (
      current_question_id IS NULL
      AND current_question_index IS NULL
      AND follow_up_count IS NULL
    ) OR (
      agent_version IN ('agent-v1', 'agent-v2')
      AND current_question_id IS NOT NULL
      AND current_question_index IS NOT NULL
      AND follow_up_count IS NOT NULL
    )
  );

CREATE OR REPLACE FUNCTION public.check_agent_readiness()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$ SELECT '20260714000005'::TEXT $$;

GRANT EXECUTE ON FUNCTION public.check_agent_readiness() TO anon, authenticated, service_role;
COMMENT ON FUNCTION public.check_agent_readiness() IS
  'Read-only Agent infrastructure probe after enabling Agent v2 current-question projection.';
