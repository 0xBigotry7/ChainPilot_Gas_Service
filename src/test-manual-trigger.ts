import dotenv from 'dotenv';
dotenv.config();

import { ethers } from 'ethers';
import { createClient } from '@supabase/supabase-js';
import { createComponentLogger } from './utils/logger';

const logger = createComponentLogger('TestScript');

// Helper function to generate a visual progress bar
function generateProgressBar(current: number, max: number = 0.05, length: number = 20): string {
  const percentage = Math.min(100, Math.round((current / max) * 100));
  const filledLength = Math.round((length * current) / max);
  const emptyLength = length - filledLength;
  
  const filled = '█'.repeat(filledLength);
  const empty = '░'.repeat(emptyLength);
  
  // Choose color emoji based on percentage
  let indicator = '🟢'; // Green for good (over 60%)
  if (percentage <= 20) {
    indicator = '🔴'; // Red for danger (under 20%)
  } else if (percentage <= 60) {
    indicator = '🟡'; // Yellow for warning (20-60%)
  }
  
  return `${indicator} ${filled}${empty} ${percentage}% (${current.toFixed(6)} ETH)`;
}

// Check arguments
const args = process.argv.slice(2);
if (args.length !== 1) {
  console.log('Usage: npx ts-node src/test-manual-trigger.ts <wallet_address>');
  process.exit(1);
}

const walletAddress = args[0];

// Validate wallet address
if (!ethers.isAddress(walletAddress)) {
  console.error('❌ Invalid wallet address');
  process.exit(1);
}

logger.info(`🧪 Testing gas funding for wallet: ${walletAddress}`);

async function main() {
  try {
    // Initialize provider
    const provider = new ethers.JsonRpcProvider(process.env.ARBITRUM_RPC_URL);
    
    // Check wallet balance
    const balance = await provider.getBalance(walletAddress);
    logger.info(`💰 Current wallet balance: ${ethers.formatEther(balance)} ETH`);
    
    // Initialize funder wallet
    const funderWallet = new ethers.Wallet(process.env.FUNDER_PRIVATE_KEY!, provider);
    logger.info(`🏦 Funding from wallet: ${funderWallet.address}`);
    
    // Get funder balance
    const funderBalance = await provider.getBalance(funderWallet.address);
    const funderBalanceEth = parseFloat(ethers.formatEther(funderBalance));
    logger.info(`💵 Funder wallet balance: ${generateProgressBar(funderBalanceEth)}`);
    
    // Calculate gas amount
    const gasAmount = ethers.parseEther(process.env.GAS_AMOUNT_TO_SEND || "0.001");
    const gasAmountEth = ethers.formatEther(gasAmount);
    logger.info(`💸 Sending ${gasAmountEth} ETH as gas`);
    
    // Get gas fee data
    const feeData = await provider.getFeeData();
    
    // Send transaction
    const tx = await funderWallet.sendTransaction({
      to: walletAddress,
      value: gasAmount,
      maxFeePerGas: feeData.maxFeePerGas,
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas
    });
    
    logger.info(`📤 Transaction sent! Hash: ${tx.hash}`);
    logger.info('⌛ Waiting for confirmation...');
    
    // Wait for transaction confirmation
    const receipt = await tx.wait();
    
    if (receipt && receipt.status === 1) {
      logger.info('✅ Transaction confirmed successfully!');
      
      // Get remaining balance
      const remainingBalance = await provider.getBalance(funderWallet.address);
      const remainingEth = parseFloat(ethers.formatEther(remainingBalance));
      logger.info(`💰 Remaining funder balance: ${generateProgressBar(remainingEth)}`);
      
      // Initialize Supabase clients
      const supabase = createClient(
        process.env.SUPABASE_URL || '',
        process.env.SUPABASE_KEY || ''
      );
      
      // Find the user ID for this wallet
      logger.info('🔍 Looking up user in database...');
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('id')
        .eq('wallet_address', walletAddress)
        .limit(1)
        .single();
      
      if (userError) {
        logger.error('❌ Error fetching user:', { error: userError });
        return;
      }
      
      if (!userData) {
        logger.error('❌ No user found with this wallet address');
        return;
      }
      
      logger.info(`✅ Found user with ID: ${userData.id}`);
      
      // Check if tracking record exists
      logger.info('🔍 Checking for existing gas tracking record...');
      const { data: existingRecord, error: checkError } = await supabase
        .from('gas_tracking')
        .select('id, gas_amount_eth')
        .eq('wallet_address', walletAddress)
        .limit(1);
      
      if (checkError) {
        logger.error('❌ Error checking gas tracking record:', { error: checkError });
        return;
      }
      
      if (existingRecord && existingRecord.length > 0) {
        logger.info(`✅ Found existing record with ID: ${existingRecord[0].id}`);
        
        // Calculate cumulative gas amount
        const previousAmount = existingRecord[0].gas_amount_eth || "0";
        const totalAmount = (parseFloat(previousAmount) + parseFloat(gasAmountEth)).toString();
        logger.info(`Previous gas total: ${previousAmount} ETH, new total: ${totalAmount} ETH`);
        
        // Update existing record
        logger.info('🔄 Updating gas tracking record...');
        const { error: updateError } = await supabase
          .from('gas_tracking')
          .update({
            has_received_gas: true,
            gas_funding_tx_hash: tx.hash,
            gas_amount_eth: totalAmount,
            updated_at: new Date().toISOString()
          })
          .eq('wallet_address', walletAddress);
        
        if (updateError) {
          logger.error('❌ Error updating gas tracking record:', { error: updateError });
        } else {
          logger.info(`✅ Gas tracking record updated successfully! Total gas: ${totalAmount} ETH`);
        }
      } else {
        logger.info('🆕 No existing record found, creating new record...');
        
        try {
          // Insert record
          const { error: insertError } = await supabase
            .from('gas_tracking')
            .insert({
              user_id: userData.id,
              wallet_address: walletAddress,
              has_received_gas: true,
              gas_funding_tx_hash: tx.hash,
              gas_amount_eth: gasAmountEth,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            });
          
          if (insertError) {
            logger.error('❌ Error creating gas tracking record:', { error: insertError });
          } else {
            logger.info(`✅ Gas tracking record created successfully! Gas amount: ${gasAmountEth} ETH`);
          }
        } catch (error) {
          logger.error('❌ Unexpected error creating record:', { error });
        }
      }
    } else {
      logger.error('❌ Transaction failed!');
    }
  } catch (error) {
    logger.error('❌ Error:', { error });
  }
}

main().then(() => process.exit(0)).catch(err => {
  logger.error('❌ Fatal error:', { error: err });
  process.exit(1);
}); 