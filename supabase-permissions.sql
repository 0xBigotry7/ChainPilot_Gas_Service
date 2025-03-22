-- Add the gas_amount_eth column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_name = 'gas_tracking' 
        AND column_name = 'gas_amount_eth'
    ) THEN
        ALTER TABLE public.gas_tracking 
        ADD COLUMN gas_amount_eth TEXT DEFAULT '0';
    END IF;
END $$;

-- Enable Row Level Security on the gas_tracking table
ALTER TABLE public.gas_tracking ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist to avoid duplicate policy errors
DROP POLICY IF EXISTS "Allow anonymous insert to gas_tracking" ON public.gas_tracking;
DROP POLICY IF EXISTS "Allow anonymous update to gas_tracking" ON public.gas_tracking;
DROP POLICY IF EXISTS "Allow anonymous select from gas_tracking" ON public.gas_tracking;
DROP POLICY IF EXISTS "Allow authenticated insert to gas_tracking" ON public.gas_tracking;
DROP POLICY IF EXISTS "Allow authenticated update to gas_tracking" ON public.gas_tracking;
DROP POLICY IF EXISTS "Allow authenticated select from gas_tracking" ON public.gas_tracking;

-- Create a policy that allows anonymous users to insert into gas_tracking
CREATE POLICY "Allow anonymous insert to gas_tracking" 
ON public.gas_tracking 
FOR INSERT 
TO anon
WITH CHECK (true);

-- Create a policy that allows anonymous users to update their own records
CREATE POLICY "Allow anonymous update to gas_tracking" 
ON public.gas_tracking 
FOR UPDATE 
TO anon
USING (true)
WITH CHECK (true);

-- Create a policy that allows anonymous users to select from gas_tracking
CREATE POLICY "Allow anonymous select from gas_tracking" 
ON public.gas_tracking 
FOR SELECT 
TO anon
USING (true);

-- Create a policy for the authenticated role
CREATE POLICY "Allow authenticated insert to gas_tracking" 
ON public.gas_tracking 
FOR INSERT 
TO authenticated
WITH CHECK (true);

CREATE POLICY "Allow authenticated update to gas_tracking" 
ON public.gas_tracking 
FOR UPDATE 
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow authenticated select from gas_tracking" 
ON public.gas_tracking 
FOR SELECT 
TO authenticated
USING (true);

-- Verify the policies
SELECT tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'gas_tracking';

-- Verify that realtime is enabled
DROP PUBLICATION IF EXISTS supabase_realtime;
CREATE PUBLICATION supabase_realtime FOR TABLE users, gas_tracking;
ALTER PUBLICATION supabase_realtime SET TABLE users, gas_tracking;

-- Verify the publication
SELECT * FROM pg_publication WHERE pubname = 'supabase_realtime';
SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime';

-- Show total gas sent to each wallet
SELECT wallet_address, gas_amount_eth, has_received_gas, updated_at
FROM gas_tracking
ORDER BY updated_at DESC; 