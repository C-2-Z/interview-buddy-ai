-- Agent 3 strategy hotfix: make the nested JSONB key allowlist expression unambiguous.
DO $$
DECLARE
  v_definition TEXT;
BEGIN
  SELECT pg_get_functiondef(
    'public.commit_agent_v3_strategy_revision(uuid,jsonb)'::regprocedure
  ) INTO v_definition;
  v_definition := replace(v_definition, E'\r\n', E'\n');
  v_definition := replace(
    v_definition,
    E'(p_strategy->''questionCriteria'' - ARRAY[\n      ''primaryDimension'',''topicKeys'',''evidenceGoalKeys'',''questionIntent''\n    ]::TEXT[]) <> ''{}''::JSONB',
    E'((p_strategy->''questionCriteria'') - ARRAY[\n      ''primaryDimension'',''topicKeys'',''evidenceGoalKeys'',''questionIntent''\n    ]::TEXT[]) <> ''{}''::JSONB'
  );
  IF position(
    '((p_strategy->''questionCriteria'') - ARRAY[' IN v_definition
  ) = 0 THEN
    RAISE EXCEPTION 'Unable to repair Agent 3 strategy JSONB validation safely';
  END IF;
  EXECUTE v_definition;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_agent_readiness()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$ SELECT '20260715000002'::TEXT $$;

GRANT EXECUTE ON FUNCTION public.check_agent_readiness() TO anon, authenticated, service_role;
COMMENT ON FUNCTION public.check_agent_readiness() IS
  'Read-only Agent infrastructure probe after repairing Agent 3 strategy persistence.';
