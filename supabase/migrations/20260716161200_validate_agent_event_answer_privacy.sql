-- 在 guard 与历史回填完成后独立扫描并验证事件隐私约束。

ALTER TABLE public.agent_events
  VALIDATE CONSTRAINT agent_events_user_message_content_check;
