-- Agent workspace projection: collapse page recovery into one ownership-checked read RPC.
CREATE OR REPLACE FUNCTION public.get_agent_workspace(p_session_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_session public.interview_sessions%ROWTYPE;
  v_snapshot JSONB;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  -- Ownership is checked inside the security-definer function before any child table is read.
  SELECT session.*
  INTO v_session
  FROM public.interview_sessions AS session
  WHERE session.id = p_session_id
    AND session.user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agent session not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT event.payload
  INTO v_snapshot
  FROM public.agent_events AS event
  WHERE event.session_id = p_session_id
    AND event.type = 'agent.snapshot'
  ORDER BY event.sequence DESC
  LIMIT 1;

  IF v_snapshot IS NULL THEN
    RAISE EXCEPTION 'Agent snapshot not found' USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object(
    'productStatus', v_session.status,
    'snapshot', v_snapshot,
    'config', jsonb_build_object(
      'position', v_session.position,
      'difficulty', v_session.difficulty,
      'questionCount', COALESCE((v_session.agent_config->>'questionCount')::INTEGER, v_session.requested_count),
      'targetCompany', v_session.agent_config->'targetCompany'
    ),
    'research', jsonb_build_object(
      'status', v_session.research_status,
      'sources', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', source.id,
          'category', source.category,
          'title', source.title,
          'url', source.url
        ) ORDER BY source.created_at ASC)
        FROM public.agent_research_sources AS source
        WHERE source.session_id = p_session_id
      ), '[]'::JSONB)
    ),
    'strategy', CASE WHEN v_session.agent_version = 'agent-v2' THEN (
      SELECT jsonb_build_object(
        'revision', strategy.revision,
        'objective', strategy.objective,
        'focusDimensions', strategy.focus_dimensions,
        'memoryApplied', strategy.memory_applied,
        'brainApplied', strategy.brain_applied
      )
      FROM public.agent_strategy_revisions AS strategy
      WHERE strategy.session_id = p_session_id
      ORDER BY strategy.revision DESC
      LIMIT 1
    ) ELSE NULL END,
    'activities', CASE WHEN v_session.agent_version = 'agent-v2' THEN COALESCE((
      SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id', activity.id,
        'kind', activity.kind,
        'status', activity.status,
        'label', activity.label,
        'reasonCode', activity.reason_code,
        'sourceCount', activity.source_count
      )) ORDER BY activity.created_at ASC)
      FROM (
        SELECT item.*
        FROM public.agent_activities AS item
        WHERE item.session_id = p_session_id
        ORDER BY item.created_at DESC
        LIMIT 20
      ) AS activity
    ), '[]'::JSONB) ELSE '[]'::JSONB END,
    'questions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', question.id,
        'question', question.question,
        'orderIndex', question.order_index,
        'roleId', question.role_id,
        'dimensionKey', question.dimension_key,
        'source', question.selection_source,
        'score', question.score,
        'feedback', question.feedback,
        'messages', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id', message.id,
            'role', message.role,
            'content', message.content,
            'source', COALESCE(message.source, 'text'),
            'interrupted', COALESCE(message.interrupted, FALSE),
            'createdAt', message.created_at
          ) ORDER BY message.created_at ASC)
          FROM public.interview_messages AS message
          WHERE message.question_id = question.id
        ), '[]'::JSONB),
        'evidence', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id', evidence.id,
            'dimensionKey', evidence.dimension_key,
            'claim', evidence.claim,
            'quote', evidence.quote
          ) ORDER BY evidence.created_at ASC)
          FROM public.answer_evidence AS evidence
          WHERE evidence.question_id = question.id
        ), '[]'::JSONB),
        'evaluation', (
          SELECT jsonb_build_object(
            'overallScore', evaluation.overall_score,
            'dimensions', evaluation.dimensions
          )
          FROM public.question_evaluations AS evaluation
          WHERE evaluation.question_id = question.id
            AND evaluation.status = 'completed'
          ORDER BY evaluation.created_at DESC
          LIMIT 1
        )
      ) ORDER BY question.order_index ASC)
      FROM public.interview_questions AS question
      WHERE question.session_id = p_session_id
    ), '[]'::JSONB),
    'report', CASE
      WHEN v_session.report_status = 'ready'
        AND v_session.overall_score IS NOT NULL
        AND v_session.overall_feedback IS NOT NULL
      THEN jsonb_build_object(
        'overallScore', v_session.overall_score,
        'overallFeedback', v_session.overall_feedback,
        'dimensionSummary', v_session.dimension_summary
      )
      ELSE NULL
    END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_agent_workspace(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_agent_workspace(UUID) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_agent_workspace(UUID) IS
  'Returns the safe Agent page projection in one round trip after enforcing session ownership.';

CREATE OR REPLACE FUNCTION public.check_agent_readiness()
RETURNS TEXT
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$ SELECT '20260714000006'::TEXT $$;

REVOKE ALL ON FUNCTION public.check_agent_readiness() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_agent_readiness() TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.check_agent_readiness() IS
  'Returns the installed Agent readiness migration including the single-query workspace projection.';
