
-- Jarvis conversations table
CREATE TABLE public.jarvis_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL DEFAULT 'Nova conversa',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Jarvis messages table
CREATE TABLE public.jarvis_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.jarvis_conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'user',
  content text NOT NULL DEFAULT '',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.jarvis_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jarvis_messages ENABLE ROW LEVEL SECURITY;

-- RLS policies for jarvis_conversations
CREATE POLICY "Users can read own conversations" ON public.jarvis_conversations
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Users can insert own conversations" ON public.jarvis_conversations
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own conversations" ON public.jarvis_conversations
  FOR UPDATE TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Users can delete own conversations" ON public.jarvis_conversations
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- RLS policies for jarvis_messages
CREATE POLICY "Users can read own messages" ON public.jarvis_messages
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Users can insert own messages" ON public.jarvis_messages
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own messages" ON public.jarvis_messages
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Indexes
CREATE INDEX idx_jarvis_conversations_user ON public.jarvis_conversations(user_id, updated_at DESC);
CREATE INDEX idx_jarvis_messages_conv ON public.jarvis_messages(conversation_id, created_at ASC);

-- Trigger to auto-update updated_at
CREATE TRIGGER jarvis_conversations_updated_at
  BEFORE UPDATE ON public.jarvis_conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
