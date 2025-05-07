-- Create table for tracking YGO database version
CREATE TABLE IF NOT EXISTS ygodb_version (
    id SERIAL PRIMARY KEY,
    version TEXT NOT NULL,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_current BOOLEAN DEFAULT TRUE
);

-- Create index on is_current for quick lookups
CREATE INDEX IF NOT EXISTS idx_ygodb_version_is_current ON ygodb_version(is_current);

-- Create function to ensure only one version is marked as current
CREATE
OR REPLACE FUNCTION set_single_current_version() RETURNS TRIGGER AS $$ BEGIN IF NEW.is_current THEN
UPDATE
    ygodb_version
SET
    is_current = FALSE
WHERE
    id != NEW.id;

END IF;

RETURN NEW;

END;

$$ LANGUAGE plpgsql;

-- Create trigger to maintain single current version
CREATE TRIGGER ensure_single_current_version
AFTER
INSERT
    OR
UPDATE
    ON ygodb_version FOR EACH ROW
    WHEN (NEW.is_current = TRUE) EXECUTE FUNCTION set_single_current_version();

-- Insert initial version (will be updated on first run)
INSERT INTO
    ygodb_version (version, is_current)
VALUES
    ('0', TRUE) ON CONFLICT DO NOTHING;

-- Enable pg_cron extension for scheduling tasks
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Create function to call the update-card-data Edge Function
CREATE
OR REPLACE FUNCTION call_update_card_data() RETURNS void AS $$ DECLARE result json;

BEGIN
SELECT
    response INTO result
FROM
    net.http_post(
        url := (
            select
                decrypted_secret
            from
                vault.decrypted_secrets
            where
                name = 'project_url'
        ) || '/functions/v1/update-card-data',
        headers := jsonb_build_object(
            'Content-type',
            'application/json',
            'Authorization',
            'Bearer ' || (
                select
                    decrypted_secret
                from
                    vault.decrypted_secrets
                where
                    name = 'anon_key'
            )
        ),
        body := concat('{"time": "', now(), '"}') :: jsonb
    );

-- Log the function execution
INSERT INTO
    ygodb_version_update_log (status, response)
VALUES
    ('executed', result);

EXCEPTION
WHEN OTHERS THEN -- Log errors
INSERT INTO
    ygodb_version_update_log (status, response)
VALUES
    ('error', json_build_object('error', SQLERRM));

END;

$$ LANGUAGE plpgsql;

-- Create a log table to track update executions
CREATE TABLE IF NOT EXISTS ygodb_version_update_log (
    id SERIAL PRIMARY KEY,
    execution_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    status TEXT,
    response JSONB
);

-- Schedule the update-card-data function to run daily at midnight UTC
SELECT
    cron.schedule(
        'daily-card-data-update',
        -- unique job name
        '0 0 * * *',
        -- cron schedule (midnight every day)
        $$
        SELECT
            call_update_card_data() $$
    );