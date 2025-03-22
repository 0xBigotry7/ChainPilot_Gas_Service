import * as dotenv from 'dotenv';
dotenv.config();
import { ethers } from 'ethers';
import { createComponentLogger } from './utils/logger';
import { supabase, updateWalletGasStatus } from './utils/supabase';

const logger = createComponentLogger('TestScript');

async function testWhitelistStatus() {
  logger.info('Testing gas service whitelist status 🧪');
  
  // Check whitelist configuration
  const whitelistEnabled = process.env.WHITELIST_ENABLED === 'true';
  const whitelistedAddresses = new Set(
    (process.env.WHITELISTED_ADDRESSES || '')
      .split(',')
      .map(addr => addr.trim().toLowerCase())
      .filter(addr => addr.length > 0)
  );
  
  logger.info(`Whitelist status: ${whitelistEnabled ? 'ENABLED ✅' : 'DISABLED ❌'}`);
  
  if (whitelistEnabled) {
    logger.info(`Whitelisted addresses (${whitelistedAddresses.size}):`);
    Array.from(whitelistedAddresses).forEach(addr => {
      logger.info(`  - ${addr}`);
    });
  } else {
    logger.info('Whitelist is disabled - any address can receive gas ⛽');
  }
  
  // Test addresses
  const testAddresses = [
    '0x51886c828c90D1B21E2901663b5A74d48fDE7f97', // Whitelisted
    '0x35769228aDBED9134D772D0FC0d4c1f4815839e3', // Whitelisted
    '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', // Vitalik's address (not whitelisted)
    '0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B' // Random address (not whitelisted)
  ];
  
  logger.info('Testing addresses that would receive gas:');
  testAddresses.forEach(addr => {
    const wouldReceiveGas = !whitelistEnabled || whitelistedAddresses.has(addr.toLowerCase());
    logger.info(`  - ${addr}: ${wouldReceiveGas ? 'WOULD RECEIVE GAS ✅' : 'BLOCKED BY WHITELIST ❌'}`);
  });
  
  logger.info('Test complete! 🎉');
}

testWhitelistStatus().catch(error => {
  logger.error('Test error:', error);
  process.exit(1);
}); 