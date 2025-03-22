-- Step 1: Enable the postgres publication for all tables
-- First drop the existing publication if it exists (optional)
DROP PUBLICATION IF EXISTS supabase_realtime;

-- Create the publication with all tables
CREATE PUBLICATION supabase_realtime FOR TABLE users, gas_tracking;

-- Step 2: Enable specific change events for the users table
ALTER PUBLICATION supabase_realtime SET TABLE users, gas_tracking;

-- Step 3: Verify the publication is set up correctly
SELECT * FROM pg_publication WHERE pubname = 'supabase_realtime';

-- Step 4: Verify the tables in the publication
SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime'; 