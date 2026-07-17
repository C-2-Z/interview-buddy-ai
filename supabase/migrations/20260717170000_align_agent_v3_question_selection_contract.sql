-- Align Agent v3 question selection audit fields with preparation and runtime RPC payloads.

ALTER TABLE public.question_bank
  ADD COLUMN IF NOT EXISTS question_family_key TEXT,
  ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;

UPDATE public.question_bank
SET question_family_key = 'legacy-' || pg_catalog.lower(id::TEXT)
WHERE question_family_key IS NULL OR pg_catalog.btrim(question_family_key) = '';

ALTER TABLE public.question_bank
  ALTER COLUMN question_family_key SET NOT NULL;

ALTER TABLE public.question_bank
  DROP CONSTRAINT IF EXISTS question_bank_question_family_key_check;
ALTER TABLE public.question_bank
  ADD CONSTRAINT question_bank_question_family_key_check CHECK (
    question_family_key ~ '^[a-z0-9][a-z0-9._-]{2,119}$'
  );

CREATE INDEX IF NOT EXISTS question_bank_active_family_idx
  ON public.question_bank(active, question_family_key);

ALTER TABLE public.interview_questions
  ADD COLUMN IF NOT EXISTS question_family_key TEXT,
  ADD COLUMN IF NOT EXISTS selection_tier TEXT,
  ADD COLUMN IF NOT EXISTS selection_score INTEGER,
  ADD COLUMN IF NOT EXISTS selection_reason_code TEXT;

UPDATE public.interview_questions AS question
SET question_family_key = CASE
      WHEN question.selection_source = 'bank' THEN COALESCE(
        bank.question_family_key,
        'legacy-' || pg_catalog.lower(question.bank_question_id::TEXT)
      )
      ELSE 'model-' || pg_catalog.lower(question.id::TEXT)
    END,
    selection_tier = CASE
      WHEN question.selection_source = 'bank' THEN 'bank_exact'
      ELSE 'model_generated'
    END,
    selection_reason_code = 'legacy_migration'
FROM public.question_bank AS bank
WHERE bank.id IS NOT DISTINCT FROM question.bank_question_id
  AND (
    question.question_family_key IS NULL
    OR question.selection_tier IS NULL
    OR question.selection_reason_code IS NULL
  );

UPDATE public.interview_questions AS question
SET question_family_key = CASE
      WHEN question.selection_source = 'bank' THEN
        'legacy-' || pg_catalog.lower(question.bank_question_id::TEXT)
      ELSE 'model-' || pg_catalog.lower(question.id::TEXT)
    END,
    selection_tier = CASE
      WHEN question.selection_source = 'bank' THEN 'bank_exact'
      ELSE 'model_generated'
    END,
    selection_reason_code = 'legacy_migration'
WHERE question.question_family_key IS NULL
   OR question.selection_tier IS NULL
   OR question.selection_reason_code IS NULL;

ALTER TABLE public.interview_questions
  ALTER COLUMN question_family_key SET NOT NULL,
  ALTER COLUMN selection_tier SET NOT NULL,
  ALTER COLUMN selection_reason_code SET NOT NULL;

ALTER TABLE public.interview_questions
  DROP CONSTRAINT IF EXISTS interview_questions_question_family_key_check,
  DROP CONSTRAINT IF EXISTS interview_questions_selection_tier_check,
  DROP CONSTRAINT IF EXISTS interview_questions_selection_score_check,
  DROP CONSTRAINT IF EXISTS interview_questions_selection_reason_code_check,
  DROP CONSTRAINT IF EXISTS interview_questions_selection_source_audit_check;
ALTER TABLE public.interview_questions
  ADD CONSTRAINT interview_questions_question_family_key_check CHECK (
    question_family_key ~ '^[a-z0-9][a-z0-9._-]{2,119}$'
  ),
  ADD CONSTRAINT interview_questions_selection_tier_check CHECK (
    selection_tier IN ('bank_exact', 'bank_rotated', 'bank_reused', 'model_generated')
  ),
  ADD CONSTRAINT interview_questions_selection_score_check CHECK (
    selection_score IS NULL OR selection_score BETWEEN 0 AND 100000
  ),
  ADD CONSTRAINT interview_questions_selection_reason_code_check CHECK (
    selection_reason_code ~ '^[a-z0-9][a-z0-9_.-]{0,99}$'
  ),
  ADD CONSTRAINT interview_questions_selection_source_audit_check CHECK (
    (selection_source = 'bank'
      AND selection_tier IN ('bank_exact', 'bank_rotated', 'bank_reused')
      AND bank_question_id IS NOT NULL)
    OR
    (selection_source = 'model'
      AND selection_tier = 'model_generated'
      AND bank_question_id IS NULL
      AND question_family_key LIKE 'model-%')
  );

CREATE OR REPLACE FUNCTION public._validate_agent_v3_question_selection(
  p_session_id UUID,
  p_question JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_session public.interview_sessions%ROWTYPE;
  v_bank public.question_bank%ROWTYPE;
  v_bank_question_id UUID;
  v_selection_score NUMERIC;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  SELECT session.* INTO v_session
  FROM public.interview_sessions AS session
  WHERE session.id = p_session_id AND session.user_id = v_user;
  IF NOT FOUND OR v_session.agent_version <> 'agent-v3' THEN
    RAISE EXCEPTION 'Agent session not found' USING ERRCODE = 'P0002';
  END IF;

  IF p_question IS NULL
    OR jsonb_typeof(p_question) <> 'object'
    OR NOT (p_question ?& ARRAY[
      'questionFamilyKey',
      'selectionTier',
      'selectionScore',
      'selectionReasonCode'
    ]::TEXT[])
    OR COALESCE(p_question->>'questionFamilyKey', '')
      !~ '^[a-z0-9][a-z0-9._-]{2,119}$'
    OR COALESCE(p_question->>'selectionReasonCode', '')
      !~ '^[a-z0-9][a-z0-9_.-]{0,99}$'
    OR jsonb_typeof(p_question->'selectionScore') NOT IN ('number', 'null')
  THEN
    RAISE EXCEPTION 'Invalid Agent question selection audit' USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(p_question->'selectionScore') = 'number' THEN
    v_selection_score := (p_question->>'selectionScore')::NUMERIC;
    IF v_selection_score <> pg_catalog.trunc(v_selection_score)
      OR v_selection_score NOT BETWEEN 0 AND 100000
    THEN
      RAISE EXCEPTION 'Invalid Agent question selection audit' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF p_question->>'source' = 'bank' THEN
    IF p_question->>'selectionTier' NOT IN ('bank_exact', 'bank_rotated', 'bank_reused')
      OR NULLIF(p_question->>'bankQuestionId', '') IS NULL
    THEN
      RAISE EXCEPTION 'Invalid Agent question selection audit' USING ERRCODE = '22023';
    END IF;
    BEGIN
      v_bank_question_id := (p_question->>'bankQuestionId')::UUID;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'Invalid Agent question selection audit' USING ERRCODE = '22023';
    END;
    SELECT bank.* INTO v_bank
    FROM public.question_bank AS bank
    WHERE bank.id = v_bank_question_id AND bank.active = TRUE;
    IF NOT FOUND
      OR v_bank.question IS DISTINCT FROM p_question->>'question'
      OR v_bank.question_family_key IS DISTINCT FROM p_question->>'questionFamilyKey'
      OR v_bank.difficulty IS DISTINCT FROM v_session.agent_config->>'difficulty'
      OR NOT (p_question->>'roleId' = ANY(v_bank.role_ids))
      OR NOT (p_question->>'dimensionKey' = ANY(v_bank.dimension_keys))
    THEN
      RAISE EXCEPTION 'Invalid Agent question selection audit' USING ERRCODE = '22023';
    END IF;
  ELSIF p_question->>'source' = 'model' THEN
    IF p_question->>'selectionTier' <> 'model_generated'
      OR NULLIF(p_question->>'bankQuestionId', '') IS NOT NULL
      OR p_question->>'questionFamilyKey' NOT LIKE 'model-%'
    THEN
      RAISE EXCEPTION 'Invalid Agent question selection audit' USING ERRCODE = '22023';
    END IF;
  ELSE
    RAISE EXCEPTION 'Invalid Agent question selection audit' USING ERRCODE = '22023';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.commit_agent_v3_preparation(
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
SECURITY INVOKER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_commit JSONB;
  v_question_id UUID;
BEGIN
  PERFORM public._validate_agent_v3_question_selection(p_session_id, p_question);
  v_question_id := (p_question->>'id')::UUID;
  v_commit := public.commit_agent_preparation(
    p_session_id,
    p_operation_key,
    p_node_name,
    p_current_role,
    p_plan,
    p_sources,
    p_question - ARRAY[
      'questionFamilyKey',
      'selectionTier',
      'selectionScore',
      'selectionReasonCode'
    ]::TEXT[],
    p_result,
    p_events
  );
  UPDATE public.interview_questions
  SET question_family_key = p_question->>'questionFamilyKey',
      selection_tier = p_question->>'selectionTier',
      selection_score = NULLIF(p_question->>'selectionScore', '')::INTEGER,
      selection_reason_code = p_question->>'selectionReasonCode'
  WHERE id = v_question_id AND session_id = p_session_id;
  RETURN v_commit;
END;
$$;

CREATE OR REPLACE FUNCTION public.commit_agent_v3_question(
  p_session_id UUID,
  p_question JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_commit JSONB;
  v_question_id UUID;
BEGIN
  PERFORM public._validate_agent_v3_question_selection(p_session_id, p_question);
  v_question_id := (p_question->>'id')::UUID;
  v_commit := public.commit_agent_next_question(
    p_session_id,
    p_question - ARRAY[
      'questionFamilyKey',
      'selectionTier',
      'selectionScore',
      'selectionReasonCode'
    ]::TEXT[]
  );
  UPDATE public.interview_questions
  SET question_family_key = p_question->>'questionFamilyKey',
      selection_tier = p_question->>'selectionTier',
      selection_score = NULLIF(p_question->>'selectionScore', '')::INTEGER,
      selection_reason_code = p_question->>'selectionReasonCode'
  WHERE id = v_question_id AND session_id = p_session_id;
  RETURN v_commit;
END;
$$;

REVOKE ALL ON FUNCTION public._validate_agent_v3_question_selection(UUID, JSONB)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.commit_agent_v3_preparation(
  UUID, TEXT, TEXT, TEXT, JSONB, JSONB, JSONB, JSONB, JSONB
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.commit_agent_v3_question(UUID, JSONB)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public._validate_agent_v3_question_selection(UUID, JSONB)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.commit_agent_v3_preparation(
  UUID, TEXT, TEXT, TEXT, JSONB, JSONB, JSONB, JSONB, JSONB
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.commit_agent_v3_question(UUID, JSONB)
  TO authenticated, service_role;

COMMENT ON FUNCTION public._validate_agent_v3_question_selection(UUID, JSONB) IS
  'Validates Agent v3 bank/model question selection audit without persisting prompt or answer content.';
COMMENT ON FUNCTION public.commit_agent_v3_preparation(
  UUID, TEXT, TEXT, TEXT, JSONB, JSONB, JSONB, JSONB, JSONB
) IS 'Commits Agent v3 preparation and persists audited first-question selection fields.';
COMMENT ON FUNCTION public.commit_agent_v3_question(UUID, JSONB) IS
  'Commits an Agent v3 runtime question and persists audited selection fields.';
