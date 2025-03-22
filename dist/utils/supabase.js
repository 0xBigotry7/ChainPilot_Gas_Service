"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateWalletGasStatus = exports.supabase = void 0;
exports.getUnfundedWallets = getUnfundedWallets;
exports.processUnfundedWallets = processUnfundedWallets;
const supabase_js_1 = require("@supabase/supabase-js");
const logger_1 = require("./logger");
const logger = (0, logger_1.createComponentLogger)('Supabase');
// Debug supabase configuration
logger.debug(`Initializing Supabase client with URL: ${process.env.SUPABASE_URL}`);
logger.debug(`Supabase key provided: ${Boolean(process.env.SUPABASE_KEY)}`);
// Create a single supabase client for interacting with your database
exports.supabase = (0, supabase_js_1.createClient)(process.env.SUPABASE_URL || '', process.env.SUPABASE_KEY || '', {
    auth: {
        persistSession: false,
    },
    realtime: {
        params: {
            eventsPerSecond: 10,
        },
    },
});
// Test realtime connection
const channel = exports.supabase.channel('supabase_realtime_test');
channel.on('system', { event: '*' }, (payload) => {
    logger.debug(`Supabase realtime test channel status: ${payload.event}`);
});
channel.subscribe();
/**
 * Updates the gas status for a wallet in the gas_tracking table
 * @param walletAddress The wallet address
 * @param txHash The transaction hash of the gas transfer (empty if no transfer needed)
 * @param gasAmount The amount of gas in ETH
 */
const updateWalletGasStatus = async (walletAddress, txHash, gasAmount) => {
    try {
        logger.debug(`Updating gas status for wallet ${walletAddress} with tx hash ${txHash || 'none'}, amount: ${gasAmount} ETH`);
        // Find the user ID for this wallet address
        const { data: userData, error: userError } = await exports.supabase
            .from('users')
            .select('id')
            .eq('wallet_address', walletAddress)
            .limit(1)
            .single();
        if (userError) {
            logger.error(`Error fetching user for wallet ${walletAddress}:`, userError);
            throw userError;
        }
        if (!userData) {
            logger.error(`No user found for wallet ${walletAddress}`);
            throw new Error('User not found');
        }
        // Check if a record already exists
        const { data: existingRecord, error: checkError } = await exports.supabase
            .from('gas_tracking')
            .select('id, gas_amount_eth')
            .eq('wallet_address', walletAddress)
            .limit(1);
        if (checkError) {
            logger.error(`Error checking gas tracking record:`, checkError);
            throw checkError;
        }
        // Update or insert record based on whether it exists
        if (existingRecord && existingRecord.length > 0) {
            // Calculate cumulative gas amount if record exists
            const previousAmount = existingRecord[0].gas_amount_eth || "0";
            const totalAmount = (parseFloat(previousAmount) + parseFloat(gasAmount)).toString();
            // Update existing record
            const { error: updateError } = await exports.supabase
                .from('gas_tracking')
                .update({
                has_received_gas: true,
                gas_funding_tx_hash: txHash,
                gas_amount_eth: totalAmount,
                updated_at: new Date().toISOString()
            })
                .eq('wallet_address', walletAddress);
            if (updateError) {
                logger.error(`Error updating gas tracking record:`, updateError);
                throw updateError;
            }
            logger.info(`Updated gas tracking record for wallet ${walletAddress}, total gas: ${totalAmount} ETH`);
        }
        else {
            // Insert new record
            const { error: insertError } = await exports.supabase
                .from('gas_tracking')
                .insert({
                user_id: userData.id,
                wallet_address: walletAddress,
                has_received_gas: true,
                gas_funding_tx_hash: txHash,
                gas_amount_eth: gasAmount,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            });
            if (insertError) {
                logger.error(`Error inserting gas tracking record:`, insertError);
                throw insertError;
            }
            logger.info(`Inserted gas tracking record for wallet ${walletAddress}, gas: ${gasAmount} ETH`);
        }
    }
    catch (error) {
        logger.error(`Failed to update wallet gas status:`, error);
        throw error;
    }
};
exports.updateWalletGasStatus = updateWalletGasStatus;
/**
 * Gets wallets that have not been funded with gas yet
 * This is used for manual checking/backfilling if needed
 */
async function getUnfundedWallets() {
    try {
        // First get all users with wallet addresses
        const { data: usersWithWallets, error: userError } = await exports.supabase
            .from('users')
            .select('id, wallet_address, created_at')
            .not('wallet_address', 'is', null)
            .order('created_at', { ascending: true });
        if (userError) {
            throw userError;
        }
        if (!usersWithWallets || usersWithWallets.length === 0) {
            return [];
        }
        // Get all already funded wallets from gas_tracking
        const { data: fundedRecords, error: trackingError } = await exports.supabase
            .from('gas_tracking')
            .select('wallet_address')
            .eq('has_received_gas', true);
        if (trackingError) {
            throw trackingError;
        }
        // Create a set of already funded wallet addresses for efficient lookup
        const fundedWallets = new Set(fundedRecords?.map(record => record.wallet_address.toLowerCase()) || []);
        // Filter to get only unfunded wallets
        const unfundedWallets = usersWithWallets
            .filter(user => user.wallet_address && !fundedWallets.has(user.wallet_address.toLowerCase()))
            .map(user => ({
            user_id: user.id,
            wallet_address: user.wallet_address,
            created_at: user.created_at
        }));
        logger.info(`Found ${unfundedWallets.length} unfunded wallets 📊`);
        return unfundedWallets;
    }
    catch (error) {
        logger.error(`Failed to get unfunded wallets: ${error} ❌`);
        return [];
    }
}
/**
 * Manually check for unfunded wallets and process them
 * This is used as a fallback if realtime events fail
 */
async function processUnfundedWallets(processor) {
    try {
        const { data, error } = await exports.supabase
            .from('gas_tracking')
            .select('id, wallet_address')
            .is('has_received_gas', false)
            .limit(100);
        if (error) {
            throw error;
        }
        logger.info(`Found ${data.length} unfunded wallets to process`);
        for (const record of data) {
            try {
                await processor(record.wallet_address);
            }
            catch (err) {
                logger.error(`Error processing wallet ${record.wallet_address}:`, err);
            }
        }
    }
    catch (error) {
        logger.error('Error fetching unfunded wallets:', error);
        throw error;
    }
}
