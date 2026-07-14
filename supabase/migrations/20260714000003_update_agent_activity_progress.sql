-- Agent v2 preparation progress migration: update running activities in place and expose the new readiness version.
CREATE OR REPLACE FUNCTION public.record_agent_activity(p_session_id UUID, p_activity JSONB)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE v_user UUID := auth.uid(); v_id UUID; v_sequence BIGINT;
BEGIN
  IF v_user IS NULL OR p_activity IS NULL OR jsonb_typeof(p_activity) <> 'object'
    OR public._agent_json_has_sensitive_key(p_activity)
  THEN RAISE EXCEPTION 'Invalid activity' USING ERRCODE = '22023'; END IF;
  PERFORM 1 FROM public.interview_sessions s
   WHERE s.id = p_session_id AND s.user_id = v_user AND s.agent_version = 'agent-v2';
  IF NOT FOUND THEN RAISE EXCEPTION 'Agent session not found' USING ERRCODE = 'P0002'; END IF;
  v_id := (p_activity->>'id')::UUID;

  -- Planner and tool lifecycle events share one stable id so the UI can replace running with its terminal state.
  INSERT INTO public.agent_activities(id, session_id, kind, status, label, reason_code, source_count)
  VALUES (v_id, p_session_id, p_activity->>'kind', p_activity->>'status', p_activity->>'label',
    NULLIF(p_activity->>'reasonCode', ''), NULLIF(p_activity->>'sourceCount', '')::INTEGER)
  ON CONFLICT (id) DO UPDATE SET
    status = EXCLUDED.status,
    label = EXCLUDED.label,
    reason_code = EXCLUDED.reason_code,
    source_count = EXCLUDED.source_count
  WHERE public.agent_activities.session_id = EXCLUDED.session_id;

  IF p_activity->>'kind' = 'tool' THEN
    INSERT INTO public.agent_tool_runs(
      id, session_id, tool_name, status, reason_code, source_count,
      result_summary, result_hash, duration_ms
    ) VALUES (
      v_id, p_session_id, COALESCE(NULLIF(p_activity->>'toolName', ''), 'context_tool'),
      p_activity->>'status', NULLIF(p_activity->>'reasonCode', ''),
      COALESCE((p_activity->>'sourceCount')::INTEGER, 0),
      left(COALESCE(p_activity->>'resultSummary', ''), 300),
      COALESCE(NULLIF(p_activity->>'resultHash', ''), repeat('0', 64)),
      LEAST(600000, GREATEST(0, COALESCE((p_activity->>'durationMs')::INTEGER, 0)))
    )
    ON CONFLICT (id) DO UPDATE SET
      status = EXCLUDED.status,
      reason_code = EXCLUDED.reason_code,
      source_count = EXCLUDED.source_count,
      result_summary = EXCLUDED.result_summary,
      result_hash = EXCLUDED.result_hash,
      duration_ms = EXCLUDED.duration_ms
    WHERE public.agent_tool_runs.session_id = EXCLUDED.session_id;
  END IF;

  -- Every lifecycle transition remains an append-only public event for SSE replay and audit.
  UPDATE public.interview_sessions
    SET last_event_seq = last_event_seq + 1, last_activity_at = now()
    WHERE id = p_session_id
    RETURNING last_event_seq INTO v_sequence;
  INSERT INTO public.agent_events(session_id, sequence, type, payload)
  VALUES (p_session_id, v_sequence, 'agent.activity', jsonb_build_object(
    'id', v_id,
    'kind', p_activity->>'kind',
    'status', p_activity->>'status',
    'label', p_activity->>'label',
    'reasonCode', NULLIF(p_activity->>'reasonCode', ''),
    'sourceCount', NULLIF(p_activity->>'sourceCount', '')::INTEGER
  ));
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_agent_activity(UUID, JSONB) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.check_agent_readiness()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$ SELECT '20260714000003'::TEXT $$;

GRANT EXECUTE ON FUNCTION public.check_agent_readiness() TO anon, authenticated, service_role;
COMMENT ON FUNCTION public.record_agent_activity(UUID, JSONB) IS
  'Creates or advances a user-visible Agent v2 activity while preserving append-only activity events.';
COMMENT ON FUNCTION public.check_agent_readiness() IS
  'Read-only Agent infrastructure probe for the Agent v2 preparation progress migration.';
