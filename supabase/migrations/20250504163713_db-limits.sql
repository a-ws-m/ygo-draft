-- Add database limits for:
-- 1. Maximum 100 drafts per day per user
-- 2. Maximum 10 players per draft
-- 3. Maximum pool size of 1000 cards

-- Add constraints to drafts table
ALTER TABLE "public"."drafts" 
  ADD CONSTRAINT "max_players_limit" CHECK (number_of_players <= 10),
  ADD CONSTRAINT "max_pool_size" CHECK (pool_size <= 1000);

-- Create a function to check if a user has reached their daily draft limit
CREATE OR REPLACE FUNCTION check_user_draft_limit()
RETURNS TRIGGER AS $$
DECLARE
  user_daily_drafts INTEGER;
BEGIN
  -- Count how many drafts the user has created in the last 24 hours
  SELECT COUNT(*) 
  INTO user_daily_drafts 
  FROM "public"."drafts" 
  WHERE created_by = NEW.created_by 
    AND created_at > NOW() - INTERVAL '24 hours';
  
  -- If user has already created 100 or more drafts, reject the new one
  IF user_daily_drafts >= 100 THEN
    RAISE EXCEPTION 'Daily limit of 100 drafts per user exceeded';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a trigger to enforce the draft limit per user
DROP TRIGGER IF EXISTS enforce_draft_limit ON "public"."drafts";
CREATE TRIGGER enforce_draft_limit
  BEFORE INSERT ON "public"."drafts"
  FOR EACH ROW
  EXECUTE FUNCTION check_user_draft_limit();

-- Create a function to enforce the maximum number of cards in cubes per draft
CREATE OR REPLACE FUNCTION enforce_max_cards_per_draft()
RETURNS TRIGGER AS $$
DECLARE
  total_cards INTEGER;
  max_pool_size INTEGER;
BEGIN
  -- Get the pool size for this draft
  SELECT pool_size INTO max_pool_size FROM "public"."drafts" WHERE id = NEW.draft_id;
  
  -- Count the total number of cards currently in this draft
  SELECT COUNT(*) INTO total_cards FROM "public"."cubes" WHERE draft_id = NEW.draft_id;
  
  -- If this would exceed the pool size, reject the insertion
  IF total_cards >= max_pool_size THEN
    RAISE EXCEPTION 'Maximum pool size of % cards reached for this draft', max_pool_size;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a trigger to enforce the maximum cards per draft
DROP TRIGGER IF EXISTS enforce_max_cards_per_draft ON "public"."cubes";
CREATE TRIGGER enforce_max_cards_per_draft
  BEFORE INSERT ON "public"."cubes"
  FOR EACH ROW
  EXECUTE FUNCTION enforce_max_cards_per_draft();

-- Create a new procedure for cleaning up expired drafts that preserves data for draft limits
CREATE OR REPLACE PROCEDURE "public"."delete_expired_drafts"()
LANGUAGE "plpgsql"
AS $$
BEGIN
    -- Delete cube entries for waiting drafts (waiting for more than 30 minutes)
    DELETE FROM cubes
    WHERE draft_id IN (
        SELECT id FROM drafts
        WHERE status = 'waiting'
          AND (created_at < now() - interval '30 minutes')
    );

    -- Delete waiting drafts (waiting for more than 30 minutes)
    DELETE FROM drafts
    WHERE status = 'waiting'
      AND (created_at < now() - interval '30 minutes');
      
    -- Delete cube entries for completed drafts older than 36 hours (keeping enough data for daily limits)
    DELETE FROM cubes
    WHERE draft_id IN (
        SELECT id FROM drafts
        WHERE status != 'waiting'
          AND created_at < now() - interval '36 hours'
    );

    -- Delete completed drafts older than 36 hours (keeping enough data for daily limits)
    DELETE FROM drafts
    WHERE status != 'waiting'
      AND created_at < now() - interval '36 hours';
END;
$$;

-- Schedule the cleanup procedure to run every hour
SELECT cron.schedule(
  'cleanup-expired-drafts-hourly',           -- unique job name
  '0 * * * *',                               -- cron schedule (every hour at minute 0)
  $$CALL public.delete_expired_drafts()$$    -- SQL command to execute
);

-- Drop the old cleanup job if it exists
SELECT cron.unschedule('cleanup-expired-drafts-daily') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'cleanup-expired-drafts-daily'
);

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION check_user_draft_limit() TO postgres, service_role;
GRANT EXECUTE ON FUNCTION enforce_max_cards_per_draft() TO postgres, service_role;
GRANT EXECUTE ON PROCEDURE delete_expired_drafts() TO postgres, service_role;