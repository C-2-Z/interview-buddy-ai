-- agent_events 回答正文脱敏：用户消息事件只保留业务消息引用，正文仍由 interview_messages 承载。

CREATE OR REPLACE FUNCTION public.remove_answer_content_from_agent_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF NEW.type = 'agent.message_completed'
    AND NEW.payload->>'role' = 'user'
  THEN
    NEW.payload := NEW.payload - 'content';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.remove_answer_content_from_agent_event()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS remove_answer_content_from_agent_events
  ON public.agent_events;

CREATE TRIGGER remove_answer_content_from_agent_events
BEFORE INSERT OR UPDATE OF type, payload
ON public.agent_events
FOR EACH ROW
EXECUTE FUNCTION public.remove_answer_content_from_agent_event();

ALTER TABLE public.agent_events
  ADD CONSTRAINT agent_events_user_message_content_check
  CHECK (
    type <> 'agent.message_completed'
    OR payload->>'role' IS DISTINCT FROM 'user'
    OR NOT (payload ? 'content')
  ) NOT VALID;

COMMENT ON FUNCTION public.remove_answer_content_from_agent_event() IS
  'Strips candidate answer content from persistent Agent events before writes.';
COMMENT ON CONSTRAINT agent_events_user_message_content_check
  ON public.agent_events IS
  'Ensures candidate answer bodies remain only in business message storage.';
