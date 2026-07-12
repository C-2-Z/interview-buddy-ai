-- Interview Agent Phase 1: persistent projections, durable events, idempotent operations, and audit runs.

-- Keep secrets out of frozen Agent configuration, operation results, and durable event payloads.
CREATE OR REPLACE FUNCTION public._agent_json_has_sensitive_key(p_value JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
STRICT
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
DECLARE
  v_key TEXT;
  v_child JSONB;
  v_normalized_key TEXT;
BEGIN
  IF jsonb_typeof(p_value) = 'object' THEN
    FOR v_key, v_child IN
      SELECT entry.key, entry.value
      FROM pg_catalog.jsonb_each(p_value) AS entry(key, value)
    LOOP
      v_normalized_key := pg_catalog.regexp_replace(
        pg_catalog.lower(v_key),
        '[^a-z0-9]',
        '',
        'g'
      );

      IF v_normalized_key IN (
        'key',
        'token',
        'bearer',
        'jwt',
        'dsn',
        'credential',
        'credentials'
      )
        OR v_normalized_key ~ '(api|access|secret|private|encryption|signing|service(role)?|publishable|supabase|openai|anthropic|deepseek)key$'
        OR v_normalized_key ~ '(access|refresh|auth|id|session|bearer)token$'
        OR v_normalized_key ~ '(authorization|clientsecret|password|databaseurl|connectionstring|sessioncookie)$'
      THEN
        RETURN TRUE;
      END IF;

      IF public._agent_json_has_sensitive_key(v_child) THEN
        RETURN TRUE;
      END IF;
    END LOOP;
  ELSIF jsonb_typeof(p_value) = 'array' THEN
    FOR v_child IN
      SELECT item.value
      FROM pg_catalog.jsonb_array_elements(p_value) AS item(value)
    LOOP
      IF public._agent_json_has_sensitive_key(v_child) THEN
        RETURN TRUE;
      END IF;
    END LOOP;
  END IF;

  RETURN FALSE;
END;
$$;

REVOKE ALL ON FUNCTION public._agent_json_has_sensitive_key(JSONB)
  FROM PUBLIC, anon, authenticated, service_role;

-- CHECK constraints execute this invoker function as the writing role. Authenticated legacy
-- writes and service-role Agent audit writes therefore need EXECUTE without receiving table writes.
GRANT EXECUTE ON FUNCTION public._agent_json_has_sensitive_key(JSONB)
  TO authenticated, service_role;

ALTER TABLE public.interview_sessions
  ADD COLUMN IF NOT EXISTS agent_version TEXT,
  ADD COLUMN IF NOT EXISTS agent_mode TEXT,
  ADD COLUMN IF NOT EXISTS agent_phase TEXT,
  ADD COLUMN IF NOT EXISTS "current_role" TEXT,
  ADD COLUMN IF NOT EXISTS agent_config JSONB,
  ADD COLUMN IF NOT EXISTS thread_id TEXT,
  ADD COLUMN IF NOT EXISTS research_status TEXT,
  ADD COLUMN IF NOT EXISTS last_event_seq BIGINT NOT NULL DEFAULT 0;

ALTER TABLE public.interview_sessions
  DROP CONSTRAINT IF EXISTS interview_sessions_agent_version_check,
  DROP CONSTRAINT IF EXISTS interview_sessions_agent_mode_check,
  DROP CONSTRAINT IF EXISTS interview_sessions_agent_phase_check,
  DROP CONSTRAINT IF EXISTS interview_sessions_current_role_check,
  DROP CONSTRAINT IF EXISTS interview_sessions_agent_config_check,
  DROP CONSTRAINT IF EXISTS interview_sessions_thread_id_check,
  DROP CONSTRAINT IF EXISTS interview_sessions_research_status_check,
  DROP CONSTRAINT IF EXISTS interview_sessions_last_event_seq_check,
  DROP CONSTRAINT IF EXISTS interview_sessions_agent_contract_check;

ALTER TABLE public.interview_sessions
  ADD CONSTRAINT interview_sessions_agent_version_check
    CHECK (agent_version IS NULL OR agent_version = 'agent-v1'),
  ADD CONSTRAINT interview_sessions_agent_mode_check
    CHECK (agent_mode IS NULL OR agent_mode IN ('single', 'panel')),
  ADD CONSTRAINT interview_sessions_agent_phase_check
    CHECK (
      agent_phase IS NULL OR agent_phase IN (
        'preparing',
        'awaiting_answer',
        'reasoning',
        'speaking',
        'scoring',
        'role_handoff',
        'reporting',
        'completed',
        'failed'
      )
    ),
  ADD CONSTRAINT interview_sessions_current_role_check
    CHECK ("current_role" IS NULL OR "current_role" IN ('general', 'technical', 'manager', 'hr')),
  ADD CONSTRAINT interview_sessions_agent_config_check
    CHECK (
      agent_config IS NULL OR (
        jsonb_typeof(agent_config) = 'object'
        AND NOT public._agent_json_has_sensitive_key(agent_config)
      )
    ),
  ADD CONSTRAINT interview_sessions_thread_id_check
    CHECK (thread_id IS NULL OR pg_catalog.length(thread_id) BETWEEN 1 AND 200),
  ADD CONSTRAINT interview_sessions_research_status_check
    CHECK (
      research_status IS NULL OR research_status IN (
        'pending', 'running', 'completed', 'skipped', 'failed'
      )
    ),
  ADD CONSTRAINT interview_sessions_last_event_seq_check
    CHECK (last_event_seq >= 0),
  ADD CONSTRAINT interview_sessions_agent_contract_check
    CHECK (
      (
        agent_version IS NULL
        AND agent_mode IS NULL
        AND agent_phase IS NULL
        AND "current_role" IS NULL
        AND agent_config IS NULL
        AND thread_id IS NULL
        AND research_status IS NULL
        AND last_event_seq = 0
      ) OR (
        agent_version IS NOT NULL
        AND agent_mode IS NOT NULL
        AND agent_phase IS NOT NULL
        AND "current_role" IS NOT NULL
        AND agent_config IS NOT NULL
        AND thread_id IS NOT NULL
        AND research_status IS NOT NULL
      )
    );

CREATE UNIQUE INDEX IF NOT EXISTS idx_interview_sessions_agent_thread
  ON public.interview_sessions(thread_id)
  WHERE thread_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_interview_sessions_user_agent
  ON public.interview_sessions(user_id, created_at DESC)
  WHERE agent_version IS NOT NULL;

-- Legacy clients keep their original write access only for rows that have no Agent discriminator.
-- Agent rows are read-only through PostgREST so writes cannot bypass operation/event RPCs or
-- delete a business session while leaving its private LangGraph checkpoints orphaned.
DROP POLICY IF EXISTS "Users manage own sessions" ON public.interview_sessions;
DROP POLICY IF EXISTS "Users read own sessions" ON public.interview_sessions;
DROP POLICY IF EXISTS "Users create legacy sessions" ON public.interview_sessions;
DROP POLICY IF EXISTS "Users update legacy sessions" ON public.interview_sessions;
DROP POLICY IF EXISTS "Users delete legacy sessions" ON public.interview_sessions;

CREATE POLICY "Users read own sessions"
  ON public.interview_sessions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users create legacy sessions"
  ON public.interview_sessions
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id AND agent_version IS NULL);

CREATE POLICY "Users update legacy sessions"
  ON public.interview_sessions
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id AND agent_version IS NULL)
  WITH CHECK (auth.uid() = user_id AND agent_version IS NULL);

CREATE POLICY "Users delete legacy sessions"
  ON public.interview_sessions
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id AND agent_version IS NULL);

CREATE TABLE IF NOT EXISTS public.agent_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.interview_sessions(id) ON DELETE CASCADE,
  sequence BIGINT NOT NULL CHECK (sequence > 0),
  type TEXT NOT NULL CHECK (
    type IN (
      'agent.snapshot',
      'agent.phase',
      'agent.role_changed',
      'agent.question_ready',
      'agent.message_delta',
      'agent.message_completed',
      'agent.score_completed',
      'agent.session_completed',
      'agent.error'
    )
  ),
  payload JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (
    jsonb_typeof(payload) = 'object'
    AND NOT public._agent_json_has_sensitive_key(payload)
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT agent_events_session_sequence_key UNIQUE (session_id, sequence)
);

CREATE INDEX IF NOT EXISTS idx_agent_events_created_at
  ON public.agent_events(created_at);

CREATE TABLE IF NOT EXISTS public.agent_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.interview_sessions(id) ON DELETE CASCADE,
  operation_key TEXT NOT NULL CHECK (pg_catalog.length(operation_key) BETWEEN 1 AND 200),
  node_name TEXT NOT NULL CHECK (pg_catalog.length(node_name) BETWEEN 1 AND 100),
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  result JSONB NOT NULL DEFAULT '{}'::JSONB,
  first_event_seq BIGINT CHECK (first_event_seq IS NULL OR first_event_seq > 0),
  last_event_seq BIGINT CHECK (last_event_seq IS NULL OR last_event_seq > 0),
  error_code TEXT CHECK (
    error_code IS NULL OR (
      pg_catalog.length(error_code) BETWEEN 1 AND 100
      AND error_code ~ '^[a-z0-9][a-z0-9_.-]*$'
    )
  ),
  claimed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT agent_operations_session_operation_key UNIQUE (session_id, operation_key),
  CONSTRAINT agent_operations_session_id_id_key UNIQUE (session_id, id),
  CONSTRAINT agent_operations_result_check CHECK (
    jsonb_typeof(result) = 'object'
    AND NOT public._agent_json_has_sensitive_key(result)
  ),
  CONSTRAINT agent_operations_event_range_check CHECK (
    (first_event_seq IS NULL AND last_event_seq IS NULL)
    OR (
      first_event_seq IS NOT NULL
      AND last_event_seq IS NOT NULL
      AND first_event_seq <= last_event_seq
    )
  ),
  CONSTRAINT agent_operations_status_timestamps_check CHECK (
    (
      status = 'pending'
      AND claimed_at IS NULL
      AND completed_at IS NULL
      AND first_event_seq IS NULL
      AND last_event_seq IS NULL
      AND error_code IS NULL
    ) OR (
      status = 'running'
      AND claimed_at IS NOT NULL
      AND completed_at IS NULL
      AND first_event_seq IS NULL
      AND last_event_seq IS NULL
      AND error_code IS NULL
    ) OR (
      status = 'completed'
      AND claimed_at IS NOT NULL
      AND completed_at IS NOT NULL
      AND first_event_seq IS NOT NULL
      AND last_event_seq IS NOT NULL
      AND error_code IS NULL
    ) OR (
      status = 'failed'
      AND claimed_at IS NOT NULL
      AND completed_at IS NULL
      AND first_event_seq IS NULL
      AND last_event_seq IS NULL
      AND error_code IS NOT NULL
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_agent_operations_status
  ON public.agent_operations(status, updated_at);

CREATE TABLE IF NOT EXISTS public.agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.interview_sessions(id) ON DELETE CASCADE,
  operation_id UUID,
  operation_key TEXT NOT NULL CHECK (pg_catalog.length(operation_key) BETWEEN 1 AND 200),
  node_name TEXT NOT NULL CHECK (pg_catalog.length(node_name) BETWEEN 1 AND 100),
  attempt SMALLINT NOT NULL DEFAULT 1 CHECK (attempt > 0),
  status TEXT NOT NULL CHECK (
    status IN ('running', 'completed', 'failed', 'cancelled', 'interrupted')
  ),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  duration_ms BIGINT CHECK (duration_ms IS NULL OR duration_ms >= 0),
  input_hash TEXT CHECK (input_hash IS NULL OR pg_catalog.length(input_hash) <= 128),
  output_summary TEXT,
  model_provider TEXT,
  model_name TEXT,
  prompt_tokens INTEGER CHECK (prompt_tokens IS NULL OR prompt_tokens >= 0),
  completion_tokens INTEGER CHECK (completion_tokens IS NULL OR completion_tokens >= 0),
  total_tokens INTEGER CHECK (total_tokens IS NULL OR total_tokens >= 0),
  error_code TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT agent_runs_session_operation_fkey
    FOREIGN KEY (session_id, operation_id)
    REFERENCES public.agent_operations(session_id, id)
    ON DELETE CASCADE,
  CONSTRAINT agent_runs_session_operation_attempt_key
    UNIQUE (session_id, operation_key, attempt),
  CONSTRAINT agent_runs_timestamps_check
    CHECK (completed_at IS NULL OR completed_at >= started_at)
);

-- A composite SET NULL action would also null the NOT NULL session_id column. CASCADE keeps the
-- run/session relationship valid and is consistent with the existing session-level cleanup cascade.
ALTER TABLE public.agent_runs
  DROP CONSTRAINT IF EXISTS agent_runs_session_operation_fkey;
ALTER TABLE public.agent_runs
  ADD CONSTRAINT agent_runs_session_operation_fkey
  FOREIGN KEY (session_id, operation_id)
  REFERENCES public.agent_operations(session_id, id)
  ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_agent_runs_session_started
  ON public.agent_runs(session_id, started_at DESC);

ALTER TABLE public.interview_messages
  ADD COLUMN IF NOT EXISTS role_id TEXT,
  ADD COLUMN IF NOT EXISTS agent_run_id UUID REFERENCES public.agent_runs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sequence BIGINT,
  ADD COLUMN IF NOT EXISTS message_kind TEXT;

ALTER TABLE public.interview_messages
  DROP CONSTRAINT IF EXISTS interview_messages_role_id_check,
  DROP CONSTRAINT IF EXISTS interview_messages_sequence_check,
  DROP CONSTRAINT IF EXISTS interview_messages_message_kind_check,
  DROP CONSTRAINT IF EXISTS interview_messages_agent_contract_check;

ALTER TABLE public.interview_messages
  ADD CONSTRAINT interview_messages_role_id_check
    CHECK (role_id IS NULL OR role_id IN ('general', 'technical', 'manager', 'hr')),
  ADD CONSTRAINT interview_messages_sequence_check
    CHECK (sequence IS NULL OR sequence > 0),
  ADD CONSTRAINT interview_messages_message_kind_check
    CHECK (
      message_kind IS NULL OR message_kind IN (
        'question',
        'follow_up',
        'redirect',
        'answer',
        'role_handoff',
        'system',
        'feedback',
        'report'
      )
    ),
  ADD CONSTRAINT interview_messages_agent_contract_check
    CHECK (
      (
        role_id IS NULL
        AND agent_run_id IS NULL
        AND sequence IS NULL
        AND message_kind IS NULL
      ) OR (
        role_id IS NOT NULL
        AND sequence IS NOT NULL
        AND message_kind IS NOT NULL
        AND (
          (role = 'user' AND message_kind = 'answer')
          OR (
            role = 'assistant'
            AND message_kind IN (
              'question',
              'follow_up',
              'redirect',
              'role_handoff',
              'system',
              'feedback',
              'report'
            )
          )
        )
      )
    );

CREATE INDEX IF NOT EXISTS idx_interview_messages_agent_run
  ON public.interview_messages(agent_run_id)
  WHERE agent_run_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_interview_messages_question_sequence
  ON public.interview_messages(question_id, sequence)
  WHERE sequence IS NOT NULL;

ALTER TABLE public.agent_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_runs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.agent_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.agent_operations FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.agent_runs FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.agent_events TO authenticated;
GRANT SELECT ON TABLE public.agent_operations TO authenticated;
GRANT SELECT ON TABLE public.agent_runs TO authenticated;

GRANT ALL ON TABLE public.agent_events TO service_role;
GRANT ALL ON TABLE public.agent_operations TO service_role;
GRANT ALL ON TABLE public.agent_runs TO service_role;

DROP POLICY IF EXISTS "Users read own agent events" ON public.agent_events;
CREATE POLICY "Users read own agent events"
  ON public.agent_events
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.interview_sessions AS session
      WHERE session.id = agent_events.session_id
        AND session.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users read own agent operations" ON public.agent_operations;
CREATE POLICY "Users read own agent operations"
  ON public.agent_operations
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.interview_sessions AS session
      WHERE session.id = agent_operations.session_id
        AND session.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users read own agent runs" ON public.agent_runs;
CREATE POLICY "Users read own agent runs"
  ON public.agent_runs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.interview_sessions AS session
      WHERE session.id = agent_runs.session_id
        AND session.user_id = auth.uid()
    )
  );

-- Create an Agent session and its first durable snapshot in one transaction.
CREATE OR REPLACE FUNCTION public.create_agent_interview_session(p_session JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_session_id UUID := gen_random_uuid();
  v_mode TEXT;
  v_interview_mode TEXT;
  v_position TEXT;
  v_difficulty TEXT;
  v_question_count INTEGER;
  v_question_count_numeric NUMERIC;
  v_current_role TEXT;
  v_research_enabled BOOLEAN;
  v_research_status TEXT;
  v_model_provider TEXT;
  v_model_name TEXT;
  v_skill_id TEXT;
  v_resume_id UUID;
  v_job_description TEXT;
  v_target_company TEXT;
  v_prompt_version TEXT;
  v_agent_config JSONB;
  v_snapshot JSONB;
  v_result JSONB;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  IF p_session IS NULL OR jsonb_typeof(p_session) <> 'object' THEN
    RAISE EXCEPTION 'Session payload must be a JSON object' USING ERRCODE = '22023';
  END IF;

  IF public._agent_json_has_sensitive_key(p_session) THEN
    RAISE EXCEPTION 'Session payload contains a forbidden sensitive field' USING ERRCODE = '22023';
  END IF;

  -- The database repeats the HTTP strict-object boundary because this definer RPC is callable through PostgREST.
  IF (
    p_session - ARRAY[
      'mode',
      'interviewMode',
      'position',
      'difficulty',
      'questionCount',
      'jobDescription',
      'targetCompany',
      'skillId',
      'resumeId',
      'modelProvider',
      'modelName',
      'webResearch',
      'promptVersion'
    ]::TEXT[]
  ) <> '{}'::JSONB THEN
    RAISE EXCEPTION 'Session payload contains unsupported fields' USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(p_session->'mode') IS DISTINCT FROM 'string'
    OR jsonb_typeof(p_session->'interviewMode') IS DISTINCT FROM 'string'
    OR jsonb_typeof(p_session->'position') IS DISTINCT FROM 'string'
    OR jsonb_typeof(p_session->'difficulty') IS DISTINCT FROM 'string'
    OR jsonb_typeof(p_session->'questionCount') IS DISTINCT FROM 'number'
  THEN
    RAISE EXCEPTION 'Session payload has invalid required field types' USING ERRCODE = '22023';
  END IF;

  IF (p_session ? 'jobDescription' AND jsonb_typeof(p_session->'jobDescription') IS DISTINCT FROM 'string')
    OR (p_session ? 'targetCompany' AND jsonb_typeof(p_session->'targetCompany') IS DISTINCT FROM 'string')
    OR (p_session ? 'skillId' AND jsonb_typeof(p_session->'skillId') IS DISTINCT FROM 'string')
    OR (p_session ? 'resumeId' AND jsonb_typeof(p_session->'resumeId') IS DISTINCT FROM 'string')
    OR (p_session ? 'modelProvider' AND jsonb_typeof(p_session->'modelProvider') IS DISTINCT FROM 'string')
    OR (p_session ? 'modelName' AND jsonb_typeof(p_session->'modelName') IS DISTINCT FROM 'string')
    OR (p_session ? 'webResearch' AND jsonb_typeof(p_session->'webResearch') IS DISTINCT FROM 'boolean')
    OR (p_session ? 'promptVersion' AND jsonb_typeof(p_session->'promptVersion') IS DISTINCT FROM 'string')
  THEN
    RAISE EXCEPTION 'Session payload has invalid optional field types' USING ERRCODE = '22023';
  END IF;

  v_mode := p_session->>'mode';
  IF v_mode IS NULL OR v_mode NOT IN ('single', 'panel') THEN
    RAISE EXCEPTION 'Invalid Agent mode' USING ERRCODE = '22023';
  END IF;

  v_interview_mode := p_session->>'interviewMode';
  IF v_interview_mode NOT IN ('text', 'voice') THEN
    RAISE EXCEPTION 'Invalid interview mode' USING ERRCODE = '22023';
  END IF;

  v_position := pg_catalog.btrim(COALESCE(p_session->>'position', ''));
  IF pg_catalog.length(v_position) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Position must contain 1 to 100 characters' USING ERRCODE = '22023';
  END IF;

  v_difficulty := p_session->>'difficulty';
  IF v_difficulty IS NULL OR v_difficulty NOT IN ('初级', '中级', '高级') THEN
    RAISE EXCEPTION 'Invalid difficulty' USING ERRCODE = '22023';
  END IF;

  v_question_count_numeric := (p_session->>'questionCount')::NUMERIC;
  IF v_question_count_numeric <> pg_catalog.trunc(v_question_count_numeric)
    OR v_question_count_numeric NOT BETWEEN 3 AND 10
  THEN
    RAISE EXCEPTION 'Question count must be between 3 and 10' USING ERRCODE = '22023';
  END IF;
  v_question_count := v_question_count_numeric::INTEGER;

  v_research_enabled := COALESCE((p_session->>'webResearch')::BOOLEAN, TRUE);
  v_research_status := CASE WHEN v_research_enabled THEN 'pending' ELSE 'skipped' END;

  v_model_provider := COALESCE(NULLIF(p_session->>'modelProvider', ''), 'deepseek');
  IF v_model_provider NOT IN ('deepseek', 'openai', 'anthropic') THEN
    RAISE EXCEPTION 'Invalid model provider' USING ERRCODE = '22023';
  END IF;

  v_model_name := NULLIF(pg_catalog.btrim(COALESCE(p_session->>'modelName', '')), '');
  IF v_model_name IS NULL THEN
    v_model_name := CASE v_model_provider
      WHEN 'deepseek' THEN 'deepseek-v4-flash'
      WHEN 'openai' THEN 'gpt-4o'
      WHEN 'anthropic' THEN 'claude-3-sonnet-20240229'
    END;
  END IF;
  IF pg_catalog.length(v_model_name) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Model name must contain 1 to 100 characters' USING ERRCODE = '22023';
  END IF;

  v_skill_id := NULLIF(pg_catalog.btrim(COALESCE(p_session->>'skillId', '')), '');
  IF v_skill_id IS NOT NULL AND pg_catalog.length(v_skill_id) > 100 THEN
    RAISE EXCEPTION 'Skill id is too long' USING ERRCODE = '22023';
  END IF;

  IF NULLIF(p_session->>'resumeId', '') IS NOT NULL THEN
    BEGIN
      v_resume_id := (p_session->>'resumeId')::UUID;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'Invalid resume id' USING ERRCODE = '22023';
    END;

    -- A definer function bypasses resume RLS, so ownership must be checked explicitly before linking it.
    PERFORM 1
    FROM public.resumes AS resume
    WHERE resume.id = v_resume_id
      AND resume.user_id = v_user_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Resume not found' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  v_job_description := NULLIF(pg_catalog.btrim(COALESCE(p_session->>'jobDescription', '')), '');
  IF v_job_description IS NOT NULL AND pg_catalog.length(v_job_description) > 2000 THEN
    RAISE EXCEPTION 'Job description is too long' USING ERRCODE = '22023';
  END IF;

  v_target_company := NULLIF(pg_catalog.btrim(COALESCE(p_session->>'targetCompany', '')), '');
  IF v_target_company IS NOT NULL AND pg_catalog.length(v_target_company) > 100 THEN
    RAISE EXCEPTION 'Target company is too long' USING ERRCODE = '22023';
  END IF;

  v_prompt_version := COALESCE(
    NULLIF(pg_catalog.btrim(COALESCE(p_session->>'promptVersion', '')), ''),
    'agent-v1'
  );
  IF pg_catalog.length(v_prompt_version) NOT BETWEEN 1 AND 100
    OR v_prompt_version !~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
  THEN
    RAISE EXCEPTION 'Invalid prompt version' USING ERRCODE = '22023';
  END IF;

  v_current_role := CASE WHEN v_mode = 'panel' THEN 'technical' ELSE 'general' END;

  -- Build the frozen configuration from explicit scalar fields so credentials and raw files cannot enter Agent state.
  v_agent_config := jsonb_build_object(
    'interviewMode', v_interview_mode,
    'position', v_position,
    'difficulty', v_difficulty,
    'questionCount', v_question_count,
    'jobDescription', v_job_description,
    'targetCompany', v_target_company,
    'skillId', v_skill_id,
    'resumeId', v_resume_id,
    'modelProvider', v_model_provider,
    'modelName', v_model_name,
    'webResearch', v_research_enabled,
    'promptVersion', v_prompt_version
  );

  INSERT INTO public.interview_sessions (
    id,
    user_id,
    position,
    difficulty,
    job_description,
    status,
    target_company,
    skill_id,
    resume_id,
    model_provider,
    model_name,
    interview_mode,
    voice_mode,
    requested_count,
    generation_status,
    last_activity_at,
    agent_version,
    agent_mode,
    agent_phase,
    "current_role",
    agent_config,
    thread_id,
    research_status,
    last_event_seq
  ) VALUES (
    v_session_id,
    v_user_id,
    v_position,
    v_difficulty,
    v_job_description,
    'in_progress',
    v_target_company,
    v_skill_id,
    v_resume_id,
    v_model_provider,
    v_model_name,
    v_interview_mode,
    v_interview_mode = 'voice',
    v_question_count,
    'ready',
    now(),
    'agent-v1',
    v_mode,
    'preparing',
    v_current_role,
    v_agent_config,
    v_session_id::TEXT,
    v_research_status,
    0
  );

  v_snapshot := jsonb_build_object(
    'sessionId', v_session_id,
    'threadId', v_session_id::TEXT,
    'version', 'agent-v1',
    'mode', v_mode,
    'interviewMode', v_interview_mode,
    'phase', 'preparing',
    'currentRole', v_current_role,
    'currentQuestionId', NULL,
    'currentQuestionIndex', 0,
    'followUpCount', 0,
    'pendingAction', 'ask',
    'eventCursor', 1
  );

  INSERT INTO public.agent_events (session_id, sequence, type, payload)
  VALUES (v_session_id, 1, 'agent.snapshot', v_snapshot);

  v_result := jsonb_build_object(
    'sessionId', v_session_id,
    'threadId', v_session_id::TEXT,
    'phase', 'preparing',
    'eventCursor', 1
  );

  INSERT INTO public.agent_operations (
    session_id,
    operation_key,
    node_name,
    status,
    result,
    first_event_seq,
    last_event_seq,
    claimed_at,
    completed_at
  ) VALUES (
    v_session_id,
    'session:create',
    'create_session',
    'completed',
    v_result,
    1,
    1,
    now(),
    now()
  );

  UPDATE public.interview_sessions
  SET last_event_seq = 1
  WHERE id = v_session_id;

  RETURN v_result;
END;
$$;

-- Claim an input/node operation before invoking or resuming the graph.
CREATE OR REPLACE FUNCTION public.claim_agent_operation(
  p_session_id UUID,
  p_operation_key TEXT,
  p_node_name TEXT
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
  v_agent_mode TEXT;
  v_interview_mode TEXT;
  v_thread_id TEXT;
  v_operation public.agent_operations%ROWTYPE;
BEGIN
  IF v_authenticated_user IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  p_operation_key := pg_catalog.btrim(COALESCE(p_operation_key, ''));
  p_node_name := pg_catalog.btrim(COALESCE(p_node_name, ''));
  IF pg_catalog.length(p_operation_key) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'Invalid operation key' USING ERRCODE = '22023';
  END IF;
  IF pg_catalog.length(p_node_name) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Invalid node name' USING ERRCODE = '22023';
  END IF;

  -- The session lock serializes claims and sequence allocation for one interview.
  SELECT session.user_id, session.agent_version
  INTO v_session_user, v_agent_version
  FROM public.interview_sessions AS session
  WHERE session.id = p_session_id
  FOR UPDATE;

  IF NOT FOUND OR v_session_user <> v_authenticated_user OR v_agent_version <> 'agent-v1' THEN
    RAISE EXCEPTION 'Agent session not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT operation.*
  INTO v_operation
  FROM public.agent_operations AS operation
  WHERE operation.session_id = p_session_id
    AND operation.operation_key = p_operation_key;

  IF FOUND THEN
    IF v_operation.node_name <> p_node_name THEN
      RAISE EXCEPTION 'Operation key is already assigned to another node' USING ERRCODE = '23505';
    END IF;

    IF v_operation.status = 'completed' THEN
      RETURN jsonb_build_object(
        'claimed', FALSE,
        'duplicate', TRUE,
        'inProgress', FALSE,
        'status', 'completed',
        'operationKey', v_operation.operation_key,
        'nodeName', v_operation.node_name,
        'result', v_operation.result,
        'firstEventSequence', v_operation.first_event_seq,
        'lastEventSequence', v_operation.last_event_seq
      );
    END IF;

    IF v_operation.status IN ('pending', 'running') THEN
      RETURN jsonb_build_object(
        'claimed', FALSE,
        'duplicate', FALSE,
        'inProgress', TRUE,
        'status', v_operation.status,
        'operationKey', v_operation.operation_key,
        'nodeName', v_operation.node_name,
        'result', NULL,
        'firstEventSequence', NULL,
        'lastEventSequence', NULL
      );
    END IF;

    -- Explicitly failed work may be claimed again by a retry request.
    UPDATE public.agent_operations
    SET status = 'running',
        result = '{}'::JSONB,
        first_event_seq = NULL,
        last_event_seq = NULL,
        error_code = NULL,
        claimed_at = now(),
        completed_at = NULL,
        updated_at = now()
    WHERE id = v_operation.id;

    RETURN jsonb_build_object(
      'claimed', TRUE,
      'duplicate', FALSE,
      'inProgress', FALSE,
      'status', 'running',
      'operationKey', p_operation_key,
      'nodeName', p_node_name,
      'result', NULL,
      'firstEventSequence', NULL,
      'lastEventSequence', NULL
    );
  END IF;

  INSERT INTO public.agent_operations (
    session_id,
    operation_key,
    node_name,
    status,
    claimed_at
  ) VALUES (
    p_session_id,
    p_operation_key,
    p_node_name,
    'running',
    now()
  );

  RETURN jsonb_build_object(
    'claimed', TRUE,
    'duplicate', FALSE,
    'inProgress', FALSE,
    'status', 'running',
    'operationKey', p_operation_key,
    'nodeName', p_node_name,
    'result', NULL,
    'firstEventSequence', NULL,
    'lastEventSequence', NULL
  );
END;
$$;

-- Atomically commit the business projection and its durable client events.
CREATE OR REPLACE FUNCTION public.commit_agent_operation(
  p_session_id UUID,
  p_operation_key TEXT,
  p_node_name TEXT,
  p_agent_phase TEXT,
  p_current_role TEXT,
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
  v_agent_mode TEXT;
  v_interview_mode TEXT;
  v_thread_id TEXT;
  v_last_sequence BIGINT;
  v_first_sequence BIGINT;
  v_event JSONB;
  v_event_type TEXT;
  v_event_data JSONB;
  v_operation public.agent_operations%ROWTYPE;
  v_operation_exists BOOLEAN := FALSE;
BEGIN
  IF v_authenticated_user IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  p_operation_key := pg_catalog.btrim(COALESCE(p_operation_key, ''));
  p_node_name := pg_catalog.btrim(COALESCE(p_node_name, ''));
  IF pg_catalog.length(p_operation_key) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'Invalid operation key' USING ERRCODE = '22023';
  END IF;
  IF pg_catalog.length(p_node_name) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Invalid node name' USING ERRCODE = '22023';
  END IF;

  -- Sequence allocation and operation completion share this session-level lock and transaction.
  SELECT
    session.user_id,
    session.agent_version,
    session.agent_mode,
    session.interview_mode,
    session.thread_id,
    session.last_event_seq
  INTO
    v_session_user,
    v_agent_version,
    v_agent_mode,
    v_interview_mode,
    v_thread_id,
    v_last_sequence
  FROM public.interview_sessions AS session
  WHERE session.id = p_session_id
  FOR UPDATE;

  IF NOT FOUND OR v_session_user <> v_authenticated_user OR v_agent_version <> 'agent-v1' THEN
    RAISE EXCEPTION 'Agent session not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT operation.*
  INTO v_operation
  FROM public.agent_operations AS operation
  WHERE operation.session_id = p_session_id
    AND operation.operation_key = p_operation_key;
  v_operation_exists := FOUND;

  IF NOT v_operation_exists THEN
    RAISE EXCEPTION 'Agent operation must be claimed before commit' USING ERRCODE = 'P0002';
  END IF;

  IF v_operation.node_name <> p_node_name THEN
    RAISE EXCEPTION 'Operation key is already assigned to another node' USING ERRCODE = '23505';
  END IF;

  -- A replay returns the first committed result without validating or writing the repeated payload.
  IF v_operation.status = 'completed' THEN
    RETURN jsonb_build_object(
      'committed', FALSE,
      'duplicate', TRUE,
      'inProgress', FALSE,
      'status', 'completed',
      'operationKey', v_operation.operation_key,
      'nodeName', v_operation.node_name,
      'result', v_operation.result,
      'firstEventSequence', v_operation.first_event_seq,
      'lastEventSequence', v_operation.last_event_seq
    );
  END IF;

  -- fail and commit race under the same session lock; only the still-running claimant may win.
  IF v_operation.status <> 'running' THEN
    RAISE EXCEPTION 'Agent operation is not running' USING ERRCODE = '55000';
  END IF;

  IF p_agent_phase IS NULL OR p_agent_phase NOT IN (
    'preparing',
    'awaiting_answer',
    'reasoning',
    'speaking',
    'scoring',
    'role_handoff',
    'reporting',
    'completed',
    'failed'
  ) THEN
    RAISE EXCEPTION 'Invalid Agent phase' USING ERRCODE = '22023';
  END IF;

  IF p_current_role IS NULL OR p_current_role NOT IN ('general', 'technical', 'manager', 'hr') THEN
    RAISE EXCEPTION 'Invalid Agent role' USING ERRCODE = '22023';
  END IF;

  p_result := COALESCE(p_result, '{}'::JSONB);
  IF jsonb_typeof(p_result) <> 'object' THEN
    RAISE EXCEPTION 'Operation result must be a JSON object' USING ERRCODE = '22023';
  END IF;
  IF public._agent_json_has_sensitive_key(p_result) THEN
    RAISE EXCEPTION 'Operation result contains a forbidden sensitive field' USING ERRCODE = '22023';
  END IF;

  IF p_events IS NULL
    OR jsonb_typeof(p_events) <> 'array'
    OR jsonb_array_length(p_events) NOT BETWEEN 1 AND 50
  THEN
    RAISE EXCEPTION 'Events must be an array containing 1 to 50 items' USING ERRCODE = '22023';
  END IF;
  IF public._agent_json_has_sensitive_key(p_events) THEN
    RAISE EXCEPTION 'Event payload contains a forbidden sensitive field' USING ERRCODE = '22023';
  END IF;

  v_first_sequence := v_last_sequence + 1;
  FOR v_event IN
    SELECT item.value
    FROM pg_catalog.jsonb_array_elements(p_events)
      WITH ORDINALITY AS item(value, ordinal)
    ORDER BY item.ordinal
  LOOP
    IF jsonb_typeof(v_event) <> 'object'
      OR (v_event - 'type' - 'data') <> '{}'::JSONB
      OR NOT (v_event ? 'type')
      OR NOT (v_event ? 'data')
    THEN
      RAISE EXCEPTION 'Each event must contain only type and data' USING ERRCODE = '22023';
    END IF;

    v_event_type := v_event->>'type';
    IF v_event_type IS NULL OR v_event_type NOT IN (
      'agent.snapshot',
      'agent.phase',
      'agent.role_changed',
      'agent.question_ready',
      'agent.message_delta',
      'agent.message_completed',
      'agent.score_completed',
      'agent.session_completed',
      'agent.error'
    ) THEN
      RAISE EXCEPTION 'Invalid Agent event type' USING ERRCODE = '22023';
    END IF;

    v_event_data := v_event->'data';
    IF jsonb_typeof(v_event_data) <> 'object' THEN
      RAISE EXCEPTION 'Agent event data must be a JSON object' USING ERRCODE = '22023';
    END IF;

    IF v_event_type = 'agent.phase'
      AND v_event_data->>'phase' IS DISTINCT FROM p_agent_phase THEN
      RAISE EXCEPTION 'Phase event does not match the committed projection' USING ERRCODE = '22023';
    END IF;

    v_last_sequence := v_last_sequence + 1;

    IF v_event_type = 'agent.snapshot' THEN
      IF v_event_data->>'sessionId' IS DISTINCT FROM p_session_id::TEXT
        OR v_event_data->>'threadId' IS DISTINCT FROM v_thread_id
        OR v_event_data->>'version' IS DISTINCT FROM v_agent_version
        OR v_event_data->>'mode' IS DISTINCT FROM v_agent_mode
        OR v_event_data->>'interviewMode' IS DISTINCT FROM v_interview_mode
        OR v_event_data->>'phase' IS DISTINCT FROM p_agent_phase
        OR v_event_data->>'currentRole' IS DISTINCT FROM p_current_role
      THEN
        RAISE EXCEPTION 'Snapshot event does not match the committed session projection'
          USING ERRCODE = '22023';
      END IF;

      -- The caller cannot know the final sequence under concurrency; the locked allocator is authoritative.
      v_event_data := pg_catalog.jsonb_set(
        v_event_data,
        '{eventCursor}',
        pg_catalog.to_jsonb(v_last_sequence),
        TRUE
      );
    END IF;

    IF v_event_type = 'agent.role_changed'
      AND v_event_data->>'roleId' IS DISTINCT FROM p_current_role THEN
      RAISE EXCEPTION 'Role event does not match the committed projection' USING ERRCODE = '22023';
    END IF;

    IF v_event_type = 'agent.session_completed'
      AND (
        p_agent_phase <> 'completed'
        OR v_event_data->>'sessionId' IS DISTINCT FROM p_session_id::TEXT
      )
    THEN
      RAISE EXCEPTION 'Completed event does not match the committed session' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.agent_events (session_id, sequence, type, payload)
    VALUES (p_session_id, v_last_sequence, v_event_type, v_event_data);
  END LOOP;

  UPDATE public.interview_sessions
  SET agent_phase = p_agent_phase,
      "current_role" = p_current_role,
      last_event_seq = v_last_sequence,
      last_activity_at = now(),
      status = CASE
        WHEN p_agent_phase = 'completed' THEN 'completed'
        WHEN p_agent_phase = 'failed' THEN 'failed'
        ELSE status
      END
  WHERE id = p_session_id;

  UPDATE public.agent_operations
  SET status = 'completed',
      result = p_result,
      first_event_seq = v_first_sequence,
      last_event_seq = v_last_sequence,
      error_code = NULL,
      completed_at = now(),
      updated_at = now()
  WHERE id = v_operation.id;

  RETURN jsonb_build_object(
    'committed', TRUE,
    'duplicate', FALSE,
    'inProgress', FALSE,
    'status', 'completed',
    'operationKey', p_operation_key,
    'nodeName', p_node_name,
    'result', p_result,
    'firstEventSequence', v_first_sequence,
    'lastEventSequence', v_last_sequence
  );
END;
$$;

-- Mark a claimed operation failed without persisting raw exception text or credentials.
CREATE OR REPLACE FUNCTION public.fail_agent_operation(
  p_session_id UUID,
  p_operation_key TEXT,
  p_error_code TEXT
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
  v_operation public.agent_operations%ROWTYPE;
BEGIN
  IF v_authenticated_user IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  p_operation_key := pg_catalog.btrim(COALESCE(p_operation_key, ''));
  p_error_code := pg_catalog.lower(pg_catalog.btrim(COALESCE(p_error_code, '')));
  IF pg_catalog.length(p_operation_key) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'Invalid operation key' USING ERRCODE = '22023';
  END IF;
  IF pg_catalog.length(p_error_code) NOT BETWEEN 1 AND 100
    OR p_error_code !~ '^[a-z0-9][a-z0-9_.-]*$'
  THEN
    RAISE EXCEPTION 'Invalid operation error code' USING ERRCODE = '22023';
  END IF;

  SELECT session.user_id, session.agent_version
  INTO v_session_user, v_agent_version
  FROM public.interview_sessions AS session
  WHERE session.id = p_session_id
  FOR UPDATE;

  IF NOT FOUND OR v_session_user <> v_authenticated_user OR v_agent_version <> 'agent-v1' THEN
    RAISE EXCEPTION 'Agent session not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT operation.*
  INTO v_operation
  FROM public.agent_operations AS operation
  WHERE operation.session_id = p_session_id
    AND operation.operation_key = p_operation_key;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agent operation not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_operation.status = 'completed' THEN
    RETURN jsonb_build_object(
      'failed', FALSE,
      'duplicate', TRUE,
      'status', 'completed',
      'operationKey', v_operation.operation_key,
      'result', v_operation.result,
      'firstEventSequence', v_operation.first_event_seq,
      'lastEventSequence', v_operation.last_event_seq
    );
  END IF;

  UPDATE public.agent_operations
  SET status = 'failed',
      error_code = p_error_code,
      completed_at = NULL,
      updated_at = now()
  WHERE id = v_operation.id;

  RETURN jsonb_build_object(
    'failed', TRUE,
    'duplicate', FALSE,
    'status', 'failed',
    'operationKey', v_operation.operation_key,
    'errorCode', p_error_code
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_agent_interview_session(JSONB)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.claim_agent_operation(UUID, TEXT, TEXT)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.commit_agent_operation(UUID, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fail_agent_operation(UUID, TEXT, TEXT)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_agent_interview_session(JSONB)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_agent_operation(UUID, TEXT, TEXT)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.commit_agent_operation(UUID, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.fail_agent_operation(UUID, TEXT, TEXT)
  TO authenticated;

COMMENT ON COLUMN public.interview_sessions.agent_version IS
  'Nullable discriminator; null identifies a legacy read-only session and agent-v1 identifies the new graph flow.';
COMMENT ON COLUMN public.interview_sessions.agent_mode IS
  'Frozen Agent experience mode: single interviewer or fixed-stage panel.';
COMMENT ON COLUMN public.interview_sessions.agent_phase IS
  'Current durable graph phase projected for API snapshots.';
COMMENT ON COLUMN public.interview_sessions."current_role" IS
  'Current interviewer persona projected by the Agent graph.';
COMMENT ON COLUMN public.interview_sessions.agent_config IS
  'Frozen, credential-free Agent configuration built from an explicit input allowlist.';
COMMENT ON COLUMN public.interview_sessions.thread_id IS
  'LangGraph thread identifier; Agent v1 uses the interview session UUID as text.';
COMMENT ON COLUMN public.interview_sessions.research_status IS
  'Pre-interview web research lifecycle without exposing research content during the interview.';
COMMENT ON COLUMN public.interview_sessions.last_event_seq IS
  'Last committed durable Agent event sequence and SSE cursor for this session.';

COMMENT ON TABLE public.agent_events IS
  'Committed Agent event log used for SSE replay; Redis or process notifications are wakeups only.';
COMMENT ON COLUMN public.agent_events.sequence IS
  'Strictly increasing per-session cursor allocated while holding the session row lock.';
COMMENT ON COLUMN public.agent_events.payload IS
  'Credential-free event data projected only after the surrounding transaction commits.';

COMMENT ON TABLE public.agent_operations IS
  'Per-session idempotency ledger for input IDs and deterministic side-effect operation keys.';
COMMENT ON COLUMN public.agent_operations.operation_key IS
  'Deterministic key such as input:<inputId> or <node>:<logical-id>:<version>.';
COMMENT ON COLUMN public.agent_operations.result IS
  'First committed structured result returned unchanged to duplicate claims or commits.';

COMMENT ON TABLE public.agent_runs IS
  'Node-attempt audit records for latency, model usage, failures, and reproducibility analysis.';
COMMENT ON COLUMN public.agent_runs.input_hash IS
  'Hash of the sanitized node input; raw prompts, credentials, and full resume files are excluded.';
COMMENT ON COLUMN public.agent_runs.output_summary IS
  'Bounded sanitized summary for audit, not the complete model response.';

COMMENT ON COLUMN public.interview_messages.role_id IS
  'Nullable Agent persona identifier; legacy messages keep null.';
COMMENT ON COLUMN public.interview_messages.agent_run_id IS
  'Optional audit run that produced or persisted this message.';
COMMENT ON COLUMN public.interview_messages.sequence IS
  'Durable Agent event sequence associated with this completed message.';
COMMENT ON COLUMN public.interview_messages.message_kind IS
  'Agent message purpose; nullable for legacy dialogue rows.';

COMMENT ON FUNCTION public.create_agent_interview_session(JSONB) IS
  'Creates an owned Agent session, frozen safe config, initial snapshot event, and completed create operation atomically.';
COMMENT ON FUNCTION public.claim_agent_operation(UUID, TEXT, TEXT) IS
  'Claims an idempotent node/input operation under a session lock before graph invocation or resume.';
COMMENT ON FUNCTION public.commit_agent_operation(UUID, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB) IS
  'Atomically updates the Agent projection, appends sequenced events, and freezes the operation result.';
COMMENT ON FUNCTION public.fail_agent_operation(UUID, TEXT, TEXT) IS
  'Marks a claimed operation failed using a sanitized error code so an explicit retry may reclaim it.';
