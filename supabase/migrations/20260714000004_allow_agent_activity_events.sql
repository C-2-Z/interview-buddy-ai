-- Agent v2 activity event migration: permit the public activity lifecycle emitted by record_agent_activity.
ALTER TABLE public.agent_events
  DROP CONSTRAINT IF EXISTS agent_events_type_check;

ALTER TABLE public.agent_events
  ADD CONSTRAINT agent_events_type_check
  CHECK (
    type IN (
      'agent.snapshot',
      'agent.phase',
      'agent.role_changed',
      'agent.question_ready',
      'agent.message_delta',
      'agent.message_completed',
      'agent.score_completed',
      'agent.session_completed',
      'agent.error',
      'agent.activity'
    )
  );

CREATE OR REPLACE FUNCTION public.check_agent_readiness()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$ SELECT '20260714000004'::TEXT $$;

GRANT EXECUTE ON FUNCTION public.check_agent_readiness() TO anon, authenticated, service_role;
COMMENT ON FUNCTION public.check_agent_readiness() IS
  'Read-only Agent infrastructure probe after enabling Agent v2 activity events.';
