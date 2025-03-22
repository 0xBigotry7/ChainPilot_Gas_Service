import { ethers } from 'ethers';
import { createComponentLogger } from '../utils/logger';
import { supabase, updateWalletGasStatus } from '../utils/supabase';
import { getPrivateKey, getRequiredEnv } from '../utils/envHelper';

const logger = createComponentLogger('WalletMonitor');

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

export class WalletMonitor {
  private provider: ethers.JsonRpcProvider;
  private funderWallet: ethers.Wallet;
  private gasAmountToSend: bigint;
  private maxTxPerMinute: number;
  private txCount: Map<string, { count: number; timestamp: number }>;
  private isProcessing: boolean;
  private whitelistEnabled: boolean;
  private whitelistedAddresses: Set<string>;
  private isRunning: boolean;
  private dbListener: any;
  private recentlyFundedWallets: Map<string, number>; // Track recently funded wallets with timestamp
  private cooldownPeriodMs: number; // Cooldown period in milliseconds

  constructor() {
    this.isRunning = false;
    
    // Initialize the recently funded wallets map and set cooldown period (default 10 minutes)
    this.recentlyFundedWallets = new Map();
    this.cooldownPeriodMs = Number(process.env.COOLDOWN_PERIOD_MINUTES || "10") * 60 * 1000;
    
    try {
      // Get required environment variables using our helper functions
      const rpcUrl = getRequiredEnv('ARBITRUM_RPC_URL');
      const funderAddress = getRequiredEnv('FUNDER_ADDRESS');
      
      // Get and format the private key using our special helper
      const privateKey = getPrivateKey('FUNDER_PRIVATE_KEY');
      
      this.provider = new ethers.JsonRpcProvider(rpcUrl, undefined, {
        staticNetwork: true,
        polling: true,
        pollingInterval: 4000,
        batchMaxCount: 1,
        batchStallTime: 0
      });
      
      this.funderWallet = new ethers.Wallet(privateKey, this.provider);
      this.gasAmountToSend = ethers.parseEther(process.env.GAS_AMOUNT_TO_SEND || "0.001");
      this.maxTxPerMinute = Number(process.env.MAX_TX_PER_MINUTE || "10");
      this.txCount = new Map();
      this.isProcessing = false;

      // Initialize whitelist
      this.whitelistEnabled = process.env.WHITELIST_ENABLED === 'true';
      this.whitelistedAddresses = new Set(
        (process.env.WHITELISTED_ADDRESSES || '')
          .split(',')
          .map(addr => addr.trim().toLowerCase())
          .filter(addr => addr.length > 0)
      );

      if (this.whitelistEnabled) {
        logger.info(`Whitelist enabled with ${this.whitelistedAddresses.size} addresses`);
        logger.info('Whitelisted addresses:', Array.from(this.whitelistedAddresses));
      }

      // Validate funder wallet
      if (this.funderWallet.address.toLowerCase() !== funderAddress.toLowerCase()) {
        throw new Error('Funder wallet address does not match private key');
      }
    } catch (error) {
      logger.error('Error initializing WalletMonitor:', error);
      throw error;
    }
  }

  // Public getter for isRunning
  public get running(): boolean {
    return this.isRunning;
  }

  private isWhitelisted(address: string): boolean {
    if (!this.whitelistEnabled) return true;
    return this.whitelistedAddresses.has(address.toLowerCase());
  }

  private async withRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    delayMs: number = 1000
  ): Promise<T> {
    let lastError;
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await operation();
      } catch (error: any) {
        lastError = error;
        if (error.code === 'SERVER_ERROR' || error.code === 'NETWORK_ERROR') {
          logger.warn(`Retry ${i + 1}/${maxRetries} failed:`, error.shortMessage || error.message);
          await new Promise(resolve => setTimeout(resolve, delayMs * (i + 1)));
          continue;
        }
        throw error;
      }
    }
    throw lastError;
  }

  private async checkFunderBalance(): Promise<boolean> {
    try {
      const balance = await this.withRetry(() => this.provider.getBalance(this.funderWallet.address));
      const balanceEth = parseFloat(ethers.formatEther(balance));
      
      // Only need to have 3 times the gas amount as minimum for testing
      const minBalance = this.gasAmountToSend * BigInt(3);
      const minBalanceEth = parseFloat(ethers.formatEther(minBalance));
      
      // Generate progress bar (max 0.05 ETH as requested)
      const progressBar = generateProgressBar(balanceEth);
      
      if (balance < minBalance) {
        logger.error(`⚠️ LOW BALANCE! ${progressBar}`);
        return false;
      }
      
      // Add special warning for low balance (below 0.01 ETH)
      if (balanceEth < 0.01) {
        logger.warn(`⚠️ LOW BALANCE WARNING! ${progressBar}`);
      } else {
        logger.info(`Funder wallet balance: ${progressBar}`);
      }
      
      return true;
    } catch (error) {
      logger.error(`Error checking funder balance:`, error);
      return false;
    }
  }

  private isRateLimited(walletAddress: string): boolean {
    const now = Date.now();
    const txInfo = this.txCount.get(walletAddress);
    
    if (!txInfo) {
      this.txCount.set(walletAddress, { count: 1, timestamp: now });
      return false;
    }

    if (now - txInfo.timestamp > 60000) { // Reset after 1 minute
      this.txCount.set(walletAddress, { count: 1, timestamp: now });
      return false;
    }

    if (txInfo.count >= this.maxTxPerMinute) {
      return true;
    }

    txInfo.count++;
    return false;
  }

  private isInCooldown(walletAddress: string): boolean {
    const normalizedAddress = walletAddress.toLowerCase();
    const lastFundedTime = this.recentlyFundedWallets.get(normalizedAddress);
    
    if (!lastFundedTime) {
      return false;
    }
    
    const now = Date.now();
    const timeSinceLastFunding = now - lastFundedTime;
    
    // Check if wallet is still in cooldown period
    if (timeSinceLastFunding < this.cooldownPeriodMs) {
      const minutesLeft = Math.ceil((this.cooldownPeriodMs - timeSinceLastFunding) / 60000);
      logger.info(`🕒 Wallet ${walletAddress} was recently funded (${minutesLeft} minutes ago). Cooldown: ${this.cooldownPeriodMs/60000} minutes.`);
      return true;
    }
    
    // Cooldown period has passed, remove from tracking
    this.recentlyFundedWallets.delete(normalizedAddress);
    return false;
  }

  private async setupDatabaseListener() {
    logger.info('Setting up database listener for username changes... 📡');
    
    // Create a more specific channel name
    this.dbListener = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE', // Only listen for UPDATE events
          schema: 'public',
          table: 'users',
        },
        async (payload: any) => {
          try {
            // Log info about the event
            logger.info(`📝 Username changed! User ID: ${payload.new?.id}, Old username: ${payload.old?.username}, New username: ${payload.new?.username}`);
            
            // Get the wallet address
            const walletAddress = payload.new?.wallet_address;
            
            // Skip if no wallet address
            if (!walletAddress || typeof walletAddress !== 'string') {
              logger.info('User update has no wallet address, skipping gas airdrop');
              return;
            }
            
            logger.info(`🎯 Processing gas airdrop for wallet: ${walletAddress}`);
            
            // Check whitelist
            if (!this.isWhitelisted(walletAddress)) {
              logger.info(`🚫 Skipping non-whitelisted address: ${walletAddress}`);
              return;
            }
            
            // Rate limiting check
            if (this.isRateLimited(walletAddress)) {
              logger.warn(`🛑 Rate limit exceeded for wallet ${walletAddress}`);
              return;
            }
            
            // Check cooldown period
            if (this.isInCooldown(walletAddress)) {
              logger.info(`⏱️ Wallet ${walletAddress} is in cooldown period. Skipping gas airdrop.`);
              return;
            }
            
            // All checks passed, send gas immediately
            await this.sendGas(walletAddress);
          } catch (error) {
            logger.error(`❌ Error processing username change event:`, error);
          }
        }
      )
      .subscribe((status) => {
        logger.info(`Supabase realtime subscription status: ${status} ${status === 'SUBSCRIBED' ? '✅' : '⌛'}`);
      });
  }

  async start() {
    try {
      logger.info('Starting wallet monitor service... 🚀');
      
      // Initial balance check
      if (!await this.checkFunderBalance()) {
        throw new Error('Insufficient funder wallet balance');
      }

      // Test provider connection
      const network = await this.withRetry(() => this.provider.getNetwork());
      logger.info(`Connected to network: ${network.name} (chainId: ${network.chainId}) 🌐`);
      
      // Setup database listener
      await this.setupDatabaseListener();

      this.isRunning = true;

      // Set up periodic balance check
      const balanceCheckInterval = setInterval(async () => {
        if (!this.isRunning) {
          clearInterval(balanceCheckInterval);
          return;
        }
        await this.checkFunderBalance();
      }, 5 * 60 * 1000); // Every 5 minutes

      logger.info(`Service started with configuration:
        - Whitelist enabled: ${this.whitelistEnabled}
        - Number of whitelisted addresses: ${this.whitelistedAddresses.size}
        - Gas amount to send per airdrop: ${ethers.formatEther(this.gasAmountToSend)} ETH
        - Rate limit: ${this.maxTxPerMinute} tx/minute/wallet
        - Listening for username changes for gas airdrops
      `);
    } catch (error) {
      logger.error(`Error starting service:`, error);
      throw error;
    }
  }

  private async sendGas(to: string) {
    try {
      // Double-check whitelist before sending
      if (!this.isWhitelisted(to)) {
        logger.warn(`Prevented sending to non-whitelisted address: ${to} 🚫`);
        return;
      }

      // Get latest gas prices from Arbitrum network
      const feeData = await this.withRetry(() => this.provider.getFeeData());

      // Send transaction with custom gas settings for Arbitrum
      const gasAmountEth = ethers.formatEther(this.gasAmountToSend);
      logger.info(`💸 Sending ${gasAmountEth} ETH to ${to}`);
      
      const tx = await this.withRetry(() => this.funderWallet.sendTransaction({
        to: to,
        value: this.gasAmountToSend,
        maxFeePerGas: feeData.maxFeePerGas,
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas
      }));

      logger.info(`📤 Transaction sent! Hash: ${tx.hash}`);
      
      const receipt = await this.withRetry(() => tx.wait());
      
      if (receipt && receipt.status === 1) {
        // Add this wallet to the recently funded list with current timestamp
        this.recentlyFundedWallets.set(to.toLowerCase(), Date.now());
        
        // Check remaining balance
        const remainingBalance = await this.provider.getBalance(this.funderWallet.address);
        const remainingEth = parseFloat(ethers.formatEther(remainingBalance));
        const progressBar = generateProgressBar(remainingEth);
        
        logger.info(`✅ Gas airdrop confirmed! Remaining funder balance: ${progressBar}`);
        
        try {
          await updateWalletGasStatus(to, tx.hash, gasAmountEth);
          logger.info(`✅ Database updated for wallet ${to} with gas amount ${gasAmountEth} ETH`);
        } catch (dbError) {
          logger.error(`❌ Failed to update database for ${to}:`, dbError);
        }
      } else {
        throw new Error(`Transaction failed for ${to}`);
      }
    } catch (error) {
      logger.error(`❌ Failed to send gas to ${to}:`, error);
      throw error;
    }
  }

  /**
   * Process a single wallet for gas funding
   * This is used for the manual API endpoint
   */
  public async processSingleWallet(walletAddress: string): Promise<boolean> {
    try {
      logger.info(`🔍 Manually processing gas airdrop for wallet: ${walletAddress}`);
      
      // Check whitelist
      if (!this.isWhitelisted(walletAddress)) {
        logger.info(`🚫 Skipping non-whitelisted address: ${walletAddress}`);
        return false;
      }
      
      // Check if we have enough balance in the funder wallet
      if (!await this.checkFunderBalance()) {
        logger.error(`❌ Insufficient funder balance to process ${walletAddress}`);
        return false;
      }
      
      // Rate limiting check
      if (this.isRateLimited(walletAddress)) {
        logger.warn(`🛑 Rate limit exceeded for wallet ${walletAddress}`);
        return false;
      }
      
      // Check cooldown period
      if (this.isInCooldown(walletAddress)) {
        logger.info(`⏱️ Wallet ${walletAddress} is in cooldown period. Skipping gas airdrop.`);
        return false;
      }
      
      // All checks passed, send gas
      await this.sendGas(walletAddress);
      return true;
    } catch (error) {
      logger.error(`❌ Error processing wallet ${walletAddress}:`, error);
      return false;
    }
  }

  async stop() {
    logger.info('Stopping wallet monitor service...');
    this.isRunning = false;
    
    // Remove database listener
    if (this.dbListener) {
      this.dbListener.unsubscribe();
      logger.info('Database listener removed');
    }
    
    logger.info('Wallet monitor service stopped');
  }
} 