"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const winston_1 = __importDefault(require("winston"));
// Load environment variables before any other imports
dotenv_1.default.config();
const express_1 = __importDefault(require("express"));
const logger_1 = require("./utils/logger");
const WalletMonitor_1 = require("./services/WalletMonitor");
const supabase_1 = require("./utils/supabase");
const ethers_1 = require("ethers");
// Import component emojis for the logger
const componentEmojis = {
    'WalletMonitor': '👀',
    'USDC': '💲',
    'Gas': '⛽',
    'Network': '🌐',
    'Database': '💾',
    'Health': '❤️',
    'API': '🔌',
    'Supabase': '📊',
    'App': '🚀',
    'USDCListener': '💸',
    'TestScript': '🧪'
};
// Create logger for the application
const logger = (0, logger_1.createComponentLogger)('App');
// Store logs in memory for inspection
const logHistory = [];
const MAX_LOG_HISTORY = 100;
// Create a custom transport to capture logs
const captureLogsTransport = new winston_1.default.transports.Console({
    format: winston_1.default.format.printf((info) => {
        const { level, message, timestamp, component, ...rest } = info;
        const emoji = component && typeof component === 'string' ? componentEmojis[component] || '📝' : '📝';
        let logString = `${timestamp} [${level}]`;
        if (component) {
            logString += ` [${component}${emoji}]`;
        }
        logString += `: ${message}`;
        // Add any additional metadata if available
        if (Object.keys(rest).length > 0 && !rest.stack) {
            try {
                logString += ` ${JSON.stringify(rest)}`;
            }
            catch (e) {
                // Ignore stringify errors
            }
        }
        // Add to log history
        if (logHistory.length >= MAX_LOG_HISTORY) {
            logHistory.shift(); // Remove oldest log
        }
        logHistory.push(logString);
        return logString;
    })
});
winston_1.default.loggers.add('captureLogger', {
    transports: [captureLogsTransport]
});
// Initialize the wallet monitor
const walletMonitor = new WalletMonitor_1.WalletMonitor();
// Create Express application
const app = (0, express_1.default)();
const port = process.env.PORT || 3001;
// API key authentication middleware
const authenticateApiKey = (req, res, next) => {
    const apiKey = req.header('X-API-Key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
};
// Middleware to parse JSON bodies
app.use(express_1.default.json());
// Health check endpoint
function healthCheckHandler(req, res) {
    try {
        const dbStatus = supabase_1.supabase ? 'connected' : 'disconnected';
        const monitorStatus = walletMonitor.running ? 'running' : 'stopped';
        res.status(200).json({
            status: 'healthy',
            database: dbStatus,
            monitor: monitorStatus
        });
    }
    catch (error) {
        logger.error('Health check error:', error);
        res.status(500).json({
            status: 'unhealthy',
            error: 'Internal server error'
        });
    }
}
// API routes
app.get('/health', healthCheckHandler);
// Manual processing endpoint with API key protection
app.post('/process-unfunded', async (req, res) => {
    try {
        // Simple API key check
        const apiKey = req.headers['x-api-key'];
        if (apiKey !== process.env.API_KEY) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        // Start processing in background
        (0, supabase_1.processUnfundedWallets)(async (walletAddress) => {
            await walletMonitor.processSingleWallet(walletAddress);
        });
        res.json({ status: 'processing', message: 'Processing started in background' });
    }
    catch (error) {
        logger.error(`Failed to start processing: ${error}`);
        res.status(500).json({
            status: 'error',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
// Test username change endpoint (for debugging)
app.post('/test-username-change', async (req, res) => {
    try {
        const userId = req.body.userId;
        const newUsername = req.body.username;
        if (!userId || !newUsername) {
            return res.status(400).json({ error: 'Missing userId or username' });
        }
        logger.debug(`Manually testing username change - userId: ${userId}, newUsername: ${newUsername}`);
        // Get current user data
        const { data: currentUser, error: fetchError } = await supabase_1.supabase
            .from('users')
            .select('id, username, wallet_address')
            .eq('id', userId)
            .limit(1)
            .single();
        if (fetchError) {
            logger.error(`Error fetching user: ${fetchError.message}`);
            return res.status(500).json({ error: fetchError.message });
        }
        if (!currentUser) {
            return res.status(404).json({ error: 'User not found' });
        }
        logger.debug(`Current user data: ${JSON.stringify(currentUser)}`);
        // Update username
        const { data: updatedUser, error: updateError } = await supabase_1.supabase
            .from('users')
            .update({ username: newUsername })
            .eq('id', userId)
            .select()
            .single();
        if (updateError) {
            logger.error(`Error updating username: ${updateError.message}`);
            return res.status(500).json({ error: updateError.message });
        }
        logger.info(`Successfully updated username from "${currentUser.username}" to "${newUsername}" for user ${userId}`);
        res.json({
            success: true,
            previous: currentUser,
            updated: updatedUser
        });
    }
    catch (error) {
        logger.error(`Error in test endpoint: ${error}`);
        res.status(500).json({
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
// API endpoint to manually trigger gas funding for a wallet
app.post('/fund', async (req, res) => {
    try {
        const apiKey = req.headers['x-api-key'];
        if (!process.env.API_KEY) {
            logger.warn('API_KEY not set in environment, disabling API key validation');
            return res.status(401).json({
                status: 'error',
                message: 'Unauthorized - API Key not set'
            });
        }
        if (!apiKey || apiKey !== process.env.API_KEY) {
            return res.status(401).json({
                status: 'error',
                message: 'Unauthorized - Invalid API Key'
            });
        }
        const { address } = req.body;
        if (!address || !ethers_1.ethers.isAddress(address)) {
            return res.status(400).json({
                status: 'error',
                message: 'Invalid or missing wallet address'
            });
        }
        if (!walletMonitor.running) {
            return res.status(503).json({
                status: 'error',
                message: 'Wallet monitor service is not running'
            });
        }
        logger.info(`Manual gas funding requested for address: ${address}`);
        // Process the wallet
        const result = await walletMonitor.processSingleWallet(address);
        if (result) {
            return res.json({
                status: 'success',
                message: 'Gas funding initiated',
                address
            });
        }
        else {
            return res.status(400).json({
                status: 'error',
                message: 'Failed to process gas funding request',
                address
            });
        }
    }
    catch (error) {
        logger.error('Error processing manual gas funding:', error);
        return res.status(500).json({
            status: 'error',
            message: 'Internal server error',
            timestamp: new Date().toISOString()
        });
    }
});
// Add an endpoint to see logs
app.get('/logs', (req, res) => {
    try {
        // Return the last 100 log messages
        res.status(200).json({
            logs: logHistory
        });
    }
    catch (error) {
        logger.error('Error retrieving logs:', error);
        res.status(500).json({ error: 'Failed to retrieve logs' });
    }
});
// Endpoint to manually trigger gas for a specific wallet
app.post('/trigger-gas', authenticateApiKey, async (req, res) => {
    const { walletAddress } = req.body;
    if (!walletAddress || typeof walletAddress !== 'string') {
        return res.status(400).json({ error: 'Invalid wallet address' });
    }
    try {
        logger.info(`Manual gas trigger requested for wallet: ${walletAddress}`);
        const success = await walletMonitor.processSingleWallet(walletAddress);
        if (success) {
            res.status(200).json({ status: 'success', message: 'Gas sent successfully' });
        }
        else {
            res.status(400).json({ status: 'error', message: 'Failed to send gas' });
        }
    }
    catch (error) {
        logger.error('Error processing manual gas trigger:', error);
        res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
});
// Start the service
async function startService() {
    try {
        // Start the wallet monitor
        await walletMonitor.start();
        // Start the Express server
        app.listen(port, () => {
            logger.info(`Gas service started on port ${port}`);
        });
        // Setup graceful shutdown
        process.on('SIGTERM', gracefulShutdown);
        process.on('SIGINT', gracefulShutdown);
        logger.info('Gas service started successfully ✅');
    }
    catch (error) {
        logger.error('Failed to start service:', error);
        process.exit(1);
    }
}
// Graceful shutdown function
async function gracefulShutdown() {
    logger.info('Received shutdown signal, cleaning up...');
    try {
        // Stop the wallet monitor
        await walletMonitor.stop();
        logger.info('Service stopped gracefully');
        process.exit(0);
    }
    catch (error) {
        logger.error('Error during shutdown:', error);
        process.exit(1);
    }
}
// Catch unhandled errors
process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception:', error);
    gracefulShutdown();
});
process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled rejection at:', reason);
    gracefulShutdown();
});
// Start the service
startService();
