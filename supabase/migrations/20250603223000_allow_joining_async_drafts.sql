-- Add policy to allow users to join asynchronous drafts
-- This allows authenticated users to add themselves to the participants list
-- of asynchronous drafts if there's still room

-- Drop the existing policy for updating drafts
DROP POLICY IF EXISTS "Users can update their own drafts" ON "public"."drafts";

-- Create a policy that allows draft creators to update any field of their drafts
CREATE POLICY "Users can update their own drafts" 
  ON "public"."drafts" 
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid());

-- Create a new policy that allows authenticated users to join asynchronous drafts
-- by adding themselves to the participants array
CREATE POLICY "Users can join asynchronous drafts" 
  ON "public"."drafts" 
  FOR UPDATE TO authenticated
  USING (
    draft_method = 'asynchronous' AND 
    status = 'waiting' AND 
    array_length(participants, 1) < number_of_players AND
    NOT (auth.uid() = ANY(participants))
  );

-- Create a trigger function to verify participant changes
CREATE OR REPLACE FUNCTION check_participants_update()
RETURNS TRIGGER AS $$
BEGIN
  -- Only apply this check for asynchronous drafts that aren't being updated by their creator
  IF NEW.draft_method = 'asynchronous' AND NEW.created_by != auth.uid() THEN
    -- Ensure no columns other than participants are being modified
    IF NEW.id != OLD.id OR
       NEW.created_at != OLD.created_at OR
       NEW.connected_users != OLD.connected_users OR
       NEW.draft_method != OLD.draft_method OR
       NEW.pool_size != OLD.pool_size OR
       NEW.number_of_players != OLD.number_of_players OR
       NEW.status != OLD.status OR
       NEW.current_player != OLD.current_player OR
       NEW.number_of_piles != OLD.number_of_piles OR
       NEW.pack_size != OLD.pack_size OR
       NEW.created_by != OLD.created_by OR
       NEW.drafted_deck_size != OLD.drafted_deck_size OR
       (NEW.picks_per_pack IS DISTINCT FROM OLD.picks_per_pack) THEN
      
      RAISE EXCEPTION 'You can only modify the participants list';
    END IF;
    
    -- Check that only one user (the current user) is being added
    -- and not removing any existing participants
    IF array_length(NEW.participants, 1) != array_length(OLD.participants, 1) + 1 THEN
      RAISE EXCEPTION 'You can only add yourself to the participants list';
    END IF;
    
    -- Make sure the current user is the one being added
    IF NOT (auth.uid() = ANY(NEW.participants)) THEN
      RAISE EXCEPTION 'You can only add yourself to the participants list';
    END IF;
    
    -- Make sure the current user wasn't already in the list
    IF auth.uid() = ANY(OLD.participants) THEN
      RAISE EXCEPTION 'You are already a participant in this draft';
    END IF;
    
    -- Make sure all old participants are still in the list
    FOR i IN 1..array_length(OLD.participants, 1) LOOP
      IF NOT (OLD.participants[i] = ANY(NEW.participants)) THEN
        RAISE EXCEPTION 'You cannot remove existing participants';
      END IF;
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create a function to join an asynchronous draft
CREATE OR REPLACE FUNCTION join_async_draft(p_draft_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_draft_record RECORD;
  v_user_id UUID;
  v_participants UUID[];
BEGIN
  -- Get the current user ID
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'You must be logged in to join a draft';
  END IF;

  -- Check if the draft exists and is asynchronous
  SELECT * INTO v_draft_record 
  FROM drafts 
  WHERE id = p_draft_id;
  
  IF v_draft_record IS NULL THEN
    RAISE EXCEPTION 'Draft not found';
  END IF;
  
  IF v_draft_record.draft_method != 'asynchronous' THEN
    RAISE EXCEPTION 'This draft is not asynchronous';
  END IF;
  
  IF v_draft_record.status != 'waiting' THEN
    RAISE EXCEPTION 'This draft is no longer accepting participants';
  END IF;
  
  -- Check if the user is already a participant
  IF v_user_id = ANY(v_draft_record.participants) THEN
    RAISE EXCEPTION 'You are already a participant in this draft';
  END IF;
  
  -- Check if the draft is full
  IF array_length(v_draft_record.participants, 1) >= v_draft_record.number_of_players THEN
    RAISE EXCEPTION 'This draft is already full';
  END IF;
  
  -- Add the user to the participants list
  v_participants := array_append(v_draft_record.participants, v_user_id);
  
  -- Check if we've reached the desired number of players
  IF array_length(v_participants, 1) = v_draft_record.number_of_players THEN
    -- Update the draft with the new participant and set status to active
    UPDATE drafts
    SET 
      participants = v_participants,
      status = 'active'
    WHERE id = p_draft_id;
  ELSE
    -- Just update the participants list
    UPDATE drafts
    SET participants = v_participants
    WHERE id = p_draft_id;
  END IF;
  
  RETURN p_draft_id;
EXCEPTION
  WHEN OTHERS THEN
    RAISE;
END;
$$;

-- Grant execute permission on the function
GRANT EXECUTE ON FUNCTION join_async_draft TO authenticated;

-- Create the trigger
DROP TRIGGER IF EXISTS trigger_check_participants_update ON "public"."drafts";
CREATE TRIGGER trigger_check_participants_update
  BEFORE UPDATE ON "public"."drafts"
  FOR EACH ROW
  EXECUTE FUNCTION check_participants_update();
