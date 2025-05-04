-- Create a table to track API calls
CREATE TABLE IF NOT EXISTS api_calls (
  id BIGSERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  api_name TEXT NOT NULL
);

-- Create an index on timestamp for efficient queries
CREATE INDEX api_calls_timestamp_idx ON api_calls (timestamp);

-- Set up row level security
ALTER TABLE api_calls ENABLE ROW LEVEL SECURITY;

-- Create policies to only allow service role to read/write
CREATE POLICY "Service role can insert api_calls" 
  ON api_calls FOR INSERT TO service_role WITH CHECK (true);

CREATE POLICY "Service role can select api_calls" 
  ON api_calls FOR SELECT TO service_role USING (true);

-- Use this function to cleanup old API call records
CREATE OR REPLACE FUNCTION cleanup_old_api_calls(older_than_hours INTEGER DEFAULT 24)
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM api_calls 
  WHERE timestamp < (NOW() - (older_than_hours || ' hours')::INTERVAL)
  RETURNING COUNT(*) INTO deleted_count;
  
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Schedule automated cleanup of API calls using pg_cron
-- This will run once per day at 3:00 AM to delete records older than 24 hours
SELECT cron.schedule(
  'cleanup-api-calls-daily',                    -- unique job name
  '0 3 * * *',                                 -- cron schedule (daily at 3:00 AM)
  $$SELECT cleanup_old_api_calls(24)$$         -- SQL command to execute
);

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION cleanup_old_api_calls(INTEGER) TO postgres, service_role;