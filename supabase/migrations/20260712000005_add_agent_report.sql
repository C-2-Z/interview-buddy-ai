-- Interview Agent Phase 4: finalize reports only from frozen question evaluations.

CREATE OR REPLACE FUNCTION public.finalize_agent_report(p_session_id UUID,p_report JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE
  v_user UUID:=auth.uid();v_session public.interview_sessions%ROWTYPE;v_operation public.agent_operations%ROWTYPE;
  v_key TEXT:='finalize:report';v_sequence BIGINT;v_created TIMESTAMPTZ:=now();v_result JSONB;v_expected INTEGER;
  v_computed_overall INTEGER;v_rubric_count INTEGER;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='28000';END IF;
  SELECT s.* INTO v_session FROM public.interview_sessions s WHERE s.id=p_session_id FOR UPDATE;
  IF NOT FOUND OR v_session.user_id<>v_user OR v_session.agent_version<>'agent-v1' THEN RAISE EXCEPTION 'Agent session not found' USING ERRCODE='P0002';END IF;
  SELECT o.* INTO v_operation FROM public.agent_operations o WHERE o.session_id=p_session_id AND o.operation_key=v_key;
  IF FOUND THEN
    IF v_operation.node_name<>'finalize_report' THEN RAISE EXCEPTION 'Report operation conflict' USING ERRCODE='23505';END IF;
    IF v_operation.status='completed' THEN RETURN jsonb_build_object('committed',FALSE,'duplicate',TRUE,'operationKey',v_key,'sessionId',p_session_id,'overallScore',(v_operation.result->>'overallScore')::INTEGER,'eventSequence',v_operation.last_event_seq);END IF;
    RAISE EXCEPTION 'Report operation incomplete' USING ERRCODE='55000';
  END IF;
  v_expected:=(v_session.agent_config->>'questionCount')::INTEGER;
  v_rubric_count:=jsonb_array_length(v_session.agent_plan->'capabilityBlueprint'->'dimensions');
  WITH dimension_scores AS (
    SELECT
      dimension->>'key' AS dimension_key,
      (dimension->>'weight')::NUMERIC AS weight,
      pg_catalog.round(pg_catalog.avg((evaluation.dimensions->(dimension->>'key')->>'score')::NUMERIC))::INTEGER AS score
    FROM jsonb_array_elements(v_session.agent_plan->'capabilityBlueprint'->'dimensions') dimension
    CROSS JOIN public.question_evaluations evaluation
    WHERE evaluation.session_id=p_session_id AND evaluation.status='completed'
    GROUP BY dimension->>'key',dimension->>'weight'
  )
  SELECT pg_catalog.round(pg_catalog.sum(score*weight)/pg_catalog.sum(weight))::INTEGER
  INTO v_computed_overall FROM dimension_scores;
  IF jsonb_typeof(p_report) IS DISTINCT FROM 'object' OR public._agent_json_has_sensitive_key(p_report)
    OR p_report->>'sessionId' IS DISTINCT FROM p_session_id::TEXT
    OR (p_report->>'questionCount')::INTEGER<>v_expected
    OR (p_report->>'overallScore')::INTEGER IS DISTINCT FROM v_computed_overall
    OR jsonb_typeof(p_report->'dimensionSummary') IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_report->'dimensionSummary'->'dimensions') IS DISTINCT FROM 'object'
    OR (SELECT count(*) FROM jsonb_object_keys(p_report->'dimensionSummary'->'dimensions'))<>v_rubric_count
    OR (p_report->'dimensionSummary'->>'overallScore')::INTEGER IS DISTINCT FROM v_computed_overall
    OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements(v_session.agent_plan->'capabilityBlueprint'->'dimensions') dimension
      WHERE (p_report->'dimensionSummary'->'dimensions'->(dimension->>'key')->>'score')::INTEGER IS DISTINCT FROM (
        SELECT pg_catalog.round(pg_catalog.avg((evaluation.dimensions->(dimension->>'key')->>'score')::NUMERIC))::INTEGER
        FROM public.question_evaluations evaluation
        WHERE evaluation.session_id=p_session_id AND evaluation.status='completed'
      )
      OR (p_report->'dimensionSummary'->'dimensions'->(dimension->>'key')->>'count')::INTEGER IS DISTINCT FROM v_expected
      OR (p_report->'dimensionSummary'->'dimensions'->(dimension->>'key')->>'weight')::NUMERIC IS DISTINCT FROM (dimension->>'weight')::NUMERIC
    )
    OR (SELECT count(*) FROM public.question_evaluations e WHERE e.session_id=p_session_id AND e.status='completed')<>v_expected
  THEN RAISE EXCEPTION 'Report is not based on all frozen evaluations' USING ERRCODE='22023';END IF;
  UPDATE public.interview_sessions SET overall_score=(p_report->>'overallScore')::INTEGER,overall_feedback=p_report->>'overallFeedback',dimension_summary=p_report->'dimensionSummary',report_status='ready',status='completed',agent_phase='completed',last_activity_at=v_created WHERE id=p_session_id;
  v_sequence:=v_session.last_event_seq+1;
  INSERT INTO public.agent_events(session_id,sequence,type,payload,created_at) VALUES(p_session_id,v_sequence,'agent.session_completed',p_report,v_created);
  v_result:=jsonb_build_object('overallScore',(p_report->>'overallScore')::INTEGER);
  INSERT INTO public.agent_operations(session_id,operation_key,node_name,status,result,first_event_seq,last_event_seq,claimed_at,completed_at) VALUES(p_session_id,v_key,'finalize_report','completed',v_result,v_sequence,v_sequence,v_created,v_created);
  UPDATE public.interview_sessions SET last_event_seq=v_sequence WHERE id=p_session_id;
  RETURN jsonb_build_object('committed',TRUE,'duplicate',FALSE,'operationKey',v_key,'sessionId',p_session_id,'overallScore',(p_report->>'overallScore')::INTEGER,'eventSequence',v_sequence);
END;$$;

REVOKE ALL ON FUNCTION public.finalize_agent_report(UUID,JSONB) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.finalize_agent_report(UUID,JSONB) TO authenticated,service_role;
