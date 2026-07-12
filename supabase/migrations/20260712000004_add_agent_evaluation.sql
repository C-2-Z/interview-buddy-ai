-- Interview Agent Phase 4: candidate evidence, versioned evaluations, legacy projections, and score events.

CREATE TABLE IF NOT EXISTS public.answer_evidence (
  id UUID PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.interview_sessions(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.interview_questions(id) ON DELETE CASCADE,
  message_id UUID NOT NULL REFERENCES public.interview_messages(id) ON DELETE CASCADE,
  dimension_key TEXT NOT NULL CHECK (pg_catalog.length(dimension_key) BETWEEN 1 AND 100),
  claim TEXT NOT NULL CHECK (pg_catalog.length(claim) BETWEEN 1 AND 500),
  quote TEXT NOT NULL CHECK (pg_catalog.length(quote) BETWEEN 1 AND 1000),
  polarity TEXT NOT NULL CHECK (polarity IN ('positive','negative','neutral')),
  confidence NUMERIC NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(question_id, message_id, dimension_key, quote)
);

CREATE TABLE IF NOT EXISTS public.question_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.interview_sessions(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.interview_questions(id) ON DELETE CASCADE,
  operation_key TEXT NOT NULL CHECK (pg_catalog.length(operation_key) BETWEEN 1 AND 200),
  rubric_version TEXT NOT NULL CHECK (pg_catalog.length(rubric_version) BETWEEN 1 AND 100),
  prompt_version TEXT NOT NULL CHECK (pg_catalog.length(prompt_version) BETWEEN 1 AND 100),
  model_provider TEXT NOT NULL CHECK (model_provider IN ('deepseek','openai','anthropic')),
  model_name TEXT NOT NULL CHECK (pg_catalog.length(model_name) BETWEEN 1 AND 100),
  dimensions JSONB,
  overall_score INTEGER,
  feedback TEXT,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed','evaluation_failed')),
  error_code TEXT CHECK (error_code IS NULL OR error_code = 'evaluation_failed'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(session_id, operation_key),
  UNIQUE(question_id, rubric_version),
  CONSTRAINT question_evaluations_status_payload_check CHECK (
    (status='completed' AND dimensions IS NOT NULL AND jsonb_typeof(dimensions)='object' AND NOT public._agent_json_has_sensitive_key(dimensions) AND overall_score BETWEEN 0 AND 100 AND pg_catalog.length(feedback) BETWEEN 1 AND 2000 AND error_code IS NULL)
    OR (status='evaluation_failed' AND dimensions IS NULL AND overall_score IS NULL AND feedback IS NULL AND error_code='evaluation_failed')
  )
);

CREATE INDEX IF NOT EXISTS idx_answer_evidence_question ON public.answer_evidence(question_id, created_at);
CREATE INDEX IF NOT EXISTS idx_question_evaluations_session ON public.question_evaluations(session_id, created_at);

ALTER TABLE public.answer_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_evaluations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.answer_evidence, public.question_evaluations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.answer_evidence, public.question_evaluations TO authenticated;
GRANT ALL ON public.answer_evidence, public.question_evaluations TO service_role;

DROP POLICY IF EXISTS "Users read own answer evidence" ON public.answer_evidence;
CREATE POLICY "Users read own answer evidence" ON public.answer_evidence FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.interview_sessions s WHERE s.id = answer_evidence.session_id AND s.user_id = auth.uid())
);
DROP POLICY IF EXISTS "Users read own question evaluations" ON public.question_evaluations;
CREATE POLICY "Users read own question evaluations" ON public.question_evaluations FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.interview_sessions s WHERE s.id = question_evaluations.session_id AND s.user_id = auth.uid())
);

CREATE OR REPLACE FUNCTION public.commit_agent_question_evaluation(
  p_session_id UUID,
  p_question_id UUID,
  p_evidence JSONB,
  p_evaluation JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_session public.interview_sessions%ROWTYPE;
  v_operation public.agent_operations%ROWTYPE;
  v_operation_key TEXT := 'evaluate:' || p_question_id::TEXT;
  v_item JSONB;
  v_dimension RECORD;
  v_evidence_id UUID;
  v_message_id UUID;
  v_event_sequence BIGINT;
  v_evidence_ids JSONB := '[]'::JSONB;
  v_computed_score INTEGER;
  v_created_at TIMESTAMPTZ := now();
  v_result JSONB;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='28000'; END IF;
  SELECT s.* INTO v_session FROM public.interview_sessions s WHERE s.id=p_session_id FOR UPDATE;
  IF NOT FOUND OR v_session.user_id<>v_user OR v_session.agent_version<>'agent-v1' THEN
    RAISE EXCEPTION 'Agent session not found' USING ERRCODE='P0002';
  END IF;
  SELECT o.* INTO v_operation FROM public.agent_operations o WHERE o.session_id=p_session_id AND o.operation_key=v_operation_key;
  IF FOUND THEN
    IF v_operation.node_name<>'score_question' THEN RAISE EXCEPTION 'Evaluation operation conflict' USING ERRCODE='23505'; END IF;
    IF v_operation.status='completed' THEN
      RETURN jsonb_build_object('committed',FALSE,'duplicate',TRUE,'operationKey',v_operation.operation_key,'questionId',p_question_id,'overallScore',(v_operation.result->>'overallScore')::INTEGER,'eventSequence',v_operation.last_event_seq,'evidenceIds',v_operation.result->'evidenceIds');
    END IF;
    RAISE EXCEPTION 'Evaluation operation incomplete' USING ERRCODE='55000';
  END IF;
  IF v_session.agent_phase<>'reasoning' OR v_session.current_question_id IS DISTINCT FROM p_question_id THEN
    RAISE EXCEPTION 'Question is not ready for evaluation' USING ERRCODE='55000';
  END IF;
  IF jsonb_typeof(p_evidence) IS DISTINCT FROM 'array' OR jsonb_array_length(p_evidence)>50
    OR jsonb_typeof(p_evaluation) IS DISTINCT FROM 'object' OR public._agent_json_has_sensitive_key(p_evaluation)
    OR p_evaluation->>'rubricVersion'<>'rubric-v1'
    OR jsonb_typeof(p_evaluation->'dimensions') IS DISTINCT FROM 'object'
    OR (SELECT count(*) FROM jsonb_object_keys(p_evaluation->'dimensions'))<>jsonb_array_length(v_session.agent_plan->'capabilityBlueprint'->'dimensions')
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_session.agent_plan->'capabilityBlueprint'->'dimensions') d
      WHERE NOT (p_evaluation->'dimensions' ? (d->>'key'))
    )
    OR (p_evaluation->>'overallScore')::INTEGER NOT BETWEEN 0 AND 100
  THEN RAISE EXCEPTION 'Invalid evaluation payload' USING ERRCODE='22023'; END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_evidence) LOOP
    BEGIN v_evidence_id:=(v_item->>'id')::UUID; v_message_id:=(v_item->>'messageId')::UUID;
    EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'Invalid evidence id' USING ERRCODE='22023'; END;
    IF v_item->>'dimensionKey' IS NULL
      OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_session.agent_plan->'capabilityBlueprint'->'dimensions') d WHERE d->>'key'=v_item->>'dimensionKey')
      OR NOT EXISTS (SELECT 1 FROM public.interview_messages m WHERE m.id=v_message_id AND m.question_id=p_question_id AND m.role='user' AND pg_catalog.strpos(m.content,v_item->>'quote')>0)
    THEN RAISE EXCEPTION 'Evidence is not grounded in candidate input' USING ERRCODE='22023'; END IF;
    INSERT INTO public.answer_evidence(id,session_id,question_id,message_id,dimension_key,claim,quote,polarity,confidence)
    VALUES(v_evidence_id,p_session_id,p_question_id,v_message_id,v_item->>'dimensionKey',v_item->>'claim',v_item->>'quote',v_item->>'polarity',(v_item->>'confidence')::NUMERIC);
    v_evidence_ids:=v_evidence_ids||jsonb_build_array(v_evidence_id);
  END LOOP;

  FOR v_dimension IN SELECT key,value FROM jsonb_each(p_evaluation->'dimensions') LOOP
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_session.agent_plan->'capabilityBlueprint'->'dimensions') d WHERE d->>'key'=v_dimension.key)
      OR jsonb_typeof(v_dimension.value->'score') IS DISTINCT FROM 'number'
      OR (v_dimension.value->>'score')::NUMERIC<>trunc((v_dimension.value->>'score')::NUMERIC)
      OR (v_dimension.value->>'score')::INTEGER NOT BETWEEN 0 AND 100
      OR pg_catalog.length(COALESCE(v_dimension.value->>'rationale','')) NOT BETWEEN 1 AND 1000
      OR jsonb_typeof(v_dimension.value->'evidenceIds') IS DISTINCT FROM 'array'
      OR (
        jsonb_array_length(v_dimension.value->'evidenceIds')=0
        AND pg_catalog.strpos(v_dimension.value->>'rationale','证据不足')=0
      )
      OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(v_dimension.value->'evidenceIds') AS evidence_id(value)
        WHERE NOT (v_evidence_ids ? evidence_id.value)
      )
      OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(v_dimension.value->'evidenceIds') AS evidence_id(value)
        WHERE NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements(p_evidence) evidence
          WHERE evidence->>'id'=evidence_id.value AND evidence->>'dimensionKey'=v_dimension.key
        )
      )
    THEN RAISE EXCEPTION 'Invalid evaluation dimension' USING ERRCODE='22023'; END IF;
  END LOOP;

  SELECT pg_catalog.round(
    pg_catalog.sum(
      (p_evaluation->'dimensions'->(dimension->>'key')->>'score')::NUMERIC
      * (dimension->>'weight')::NUMERIC
    ) / pg_catalog.sum((dimension->>'weight')::NUMERIC)
  )::INTEGER
  INTO v_computed_score
  FROM jsonb_array_elements(v_session.agent_plan->'capabilityBlueprint'->'dimensions') dimension;
  IF v_computed_score IS DISTINCT FROM (p_evaluation->>'overallScore')::INTEGER THEN
    RAISE EXCEPTION 'Evaluation total is not derived from frozen weights' USING ERRCODE='22023';
  END IF;

  INSERT INTO public.question_evaluations(session_id,question_id,operation_key,rubric_version,prompt_version,model_provider,model_name,dimensions,overall_score,feedback,status,error_code)
  VALUES(p_session_id,p_question_id,v_operation_key,p_evaluation->>'rubricVersion',p_evaluation->>'promptVersion',p_evaluation->>'modelProvider',p_evaluation->>'modelName',p_evaluation->'dimensions',(p_evaluation->>'overallScore')::INTEGER,p_evaluation->>'feedback','completed',NULL)
  ON CONFLICT(question_id,rubric_version) DO UPDATE SET
    operation_key=EXCLUDED.operation_key,prompt_version=EXCLUDED.prompt_version,model_provider=EXCLUDED.model_provider,model_name=EXCLUDED.model_name,
    dimensions=EXCLUDED.dimensions,overall_score=EXCLUDED.overall_score,feedback=EXCLUDED.feedback,status='completed',error_code=NULL,created_at=now()
  WHERE question_evaluations.status='evaluation_failed';
  UPDATE public.interview_questions SET
    answer=(SELECT string_agg(m.content,E'\n\n' ORDER BY m.sequence) FROM public.interview_messages m WHERE m.question_id=p_question_id AND m.role='user'),
    score=(p_evaluation->>'overallScore')::INTEGER,
    feedback=p_evaluation->>'feedback',
    dimension_scores=p_evaluation->'dimensions'
  WHERE id=p_question_id AND session_id=p_session_id;
  v_event_sequence:=v_session.last_event_seq+1;
  INSERT INTO public.agent_events(session_id,sequence,type,payload,created_at) VALUES(
    p_session_id,v_event_sequence,'agent.score_completed',jsonb_build_object('questionId',p_question_id,'overallScore',(p_evaluation->>'overallScore')::INTEGER,'dimensions',p_evaluation->'dimensions'),v_created_at
  );
  v_result:=jsonb_build_object('questionId',p_question_id,'overallScore',(p_evaluation->>'overallScore')::INTEGER,'evidenceIds',v_evidence_ids);
  INSERT INTO public.agent_operations(session_id,operation_key,node_name,status,result,first_event_seq,last_event_seq,claimed_at,completed_at)
  VALUES(p_session_id,v_operation_key,'score_question','completed',v_result,v_event_sequence,v_event_sequence,v_created_at,v_created_at);
  UPDATE public.interview_sessions SET last_event_seq=v_event_sequence,last_activity_at=v_created_at WHERE id=p_session_id;
  RETURN jsonb_build_object('committed',TRUE,'duplicate',FALSE,'operationKey',v_operation_key,'questionId',p_question_id,'overallScore',(p_evaluation->>'overallScore')::INTEGER,'eventSequence',v_event_sequence,'evidenceIds',v_evidence_ids);
END;
$$;

REVOKE ALL ON FUNCTION public.commit_agent_question_evaluation(UUID,UUID,JSONB,JSONB) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.commit_agent_question_evaluation(UUID,UUID,JSONB,JSONB) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.mark_agent_evaluation_failed(p_session_id UUID,p_question_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_user UUID:=auth.uid();v_session public.interview_sessions%ROWTYPE;v_config JSONB;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='28000';END IF;
  SELECT s.* INTO v_session FROM public.interview_sessions s WHERE s.id=p_session_id FOR UPDATE;
  IF NOT FOUND OR v_session.user_id<>v_user OR v_session.agent_version<>'agent-v1' OR v_session.current_question_id IS DISTINCT FROM p_question_id THEN RAISE EXCEPTION 'Agent session not found' USING ERRCODE='P0002';END IF;
  v_config:=v_session.agent_config;
  INSERT INTO public.question_evaluations(session_id,question_id,operation_key,rubric_version,prompt_version,model_provider,model_name,status,error_code)
  VALUES(p_session_id,p_question_id,'evaluate:'||p_question_id::TEXT,'rubric-v1',v_config->>'promptVersion',v_config->>'modelProvider',v_config->>'modelName','evaluation_failed','evaluation_failed')
  ON CONFLICT(question_id,rubric_version) DO UPDATE SET status='evaluation_failed',error_code='evaluation_failed',dimensions=NULL,overall_score=NULL,feedback=NULL,created_at=now()
  WHERE question_evaluations.status='evaluation_failed';
  RETURN jsonb_build_object('failed',TRUE,'questionId',p_question_id,'errorCode','evaluation_failed');
END;$$;
REVOKE ALL ON FUNCTION public.mark_agent_evaluation_failed(UUID,UUID) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mark_agent_evaluation_failed(UUID,UUID) TO authenticated,service_role;
