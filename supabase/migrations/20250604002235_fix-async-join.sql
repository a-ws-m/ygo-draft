-- Fix the issue with joining asynchronous drafts
-- The problem is that when the last player joins, we need to update both
-- participants and status, but the trigger only allows updating participants

-- Modify the check_participants_update function to allow status updates
-- when the draft becomes full
CREATE OR REPLACE FUNCTION check_participants_update()
RETURNS TRIGGER AS $$
BEGIN
  -- Only apply this check for asynchronous drafts that aren't being updated by their creator
  IF NEW.draft_method = 'asynchronous' AND NEW.created_by != auth.uid() THEN
    -- Allow status to change from 'waiting' to 'active' when draft becomes full
    IF NEW.status != OLD.status AND 
       (OLD.status != 'waiting' OR NEW.status != 'active' OR 
        array_length(NEW.participants, 1) != NEW.number_of_players) THEN
      RAISE EXCEPTION 'You cannot modify the draft status';
    END IF;

    -- Ensure no columns other than participants and status are being modified
    IF NEW.id != OLD.id OR
       NEW.created_at != OLD.created_at OR
       NEW.connected_users != OLD.connected_users OR
       NEW.draft_method != OLD.draft_method OR
       NEW.pool_size != OLD.pool_size OR
       NEW.number_of_players != OLD.number_of_players OR
       NEW.current_player != OLD.current_player OR
       NEW.number_of_piles != OLD.number_of_piles OR
       NEW.pack_size != OLD.pack_size OR
       NEW.created_by != OLD.created_by OR
       NEW.drafted_deck_size != OLD.drafted_deck_size OR
       (NEW.picks_per_pack IS DISTINCT FROM OLD.picks_per_pack) THEN
      
      RAISE EXCEPTION 'You can only modify the participants list and status';
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
