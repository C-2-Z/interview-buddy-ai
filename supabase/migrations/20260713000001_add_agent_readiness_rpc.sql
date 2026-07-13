-- PX-A01：提供无副作用的 Agent 迁移版本探测，避免 readiness 通过写 RPC 判断数据库状态。
CREATE OR REPLACE FUNCTION public.check_agent_readiness()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$ SELECT '20260713000001'::TEXT $$;

REVOKE ALL ON FUNCTION public.check_agent_readiness() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_agent_readiness() TO authenticated;
COMMENT ON FUNCTION public.check_agent_readiness() IS
  'Returns the installed Agent readiness migration version without reading or writing user data.';
