-- Interview Agent Phase 3: durable input receipts, current-question projection, and legacy-only message writes.

ALTER TABLE public.interview_sessions
  ADD COLUMN IF NOT EXISTS current_question_id UUID REFERENCES public.interview_questions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS current_question_index INTEGER,
  ADD COLUMN IF NOT EXISTS follow_up_count INTEGER;

ALTER TABLE public.interview_sessions
  DROP CONSTRAINT IF EXISTS interview_sessions_current_question_index_check,
  DROP CONSTRAINT IF EXISTS interview_sessions_follow_up_count_check,
  DROP CONSTRAINT IF EXISTS interview_sessions_current_question_contract_check;

ALTER TABLE public.interview_sessions
  ADD CONSTRAINT interview_sessions_current_question_index_check
    CHECK (current_question_index IS NULL OR current_question_index BETWEEN 0 AND 9),
  ADD CONSTRAINT interview_sessions_follow_up_count_check
    CHECK (follow_up_count IS NULL OR follow_up_count BETWEEN 0 AND 3),
  ADD CONSTRAINT interview_sessions_current_question_contract_check
    CHECK (
      (
        current_question_id IS NULL
        AND current_question_index IS NULL
        AND follow_up_count IS NULL
      ) OR (
        agent_version = 'agent-v1'
        AND current_question_id IS NOT NULL
        AND current_question_index IS NOT NULL
        AND follow_up_count IS NOT NULL
      )
    );

ALTER TABLE public.interview_messages
  ADD COLUMN IF NOT EXISTS input_id TEXT;

ALTER TABLE public.interview_messages
  DROP CONSTRAINT IF EXISTS interview_messages_input_id_check,
  ADD CONSTRAINT interview_messages_input_id_check
    CHECK (input_id IS NULL OR pg_catalog.length(input_id) BETWEEN 1 AND 180);

CREATE UNIQUE INDEX IF NOT EXISTS idx_interview_messages_agent_input
  ON public.interview_messages(question_id, input_id)
  WHERE input_id IS NOT NULL;

-- A definer preparation RPC inserts Agent questions; this trigger keeps the recoverable session projection aligned.
CREATE OR REPLACE FUNCTION public._project_agent_current_question()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  UPDATE public.interview_sessions
  SET current_question_id = NEW.id,
      current_question_index = NEW.order_index,
      follow_up_count = 0
  WHERE id = NEW.session_id
    AND agent_version = 'agent-v1';
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public._project_agent_current_question()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS project_agent_current_question ON public.interview_questions;
CREATE TRIGGER project_agent_current_question
  AFTER INSERT ON public.interview_questions
  FOR EACH ROW
  EXECUTE FUNCTION public._project_agent_current_question();

-- Backfill sessions prepared before this migration without changing legacy rows.
WITH current_questions AS (
  SELECT DISTINCT ON (question.session_id)
    question.session_id,
    question.id,
    question.order_index
  FROM public.interview_questions AS question
  WHERE question.plan_version IS NOT NULL
  ORDER BY question.session_id, question.order_index DESC
)
UPDATE public.interview_sessions AS session
SET current_question_id = current_question.id,
    current_question_index = current_question.order_index,
    follow_up_count = 0
FROM current_questions AS current_question
WHERE session.agent_version = 'agent-v1'
  AND current_question.session_id = session.id
  AND session.current_question_id IS NULL;

-- Existing message RLS allowed arbitrary Agent writes. Keep reads, but restrict mutations to legacy sessions.
DROP POLICY IF EXISTS "Users manage own messages" ON public.interview_messages;
DROP POLICY IF EXISTS "Users read own messages" ON public.interview_messages;
DROP POLICY IF EXISTS "Users create legacy messages" ON public.interview_messages;
DROP POLICY IF EXISTS "Users update legacy messages" ON public.interview_messages;
DROP POLICY IF EXISTS "Users delete legacy messages" ON public.interview_messages;

CREATE POLICY "Users read own messages"
  ON public.interview_messages
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.interview_questions AS question
      JOIN public.interview_sessions AS session ON session.id = question.session_id
      WHERE question.id = interview_messages.question_id
        AND session.user_id = auth.uid()
    )
  );

CREATE POLICY "Users create legacy messages"
  ON public.interview_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.interview_questions AS question
      JOIN public.interview_sessions AS session ON session.id = question.session_id
      WHERE question.id = interview_messages.question_id
        AND session.user_id = auth.uid()
        AND session.agent_version IS NULL
    )
  );

CREATE POLICY "Users update legacy messages"
  ON public.interview_messages
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.interview_questions AS question
      JOIN public.interview_sessions AS session ON session.id = question.session_id
      WHERE question.id = interview_messages.question_id
        AND session.user_id = auth.uid()
        AND session.agent_version IS NULL
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.interview_questions AS question
      JOIN public.interview_sessions AS session ON session.id = question.session_id
      WHERE question.id = interview_messages.question_id
        AND session.user_id = auth.uid()
        AND session.agent_version IS NULL
    )
  );

CREATE POLICY "Users delete legacy messages"
  ON public.interview_messages
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.interview_questions AS question
      JOIN public.interview_sessions AS session ON session.id = question.session_id
      WHERE question.id = interview_messages.question_id
        AND session.user_id = auth.uid()
        AND session.agent_version IS NULL
    )
  );

-- Save one candidate message and its replayable event before the Graph receives only the inputId.
CREATE OR REPLACE FUNCTION public.accept_agent_input(
  p_session_id UUID,
  p_input_id TEXT,
  p_content TEXT,
  p_source TEXT DEFAULT 'text'
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
  v_message_id UUID := gen_random_uuid();
  v_message_sequence BIGINT;
  v_event_sequence BIGINT;
  v_created_at TIMESTAMPTZ := now();
  v_result JSONB;
BEGIN
  IF v_authenticated_user IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  p_input_id := pg_catalog.btrim(COALESCE(p_input_id, ''));
  p_content := COALESCE(p_content, '');
  p_source := pg_catalog.lower(pg_catalog.btrim(COALESCE(p_source, '')));
  IF pg_catalog.length(p_input_id) NOT BETWEEN 1 AND 180 THEN
    RAISE EXCEPTION 'Invalid input id' USING ERRCODE = '22023';
  END IF;
  IF pg_catalog.length(p_content) > 20000 THEN
    RAISE EXCEPTION 'Input content exceeds persistence limit' USING ERRCODE = '22023';
  END IF;
  IF p_source NOT IN ('text', 'voice') THEN
    RAISE EXCEPTION 'Invalid input source' USING ERRCODE = '22023';
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

  v_operation_key := 'receive:' || p_input_id;
  SELECT operation.*
  INTO v_operation
  FROM public.agent_operations AS operation
  WHERE operation.session_id = p_session_id
    AND operation.operation_key = v_operation_key;

  IF FOUND THEN
    IF v_operation.node_name <> 'accept_input' THEN
      RAISE EXCEPTION 'Input receipt conflicts with another node' USING ERRCODE = '23505';
    END IF;
    IF v_operation.status = 'completed' THEN
      RETURN jsonb_build_object(
        'accepted', FALSE,
        'duplicate', TRUE,
        'operationKey', v_operation.operation_key,
        'messageId', v_operation.result->>'messageId',
        'questionId', v_operation.result->>'questionId',
        'eventSequence', v_operation.last_event_seq
      );
    END IF;
    RAISE EXCEPTION 'Input receipt is not complete' USING ERRCODE = '55000';
  END IF;

  IF v_session.agent_phase <> 'awaiting_answer'
    OR v_session.current_question_id IS NULL
  THEN
    RAISE EXCEPTION 'Agent is not waiting for input' USING ERRCODE = '55000';
  END IF;

  SELECT COALESCE(pg_catalog.max(message.sequence), 0) + 1
  INTO v_message_sequence
  FROM public.interview_messages AS message
  WHERE message.question_id = v_session.current_question_id;

  v_event_sequence := v_session.last_event_seq + 1;
  v_result := jsonb_build_object(
    'messageId', v_message_id,
    'questionId', v_session.current_question_id,
    'inputId', p_input_id
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
    p_session_id,
    v_operation_key,
    'accept_input',
    'completed',
    v_result,
    v_event_sequence,
    v_event_sequence,
    v_created_at,
    v_created_at
  );

  INSERT INTO public.interview_messages (
    id,
    question_id,
    role,
    content,
    source,
    interrupted,
    role_id,
    sequence,
    message_kind,
    input_id
  ) VALUES (
    v_message_id,
    v_session.current_question_id,
    'user',
    p_content,
    p_source,
    FALSE,
    v_session."current_role",
    v_message_sequence,
    'answer',
    p_input_id
  );

  INSERT INTO public.agent_events (session_id, sequence, type, payload, created_at)
  VALUES (
    p_session_id,
    v_event_sequence,
    'agent.message_completed',
    jsonb_build_object(
      'id', v_message_id,
      'role', 'user',
      'content', p_content,
      'roleId', v_session."current_role",
      'createdAt', v_created_at,
      'interrupted', FALSE
    ),
    v_created_at
  );

  UPDATE public.interview_sessions
  SET agent_phase = 'reasoning',
      last_event_seq = v_event_sequence,
      last_activity_at = v_created_at
  WHERE id = p_session_id;

  RETURN jsonb_build_object(
    'accepted', TRUE,
    'duplicate', FALSE,
    'operationKey', v_operation_key,
    'messageId', v_message_id,
    'questionId', v_session.current_question_id,
    'eventSequence', v_event_sequence
  );
END;
$$;

REVOKE ALL ON FUNCTION public.accept_agent_input(UUID, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_agent_input(UUID, TEXT, TEXT, TEXT)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.accept_agent_input(UUID, TEXT, TEXT, TEXT) IS
  'Idempotently persists one candidate input and committed message event before LangGraph resumes by inputId.';

-- Commit an invalid-input redirect or a focused follow-up before Graph checkpoints the next interrupt.
CREATE OR REPLACE FUNCTION public.commit_agent_interviewer_response(
  p_session_id UUID,
  p_input_id TEXT,
  p_response_type TEXT,
  p_content TEXT
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
  v_message_id UUID := gen_random_uuid();
  v_message_sequence BIGINT;
  v_event_sequence BIGINT;
  v_follow_up_count INTEGER;
  v_created_at TIMESTAMPTZ := now();
  v_result JSONB;
BEGIN
  IF v_authenticated_user IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  p_input_id := pg_catalog.btrim(COALESCE(p_input_id, ''));
  p_response_type := pg_catalog.lower(pg_catalog.btrim(COALESCE(p_response_type, '')));
  p_content := pg_catalog.btrim(COALESCE(p_content, ''));
  IF pg_catalog.length(p_input_id) NOT BETWEEN 1 AND 180
    OR p_response_type NOT IN ('redirect', 'follow_up')
    OR pg_catalog.length(p_content) NOT BETWEEN 1 AND 2000
  THEN
    RAISE EXCEPTION 'Invalid interviewer response' USING ERRCODE = '22023';
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

  v_operation_key := 'respond:' || p_input_id || ':' || p_response_type;
  SELECT operation.*
  INTO v_operation
  FROM public.agent_operations AS operation
  WHERE operation.session_id = p_session_id
    AND operation.operation_key = v_operation_key;

  -- Replays return the first result before checking the phase changed by that first commit.
  IF FOUND THEN
    IF v_operation.node_name <> 'interviewer_respond' THEN
      RAISE EXCEPTION 'Interviewer response conflicts with another node' USING ERRCODE = '23505';
    END IF;
    IF v_operation.status = 'completed' THEN
      RETURN jsonb_build_object(
        'committed', FALSE,
        'duplicate', TRUE,
        'operationKey', v_operation.operation_key,
        'messageId', v_operation.result->>'messageId',
        'questionId', v_operation.result->>'questionId',
        'responseType', v_operation.result->>'responseType',
        'followUpCount', (v_operation.result->>'followUpCount')::INTEGER,
        'eventSequence', v_operation.last_event_seq
      );
    END IF;
    RAISE EXCEPTION 'Interviewer response is not complete' USING ERRCODE = '55000';
  END IF;

  IF v_session.agent_phase <> 'reasoning' OR v_session.current_question_id IS NULL THEN
    RAISE EXCEPTION 'Agent is not reasoning about an input' USING ERRCODE = '55000';
  END IF;
  IF p_response_type = 'follow_up' AND v_session.follow_up_count >= 3 THEN
    RAISE EXCEPTION 'Follow-up limit reached' USING ERRCODE = '55000';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.interview_messages AS message
    WHERE message.question_id = v_session.current_question_id
      AND message.input_id = p_input_id
      AND message.role = 'user'
      AND message.message_kind = 'answer'
  ) THEN
    RAISE EXCEPTION 'Agent input not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(pg_catalog.max(message.sequence), 0) + 1
  INTO v_message_sequence
  FROM public.interview_messages AS message
  WHERE message.question_id = v_session.current_question_id;

  v_event_sequence := v_session.last_event_seq + 1;
  v_follow_up_count := v_session.follow_up_count
    + CASE WHEN p_response_type = 'follow_up' THEN 1 ELSE 0 END;
  v_result := jsonb_build_object(
    'messageId', v_message_id,
    'questionId', v_session.current_question_id,
    'responseType', p_response_type,
    'followUpCount', v_follow_up_count
  );

  INSERT INTO public.agent_operations (
    session_id, operation_key, node_name, status, result,
    first_event_seq, last_event_seq, claimed_at, completed_at
  ) VALUES (
    p_session_id, v_operation_key, 'interviewer_respond', 'completed', v_result,
    v_event_sequence, v_event_sequence, v_created_at, v_created_at
  );

  INSERT INTO public.interview_messages (
    id, question_id, role, content, source, interrupted,
    role_id, sequence, message_kind
  ) VALUES (
    v_message_id, v_session.current_question_id, 'assistant', p_content, 'text', FALSE,
    v_session."current_role", v_message_sequence, p_response_type
  );

  INSERT INTO public.agent_events (session_id, sequence, type, payload, created_at)
  VALUES (
    p_session_id,
    v_event_sequence,
    'agent.message_completed',
    jsonb_build_object(
      'id', v_message_id,
      'role', 'assistant',
      'content', p_content,
      'roleId', v_session."current_role",
      'createdAt', v_created_at,
      'interrupted', FALSE
    ),
    v_created_at
  );

  UPDATE public.interview_sessions
  SET agent_phase = 'awaiting_answer',
      follow_up_count = v_follow_up_count,
      last_event_seq = v_event_sequence,
      last_activity_at = v_created_at
  WHERE id = p_session_id;

  RETURN jsonb_build_object(
    'committed', TRUE,
    'duplicate', FALSE,
    'operationKey', v_operation_key,
    'messageId', v_message_id,
    'questionId', v_session.current_question_id,
    'responseType', p_response_type,
    'followUpCount', v_follow_up_count,
    'eventSequence', v_event_sequence
  );
END;
$$;

REVOKE ALL ON FUNCTION public.commit_agent_interviewer_response(UUID, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commit_agent_interviewer_response(UUID, TEXT, TEXT, TEXT)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.commit_agent_interviewer_response(UUID, TEXT, TEXT, TEXT) IS
  'Idempotently persists one redirect or follow-up and returns the session to awaiting_answer.';
