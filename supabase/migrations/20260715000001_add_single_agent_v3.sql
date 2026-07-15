-- Single Agent 3 runtime: retire unfinished legacy sessions and add v3-only persistence contracts.
ALTER TABLE public.interview_sessions
  DROP CONSTRAINT IF EXISTS interview_sessions_agent_version_check;
ALTER TABLE public.interview_sessions
  ADD CONSTRAINT interview_sessions_agent_version_check
  CHECK (agent_version IS NULL OR agent_version IN ('agent-v1', 'agent-v2', 'agent-v3'));

-- 历史报告仍需满足旧行约束；新会话只通过 v3 创建 RPC 写入，但共享投影列必须接受 v3。
ALTER TABLE public.interview_sessions
  DROP CONSTRAINT IF EXISTS interview_sessions_prepared_contract_check,
  DROP CONSTRAINT IF EXISTS interview_sessions_current_question_contract_check;
ALTER TABLE public.interview_sessions
  ADD CONSTRAINT interview_sessions_prepared_contract_check CHECK (
    (agent_plan IS NULL AND prepared_at IS NULL)
    OR (
      agent_version IN ('agent-v1', 'agent-v2', 'agent-v3')
      AND agent_plan IS NOT NULL
      AND prepared_at IS NOT NULL
    )
  ),
  ADD CONSTRAINT interview_sessions_current_question_contract_check CHECK (
    (
      current_question_id IS NULL
      AND current_question_index IS NULL
      AND follow_up_count IS NULL
    ) OR (
      agent_version IN ('agent-v1', 'agent-v2', 'agent-v3')
      AND current_question_id IS NOT NULL
      AND current_question_index IS NOT NULL
      AND follow_up_count IS NOT NULL
    )
  );

ALTER TABLE public.agent_tool_runs
  ADD COLUMN IF NOT EXISTS result_context TEXT;
ALTER TABLE public.agent_tool_runs
  DROP CONSTRAINT IF EXISTS agent_tool_runs_result_context_check;
ALTER TABLE public.agent_tool_runs
  ADD CONSTRAINT agent_tool_runs_result_context_check
  CHECK (result_context IS NULL OR pg_catalog.length(result_context) <= 8000);

ALTER TABLE public.agent_strategy_revisions
  ADD COLUMN IF NOT EXISTS question_criteria JSONB,
  ADD COLUMN IF NOT EXISTS observation_ids UUID[] NOT NULL DEFAULT ARRAY[]::UUID[];
ALTER TABLE public.agent_strategy_revisions
  DROP CONSTRAINT IF EXISTS agent_strategy_question_criteria_check,
  DROP CONSTRAINT IF EXISTS agent_strategy_observation_ids_check;
ALTER TABLE public.agent_strategy_revisions
  ADD CONSTRAINT agent_strategy_question_criteria_check CHECK (
    question_criteria IS NULL OR (
      jsonb_typeof(question_criteria) = 'object'
      AND NOT public._agent_json_has_sensitive_key(question_criteria)
      AND pg_catalog.octet_length(question_criteria::TEXT) <= 8192
    )
  ),
  ADD CONSTRAINT agent_strategy_observation_ids_check
    CHECK (cardinality(observation_ids) <= 3);

ALTER TABLE public.question_bank
  ADD COLUMN IF NOT EXISTS role_ids TEXT[] NOT NULL DEFAULT ARRAY['general','technical','manager','hr']::TEXT[],
  ADD COLUMN IF NOT EXISTS dimension_keys TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS topic_keys TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS evidence_goal_keys TEXT[] NOT NULL DEFAULT ARRAY['situation','action','result']::TEXT[];

UPDATE public.question_bank
SET dimension_keys = ARRAY[CASE type
      WHEN '技术题' THEN 'TECHNICAL_DEPTH'
      WHEN '系统设计' THEN 'TECHNICAL_DEPTH'
      WHEN '场景题' THEN 'PROBLEM_SOLVING'
      ELSE 'COMMUNICATION'
    END],
    topic_keys = CASE
      WHEN COALESCE(pg_catalog.array_length(tags, 1), 0) > 0 THEN tags
      ELSE ARRAY[COALESCE(NULLIF(position, ''), 'general')]
    END
WHERE pg_catalog.array_length(dimension_keys, 1) IS NULL;

ALTER TABLE public.question_bank
  DROP CONSTRAINT IF EXISTS question_bank_role_ids_check,
  DROP CONSTRAINT IF EXISTS question_bank_dimension_keys_check,
  DROP CONSTRAINT IF EXISTS question_bank_topic_keys_check,
  DROP CONSTRAINT IF EXISTS question_bank_evidence_goal_keys_check;
ALTER TABLE public.question_bank
  ADD CONSTRAINT question_bank_role_ids_check
    CHECK (role_ids <@ ARRAY['general','technical','manager','hr']::TEXT[] AND cardinality(role_ids) > 0),
  ADD CONSTRAINT question_bank_dimension_keys_check CHECK (cardinality(dimension_keys) > 0),
  ADD CONSTRAINT question_bank_topic_keys_check CHECK (cardinality(topic_keys) > 0),
  ADD CONSTRAINT question_bank_evidence_goal_keys_check CHECK (cardinality(evidence_goal_keys) > 0);

-- Completed legacy reports remain untouched. Every unfinished legacy graph becomes permanently read-only.
UPDATE public.interview_sessions
SET status = 'failed',
    agent_phase = 'failed',
    agent_config = COALESCE(agent_config, '{}'::JSONB)
      || jsonb_build_object('retirementReason', 'legacy_agent_retired'),
    last_activity_at = now()
WHERE agent_version IN ('agent-v1', 'agent-v2')
  AND status NOT IN ('completed', 'abandoned', 'failed');

UPDATE public.agent_operations AS operation
SET status = 'failed',
    error_code = 'legacy_agent_retired',
    completed_at = NULL,
    updated_at = now()
FROM public.interview_sessions AS session
WHERE operation.session_id = session.id
  AND session.agent_version IN ('agent-v1', 'agent-v2')
  AND operation.status IN ('pending', 'running');

-- Upgrade the existing creation function without rewriting historical migrations.
DO $$
DECLARE v_definition TEXT;
BEGIN
  SELECT pg_get_functiondef('public.create_agent_interview_session(jsonb)'::regprocedure)
  INTO v_definition;
  v_definition := replace(v_definition, E'\r\n', E'\n');
  v_definition := replace(v_definition,
    'v_agent_version TEXT;',
    E'v_agent_version TEXT;\n  v_experience_mode TEXT;');
  v_definition := replace(v_definition,
    E'      ''useTrainingMemory''\n',
    E'      ''useTrainingMemory'',\n      ''experienceMode''\n');
  v_definition := replace(v_definition,
    E'    OR (p_session ? ''useTrainingMemory'' AND jsonb_typeof(p_session->''useTrainingMemory'') IS DISTINCT FROM ''boolean'')\n  THEN',
    E'    OR (p_session ? ''useTrainingMemory'' AND jsonb_typeof(p_session->''useTrainingMemory'') IS DISTINCT FROM ''boolean'')\n    OR jsonb_typeof(p_session->''experienceMode'') IS DISTINCT FROM ''string''\n  THEN');
  v_definition := replace(v_definition,
    E'  v_use_training_memory := COALESCE((p_session->>''useTrainingMemory'')::BOOLEAN, FALSE);\n',
    E'  v_use_training_memory := COALESCE((p_session->>''useTrainingMemory'')::BOOLEAN, FALSE);\n  v_experience_mode := p_session->>''experienceMode'';\n  IF v_experience_mode NOT IN (''simulation'', ''coaching'') THEN\n    RAISE EXCEPTION ''Invalid experience mode'' USING ERRCODE = ''22023'';\n  END IF;\n');
  v_definition := replace(v_definition,
    'v_agent_version := COALESCE(NULLIF(p_session->>''agentVersion'', ''''), ''agent-v1'');',
    'v_agent_version := COALESCE(NULLIF(p_session->>''agentVersion'', ''''), ''agent-v3'');');
  v_definition := replace(v_definition,
    'v_agent_version NOT IN (''agent-v1'', ''agent-v2'')',
    'v_agent_version <> ''agent-v3''');
  v_definition := replace(v_definition,
    E'    ''useTrainingMemory'', v_use_training_memory,\n',
    E'    ''useTrainingMemory'', v_use_training_memory,\n    ''experienceMode'', v_experience_mode,\n');
  IF position('v_experience_mode TEXT' IN v_definition) = 0
    OR position('''experienceMode'', v_experience_mode' IN v_definition) = 0
  THEN
    RAISE EXCEPTION 'Unable to upgrade Agent 3 session creation safely';
  END IF;
  EXECUTE v_definition;
END;
$$;

-- Strategy and Brain citation writers are now owned exclusively by Agent 3.
DO $$
DECLARE v_signature TEXT; v_definition TEXT;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'public.commit_agent_strategy_revision(uuid,jsonb)',
    'public.record_agent_knowledge_citations(uuid,jsonb)'
  ] LOOP
    SELECT pg_get_functiondef(v_signature::regprocedure) INTO v_definition;
    v_definition := replace(v_definition, E'\r\n', E'\n');
    v_definition := replace(v_definition, 'agent_version = ''agent-v2''', 'agent_version = ''agent-v3''');
    v_definition := replace(v_definition, 'agent_version=''agent-v2''', 'agent_version=''agent-v3''');
    EXECUTE v_definition;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.commit_agent_v3_strategy_revision(
  p_session_id UUID,
  p_strategy JSONB
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_revision INTEGER;
  v_id UUID := gen_random_uuid();
  v_observation_id TEXT;
  v_observation_ids UUID[] := ARRAY[]::UUID[];
BEGIN
  IF v_user IS NULL OR p_strategy IS NULL OR jsonb_typeof(p_strategy) <> 'object'
    OR public._agent_json_has_sensitive_key(p_strategy)
    OR (p_strategy - ARRAY[
      'kind','objective','focusDimensions','questionIntent','questionCriteria',
      'toolRequests','activityLabel','memoryApplied','brainApplied','observationIds'
    ]::TEXT[]) <> '{}'::JSONB
  THEN RAISE EXCEPTION 'Invalid Agent 3 strategy' USING ERRCODE='22023'; END IF;

  PERFORM 1 FROM public.interview_sessions s
  WHERE s.id=p_session_id AND s.user_id=v_user AND s.agent_version='agent-v3'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Agent session not found' USING ERRCODE='P0002'; END IF;

  IF p_strategy->>'kind' NOT IN ('planning','reflection')
    OR pg_catalog.length(COALESCE(p_strategy->>'objective','')) NOT BETWEEN 5 AND 300
    OR jsonb_typeof(p_strategy->'focusDimensions') IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_strategy->'focusDimensions') NOT BETWEEN 1 AND 5
    OR pg_catalog.length(COALESCE(p_strategy->>'questionIntent','')) NOT BETWEEN 5 AND 500
    OR jsonb_typeof(p_strategy->'questionCriteria') IS DISTINCT FROM 'object'
    OR ((p_strategy->'questionCriteria') - ARRAY[
      'primaryDimension','topicKeys','evidenceGoalKeys','questionIntent'
    ]::TEXT[]) <> '{}'::JSONB
    OR pg_catalog.length(COALESCE(p_strategy->'questionCriteria'->>'primaryDimension','')) NOT BETWEEN 1 AND 100
    OR jsonb_typeof(p_strategy->'questionCriteria'->'topicKeys') IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_strategy->'questionCriteria'->'topicKeys') NOT BETWEEN 1 AND 8
    OR jsonb_typeof(p_strategy->'questionCriteria'->'evidenceGoalKeys') IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_strategy->'questionCriteria'->'evidenceGoalKeys') NOT BETWEEN 1 AND 8
    OR pg_catalog.length(COALESCE(p_strategy->'questionCriteria'->>'questionIntent','')) NOT BETWEEN 5 AND 500
    OR jsonb_typeof(p_strategy->'toolRequests') IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_strategy->'toolRequests') > 3
    OR jsonb_typeof(p_strategy->'observationIds') IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_strategy->'observationIds') > 3
  THEN RAISE EXCEPTION 'Invalid Agent 3 strategy' USING ERRCODE='22023'; END IF;

  FOR v_observation_id IN
    SELECT value FROM jsonb_array_elements_text(p_strategy->'observationIds')
  LOOP
    IF v_observation_id !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
      OR NOT EXISTS (
        SELECT 1 FROM public.agent_tool_runs run
        WHERE run.id=v_observation_id::UUID AND run.session_id=p_session_id
      )
    THEN RAISE EXCEPTION 'Invalid Agent observation reference' USING ERRCODE='22023'; END IF;
    v_observation_ids := pg_catalog.array_append(v_observation_ids, v_observation_id::UUID);
  END LOOP;

  SELECT COALESCE(max(revision),0)+1 INTO v_revision
  FROM public.agent_strategy_revisions WHERE session_id=p_session_id;
  INSERT INTO public.agent_strategy_revisions(
    id,session_id,revision,kind,objective,focus_dimensions,question_intent,
    question_criteria,tool_requests,observation_ids,memory_applied,brain_applied
  ) VALUES (
    v_id,p_session_id,v_revision,p_strategy->>'kind',p_strategy->>'objective',
    p_strategy->'focusDimensions',p_strategy->>'questionIntent',p_strategy->'questionCriteria',
    p_strategy->'toolRequests',v_observation_ids,
    COALESCE((p_strategy->>'memoryApplied')::BOOLEAN,FALSE),
    COALESCE((p_strategy->>'brainApplied')::BOOLEAN,FALSE)
  );
  RETURN jsonb_build_object('id',v_id,'revision',v_revision);
END;
$$;

REVOKE ALL ON FUNCTION public.commit_agent_strategy_revision(UUID,JSONB) FROM authenticated;
REVOKE ALL ON FUNCTION public.commit_agent_v3_strategy_revision(UUID,JSONB) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.commit_agent_v3_strategy_revision(UUID,JSONB) TO authenticated,service_role;

-- Existing atomic helpers are retained internally but expanded only so the v3 wrapper can reuse them.
DO $$
DECLARE v_signature TEXT; v_definition TEXT;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'public.commit_agent_preparation(uuid,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb)',
    'public.commit_agent_next_question(uuid,jsonb)',
    'public.commit_agent_interviewer_response(uuid,text,text,text)',
    'public.accept_agent_input(uuid,text,text,text)',
    'public.mark_agent_evaluation_failed(uuid,uuid)'
  ] LOOP
    SELECT pg_get_functiondef(v_signature::regprocedure) INTO v_definition;
    v_definition := replace(v_definition, E'\r\n', E'\n');
    -- 旧会话已经终止，内部原子函数从此只允许 v3；同时把冻结计划契约升级为 plan-v3。
    v_definition := replace(v_definition,
      'agent_version IN (''agent-v1'', ''agent-v2'')',
      'agent_version = ''agent-v3''');
    v_definition := replace(v_definition,
      'agent_version NOT IN (''agent-v1'', ''agent-v2'')',
      'agent_version <> ''agent-v3''');
    v_definition := replace(v_definition, '''agent-v1''', '''agent-v3''');
    v_definition := replace(v_definition, '''agent-v2''', '''agent-v3''');
    v_definition := replace(v_definition, 'plan-v1', 'plan-v3');
    -- preparation 的严格对象白名单必须显式接纳 v3 的适用维度与证据目标。
    IF v_signature LIKE 'public.commit_agent_preparation(%' THEN
      v_definition := replace(v_definition,
        E'      ''questionDimensions'',\n      ''firstQuestion'',',
        E'      ''questionDimensions'',\n      ''questionApplicableDimensions'',\n      ''questionEvidenceGoals'',\n      ''firstQuestion'',');
      v_definition := replace(v_definition,
        E'    OR jsonb_typeof(p_plan->''questionDimensions'') IS DISTINCT FROM ''array''\n',
        E'    OR jsonb_typeof(p_plan->''questionDimensions'') IS DISTINCT FROM ''array''\n    OR jsonb_typeof(p_plan->''questionApplicableDimensions'') IS DISTINCT FROM ''array''\n    OR jsonb_typeof(p_plan->''questionEvidenceGoals'') IS DISTINCT FROM ''array''\n');
      v_definition := replace(v_definition,
        E'    OR jsonb_array_length(p_plan->''questionDimensions'') <> v_question_count\n',
        E'    OR jsonb_array_length(p_plan->''questionDimensions'') <> v_question_count\n    OR jsonb_array_length(p_plan->''questionApplicableDimensions'') <> v_question_count\n    OR jsonb_array_length(p_plan->''questionEvidenceGoals'') <> v_question_count\n');
      IF position('''questionApplicableDimensions''' IN v_definition) = 0 THEN
        RAISE EXCEPTION 'Unable to upgrade Agent 3 preparation contract safely';
      END IF;
    END IF;
    EXECUTE v_definition;
  END LOOP;
END;
$$;

-- Every active lifecycle RPC now accepts only Agent 3. Legacy rows remain readable through history queries.
DO $$
DECLARE v_record RECORD; v_definition TEXT;
BEGIN
  FOR v_record IN
    SELECT p.oid
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = ANY (ARRAY[
      'claim_agent_operation', 'commit_agent_operation', 'fail_agent_operation',
      'finalize_agent_report', 'manage_agent_session_lifecycle', 'delete_agent_session',
      '_project_agent_current_question'
    ])
  LOOP
    v_definition := pg_get_functiondef(v_record.oid);
    v_definition := replace(v_definition, E'\r\n', E'\n');
    v_definition := replace(v_definition,
      'agent_version IN (''agent-v1'', ''agent-v2'')',
      'agent_version = ''agent-v3''');
    v_definition := replace(v_definition,
      'agent_version NOT IN (''agent-v1'', ''agent-v2'')',
      'agent_version <> ''agent-v3''');
    v_definition := replace(v_definition,
      'agent_version = ''agent-v1''',
      'agent_version = ''agent-v3''');
    v_definition := replace(v_definition,
      'agent_version <> ''agent-v1''',
      'agent_version <> ''agent-v3''');
    EXECUTE v_definition;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.commit_agent_v3_preparation(
  p_session_id UUID, p_operation_key TEXT, p_node_name TEXT, p_current_role TEXT,
  p_plan JSONB, p_sources JSONB, p_question JSONB, p_result JSONB, p_events JSONB
)
RETURNS JSONB LANGUAGE sql SECURITY INVOKER SET search_path = public, pg_catalog
AS $$
  SELECT public.commit_agent_preparation(
    p_session_id, p_operation_key, p_node_name, p_current_role,
    p_plan, p_sources, p_question, p_result, p_events
  )
$$;

CREATE OR REPLACE FUNCTION public.commit_agent_v3_question(
  p_session_id UUID, p_question JSONB
)
RETURNS JSONB LANGUAGE sql SECURITY INVOKER SET search_path = public, pg_catalog
AS $$ SELECT public.commit_agent_next_question(p_session_id, p_question) $$;

-- Agent 3 activity writes keep safe result_context only in the tool-run table, never in public events.
CREATE OR REPLACE FUNCTION public.record_agent_activity(p_session_id UUID, p_activity JSONB)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog
AS $$
DECLARE v_user UUID := auth.uid(); v_id UUID; v_sequence BIGINT; v_result_context TEXT;
BEGIN
  IF v_user IS NULL OR p_activity IS NULL OR jsonb_typeof(p_activity) <> 'object'
    OR public._agent_json_has_sensitive_key(p_activity)
  THEN RAISE EXCEPTION 'Invalid activity' USING ERRCODE = '22023'; END IF;
  PERFORM 1 FROM public.interview_sessions s
   WHERE s.id = p_session_id AND s.user_id = v_user AND s.agent_version = 'agent-v3';
  IF NOT FOUND THEN RAISE EXCEPTION 'Agent session not found' USING ERRCODE = 'P0002'; END IF;
  v_id := (p_activity->>'id')::UUID;
  v_result_context := left(COALESCE(p_activity->>'resultContext', ''), 8000);

  INSERT INTO public.agent_activities(id, session_id, kind, status, label, reason_code, source_count)
  VALUES (v_id, p_session_id, p_activity->>'kind', p_activity->>'status', p_activity->>'label',
    NULLIF(p_activity->>'reasonCode', ''), NULLIF(p_activity->>'sourceCount', '')::INTEGER)
  ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status,label=EXCLUDED.label,
    reason_code=EXCLUDED.reason_code,source_count=EXCLUDED.source_count
  WHERE public.agent_activities.session_id=EXCLUDED.session_id;

  IF p_activity->>'kind' = 'tool' THEN
    INSERT INTO public.agent_tool_runs(
      id,session_id,tool_name,status,reason_code,source_count,result_summary,result_hash,duration_ms,result_context
    ) VALUES (
      v_id,p_session_id,COALESCE(NULLIF(p_activity->>'toolName',''),'context_tool'),p_activity->>'status',
      NULLIF(p_activity->>'reasonCode',''),COALESCE((p_activity->>'sourceCount')::INTEGER,0),
      left(COALESCE(p_activity->>'resultSummary',''),300),
      COALESCE(NULLIF(p_activity->>'resultHash',''),repeat('0',64)),
      LEAST(600000,GREATEST(0,COALESCE((p_activity->>'durationMs')::INTEGER,0))),
      NULLIF(v_result_context,'')
    ) ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status,reason_code=EXCLUDED.reason_code,
      source_count=EXCLUDED.source_count,result_summary=EXCLUDED.result_summary,
      result_hash=EXCLUDED.result_hash,duration_ms=EXCLUDED.duration_ms,result_context=EXCLUDED.result_context
    WHERE public.agent_tool_runs.session_id=EXCLUDED.session_id;
  END IF;

  UPDATE public.interview_sessions SET last_event_seq=last_event_seq+1,last_activity_at=now()
  WHERE id=p_session_id RETURNING last_event_seq INTO v_sequence;
  INSERT INTO public.agent_events(session_id,sequence,type,payload) VALUES(
    p_session_id,v_sequence,'agent.activity',jsonb_strip_nulls(jsonb_build_object(
      'id',v_id,'kind',p_activity->>'kind','status',p_activity->>'status','label',p_activity->>'label',
      'reasonCode',NULLIF(p_activity->>'reasonCode',''),'sourceCount',NULLIF(p_activity->>'sourceCount','')::INTEGER
    ))
  );
END;
$$;

-- v3 scoring accepts only the per-question applicable dimensions and preserves not_observed as null.
CREATE OR REPLACE FUNCTION public.commit_agent_v3_question_evaluation(
  p_session_id UUID, p_question_id UUID, p_evidence JSONB, p_evaluation JSONB
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog
AS $$
DECLARE
  v_user UUID := auth.uid(); v_session public.interview_sessions%ROWTYPE;
  v_question public.interview_questions%ROWTYPE; v_operation public.agent_operations%ROWTYPE;
  v_operation_key TEXT := 'evaluate:' || p_question_id::TEXT; v_item JSONB; v_dimension RECORD;
  v_evidence_id UUID; v_message_id UUID; v_event_sequence BIGINT; v_created_at TIMESTAMPTZ := now();
  v_evidence_ids JSONB := '[]'::JSONB; v_applicable JSONB; v_result JSONB;
  v_computed_score INTEGER;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='28000'; END IF;
  SELECT s.* INTO v_session FROM public.interview_sessions s WHERE s.id=p_session_id FOR UPDATE;
  IF NOT FOUND OR v_session.user_id<>v_user OR v_session.agent_version<>'agent-v3'
  THEN RAISE EXCEPTION 'Agent session not found' USING ERRCODE='P0002'; END IF;
  SELECT q.* INTO v_question FROM public.interview_questions q
  WHERE q.id=p_question_id AND q.session_id=p_session_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Question not found' USING ERRCODE='P0002'; END IF;
  v_applicable := v_session.agent_plan->'questionApplicableDimensions'->v_question.order_index;
  IF jsonb_typeof(p_evidence) IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_evidence) > 50
    OR jsonb_typeof(p_evaluation) IS DISTINCT FROM 'object'
    OR public._agent_json_has_sensitive_key(p_evaluation)
    OR jsonb_typeof(v_applicable) IS DISTINCT FROM 'array'
    OR p_evaluation->>'rubricVersion'<>'rubric-v3'
    OR jsonb_typeof(p_evaluation->'dimensions') IS DISTINCT FROM 'object'
    OR (SELECT count(*) FROM jsonb_object_keys(p_evaluation->'dimensions'))<>jsonb_array_length(v_applicable)
    OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(v_applicable) d WHERE NOT (p_evaluation->'dimensions' ? d.value))
    OR (p_evaluation->>'overallScore')::INTEGER NOT BETWEEN 0 AND 100
  THEN RAISE EXCEPTION 'Invalid Agent 3 evaluation payload' USING ERRCODE='22023'; END IF;

  SELECT o.* INTO v_operation FROM public.agent_operations o
  WHERE o.session_id=p_session_id AND o.operation_key=v_operation_key;
  IF FOUND THEN
    IF v_operation.status='completed' THEN
      RETURN jsonb_build_object('committed',FALSE,'duplicate',TRUE,'operationKey',v_operation_key,
        'questionId',p_question_id,'overallScore',(v_operation.result->>'overallScore')::INTEGER,
        'eventSequence',v_operation.last_event_seq,'evidenceIds',v_operation.result->'evidenceIds');
    END IF;
    RAISE EXCEPTION 'Evaluation operation incomplete' USING ERRCODE='55000';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_evidence) LOOP
    BEGIN v_evidence_id=(v_item->>'id')::UUID; v_message_id=(v_item->>'messageId')::UUID;
    EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'Invalid evidence id' USING ERRCODE='22023'; END;
    IF NOT (v_applicable ? (v_item->>'dimensionKey')) OR NOT EXISTS (
      SELECT 1 FROM public.interview_messages m WHERE m.id=v_message_id AND m.question_id=p_question_id
      AND m.role='user' AND pg_catalog.strpos(m.content,v_item->>'quote')>0
    ) THEN RAISE EXCEPTION 'Evidence is not grounded in candidate input' USING ERRCODE='22023'; END IF;
    INSERT INTO public.answer_evidence(id,session_id,question_id,message_id,dimension_key,claim,quote,polarity,confidence)
    VALUES(v_evidence_id,p_session_id,p_question_id,v_message_id,v_item->>'dimensionKey',v_item->>'claim',
      v_item->>'quote',v_item->>'polarity',(v_item->>'confidence')::NUMERIC);
    v_evidence_ids:=v_evidence_ids||jsonb_build_array(v_evidence_id);
  END LOOP;

  FOR v_dimension IN SELECT key,value FROM jsonb_each(p_evaluation->'dimensions') LOOP
    IF NOT (v_applicable ? v_dimension.key)
      OR v_dimension.value->>'status' NOT IN ('scored','not_observed')
      OR pg_catalog.length(COALESCE(v_dimension.value->>'rationale','')) NOT BETWEEN 1 AND 1000
      OR jsonb_typeof(v_dimension.value->'evidenceIds') IS DISTINCT FROM 'array'
      OR (v_dimension.value->>'status'='not_observed' AND (
        jsonb_typeof(v_dimension.value->'score') IS DISTINCT FROM 'null'
        OR jsonb_array_length(v_dimension.value->'evidenceIds')<>0
      ))
      OR (v_dimension.value->>'status'='scored' AND (
        jsonb_typeof(v_dimension.value->'score') IS DISTINCT FROM 'number'
        OR (v_dimension.value->>'score')::INTEGER NOT BETWEEN 0 AND 100
        OR (v_dimension.key<>v_question.dimension_key
          AND jsonb_array_length(v_dimension.value->'evidenceIds')=0)
      ))
      OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(v_dimension.value->'evidenceIds') e
        WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_evidence) source
          WHERE source->>'id'=e.value AND source->>'dimensionKey'=v_dimension.key))
    THEN RAISE EXCEPTION 'Invalid Agent 3 evaluation dimension' USING ERRCODE='22023'; END IF;
    IF v_dimension.key=v_question.dimension_key
      AND (v_dimension.value->>'status'<>'scored' OR v_dimension.value->'score' IS NULL)
    THEN RAISE EXCEPTION 'Primary dimension must be scored' USING ERRCODE='22023'; END IF;
    IF v_dimension.key=v_question.dimension_key
      AND jsonb_array_length(v_dimension.value->'evidenceIds')=0
      AND (v_dimension.value->>'score')::INTEGER<>0
    THEN RAISE EXCEPTION 'Unobserved primary dimension must score zero' USING ERRCODE='22023'; END IF;
  END LOOP;

  SELECT round(sum((item.value->>'score')::NUMERIC * (blueprint->>'weight')::NUMERIC)
    / sum((blueprint->>'weight')::NUMERIC))::INTEGER
  INTO v_computed_score
  FROM jsonb_each(p_evaluation->'dimensions') item
  JOIN jsonb_array_elements(v_session.agent_plan->'capabilityBlueprint'->'dimensions') blueprint
    ON blueprint->>'key'=item.key
  WHERE item.value->>'status'='scored';
  IF v_computed_score IS DISTINCT FROM (p_evaluation->>'overallScore')::INTEGER THEN
    RAISE EXCEPTION 'Evaluation total is not derived from scored dimensions' USING ERRCODE='22023';
  END IF;

  INSERT INTO public.question_evaluations(session_id,question_id,operation_key,rubric_version,prompt_version,
    model_provider,model_name,dimensions,overall_score,feedback,status,error_code)
  VALUES(p_session_id,p_question_id,v_operation_key,'rubric-v3',p_evaluation->>'promptVersion',
    p_evaluation->>'modelProvider',p_evaluation->>'modelName',p_evaluation->'dimensions',
    (p_evaluation->>'overallScore')::INTEGER,p_evaluation->>'feedback','completed',NULL)
  ON CONFLICT(question_id,rubric_version) DO UPDATE SET
    operation_key=EXCLUDED.operation_key,prompt_version=EXCLUDED.prompt_version,
    model_provider=EXCLUDED.model_provider,model_name=EXCLUDED.model_name,
    dimensions=EXCLUDED.dimensions,overall_score=EXCLUDED.overall_score,
    feedback=EXCLUDED.feedback,status='completed',error_code=NULL,created_at=now()
  WHERE question_evaluations.status='evaluation_failed';
  UPDATE public.interview_questions SET
    answer=(SELECT string_agg(m.content,E'\n\n' ORDER BY m.sequence) FROM public.interview_messages m
      WHERE m.question_id=p_question_id AND m.role='user'),
    score=(p_evaluation->>'overallScore')::INTEGER,feedback=p_evaluation->>'feedback',
    dimension_scores=p_evaluation->'dimensions'
  WHERE id=p_question_id;
  v_event_sequence:=v_session.last_event_seq+1;
  INSERT INTO public.agent_events(session_id,sequence,type,payload,created_at) VALUES(
    p_session_id,v_event_sequence,'agent.score_completed',jsonb_build_object(
      'questionId',p_question_id,'overallScore',(p_evaluation->>'overallScore')::INTEGER,
      'dimensions',p_evaluation->'dimensions'),v_created_at);
  v_result:=jsonb_build_object('questionId',p_question_id,'overallScore',(p_evaluation->>'overallScore')::INTEGER,
    'evidenceIds',v_evidence_ids);
  INSERT INTO public.agent_operations(session_id,operation_key,node_name,status,result,first_event_seq,last_event_seq,claimed_at,completed_at)
  VALUES(p_session_id,v_operation_key,'score_question','completed',v_result,v_event_sequence,v_event_sequence,v_created_at,v_created_at);
  UPDATE public.interview_sessions SET last_event_seq=v_event_sequence,last_activity_at=v_created_at WHERE id=p_session_id;
  RETURN jsonb_build_object('committed',TRUE,'duplicate',FALSE,'operationKey',v_operation_key,
    'questionId',p_question_id,'overallScore',(p_evaluation->>'overallScore')::INTEGER,
    'eventSequence',v_event_sequence,'evidenceIds',v_evidence_ids);
END;
$$;

-- Patch the existing ownership-checked workspace with v3 strategy, activities and explicit experience mode.
CREATE OR REPLACE FUNCTION public.get_agent_v3_workspace(p_session_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog
AS $$
DECLARE v_user UUID:=auth.uid(); v_session public.interview_sessions%ROWTYPE; v_result JSONB;
BEGIN
  SELECT s.* INTO v_session FROM public.interview_sessions s
  WHERE s.id=p_session_id AND s.user_id=v_user AND s.agent_version='agent-v3';
  IF NOT FOUND THEN RAISE EXCEPTION 'Agent session not found' USING ERRCODE='P0002'; END IF;
  v_result:=public.get_agent_workspace(p_session_id);
  v_result:=jsonb_set(v_result,'{config,experienceMode}',
    to_jsonb(v_session.agent_config->>'experienceMode'),TRUE);
  v_result:=jsonb_set(v_result,'{strategy}',COALESCE((
    SELECT jsonb_build_object('revision',r.revision,'objective',r.objective,'focusDimensions',r.focus_dimensions,
      'memoryApplied',r.memory_applied,'brainApplied',r.brain_applied)
    FROM public.agent_strategy_revisions r WHERE r.session_id=p_session_id ORDER BY r.revision DESC LIMIT 1
  ),'null'::JSONB),TRUE);
  v_result:=jsonb_set(v_result,'{activities}',COALESCE((
    SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id',a.id,'kind',a.kind,'status',a.status,
      'label',a.label,'reasonCode',a.reason_code,'sourceCount',a.source_count)) ORDER BY a.created_at)
    FROM (SELECT item.* FROM public.agent_activities item WHERE item.session_id=p_session_id
      ORDER BY item.created_at DESC LIMIT 20) a
  ),'[]'::JSONB),TRUE);
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.commit_agent_v3_preparation(UUID,TEXT,TEXT,TEXT,JSONB,JSONB,JSONB,JSONB,JSONB) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.commit_agent_v3_question(UUID,JSONB) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.commit_agent_v3_question_evaluation(UUID,UUID,JSONB,JSONB) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.get_agent_v3_workspace(UUID) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.commit_agent_v3_preparation(UUID,TEXT,TEXT,TEXT,JSONB,JSONB,JSONB,JSONB,JSONB) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.commit_agent_v3_question(UUID,JSONB) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.commit_agent_v3_question_evaluation(UUID,UUID,JSONB,JSONB) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_agent_v3_workspace(UUID) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.check_agent_readiness()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog
AS $$ SELECT '20260715000001'::TEXT $$;
REVOKE ALL ON FUNCTION public.check_agent_readiness() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_agent_readiness() TO anon,authenticated,service_role;

COMMENT ON FUNCTION public.check_agent_readiness() IS
  'Returns the installed single Agent 3 runtime migration version.';
