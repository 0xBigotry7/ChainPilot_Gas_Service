import * as dotenv from 'dotenv';
dotenv.config();
import { createComponentLogger } from './utils/logger';
import { supabase } from './utils/supabase';

const logger = createComponentLogger('TestScript');

// Function to test the cooldown feature
async function testCooldownFeature() {
  try {
    logger.info('Starting cooldown test...');
    
    // Step 1: Get a user from the database
    const { data: users, error: fetchError } = await supabase
      .from('users')
      .select('id, username, wallet_address')
      .limit(5);
    
    if (fetchError) {
      throw fetchError;
    }
    
    if (!users || users.length === 0) {
      logger.info('No users found in the database. Please add a user first.');
      return;
    }
    
    // Select a user
    const user = users[0];
    logger.info(`Selected user: ${user.id}, current username: ${user.username}, wallet: ${user.wallet_address}`);
    
    // Step 2: Update the username first time
    const timestamp1 = new Date().toISOString();
    const newUsername1 = `user_${timestamp1}`;
    
    logger.info(`First update: Changing username to ${newUsername1}`);
    
    const { error: updateError1 } = await supabase
      .from('users')
      .update({ username: newUsername1 })
      .eq('id', user.id);
    
    if (updateError1) {
      throw updateError1;
    }
    
    logger.info(`First username update complete! This should trigger gas funding.`);
    
    // Step 3: Wait 5 seconds
    logger.info('Waiting 5 seconds before second update...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Step 4: Update the username second time
    const timestamp2 = new Date().toISOString();
    const newUsername2 = `user_${timestamp2}`;
    
    logger.info(`Second update: Changing username to ${newUsername2}`);
    
    const { error: updateError2 } = await supabase
      .from('users')
      .update({ username: newUsername2 })
      .eq('id', user.id);
    
    if (updateError2) {
      throw updateError2;
    }
    
    logger.info(`Second username update complete! This should NOT trigger gas funding due to cooldown.`);
    logger.info(`Check the service logs to confirm cooldown is working correctly.`);
    logger.info(`If cooldown is working, you should see a message about the wallet being in cooldown period.`);
    
  } catch (error) {
    logger.error('Error during cooldown test:', error);
  }
}

// Check for command line arguments
const args = process.argv.slice(2);
if (args.includes('--confirm')) {
  // Run the test only if --confirm flag is provided
  testCooldownFeature();
} else {
  console.log(`
⚠️  WARNING: This script will update usernames in your database, which can trigger gas airdrops.
To run this script, use the --confirm flag:

  npx ts-node src/test-cooldown.ts --confirm

No changes were made to your database.
  `);
} 