-- 分批清理 guard 生效前遗留的用户回答正文，避免单条 UPDATE 长时间占用大量执行资源。

DO $$
DECLARE
  updated_rows integer;
BEGIN
  LOOP
    WITH batch AS (
      SELECT ctid
      FROM public.agent_events
      WHERE type = 'agent.message_completed'
        AND payload->>'role' = 'user'
        AND payload ? 'content'
      LIMIT 1000
    )
    UPDATE public.agent_events AS events
    SET payload = events.payload - 'content'
    FROM batch
    WHERE events.ctid = batch.ctid;

    GET DIAGNOSTICS updated_rows = ROW_COUNT;
    EXIT WHEN updated_rows = 0;
  END LOOP;
END;
$$;
