DROP POLICY IF EXISTS "Signed-in users can view profiles" ON public.profiles;

CREATE POLICY "View self and conversation partners" ON public.profiles
FOR SELECT TO authenticated
USING (
  id = auth.uid() OR EXISTS (
    SELECT 1 FROM public.messages m
    WHERE (m.sender_id = auth.uid() AND m.recipient_id = profiles.id)
       OR (m.recipient_id = auth.uid() AND m.sender_id = profiles.id)
  )
);

CREATE OR REPLACE FUNCTION public.find_profile_by_email(_email text)
RETURNS TABLE (id uuid, display_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.id, p.display_name FROM public.profiles p
  WHERE auth.uid() IS NOT NULL
    AND lower(p.email) = lower(trim(_email))
    AND p.id <> auth.uid()
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.find_profile_by_email(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.find_profile_by_email(text) TO authenticated;