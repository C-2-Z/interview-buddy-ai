-- Interview Agent Phase 4: prompt-version and token-aware model attempt audit.

-- Capability blueprints legitimately use dimensions[].key. Keep concrete secret-key patterns blocked
-- without rejecting this generic business field in every durable Agent JSON document.
CREATE OR REPLACE FUNCTION public._agent_json_has_sensitive_key(p_value JSONB)
RETURNS BOOLEAN LANGUAGE plpgsql IMMUTABLE STRICT SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE v_key TEXT;v_child JSONB;v_normalized_key TEXT;
BEGIN
  IF jsonb_typeof(p_value)='object' THEN
    FOR v_key,v_child IN SELECT entry.key,entry.value FROM pg_catalog.jsonb_each(p_value) AS entry(key,value) LOOP
      v_normalized_key:=pg_catalog.regexp_replace(pg_catalog.lower(v_key),'[^a-z0-9]','','g');
      IF v_normalized_key IN('token','bearer','jwt','dsn','credential','credentials')
        OR v_normalized_key~'(api|access|secret|private|encryption|signing|service(role)?|publishable|supabase|openai|anthropic|deepseek)key$'
        OR v_normalized_key~'(access|refresh|auth|id|session|bearer)token$'
        OR v_normalized_key~'(authorization|clientsecret|password|databaseurl|connectionstring|sessioncookie)$'
      THEN RETURN TRUE;END IF;
      IF public._agent_json_has_sensitive_key(v_child) THEN RETURN TRUE;END IF;
    END LOOP;
  ELSIF jsonb_typeof(p_value)='array' THEN
    FOR v_child IN SELECT item.value FROM pg_catalog.jsonb_array_elements(p_value) AS item(value) LOOP
      IF public._agent_json_has_sensitive_key(v_child) THEN RETURN TRUE;END IF;
    END LOOP;
  END IF;
  RETURN FALSE;
END;$$;

REVOKE ALL ON FUNCTION public._agent_json_has_sensitive_key(JSONB) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public._agent_json_has_sensitive_key(JSONB) TO authenticated,service_role;

ALTER TABLE public.agent_runs ADD COLUMN IF NOT EXISTS prompt_version TEXT;

CREATE OR REPLACE FUNCTION public.record_agent_run(p_session_id UUID,p_run JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_user UUID:=auth.uid();v_session_user UUID;v_attempt INTEGER;v_status TEXT;v_error TEXT;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='28000';END IF;
  SELECT user_id INTO v_session_user FROM public.interview_sessions WHERE id=p_session_id FOR UPDATE;
  IF NOT FOUND OR v_session_user<>v_user THEN RAISE EXCEPTION 'Agent session not found' USING ERRCODE='P0002';END IF;
  IF jsonb_typeof(p_run) IS DISTINCT FROM 'object' OR public._agent_json_has_sensitive_key(p_run)
    OR p_run->>'sessionId' IS DISTINCT FROM p_session_id::TEXT
    OR p_run->>'status' NOT IN('completed','failed')
  THEN RAISE EXCEPTION 'Invalid Agent run audit' USING ERRCODE='22023';END IF;
  v_status:=p_run->>'status';v_error:=NULLIF(p_run->>'errorCode','');
  IF (v_status='completed' AND v_error IS NOT NULL) OR (v_status='failed' AND v_error IS NULL) THEN RAISE EXCEPTION 'Invalid Agent run status' USING ERRCODE='22023';END IF;
  SELECT COALESCE(max(attempt),0)+1 INTO v_attempt FROM public.agent_runs WHERE session_id=p_session_id AND operation_key=p_run->>'operationKey';
  INSERT INTO public.agent_runs(session_id,operation_key,node_name,attempt,status,started_at,completed_at,duration_ms,model_provider,model_name,prompt_version,prompt_tokens,completion_tokens,total_tokens,error_code)
  VALUES(p_session_id,p_run->>'operationKey',p_run->>'nodeName',v_attempt,v_status,now()-make_interval(secs=>((p_run->>'durationMs')::NUMERIC/1000)),now(),(p_run->>'durationMs')::BIGINT,p_run->>'modelProvider',p_run->>'modelName',p_run->>'promptVersion',(p_run->>'promptTokens')::INTEGER,(p_run->>'completionTokens')::INTEGER,(p_run->>'totalTokens')::INTEGER,v_error);
  RETURN jsonb_build_object('recorded',TRUE,'attempt',v_attempt);
END;$$;

REVOKE ALL ON FUNCTION public.record_agent_run(UUID,JSONB) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_agent_run(UUID,JSONB) TO authenticated,service_role;
