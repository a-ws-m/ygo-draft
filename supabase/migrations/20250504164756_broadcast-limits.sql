-- Create a function to check if a user is a participant in a draft
CREATE OR REPLACE FUNCTION public.is_draft_participant(draft_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    is_participant boolean;
BEGIN
    SELECT EXISTS (
        SELECT 1
        FROM public.drafts
        WHERE id = draft_id
          AND auth.uid() = ANY(participants)
    ) INTO is_participant;
    
    RETURN is_participant;
END;
$$;

-- Grant execution permissions
GRANT EXECUTE ON FUNCTION public.is_draft_participant TO authenticated;

-- Create a security policy on realtime.broadcast_messages table
-- This allows only participants to send or receive broadcast messages
-- And only participants can track presence for active drafts
CREATE POLICY "Only participants can send broadcast messages and presence for active drafts"
ON "realtime"."messages"
FOR INSERT
TO authenticated
WITH CHECK (
    -- For broadcast messages: restrict to draft participants
    (realtime.messages.extension IN ('broadcast') AND realtime.topic() LIKE 'draft-room-%' AND 
    public.is_draft_participant(
        (regexp_match(realtime.topic(), 'draft-room-([0-9a-f\-]+)'))[1]::uuid
    ))
    -- For presence messages: allow only participants for active drafts
    OR (realtime.messages.extension IN ('presence') AND realtime.topic() LIKE 'draft-room-%' AND
       EXISTS (
           SELECT 1 
           FROM public.drafts 
           WHERE id = (regexp_match(realtime.topic(), 'draft-room-([0-9a-f\-]+)'))[1]::uuid
           AND (
               -- If draft is active, require user to be participant
               (status = 'active' AND auth.uid() = ANY(participants))
               -- If draft is not active, any authenticated user can track presence
               OR status != 'active'
           )
       )
    )
    -- Allow non-draft-room channels
    OR realtime.topic() NOT LIKE 'draft-room-%'
);

-- Function to create or update a trigger that enforces participants can only update their own draft data
CREATE OR REPLACE FUNCTION public.enforce_participant_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Check if the user is a participant in the draft
    IF NOT (SELECT EXISTS (
        SELECT 1
        FROM public.drafts
        WHERE id = NEW.draft_id
          AND auth.uid() = ANY(participants)
    )) THEN
        RAISE EXCEPTION 'You must be a participant in this draft to make changes';
    END IF;
    
    RETURN NEW;
END;
$$;

-- Create a trigger on cubes table to enforce participant-only changes
DROP TRIGGER IF EXISTS enforce_participant_changes_trigger ON public.cubes;
CREATE TRIGGER enforce_participant_changes_trigger
BEFORE UPDATE ON public.cubes
FOR EACH ROW
EXECUTE FUNCTION public.enforce_participant_changes();

-- Update the start draft function to only allow the creator to start the draft
CREATE OR REPLACE FUNCTION public.start_draft(draft_id uuid, participant_list uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Verify the current user is the creator of the draft
    IF NOT EXISTS (
        SELECT 1
        FROM public.drafts
        WHERE id = draft_id
          AND created_by = auth.uid()
    ) THEN
        RAISE EXCEPTION 'Only the creator of the draft can start it';
    END IF;
    
    -- Update the draft with participants and set status to active
    UPDATE public.drafts
    SET participants = participant_list,
        status = 'active'
    WHERE id = draft_id;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.start_draft TO authenticated;