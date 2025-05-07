-- Fix cleanup_old_api_calls function to avoid using aggregate functions in RETURNING
CREATE OR REPLACE FUNCTION cleanup_old_api_calls(older_than_hours INTEGER DEFAULT 24)
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM api_calls 
  WHERE timestamp < (NOW() - (older_than_hours || ' hours')::INTERVAL);
  
  -- Use GET DIAGNOSTICS to retrieve the number of affected rows
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ensure permissions are granted
GRANT EXECUTE ON FUNCTION cleanup_old_api_calls(INTEGER) TO postgres, service_role;
