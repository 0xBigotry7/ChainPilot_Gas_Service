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
const logger = (0, logger_1.createComponentLogger)('TestScript');
async function testWhitelistStatus() {
    logger.info('Testing gas service whitelist status 🧪');
    // Check whitelist configuration
    const whitelistEnabled = process.env.WHITELIST_ENABLED === 'true';
    const whitelistedAddresses = new Set((process.env.WHITELISTED_ADDRESSES || '')
        .split(',')
        .map(addr => addr.trim().toLowerCase())
        .filter(addr => addr.length > 0));
    logger.info(`Whitelist status: ${whitelistEnabled ? 'ENABLED ✅' : 'DISABLED ❌'}`);
    if (whitelistEnabled) {
        logger.info(`Whitelisted addresses (${whitelistedAddresses.size}):`);
        Array.from(whitelistedAddresses).forEach(addr => {
            logger.info(`  - ${addr}`);
        });
    }
    else {
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
