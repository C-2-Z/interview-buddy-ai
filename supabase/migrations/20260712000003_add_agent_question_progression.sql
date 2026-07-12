-- Interview Agent Phase 3: idempotent dynamic question progression and role handoff events.

CREATE OR REPLACE FUNCTION public.commit_agent_next_question(
  p_session_id UUID,
  p_question JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_authenticated_user UUID := auth.uid();
  v_session public.interview_sessions%ROWTYPE;
  v_operation public.agent_operations%ROWTYPE;
  v_operation_key TEXT;
  v_question_id UUID;
  v_bank_question_id UUID;
  v_order_index INTEGER;
  v_order_numeric NUMERIC;
  v_role_id TEXT;
  v_dimension_key TEXT;
  v_source TEXT;
  v_stage JSONB;
  v_role_changed BOOLEAN;
  v_first_event_sequence BIGINT;
  v_event_sequence BIGINT;
  v_created_at TIMESTAMPTZ := now();
  v_result JSONB;
BEGIN
  IF v_authenticated_user IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  IF p_question IS NULL
    OR jsonb_typeof(p_question) <> 'object'
    OR (p_question - ARRAY['id','orderIndex','question','roleId','dimensionKey','source','bankQuestionId']::TEXT[]) <> '{}'::JSONB
    OR jsonb_typeof(p_question->'orderIndex') IS DISTINCT FROM 'number'
  THEN
    RAISE EXCEPTION 'Invalid next question payload' USING ERRCODE = '22023';
  END IF;

  BEGIN
    v_question_id := (p_question->>'id')::UUID;
    IF NULLIF(p_question->>'bankQuestionId', '') IS NOT NULL THEN
      v_bank_question_id := (p_question->>'bankQuestionId')::UUID;
    END IF;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'Invalid next question id' USING ERRCODE = '22023';
  END;
  v_order_numeric := (p_question->>'orderIndex')::NUMERIC;
  IF v_order_numeric <> pg_catalog.trunc(v_order_numeric) OR v_order_numeric NOT BETWEEN 1 AND 9 THEN
    RAISE EXCEPTION 'Invalid next question index' USING ERRCODE = '22023';
  END IF;
  v_order_index := v_order_numeric::INTEGER;
  v_role_id := p_question->>'roleId';
  v_dimension_key := pg_catalog.btrim(COALESCE(p_question->>'dimensionKey', ''));
  v_source := p_question->>'source';
  IF v_role_id NOT IN ('general','technical','manager','hr')
    OR pg_catalog.length(v_dimension_key) NOT BETWEEN 1 AND 100
    OR v_source NOT IN ('bank','model')
    OR pg_catalog.length(COALESCE(p_question->>'question', '')) NOT BETWEEN 1 AND 5000
    OR (v_source = 'bank' AND v_bank_question_id IS NULL)
    OR (v_source = 'model' AND v_bank_question_id IS NOT NULL)
  THEN
    RAISE EXCEPTION 'Invalid next question fields' USING ERRCODE = '22023';
  END IF;

  SELECT session.*
  INTO v_session
  FROM public.interview_sessions AS session
  WHERE session.id = p_session_id
  FOR UPDATE;
  IF NOT FOUND
    OR v_session.user_id <> v_authenticated_user
    OR v_session.agent_version <> 'agent-v1'
  THEN
    RAISE EXCEPTION 'Agent session not found' USING ERRCODE = 'P0002';
  END IF;

  v_operation_key := 'question:' || v_order_index::TEXT;
  SELECT operation.*
  INTO v_operation
  FROM public.agent_operations AS operation
  WHERE operation.session_id = p_session_id
    AND operation.operation_key = v_operation_key;
  IF FOUND THEN
    IF v_operation.node_name <> 'select_question' THEN
      RAISE EXCEPTION 'Question operation conflicts with another node' USING ERRCODE = '23505';
    END IF;
    IF v_operation.status = 'completed' THEN
      RETURN jsonb_build_object(
        'committed', FALSE,
        'duplicate', TRUE,
        'operationKey', v_operation.operation_key,
        'questionId', v_operation.result->>'questionId',
        'orderIndex', (v_operation.result->>'orderIndex')::INTEGER,
        'roleId', v_operation.result->>'roleId',
        'dimensionKey', v_operation.result->>'dimensionKey',
        'eventSequence', v_operation.last_event_seq
      );
    END IF;
    RAISE EXCEPTION 'Question operation is not complete' USING ERRCODE = '55000';
  END IF;

  IF v_session.agent_phase <> 'reasoning'
    OR v_session.current_question_index IS NULL
    OR v_order_index <> v_session.current_question_index + 1
    OR v_order_index >= (v_session.agent_config->>'questionCount')::INTEGER
    OR v_session.agent_plan IS NULL
    OR v_session.agent_plan->'questionRoles'->>v_order_index IS DISTINCT FROM v_role_id
    OR v_session.agent_plan->'questionDimensions'->>v_order_index IS DISTINCT FROM v_dimension_key
  THEN
    RAISE EXCEPTION 'Next question does not match the frozen plan' USING ERRCODE = '55000';
  END IF;
  IF v_bank_question_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.question_bank WHERE id = v_bank_question_id)
  THEN
    RAISE EXCEPTION 'Question bank source not found' USING ERRCODE = 'P0002';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.interview_questions
    WHERE session_id = p_session_id AND order_index = v_order_index
  ) THEN
    RAISE EXCEPTION 'Question index already exists' USING ERRCODE = '23505';
  END IF;

  SELECT stage.value
  INTO v_stage
  FROM pg_catalog.jsonb_array_elements(v_session.agent_plan->'rolePlan') AS stage(value)
  WHERE stage.value->>'roleId' = v_role_id
    AND v_order_index BETWEEN
      (stage.value->>'startQuestionIndex')::INTEGER
      AND (stage.value->>'endQuestionIndex')::INTEGER
  LIMIT 1;
  IF v_stage IS NULL THEN
    RAISE EXCEPTION 'Role stage not found in frozen plan' USING ERRCODE = '55000';
  END IF;

  v_role_changed := v_session."current_role" IS DISTINCT FROM v_role_id;
  v_first_event_sequence := v_session.last_event_seq + 1;
  v_event_sequence := v_session.last_event_seq;
  IF v_role_changed THEN
    v_event_sequence := v_event_sequence + 1;
    INSERT INTO public.agent_events(session_id, sequence, type, payload, created_at)
    VALUES(p_session_id, v_event_sequence, 'agent.role_changed', v_stage, v_created_at);
  END IF;
  v_event_sequence := v_event_sequence + 1;
  INSERT INTO public.agent_events(session_id, sequence, type, payload, created_at)
  VALUES(
    p_session_id,
    v_event_sequence,
    'agent.question_ready',
    jsonb_build_object(
      'id', v_question_id,
      'question', p_question->>'question',
      'orderIndex', v_order_index,
      'roleId', v_role_id,
      'dimensionKey', v_dimension_key,
      'source', v_source
    ),
    v_created_at
  );

  v_result := jsonb_build_object(
    'questionId', v_question_id,
    'orderIndex', v_order_index,
    'roleId', v_role_id,
    'dimensionKey', v_dimension_key
  );
  INSERT INTO public.agent_operations(
    session_id, operation_key, node_name, status, result,
    first_event_seq, last_event_seq, claimed_at, completed_at
  ) VALUES(
    p_session_id, v_operation_key, 'select_question', 'completed', v_result,
    v_first_event_sequence, v_event_sequence, v_created_at, v_created_at
  );

  INSERT INTO public.interview_questions(
    id, session_id, order_index, question, role_id, dimension_key,
    selection_source, bank_question_id, plan_version
  ) VALUES(
    v_question_id, p_session_id, v_order_index, p_question->>'question', v_role_id,
    v_dimension_key, v_source, v_bank_question_id, 'plan-v1'
  );

  UPDATE public.interview_sessions
  SET agent_phase = 'awaiting_answer',
      "current_role" = v_role_id,
      last_event_seq = v_event_sequence,
      last_activity_at = v_created_at
  WHERE id = p_session_id;

  RETURN jsonb_build_object(
    'committed', TRUE,
    'duplicate', FALSE,
    'operationKey', v_operation_key,
    'questionId', v_question_id,
    'orderIndex', v_order_index,
    'roleId', v_role_id,
    'dimensionKey', v_dimension_key,
    'eventSequence', v_event_sequence
  );
END;
$$;

REVOKE ALL ON FUNCTION public.commit_agent_next_question(UUID, JSONB)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commit_agent_next_question(UUID, JSONB)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.commit_agent_next_question(UUID, JSONB) IS
  'Idempotently validates the frozen plan, inserts the next question, and emits role/question events.';
