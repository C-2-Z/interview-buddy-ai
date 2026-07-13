-- PX-A02: add ownership-checked Agent lifecycle transitions, partial reports, and complete deletion.

CREATE OR REPLACE FUNCTION public.manage_agent_session_lifecycle(
  p_session_id UUID,
  p_action TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_session public.interview_sessions%ROWTYPE;
  v_evaluated INTEGER := 0;
  v_total INTEGER := 1;
  v_overall INTEGER := 0;
  v_dimensions JSONB := '{}'::JSONB;
  v_report_available BOOLEAN := FALSE;
  v_status TEXT;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  IF p_action NOT IN ('pause', 'resume', 'finish', 'abandon') THEN
    RAISE EXCEPTION 'Invalid lifecycle action' USING ERRCODE = '22023';
  END IF;

  -- Row locking keeps lifecycle actions ordered with Agent RPC writes for the same session.
  SELECT session.* INTO v_session
  FROM public.interview_sessions AS session
  WHERE session.id = p_session_id
  FOR UPDATE;

  IF NOT FOUND OR v_session.user_id <> v_user OR v_session.agent_version <> 'agent-v1' THEN
    RAISE EXCEPTION 'Agent session not found' USING ERRCODE = 'P0002';
  END IF;

  v_total := GREATEST(COALESCE((v_session.agent_config ->> 'questionCount')::INTEGER, 1), 1);
  SELECT count(*)::INTEGER, COALESCE(round(avg(evaluation.overall_score))::INTEGER, 0)
  INTO v_evaluated, v_overall
  FROM public.question_evaluations AS evaluation
  WHERE evaluation.session_id = p_session_id
    AND evaluation.status = 'completed';

  IF p_action = 'pause' THEN
    IF v_session.status = 'paused' THEN
      NULL;
    ELSIF v_session.status <> 'in_progress' OR v_session.agent_phase <> 'awaiting_answer' THEN
      RAISE EXCEPTION 'Session cannot be paused now' USING ERRCODE = '55000';
    ELSE
      UPDATE public.interview_sessions
      SET status = 'paused', last_activity_at = now()
      WHERE id = p_session_id;
    END IF;
  ELSIF p_action = 'resume' THEN
    IF v_session.status = 'in_progress' THEN
      NULL;
    ELSIF v_session.status <> 'paused' THEN
      RAISE EXCEPTION 'Session cannot be resumed now' USING ERRCODE = '55000';
    ELSE
      UPDATE public.interview_sessions
      SET status = 'in_progress', last_activity_at = now()
      WHERE id = p_session_id;
    END IF;
  ELSIF p_action = 'finish' THEN
    IF v_session.status = 'completed' THEN
      v_report_available := v_session.report_status = 'ready';
    ELSIF v_session.status NOT IN ('in_progress', 'paused') THEN
      RAISE EXCEPTION 'Session cannot be finished now' USING ERRCODE = '55000';
    ELSE
      -- Aggregate arbitrary rubric keys from frozen evaluations without reading answer/message text.
      SELECT COALESCE(
        jsonb_object_agg(summary.dimension_key, jsonb_build_object(
          'score', summary.average_score,
          'count', summary.score_count
        )),
        '{}'::JSONB
      )
      INTO v_dimensions
      FROM (
        SELECT item.key AS dimension_key,
          round(avg((item.value ->> 'score')::NUMERIC))::INTEGER AS average_score,
          count(*)::INTEGER AS score_count
        FROM public.question_evaluations AS evaluation
        CROSS JOIN LATERAL jsonb_each(evaluation.dimensions) AS item
        WHERE evaluation.session_id = p_session_id
          AND evaluation.status = 'completed'
        GROUP BY item.key
      ) AS summary;

      UPDATE public.interview_sessions
      SET status = 'completed',
        agent_phase = 'completed',
        overall_score = v_overall,
        overall_feedback = CASE
          WHEN v_evaluated = 0 THEN '本场面试已提前结束，尚无已完成评分的题目。建议重新开始一次练习。'
          ELSE format('本场面试已提前结束，报告基于 %s/%s 道已完成评分的题目生成。', v_evaluated, v_total)
        END,
        dimension_summary = jsonb_build_object(
          'completionStatus', 'partial',
          'evaluatedQuestionCount', v_evaluated,
          'totalQuestionCount', v_total,
          'overallScore', v_overall,
          'dimensions', v_dimensions
        ),
        report_status = 'ready',
        last_activity_at = now()
      WHERE id = p_session_id;
      v_report_available := TRUE;
    END IF;
  ELSE
    IF v_session.status = 'abandoned' THEN
      NULL;
    ELSIF v_session.status NOT IN ('in_progress', 'paused') THEN
      RAISE EXCEPTION 'Session cannot be abandoned now' USING ERRCODE = '55000';
    ELSE
      UPDATE public.interview_sessions
      SET status = 'abandoned', last_activity_at = now()
      WHERE id = p_session_id;
    END IF;
  END IF;

  SELECT session.status, session.report_status = 'ready'
  INTO v_status, v_report_available
  FROM public.interview_sessions AS session
  WHERE session.id = p_session_id;

  RETURN jsonb_build_object(
    'sessionId', p_session_id,
    'status', v_status,
    'reportAvailable', v_report_available,
    'evaluatedQuestionCount', v_evaluated,
    'totalQuestionCount', v_total
  );
END;
$$;

REVOKE ALL ON FUNCTION public.manage_agent_session_lifecycle(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manage_agent_session_lifecycle(UUID, TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.delete_agent_session(p_session_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_session public.interview_sessions%ROWTYPE;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  SELECT session.* INTO v_session
  FROM public.interview_sessions AS session
  WHERE session.id = p_session_id
  FOR UPDATE;

  IF NOT FOUND OR v_session.user_id <> v_user OR v_session.agent_version <> 'agent-v1' THEN
    RAISE EXCEPTION 'Agent session not found' USING ERRCODE = 'P0002';
  END IF;

  -- Foreign keys cascade all business projections; the API removes the external checkpoint afterward.
  DELETE FROM public.interview_sessions WHERE id = p_session_id;
  RETURN jsonb_build_object(
    'sessionId', p_session_id,
    'threadId', v_session.thread_id,
    'deleted', TRUE
  );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_agent_session(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_agent_session(UUID) TO authenticated, service_role;
