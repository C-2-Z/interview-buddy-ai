-- Agent 2.0：双版本契约、策略修订、动态工具审计、Brain 引用与主动授权训练记忆。

ALTER TABLE public.interview_sessions
  DROP CONSTRAINT IF EXISTS interview_sessions_agent_version_check;
ALTER TABLE public.interview_sessions
  ADD CONSTRAINT interview_sessions_agent_version_check
  CHECK (agent_version IS NULL OR agent_version IN ('agent-v1', 'agent-v2'));

ALTER TABLE public.interview_sessions
  DROP CONSTRAINT IF EXISTS interview_sessions_prepared_contract_check;
ALTER TABLE public.interview_sessions
  ADD CONSTRAINT interview_sessions_prepared_contract_check
  CHECK (
    (agent_plan IS NULL AND prepared_at IS NULL)
    OR (agent_version IN ('agent-v1', 'agent-v2') AND agent_plan IS NOT NULL AND prepared_at IS NOT NULL)
  );

CREATE TABLE IF NOT EXISTS public.agent_strategy_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.interview_sessions(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL CHECK (revision > 0),
  kind TEXT NOT NULL CHECK (kind IN ('planning', 'reflection')),
  objective TEXT NOT NULL CHECK (length(objective) BETWEEN 5 AND 300),
  focus_dimensions JSONB NOT NULL CHECK (jsonb_typeof(focus_dimensions) = 'array'),
  question_intent TEXT NOT NULL CHECK (length(question_intent) BETWEEN 5 AND 500),
  tool_requests JSONB NOT NULL DEFAULT '[]'::JSONB CHECK (jsonb_typeof(tool_requests) = 'array'),
  memory_applied BOOLEAN NOT NULL DEFAULT FALSE,
  brain_applied BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT agent_strategy_session_revision_key UNIQUE (session_id, revision),
  CONSTRAINT agent_strategy_safe_json CHECK (
    NOT public._agent_json_has_sensitive_key(focus_dimensions)
    AND NOT public._agent_json_has_sensitive_key(tool_requests)
  )
);

CREATE TABLE IF NOT EXISTS public.agent_activities (
  id UUID PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.interview_sessions(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('planning', 'tool', 'reflection', 'memory')),
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'skipped', 'failed')),
  label TEXT NOT NULL CHECK (length(label) BETWEEN 2 AND 100),
  reason_code TEXT CHECK (reason_code IS NULL OR length(reason_code) BETWEEN 1 AND 100),
  source_count INTEGER CHECK (source_count IS NULL OR source_count BETWEEN 0 AND 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.agent_tool_runs (
  id UUID PRIMARY KEY REFERENCES public.agent_activities(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES public.interview_sessions(id) ON DELETE CASCADE,
  tool_name TEXT NOT NULL CHECK (tool_name IN (
    'search_question_bank', 'web_search', 'search_knowledge',
    'load_session_messages', 'load_training_profile', 'context_tool'
  )),
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'skipped', 'failed')),
  reason_code TEXT,
  source_count INTEGER NOT NULL DEFAULT 0 CHECK (source_count BETWEEN 0 AND 1000),
  result_summary TEXT NOT NULL DEFAULT '' CHECK (length(result_summary) <= 300),
  result_hash TEXT NOT NULL DEFAULT repeat('0', 64) CHECK (result_hash ~ '^[0-9a-f]{64}$'),
  duration_ms INTEGER NOT NULL DEFAULT 0 CHECK (duration_ms BETWEEN 0 AND 600000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.agent_knowledge_citations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.interview_sessions(id) ON DELETE CASCADE,
  brain_id UUID NOT NULL REFERENCES public.knowledge_brains(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES public.knowledge_documents(id) ON DELETE CASCADE,
  chunk_id UUID NOT NULL REFERENCES public.knowledge_chunks(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (length(title) <= 300),
  snippet TEXT NOT NULL CHECK (length(snippet) <= 1000),
  similarity DOUBLE PRECISION NOT NULL CHECK (similarity BETWEEN 0 AND 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT agent_knowledge_session_chunk_key UNIQUE (session_id, chunk_id)
);

CREATE TABLE IF NOT EXISTS public.agent_training_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  summary JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT agent_training_summary_object CHECK (
    summary IS NULL OR (jsonb_typeof(summary) = 'object' AND NOT public._agent_json_has_sensitive_key(summary))
  )
);

CREATE INDEX IF NOT EXISTS idx_agent_strategy_session_revision
  ON public.agent_strategy_revisions(session_id, revision DESC);
CREATE INDEX IF NOT EXISTS idx_agent_activities_session_created
  ON public.agent_activities(session_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_agent_tool_runs_session_created
  ON public.agent_tool_runs(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_knowledge_session_created
  ON public.agent_knowledge_citations(session_id, created_at ASC);

ALTER TABLE public.agent_strategy_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_tool_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_knowledge_citations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_training_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own agent strategies" ON public.agent_strategy_revisions;
CREATE POLICY "Users read own agent strategies" ON public.agent_strategy_revisions
FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.interview_sessions s WHERE s.id = session_id AND s.user_id = auth.uid())
);
DROP POLICY IF EXISTS "Users read own agent activities" ON public.agent_activities;
CREATE POLICY "Users read own agent activities" ON public.agent_activities
FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.interview_sessions s WHERE s.id = session_id AND s.user_id = auth.uid())
);
DROP POLICY IF EXISTS "Users read own agent tool runs" ON public.agent_tool_runs;
CREATE POLICY "Users read own agent tool runs" ON public.agent_tool_runs
FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.interview_sessions s WHERE s.id = session_id AND s.user_id = auth.uid())
);
DROP POLICY IF EXISTS "Users read own agent knowledge citations" ON public.agent_knowledge_citations;
CREATE POLICY "Users read own agent knowledge citations" ON public.agent_knowledge_citations
FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.interview_sessions s WHERE s.id = session_id AND s.user_id = auth.uid())
);
DROP POLICY IF EXISTS "Users manage own agent training profile" ON public.agent_training_profiles;
CREATE POLICY "Users manage own agent training profile" ON public.agent_training_profiles
FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

REVOKE ALL ON public.agent_strategy_revisions, public.agent_activities, public.agent_tool_runs, public.agent_knowledge_citations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.agent_strategy_revisions, public.agent_activities, public.agent_tool_runs, public.agent_knowledge_citations TO authenticated;
GRANT ALL ON public.agent_training_profiles TO authenticated;
GRANT ALL ON public.agent_strategy_revisions, public.agent_activities, public.agent_tool_runs, public.agent_knowledge_citations, public.agent_training_profiles TO service_role;

CREATE OR REPLACE FUNCTION public.commit_agent_strategy_revision(p_session_id UUID, p_strategy JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_revision INTEGER;
  v_id UUID := gen_random_uuid();
BEGIN
  IF v_user IS NULL OR p_strategy IS NULL OR jsonb_typeof(p_strategy) <> 'object'
    OR public._agent_json_has_sensitive_key(p_strategy)
  THEN RAISE EXCEPTION 'Invalid strategy' USING ERRCODE = '22023'; END IF;
  PERFORM 1 FROM public.interview_sessions s
   WHERE s.id = p_session_id AND s.user_id = v_user AND s.agent_version = 'agent-v2'
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Agent session not found' USING ERRCODE = 'P0002'; END IF;
  IF p_strategy->>'kind' NOT IN ('planning', 'reflection')
    OR jsonb_typeof(p_strategy->'focusDimensions') <> 'array'
    OR jsonb_array_length(p_strategy->'focusDimensions') NOT BETWEEN 1 AND 5
    OR jsonb_typeof(p_strategy->'toolRequests') <> 'array'
    OR jsonb_array_length(p_strategy->'toolRequests') > 3
  THEN RAISE EXCEPTION 'Invalid strategy' USING ERRCODE = '22023'; END IF;
  SELECT COALESCE(max(revision), 0) + 1 INTO v_revision
    FROM public.agent_strategy_revisions WHERE session_id = p_session_id;
  INSERT INTO public.agent_strategy_revisions(
    id, session_id, revision, kind, objective, focus_dimensions, question_intent,
    tool_requests, memory_applied, brain_applied
  ) VALUES (
    v_id, p_session_id, v_revision, p_strategy->>'kind', p_strategy->>'objective',
    p_strategy->'focusDimensions', p_strategy->>'questionIntent', p_strategy->'toolRequests',
    COALESCE((p_strategy->>'memoryApplied')::BOOLEAN, FALSE),
    COALESCE((p_strategy->>'brainApplied')::BOOLEAN, FALSE)
  );
  RETURN jsonb_build_object('id', v_id, 'revision', v_revision);
END;
$$;

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
  INSERT INTO public.agent_activities(id, session_id, kind, status, label, reason_code, source_count)
  VALUES (v_id, p_session_id, p_activity->>'kind', p_activity->>'status', p_activity->>'label',
    NULLIF(p_activity->>'reasonCode', ''), NULLIF(p_activity->>'sourceCount', '')::INTEGER);
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
    );
  END IF;
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

CREATE OR REPLACE FUNCTION public.record_agent_knowledge_citations(p_session_id UUID, p_citations JSONB)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE v_user UUID := auth.uid(); v_brain UUID; v_item JSONB;
BEGIN
  IF v_user IS NULL OR jsonb_typeof(p_citations) <> 'array' OR jsonb_array_length(p_citations) > 5
    OR public._agent_json_has_sensitive_key(p_citations)
  THEN RAISE EXCEPTION 'Invalid citations' USING ERRCODE = '22023'; END IF;
  SELECT NULLIF(s.agent_config->>'brainId', '')::UUID INTO v_brain
    FROM public.interview_sessions s
   WHERE s.id = p_session_id AND s.user_id = v_user AND s.agent_version = 'agent-v2';
  IF NOT FOUND OR v_brain IS NULL THEN RAISE EXCEPTION 'Agent session not found' USING ERRCODE = 'P0002'; END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_citations) LOOP
    IF (v_item->>'brainId')::UUID IS DISTINCT FROM v_brain THEN
      RAISE EXCEPTION 'Citation brain mismatch' USING ERRCODE = '42501';
    END IF;
    INSERT INTO public.agent_knowledge_citations(session_id, brain_id, document_id, chunk_id, title, snippet, similarity)
    VALUES (p_session_id, v_brain, (v_item->>'documentId')::UUID, (v_item->>'chunkId')::UUID,
      left(COALESCE(v_item->>'title', ''), 300), left(COALESCE(v_item->>'snippet', ''), 1000),
      (v_item->>'similarity')::DOUBLE PRECISION)
    ON CONFLICT (session_id, chunk_id) DO NOTHING;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_agent_training_memory(p_enabled BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE v_user UUID := auth.uid();
BEGIN
  IF v_user IS NULL OR p_enabled IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.agent_training_profiles(user_id, enabled, summary, updated_at)
  VALUES (v_user, p_enabled, NULL, now())
  ON CONFLICT (user_id) DO UPDATE
    SET enabled = EXCLUDED.enabled, updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.clear_agent_training_memory()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE v_user UUID := auth.uid();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.agent_training_profiles(user_id, enabled, summary, updated_at)
  VALUES (v_user, FALSE, NULL, now())
  ON CONFLICT (user_id) DO UPDATE
    SET summary = NULL, updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.commit_agent_training_summary(p_summary JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE v_user UUID := auth.uid();
BEGIN
  IF v_user IS NULL OR p_summary IS NULL OR jsonb_typeof(p_summary) <> 'object'
    OR public._agent_json_has_sensitive_key(p_summary)
  THEN RAISE EXCEPTION 'Invalid training summary' USING ERRCODE = '22023'; END IF;
  UPDATE public.agent_training_profiles
     SET summary = p_summary, updated_at = now()
   WHERE user_id = v_user AND enabled = TRUE;
  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION public.commit_agent_strategy_revision(UUID, JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_agent_activity(UUID, JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_agent_knowledge_citations(UUID, JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_agent_training_memory(BOOLEAN) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.clear_agent_training_memory() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.commit_agent_training_summary(JSONB) TO authenticated, service_role;

-- 已部署环境中的 Canonical RPC 曾显式拒绝非 v1；只扩展版本判别，不改变其余业务规则。
DO $$
DECLARE v_record RECORD; v_definition TEXT;
BEGIN
  FOR v_record IN
    SELECT p.oid
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = ANY (ARRAY[
      'claim_agent_operation', 'commit_agent_operation', 'fail_agent_operation',
      'commit_agent_preparation', 'accept_agent_input', 'commit_agent_interviewer_response',
      'commit_agent_next_question', 'commit_agent_question_evaluation',
      'mark_agent_evaluation_failed', 'finalize_agent_report',
      'manage_agent_session_lifecycle', 'delete_agent_session', '_project_agent_current_question'
    ])
  LOOP
    v_definition := pg_get_functiondef(v_record.oid);
    v_definition := replace(v_definition, 'agent_version = ''agent-v1''', 'agent_version IN (''agent-v1'', ''agent-v2'')');
    v_definition := replace(v_definition, 'agent_version=''agent-v1''', 'agent_version IN (''agent-v1'', ''agent-v2'')');
    v_definition := replace(v_definition, 'agent_version <> ''agent-v1''', 'agent_version NOT IN (''agent-v1'', ''agent-v2'')');
    v_definition := replace(v_definition, 'agent_version<>''agent-v1''', 'agent_version NOT IN (''agent-v1'', ''agent-v2'')');
    v_definition := replace(v_definition, 'v_agent_version <> ''agent-v1''', 'v_agent_version NOT IN (''agent-v1'', ''agent-v2'')');
    EXECUTE v_definition;
  END LOOP;
END;
$$;

-- 创建 RPC 还需把版本、Brain 和记忆授权冻结到配置；通过原定义做受控文本升级以保留既有校验。
DO $$
DECLARE v_definition TEXT;
BEGIN
  SELECT pg_get_functiondef('public.create_agent_interview_session(jsonb)'::regprocedure) INTO v_definition;
  -- pg_get_functiondef preserves the original function body's CRLF newlines on some deployments.
  -- Normalize them before applying guarded text replacements so the upgrade is cross-platform.
  v_definition := replace(v_definition, E'\r\n', E'\n');
  v_definition := replace(v_definition, '''agent-v1''', 'v_agent_version');
  v_definition := replace(v_definition, '  v_prompt_version TEXT;', E'  v_prompt_version TEXT;\n  v_agent_version TEXT;\n  v_brain_id UUID;\n  v_use_training_memory BOOLEAN;');
  v_definition := replace(v_definition, E'      ''promptVersion''\n', E'      ''promptVersion'',\n      ''agentVersion'',\n      ''brainId'',\n      ''useTrainingMemory''\n');
  v_definition := replace(v_definition, E'    OR (p_session ? ''promptVersion'' AND jsonb_typeof(p_session->''promptVersion'') IS DISTINCT FROM ''string'')\n  THEN', E'    OR (p_session ? ''promptVersion'' AND jsonb_typeof(p_session->''promptVersion'') IS DISTINCT FROM ''string'')\n    OR (p_session ? ''agentVersion'' AND jsonb_typeof(p_session->''agentVersion'') IS DISTINCT FROM ''string'')\n    OR (p_session ? ''brainId'' AND jsonb_typeof(p_session->''brainId'') IS DISTINCT FROM ''string'')\n    OR (p_session ? ''useTrainingMemory'' AND jsonb_typeof(p_session->''useTrainingMemory'') IS DISTINCT FROM ''boolean'')\n  THEN');
  v_definition := replace(v_definition, E'  IF public._agent_json_has_sensitive_key(p_session) THEN\n    RAISE EXCEPTION ''Session payload contains a forbidden sensitive field'' USING ERRCODE = ''22023'';\n  END IF;\n', E'  IF public._agent_json_has_sensitive_key(p_session) THEN\n    RAISE EXCEPTION ''Session payload contains a forbidden sensitive field'' USING ERRCODE = ''22023'';\n  END IF;\n\n  v_agent_version := COALESCE(NULLIF(p_session->>''agentVersion'', ''''), ''agent-v1'');\n  IF v_agent_version NOT IN (''agent-v1'', ''agent-v2'') THEN\n    RAISE EXCEPTION ''Invalid Agent version'' USING ERRCODE = ''22023'';\n  END IF;\n  v_use_training_memory := COALESCE((p_session->>''useTrainingMemory'')::BOOLEAN, FALSE);\n');
  v_definition := replace(v_definition, E'  v_job_description := NULLIF', E'  IF NULLIF(p_session->>''brainId'', '''') IS NOT NULL THEN\n    BEGIN\n      v_brain_id := (p_session->>''brainId'')::UUID;\n    EXCEPTION WHEN invalid_text_representation THEN\n      RAISE EXCEPTION ''Invalid brain id'' USING ERRCODE = ''22023'';\n    END;\n    PERFORM 1 FROM public.knowledge_brains brain WHERE brain.id = v_brain_id AND brain.user_id = v_user_id;\n    IF NOT FOUND THEN RAISE EXCEPTION ''Brain not found'' USING ERRCODE = ''P0002''; END IF;\n  END IF;\n  IF v_use_training_memory AND NOT EXISTS (\n    SELECT 1 FROM public.agent_training_profiles profile\n    WHERE profile.user_id = v_user_id AND profile.enabled = TRUE\n  ) THEN\n    RAISE EXCEPTION ''Training memory is not enabled'' USING ERRCODE = ''42501'';\n  END IF;\n\n  v_job_description := NULLIF');
  v_definition := replace(v_definition, E'    ''resumeId'', v_resume_id,\n', E'    ''resumeId'', v_resume_id,\n    ''brainId'', v_brain_id,\n    ''useTrainingMemory'', v_use_training_memory,\n');
  IF position('v_agent_version TEXT' IN v_definition) = 0 OR position('''brainId'', v_brain_id' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Unable to upgrade create_agent_interview_session safely';
  END IF;
  EXECUTE v_definition;
END;
$$;

COMMENT ON COLUMN public.interview_sessions.agent_version IS
  'Nullable discriminator; agent-v1 resumes the original controlled graph and agent-v2 enables planning, tools, reflection and opt-in memory.';

CREATE OR REPLACE FUNCTION public.check_agent_readiness()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$ SELECT '20260714000002'::TEXT $$;

COMMENT ON FUNCTION public.check_agent_readiness() IS
  'Returns the installed controlled Agent 2.0 migration version without reading or writing user data.';
