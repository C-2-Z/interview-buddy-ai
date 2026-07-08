-- Rename interview_sessions.background to job_description while preserving existing data.
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
  END IF;
END $$;
