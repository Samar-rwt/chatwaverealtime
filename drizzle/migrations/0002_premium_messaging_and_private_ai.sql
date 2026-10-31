ALTER TABLE public.messages ADD COLUMN reply_to uuid REFERENCES public.messages(id), ADD COLUMN edited_at timestamptz, ADD COLUMN deleted_at timestamptz, ADD COLUMN pinned boolean NOT NULL DEFAULT false, ADD COLUMN forwarded boolean NOT NULL DEFAULT false, ADD COLUMN attachments jsonb NOT NULL DEFAULT '[]'::jsonb, ADD COLUMN read_at timestamptz;
CREATE TABLE public.message_hidden (message_id uuid REFERENCES public.messages(id), user_id uuid NOT NULL, PRIMARY KEY(message_id,user_id));
GRANT SELECT,INSERT,DELETE ON public.message_hidden TO authenticated; GRANT ALL ON public.message_hidden TO service_role;
ALTER TABLE public.message_hidden ENABLE ROW LEVEL SECURITY;
CREATE POLICY hidden_own_read ON public.message_hidden FOR SELECT TO authenticated USING(user_id=auth.uid());
CREATE POLICY hidden_own_insert ON public.message_hidden FOR INSERT TO authenticated WITH CHECK(user_id=auth.uid() AND EXISTS(SELECT 1 FROM public.messages m WHERE m.id=message_id AND auth.uid() IN(m.sender_id,m.recipient_id)));
CREATE POLICY hidden_own_delete ON public.message_hidden FOR DELETE TO authenticated USING(user_id=auth.uid());
CREATE TABLE public.message_reactions (message_id uuid REFERENCES public.messages(id), user_id uuid NOT NULL, emoji text NOT NULL CHECK(emoji IN ('❤️','👍','😂','😮','😢','🙏')), PRIMARY KEY(message_id,user_id));
GRANT SELECT,INSERT,UPDATE,DELETE ON public.message_reactions TO authenticated; GRANT ALL ON public.message_reactions TO service_role;
ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY reactions_read ON public.message_reactions FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.messages m WHERE m.id=message_id AND auth.uid() IN(m.sender_id,m.recipient_id)));
CREATE POLICY reactions_insert ON public.message_reactions FOR INSERT TO authenticated WITH CHECK(user_id=auth.uid() AND EXISTS(SELECT 1 FROM public.messages m WHERE m.id=message_id AND m.deleted_at IS NULL AND auth.uid() IN(m.sender_id,m.recipient_id)));
CREATE POLICY reactions_update ON public.message_reactions FOR UPDATE TO authenticated USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid() AND EXISTS(SELECT 1 FROM public.messages m WHERE m.id=message_id AND m.deleted_at IS NULL AND auth.uid() IN(m.sender_id,m.recipient_id)));
CREATE POLICY reactions_delete ON public.message_reactions FOR DELETE TO authenticated USING(user_id=auth.uid());
CREATE TABLE public.chat_activity (user_id uuid NOT NULL, recipient_id uuid REFERENCES public.profiles(id) NOT NULL, typing_at timestamptz, seen_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,recipient_id), CHECK(user_id<>recipient_id));
GRANT SELECT,INSERT,UPDATE ON public.chat_activity TO authenticated; GRANT ALL ON public.chat_activity TO service_role;
ALTER TABLE public.chat_activity ENABLE ROW LEVEL SECURITY;
CREATE POLICY activity_read ON public.chat_activity FOR SELECT TO authenticated USING(auth.uid() IN(user_id,recipient_id) AND (user_id=auth.uid() OR EXISTS(SELECT 1 FROM public.messages m WHERE (m.sender_id=user_id AND m.recipient_id=recipient_id) OR (m.sender_id=recipient_id AND m.recipient_id=user_id))));
CREATE POLICY activity_insert ON public.chat_activity FOR INSERT TO authenticated WITH CHECK(user_id=auth.uid());
CREATE POLICY activity_update ON public.chat_activity FOR UPDATE TO authenticated USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());
CREATE OR REPLACE FUNCTION public.validate_message_extensions() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE r public.messages; a jsonb; BEGIN
IF TG_OP='UPDATE' AND (NEW.id<>OLD.id OR NEW.sender_id<>OLD.sender_id OR NEW.recipient_id<>OLD.recipient_id OR NEW.created_at<>OLD.created_at OR NEW.reply_to IS DISTINCT FROM OLD.reply_to OR NEW.attachments<>OLD.attachments OR NEW.forwarded<>OLD.forwarded) THEN RAISE EXCEPTION 'Message identity is immutable'; END IF;
IF NEW.reply_to IS NOT NULL THEN SELECT * INTO r FROM public.messages WHERE id=NEW.reply_to; IF NOT FOUND OR NOT ((r.sender_id=NEW.sender_id AND r.recipient_id=NEW.recipient_id) OR (r.sender_id=NEW.recipient_id AND r.recipient_id=NEW.sender_id)) THEN RAISE EXCEPTION 'Reply must belong to this conversation'; END IF; END IF;
IF jsonb_typeof(NEW.attachments)<>'array' OR jsonb_array_length(NEW.attachments)>5 THEN RAISE EXCEPTION 'Invalid attachments'; END IF;
FOR a IN SELECT value FROM jsonb_array_elements(NEW.attachments) LOOP
IF a->>'path' IS NULL OR split_part(a->>'path','/',1)<>NEW.sender_id::text OR split_part(a->>'path','/',2)<>NEW.recipient_id::text OR a->>'kind' NOT IN ('image','video','file','voice') THEN RAISE EXCEPTION 'Invalid attachment ownership'; END IF;
END LOOP;
IF TG_OP='INSERT' AND (NEW.edited_at IS NOT NULL OR NEW.deleted_at IS NOT NULL OR NEW.read_at IS NOT NULL OR NEW.pinned) THEN RAISE EXCEPTION 'Invalid initial message state'; END IF;
RETURN NEW; END $$;
CREATE TRIGGER validate_message_extensions BEFORE INSERT OR UPDATE ON public.messages FOR EACH ROW EXECUTE FUNCTION public.validate_message_extensions();
CREATE OR REPLACE FUNCTION public.message_action(_id uuid,_action text,_content text DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE m public.messages; BEGIN
SELECT * INTO m FROM public.messages WHERE id=_id FOR UPDATE;
IF auth.uid() IS NULL OR NOT FOUND OR auth.uid() NOT IN(m.sender_id,m.recipient_id) THEN RAISE EXCEPTION 'Not authorized'; END IF;
IF _action='hide' THEN INSERT INTO public.message_hidden(message_id,user_id) VALUES(_id,auth.uid()) ON CONFLICT DO NOTHING;
ELSIF _action='read' THEN IF auth.uid()<>m.recipient_id THEN RAISE EXCEPTION 'Only recipient can mark read'; END IF; UPDATE public.messages SET read_at=COALESCE(read_at,now()) WHERE id=_id;
ELSIF _action='pin' THEN IF m.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Message was deleted'; END IF; UPDATE public.messages SET pinned=NOT pinned WHERE id=_id;
ELSIF _action IN('edit','delete') THEN
IF auth.uid()<>m.sender_id OR m.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Only author can change this message'; END IF;
IF _action='edit' THEN IF _content IS NULL OR char_length(btrim(_content)) NOT BETWEEN 1 AND 4000 THEN RAISE EXCEPTION 'Message must contain 1 to 4000 characters'; END IF; UPDATE public.messages SET content=btrim(_content),edited_at=now() WHERE id=_id;
ELSE UPDATE public.messages SET content='Message deleted',deleted_at=now(),pinned=false WHERE id=_id; END IF;
ELSE RAISE EXCEPTION 'Unknown action'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.message_action(uuid,text,text) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.message_action(uuid,text,text) TO authenticated;
CREATE TABLE public.ai_threads(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL,title text NOT NULL DEFAULT 'New conversation' CHECK(char_length(title) BETWEEN 1 AND 100),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT,INSERT,UPDATE,DELETE ON public.ai_threads TO authenticated; GRANT ALL ON public.ai_threads TO service_role;
ALTER TABLE public.ai_threads ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_thread_owner ON public.ai_threads FOR ALL TO authenticated USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());
CREATE TABLE public.ai_messages(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),thread_id uuid REFERENCES public.ai_threads(id) ON DELETE CASCADE NOT NULL,user_id uuid NOT NULL,sdk_id text NOT NULL,role text NOT NULL CHECK(role IN('user','assistant')),parts jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(thread_id,sdk_id));
GRANT SELECT,INSERT,UPDATE,DELETE ON public.ai_messages TO authenticated; GRANT ALL ON public.ai_messages TO service_role;
ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_message_owner ON public.ai_messages FOR ALL TO authenticated USING(user_id=auth.uid() AND EXISTS(SELECT 1 FROM public.ai_threads t WHERE t.id=thread_id AND t.user_id=auth.uid())) WITH CHECK(user_id=auth.uid() AND EXISTS(SELECT 1 FROM public.ai_threads t WHERE t.id=thread_id AND t.user_id=auth.uid()));
CREATE INDEX ai_messages_thread_time ON public.ai_messages(thread_id,created_at);
CREATE TABLE public.ai_access_state(user_id uuid PRIMARY KEY,message text NOT NULL,status integer NOT NULL,blocked_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.ai_access_state TO authenticated; GRANT ALL ON public.ai_access_state TO service_role;
ALTER TABLE public.ai_access_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_access_own ON public.ai_access_state FOR SELECT TO authenticated USING(user_id=auth.uid());
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions,public.chat_activity;
