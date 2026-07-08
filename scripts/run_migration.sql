-- === 请在 Supabase Dashboard → SQL Editor 中执行此脚本 ===
-- 将 interview_sessions 表的 background 列重命名为 job_description

-- 仅当 background 存在且 job_description 不存在时执行
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'interview_sessions'
      AND column_name = 'background'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'interview_sessions'
      AND column_name = 'job_description'
  ) THEN
    ALTER TABLE public.interview_sessions
      RENAME COLUMN background TO job_description;
    RAISE NOTICE '迁移成功：background → job_description';
  ELSE
    RAISE NOTICE '无需迁移（列已存在或不存在）';
  END IF;
END $$;

-- 验证结果
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'interview_sessions'
  AND column_name IN ('background', 'job_description')
ORDER BY column_name;
