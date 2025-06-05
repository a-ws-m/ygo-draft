
-- Add "picked" column to cubes table
ALTER TABLE "public"."cubes"
ADD COLUMN "picked" BOOLEAN DEFAULT FALSE;

-- Add a new draft method option to the enum type
-- First, we need to check if the type exists and create it if it doesn't
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'draft_method') THEN
        CREATE TYPE "public"."draft_method" AS ENUM ('winston', 'rochester', 'grid', 'asynchronous');
    ELSE
        -- Add 'asynchronous' to existing enum if it doesn't already exist
        BEGIN
            -- Check if the value already exists in the enum
            IF NOT EXISTS (
                SELECT 1 FROM pg_enum 
                WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'draft_method')
                AND enumlabel = 'asynchronous'
            ) THEN
                ALTER TYPE "public"."draft_method" ADD VALUE 'asynchronous';
            END IF;
        END;
    END IF;
END$$;

-- Add new fields to drafts table if they don't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                  WHERE table_schema = 'public' 
                  AND table_name = 'drafts'
                  AND column_name = 'pack_size') THEN
        ALTER TABLE "public"."drafts" ADD COLUMN "pack_size" INTEGER DEFAULT 15;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                  WHERE table_schema = 'public' 
                  AND table_name = 'drafts'
                  AND column_name = 'picks_per_pack') THEN
        ALTER TABLE "public"."drafts" ADD COLUMN "picks_per_pack" INTEGER DEFAULT 1;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                  WHERE table_schema = 'public' 
                  AND table_name = 'drafts'
                  AND column_name = 'drafted_deck_size') THEN
        ALTER TABLE "public"."drafts" ADD COLUMN "drafted_deck_size" INTEGER DEFAULT 60;
    END IF;
END$$;

-- Update the delete_expired_drafts procedure to handle async drafts differently
CREATE OR REPLACE PROCEDURE "public"."delete_expired_drafts"()
LANGUAGE "plpgsql"
AS $$
BEGIN
    -- Delete cube entries for waiting drafts (waiting for more than 30 minutes, except async drafts)
    DELETE FROM cubes
    WHERE draft_id IN (
        SELECT id FROM drafts
        WHERE status = 'waiting'
          AND draft_method != 'asynchronous'
          AND (created_at < now() - interval '30 minutes')
    );

    -- Delete waiting drafts (waiting for more than 30 minutes, except async drafts)
    DELETE FROM drafts
    WHERE status = 'waiting'
      AND draft_method != 'asynchronous'
      AND (created_at < now() - interval '30 minutes');
    
    -- Delete waiting async drafts after a week
    DELETE FROM cubes
    WHERE draft_id IN (
        SELECT id FROM drafts
        WHERE status = 'waiting'
          AND draft_method = 'asynchronous'
          AND (created_at < now() - interval '1 week')
    );
    
    DELETE FROM drafts
    WHERE status = 'waiting'
      AND draft_method = 'asynchronous'
      AND (created_at < now() - interval '1 week');
      
    -- Delete cube entries for completed drafts older than 36 hours (keeping enough data for daily limits)
    -- For async drafts, keep for a month
    DELETE FROM cubes
    WHERE draft_id IN (
        SELECT id FROM drafts
        WHERE status != 'waiting'
          AND draft_method != 'asynchronous'
          AND created_at < now() - interval '36 hours'
    );

    -- Delete completed drafts older than 36 hours (keeping enough data for daily limits)
    -- For async drafts, keep for a month
    DELETE FROM drafts
    WHERE status != 'waiting'
      AND draft_method != 'asynchronous'
      AND created_at < now() - interval '36 hours';
      
    -- Delete async drafts that are completed or active after a month
    DELETE FROM cubes
    WHERE draft_id IN (
        SELECT id FROM drafts
        WHERE status != 'waiting'
          AND draft_method = 'asynchronous'
          AND created_at < now() - interval '1 month'
    );
    
    DELETE FROM drafts
    WHERE status != 'waiting'
      AND draft_method = 'asynchronous'
      AND created_at < now() - interval '1 month';
END;
$$;

-- Grant necessary permissions
GRANT EXECUTE ON PROCEDURE delete_expired_drafts() TO postgres, service_role;