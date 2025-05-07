-- Function to allow users to delete their own account
CREATE OR REPLACE FUNCTION public.delete_user_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_id uuid;
BEGIN
  -- Get the user ID from the current session
  user_id := auth.uid();
  
  -- Make sure we have a valid user ID
  IF user_id IS NULL THEN
    RAISE EXCEPTION 'You must be logged in to delete your account';
  END IF;
  
  -- Delete cubes owned by the user
  DELETE FROM public.cubes WHERE owner = user_id::text;
  
  -- Delete cubes associated with drafts created by the user
  DELETE FROM public.cubes WHERE draft_id IN (SELECT id FROM public.drafts WHERE created_by = user_id);
  
  -- Delete drafts created by the user
  DELETE FROM public.drafts WHERE created_by = user_id;
  
  -- Delete cubes from drafts where the user is a participant
  DELETE FROM public.cubes WHERE draft_id IN (SELECT id FROM public.drafts WHERE user_id = ANY(participants));
  
  -- Delete drafts where the user is a participant
  DELETE FROM public.drafts WHERE user_id = ANY(participants);
  
  -- Delete the user directly from auth.users
  DELETE FROM auth.users WHERE id = user_id;
END;
$$;

-- Grant access to the function for authenticated users
GRANT EXECUTE ON FUNCTION public.delete_user_account() TO authenticated;
