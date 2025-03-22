"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv = __importStar(require("dotenv"));
dotenv.config();
const logger_1 = require("./utils/logger");
const supabase_1 = require("./utils/supabase");
const logger = (0, logger_1.createComponentLogger)('TestScript');
// Function to update a random username in the database
async function updateRandomUsername() {
    try {
        logger.info('Starting username update test...');
        // Get the current timestamp
        const timestamp = new Date().toISOString();
        // First, check if there are any users
        const { data: users, error: fetchError } = await supabase_1.supabase
            .from('users')
            .select('id, username, wallet_address')
            .limit(5);
        if (fetchError) {
            throw fetchError;
        }
        if (!users || users.length === 0) {
            logger.info('No users found in the database. Creating a test user...');
            // Create a test wallet address (replace with any test address you want to fund)
            const testWalletAddress = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'; // Example address
            // Insert a new user
            const { data: newUser, error: insertError } = await supabase_1.supabase
                .from('users')
                .insert([
                {
                    username: 'test_user',
                    wallet_address: testWalletAddress
                }
            ])
                .select();
            if (insertError) {
                throw insertError;
            }
            logger.info(`Created new test user with ID: ${newUser[0].id}, wallet: ${testWalletAddress}`);
            // Wait a moment to ensure the user is created
            await new Promise(resolve => setTimeout(resolve, 1000));
            // Now update the username to trigger the event
            const { error: updateError } = await supabase_1.supabase
                .from('users')
                .update({ username: `test_user_${timestamp}` })
                .eq('id', newUser[0].id);
            if (updateError) {
                throw updateError;
            }
            logger.info(`Updated username for user ID: ${newUser[0].id} to trigger gas funding`);
        }
        else {
            // Select a random user from the list
            const randomIndex = Math.floor(Math.random() * users.length);
            const user = users[randomIndex];
            logger.info(`Selected user: ${user.id}, current username: ${user.username}, wallet: ${user.wallet_address}`);
            // Update the username
            const newUsername = `user_${timestamp}`;
            const { error: updateError } = await supabase_1.supabase
                .from('users')
                .update({ username: newUsername })
                .eq('id', user.id);
            if (updateError) {
                throw updateError;
            }
            logger.info(`Updated username to: ${newUsername} for user ID: ${user.id}`);
            logger.info(`This should trigger gas funding for wallet: ${user.wallet_address}`);
        }
        logger.info('Test completed! Check the logs to see if gas was sent.');
    }
    catch (error) {
        logger.error('Error during test:', error);
    }
}
// Check for command line arguments
const args = process.argv.slice(2);
if (args.includes('--confirm')) {
    // Run the test only if --confirm flag is provided
    updateRandomUsername();
}
else {
    console.log(`
⚠️  WARNING: This script will update usernames in your database, which can trigger gas airdrops.
To run this script, use the --confirm flag:

  npx ts-node src/test-username-update.ts --confirm

No changes were made to your database.
  `);
}
