-- Add dimension_scores column to interview_questions
ALTER TABLE interview_questions
ADD COLUMN dimension_scores jsonb DEFAULT NULL;

-- Add dimension_summary column to interview_sessions
ALTER TABLE interview_sessions
ADD COLUMN dimension_summary jsonb DEFAULT NULL;
