-- interview_messages: stores multi-turn dialogue per question
CREATE TABLE public.interview_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES public.interview_questions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.interview_messages TO authenticated;
GRANT ALL ON public.interview_messages TO service_role;
ALTER TABLE public.interview_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own messages" ON public.interview_messages FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.interview_questions q
    JOIN public.interview_sessions s ON s.id = q.session_id
    WHERE q.id = question_id AND s.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.interview_questions q
    JOIN public.interview_sessions s ON s.id = q.session_id
    WHERE q.id = question_id AND s.user_id = auth.uid()
  ));

CREATE INDEX idx_messages_question ON public.interview_messages(question_id, created_at);
