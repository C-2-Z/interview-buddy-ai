-- Interview Agent Phase 2: frozen preparation plans, research cache, question provenance, and atomic preparation commits.

ALTER TABLE public.interview_sessions
  ADD COLUMN IF NOT EXISTS agent_plan JSONB,
  ADD COLUMN IF NOT EXISTS prepared_at TIMESTAMPTZ;

ALTER TABLE public.interview_sessions
  DROP CONSTRAINT IF EXISTS interview_sessions_agent_plan_check,
  DROP CONSTRAINT IF EXISTS interview_sessions_prepared_contract_check;

ALTER TABLE public.interview_sessions
  ADD CONSTRAINT interview_sessions_agent_plan_check
    CHECK (
      agent_plan IS NULL OR (
        jsonb_typeof(agent_plan) = 'object'
        AND NOT public._agent_json_has_sensitive_key(agent_plan)
      )
    ),
  ADD CONSTRAINT interview_sessions_prepared_contract_check
    CHECK (
      (agent_plan IS NULL AND prepared_at IS NULL)
      OR (agent_version = 'agent-v1' AND agent_plan IS NOT NULL AND prepared_at IS NOT NULL)
    );

CREATE TABLE IF NOT EXISTS public.agent_research_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.interview_sessions(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('company', 'role', 'industry')),
  query TEXT NOT NULL CHECK (pg_catalog.length(query) BETWEEN 1 AND 300),
  title TEXT NOT NULL CHECK (pg_catalog.length(title) BETWEEN 1 AND 300),
  url TEXT NOT NULL CHECK (pg_catalog.length(url) BETWEEN 1 AND 2048),
  snippet TEXT NOT NULL CHECK (pg_catalog.length(snippet) BETWEEN 1 AND 2000),
  fetched_at TIMESTAMPTZ NOT NULL,
  content_hash TEXT NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT agent_research_sources_session_hash_key UNIQUE (session_id, content_hash)
);

CREATE INDEX IF NOT EXISTS idx_agent_research_sources_session_category
  ON public.agent_research_sources(session_id, category, created_at DESC);

ALTER TABLE public.agent_research_sources ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.agent_research_sources FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.agent_research_sources TO authenticated;
GRANT ALL ON TABLE public.agent_research_sources TO service_role;

DROP POLICY IF EXISTS "Users read own agent research sources"
  ON public.agent_research_sources;
CREATE POLICY "Users read own agent research sources"
  ON public.agent_research_sources
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.interview_sessions AS session
      WHERE session.id = agent_research_sources.session_id
        AND session.user_id = auth.uid()
    )
  );

ALTER TABLE public.interview_questions
  ADD COLUMN IF NOT EXISTS role_id TEXT,
  ADD COLUMN IF NOT EXISTS dimension_key TEXT,
  ADD COLUMN IF NOT EXISTS selection_source TEXT,
  ADD COLUMN IF NOT EXISTS bank_question_id UUID REFERENCES public.question_bank(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS plan_version TEXT;

ALTER TABLE public.interview_questions
  DROP CONSTRAINT IF EXISTS interview_questions_role_id_check,
  DROP CONSTRAINT IF EXISTS interview_questions_dimension_key_check,
  DROP CONSTRAINT IF EXISTS interview_questions_selection_source_check,
  DROP CONSTRAINT IF EXISTS interview_questions_plan_version_check,
  DROP CONSTRAINT IF EXISTS interview_questions_agent_contract_check;

ALTER TABLE public.interview_questions
  ADD CONSTRAINT interview_questions_role_id_check
    CHECK (role_id IS NULL OR role_id IN ('general', 'technical', 'manager', 'hr')),
  ADD CONSTRAINT interview_questions_dimension_key_check
    CHECK (dimension_key IS NULL OR pg_catalog.length(dimension_key) BETWEEN 1 AND 100),
  ADD CONSTRAINT interview_questions_selection_source_check
    CHECK (selection_source IS NULL OR selection_source IN ('bank', 'model')),
  ADD CONSTRAINT interview_questions_plan_version_check
    CHECK (plan_version IS NULL OR pg_catalog.length(plan_version) BETWEEN 1 AND 100),
  ADD CONSTRAINT interview_questions_agent_contract_check
    CHECK (
      (
        role_id IS NULL
        AND dimension_key IS NULL
        AND selection_source IS NULL
        AND bank_question_id IS NULL
        AND plan_version IS NULL
      ) OR (
        role_id IS NOT NULL
        AND dimension_key IS NOT NULL
        AND selection_source IS NOT NULL
        AND plan_version IS NOT NULL
        AND (selection_source = 'bank' OR bank_question_id IS NULL)
      )
    );

CREATE INDEX IF NOT EXISTS idx_interview_questions_agent_plan
  ON public.interview_questions(session_id, role_id, order_index)
  WHERE plan_version IS NOT NULL;

-- Agent questions are read through normal ownership rules but can only be created by the atomic RPC.
DROP POLICY IF EXISTS "Users manage own questions" ON public.interview_questions;
DROP POLICY IF EXISTS "Users read own questions" ON public.interview_questions;
DROP POLICY IF EXISTS "Users create legacy questions" ON public.interview_questions;
DROP POLICY IF EXISTS "Users update legacy questions" ON public.interview_questions;
DROP POLICY IF EXISTS "Users delete legacy questions" ON public.interview_questions;

CREATE POLICY "Users read own questions"
  ON public.interview_questions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.interview_sessions AS session
      WHERE session.id = interview_questions.session_id
        AND session.user_id = auth.uid()
    )
  );

CREATE POLICY "Users create legacy questions"
  ON public.interview_questions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.interview_sessions AS session
      WHERE session.id = interview_questions.session_id
        AND session.user_id = auth.uid()
        AND session.agent_version IS NULL
    )
  );

CREATE POLICY "Users update legacy questions"
  ON public.interview_questions
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.interview_sessions AS session
      WHERE session.id = interview_questions.session_id
        AND session.user_id = auth.uid()
        AND session.agent_version IS NULL
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.interview_sessions AS session
      WHERE session.id = interview_questions.session_id
        AND session.user_id = auth.uid()
        AND session.agent_version IS NULL
    )
  );

CREATE POLICY "Users delete legacy questions"
  ON public.interview_questions
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.interview_sessions AS session
      WHERE session.id = interview_questions.session_id
        AND session.user_id = auth.uid()
        AND session.agent_version IS NULL
    )
  );

-- Persist the frozen plan, research cache, first question, projection, and events in one transaction.
CREATE OR REPLACE FUNCTION public.commit_agent_preparation(
  p_session_id UUID,
  p_operation_key TEXT,
  p_node_name TEXT,
  p_current_role TEXT,
  p_plan JSONB,
  p_sources JSONB,
  p_question JSONB,
  p_result JSONB,
  p_events JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_authenticated_user UUID := auth.uid();
  v_session_user UUID;
  v_agent_version TEXT;
  v_agent_config JSONB;
  v_question_count INTEGER;
  v_operation_status TEXT;
  v_source JSONB;
  v_question_id UUID;
  v_bank_question_id UUID;
  v_selection_source TEXT;
  v_research_status TEXT;
BEGIN
  IF v_authenticated_user IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  SELECT session.user_id, session.agent_version, session.agent_config
  INTO v_session_user, v_agent_version, v_agent_config
  FROM public.interview_sessions AS session
  WHERE session.id = p_session_id
  FOR UPDATE;

  IF NOT FOUND OR v_session_user <> v_authenticated_user OR v_agent_version <> 'agent-v1' THEN
    RAISE EXCEPTION 'Agent session not found' USING ERRCODE = 'P0002';
  END IF;
  v_question_count := (v_agent_config->>'questionCount')::INTEGER;

  SELECT operation.status
  INTO v_operation_status
  FROM public.agent_operations AS operation
  WHERE operation.session_id = p_session_id
    AND operation.operation_key = p_operation_key
    AND operation.node_name = p_node_name;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agent preparation must be claimed before commit' USING ERRCODE = 'P0002';
  END IF;

  -- Replay must not attempt duplicate inserts; the canonical operation RPC returns the first result.
  IF v_operation_status = 'completed' THEN
    RETURN public.commit_agent_operation(
      p_session_id,
      p_operation_key,
      p_node_name,
      'awaiting_answer',
      p_current_role,
      p_result,
      p_events
    );
  END IF;

  IF v_operation_status <> 'running' THEN
    RAISE EXCEPTION 'Agent preparation is not running' USING ERRCODE = '55000';
  END IF;

  IF p_plan IS NULL
    OR jsonb_typeof(p_plan) <> 'object'
    OR (p_plan - ARRAY[
      'version',
      'rolePlan',
      'capabilityBlueprint',
      'questionRoles',
      'questionDimensions',
      'firstQuestion',
      'researchStatus',
      'researchSources'
    ]::TEXT[]) <> '{}'::JSONB
    OR p_plan->>'version' IS DISTINCT FROM 'plan-v1'
    OR jsonb_typeof(p_plan->'rolePlan') IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_plan->'capabilityBlueprint') IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_plan->'questionRoles') IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_plan->'questionDimensions') IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_plan->'firstQuestion') IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_plan->'researchSources') IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_plan->'questionRoles') <> v_question_count
    OR jsonb_array_length(p_plan->'questionDimensions') <> v_question_count
    OR (p_plan->'capabilityBlueprint'->>'questionCount')::INTEGER <> v_question_count
    OR EXISTS (
      SELECT 1
      FROM pg_catalog.jsonb_array_elements_text(p_plan->'questionRoles') AS role(value)
      WHERE role.value NOT IN ('general', 'technical', 'manager', 'hr')
    )
    OR public._agent_json_has_sensitive_key(p_plan)
    OR pg_catalog.octet_length(p_plan::TEXT) > 131072
  THEN
    RAISE EXCEPTION 'Invalid Agent preparation plan' USING ERRCODE = '22023';
  END IF;

  v_research_status := p_plan->>'researchStatus';
  IF v_research_status IS NULL
    OR v_research_status NOT IN ('completed', 'skipped', 'failed')
  THEN
    RAISE EXCEPTION 'Invalid research status' USING ERRCODE = '22023';
  END IF;

  IF p_sources IS NULL OR jsonb_typeof(p_sources) <> 'array'
    OR jsonb_array_length(p_sources) > 15
    OR p_plan->'researchSources' <> p_sources
    OR public._agent_json_has_sensitive_key(p_sources)
  THEN
    RAISE EXCEPTION 'Invalid research sources' USING ERRCODE = '22023';
  END IF;

  FOR v_source IN
    SELECT item.value
    FROM pg_catalog.jsonb_array_elements(p_sources) AS item(value)
  LOOP
    IF jsonb_typeof(v_source) <> 'object'
      OR (v_source - ARRAY['category', 'query', 'title', 'url', 'snippet', 'fetchedAt', 'contentHash']::TEXT[]) <> '{}'::JSONB
      OR v_source->>'category' NOT IN ('company', 'role', 'industry')
      OR pg_catalog.length(COALESCE(v_source->>'query', '')) NOT BETWEEN 1 AND 300
      OR pg_catalog.length(COALESCE(v_source->>'title', '')) NOT BETWEEN 1 AND 300
      OR pg_catalog.length(COALESCE(v_source->>'url', '')) NOT BETWEEN 1 AND 2048
      OR COALESCE(v_source->>'url', '') !~ '^https?://'
      OR pg_catalog.length(COALESCE(v_source->>'snippet', '')) NOT BETWEEN 1 AND 2000
      OR COALESCE(v_source->>'contentHash', '') !~ '^[a-f0-9]{64}$'
    THEN
      RAISE EXCEPTION 'Invalid research source' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.agent_research_sources (
      session_id, category, query, title, url, snippet, fetched_at, content_hash
    ) VALUES (
      p_session_id,
      v_source->>'category',
      v_source->>'query',
      v_source->>'title',
      v_source->>'url',
      v_source->>'snippet',
      (v_source->>'fetchedAt')::TIMESTAMPTZ,
      v_source->>'contentHash'
    )
    ON CONFLICT (session_id, content_hash) DO NOTHING;
  END LOOP;

  IF p_question IS NULL
    OR jsonb_typeof(p_question) <> 'object'
    OR (p_question - ARRAY['id', 'question', 'roleId', 'dimensionKey', 'source', 'bankQuestionId']::TEXT[]) <> '{}'::JSONB
  THEN
    RAISE EXCEPTION 'Invalid prepared question' USING ERRCODE = '22023';
  END IF;

  BEGIN
    v_question_id := (p_question->>'id')::UUID;
    IF NULLIF(p_question->>'bankQuestionId', '') IS NOT NULL THEN
      v_bank_question_id := (p_question->>'bankQuestionId')::UUID;
    END IF;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'Invalid prepared question id' USING ERRCODE = '22023';
  END;

  v_selection_source := p_question->>'source';
  IF pg_catalog.length(COALESCE(p_question->>'question', '')) NOT BETWEEN 1 AND 5000
    OR p_question->>'roleId' NOT IN ('general', 'technical', 'manager', 'hr')
    OR p_question->>'roleId' IS DISTINCT FROM p_current_role
    OR p_question->>'roleId' IS DISTINCT FROM p_plan->'questionRoles'->>0
    OR pg_catalog.length(COALESCE(p_question->>'dimensionKey', '')) NOT BETWEEN 1 AND 100
    OR p_question->>'dimensionKey' IS DISTINCT FROM p_plan->'questionDimensions'->>0
    OR v_selection_source NOT IN ('bank', 'model')
    OR (v_selection_source = 'bank' AND v_bank_question_id IS NULL)
    OR (v_selection_source = 'model' AND v_bank_question_id IS NOT NULL)
  THEN
    RAISE EXCEPTION 'Invalid prepared question fields' USING ERRCODE = '22023';
  END IF;

  IF v_bank_question_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.question_bank WHERE id = v_bank_question_id)
  THEN
    RAISE EXCEPTION 'Question bank source not found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.interview_questions (
    id,
    session_id,
    order_index,
    question,
    role_id,
    dimension_key,
    selection_source,
    bank_question_id,
    plan_version
  ) VALUES (
    v_question_id,
    p_session_id,
    0,
    p_question->>'question',
    p_question->>'roleId',
    p_question->>'dimensionKey',
    v_selection_source,
    v_bank_question_id,
    'plan-v1'
  );

  UPDATE public.interview_sessions
  SET agent_plan = p_plan,
      research_status = v_research_status,
      prepared_at = now()
  WHERE id = p_session_id;

  RETURN public.commit_agent_operation(
    p_session_id,
    p_operation_key,
    p_node_name,
    'awaiting_answer',
    p_current_role,
    p_result,
    p_events
  );
END;
$$;

REVOKE ALL ON FUNCTION public.commit_agent_preparation(
  UUID, TEXT, TEXT, TEXT, JSONB, JSONB, JSONB, JSONB, JSONB
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commit_agent_preparation(
  UUID, TEXT, TEXT, TEXT, JSONB, JSONB, JSONB, JSONB, JSONB
) TO authenticated, service_role;

COMMENT ON TABLE public.agent_research_sources IS
  'Sanitized, untrusted pre-interview web research cached per Agent session.';
COMMENT ON COLUMN public.interview_sessions.agent_plan IS
  'Frozen plan-v1 role allocation and capability blueprint; never stores credentials or raw resume files.';
COMMENT ON FUNCTION public.commit_agent_preparation(
  UUID, TEXT, TEXT, TEXT, JSONB, JSONB, JSONB, JSONB, JSONB
) IS
  'Atomically persists a frozen preparation plan, sanitized research, first question, projection, and durable events.';
