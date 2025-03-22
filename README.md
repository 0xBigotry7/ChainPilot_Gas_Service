# Gas Service for Arbitrum

This service monitors username changes in the Supabase database and provides gas funds to new user wallets on the Arbitrum network.

## Features

- Monitors username changes in Supabase (using realtime subscriptions)
- Sends gas to new wallets (configurable amount)
- Whitelist mode for testing
- Automatic gas funding on username changes
- RPC resilience with retry mechanism
- Detailed logging
- Database tracking of funded wallets

## Setup

1. Configure your environment variables in `.env`:

```
# Server
PORT=3001
LOG_LEVEL=debug # options: debug, info, warn, error

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Arbitrum RPC URL
ARBITRUM_RPC_URL=https://rpc.ankr.com/arbitrum

# Funder wallet details
FUNDER_PRIVATE_KEY=your-private-key
FUNDER_ADDRESS=your-address
GAS_AMOUNT_TO_SEND=0.001
MAX_TX_PER_MINUTE=10

# Whitelist (optional, for testing)
WHITELIST_ENABLED=true
WHITELISTED_ADDRESSES=0x123...,0x456...
```

2. Enable realtime for your tables in Supabase:

```sql
-- Run this in Supabase SQL Editor
DROP PUBLICATION IF EXISTS supabase_realtime;
CREATE PUBLICATION supabase_realtime FOR TABLE users, gas_tracking;
ALTER PUBLICATION supabase_realtime SET TABLE users, gas_tracking;
```

3. Install dependencies and build:

```bash
npm install
npm run build
```

## Running the Service

```bash
npm start
```

## Testing Tools

### 1. Manually Trigger Gas Funding

To test gas funding for a specific wallet:

```bash
cd gas-service
npx ts-node src/test-manual-trigger.ts <WALLET_ADDRESS>
```

This will:
- Check the target wallet's balance
- Send gas from the funder wallet
- Update the gas_tracking table
- Log detailed information about the process

### 2. Test Realtime Events

To verify realtime events are working:

```bash
cd gas-service
npx ts-node src/test-realtime.ts
```

This will set up a subscription to the users table and log all events it receives.

### 3. Health Check API

The service exposes a health check endpoint:

```
GET http://localhost:3001/health
```

## Troubleshooting

### Row-Level Security Issues

If you encounter RLS errors when updating the gas_tracking table:
1. Add your SUPABASE_SERVICE_ROLE_KEY to the .env file
2. The service will automatically retry with the service role key

### Realtime Not Working

If realtime events aren't being received:
1. Verify you've run the SQL to enable realtime for your tables
2. Check the Supabase dashboard > Database > Replication to ensure your tables are listed
3. Look at the debug logs to see if the subscription has been established

### Low Gas Balance

If you get an "Insufficient funder balance" error, add more ETH to your funder wallet.

## Logging

Set LOG_LEVEL to control logging verbosity:
- debug: All logs (best for development)
- info: Normal operation logs (good for production)
- warn: Only warnings and errors
- error: Only errors 