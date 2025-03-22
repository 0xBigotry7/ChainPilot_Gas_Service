"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createComponentLogger = void 0;
const winston_1 = __importDefault(require("winston"));
// Emoji mappings for different components
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
// Create logger
const logger = winston_1.default.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston_1.default.format.combine(winston_1.default.format.timestamp(), winston_1.default.format.json()),
    transports: [
        new winston_1.default.transports.Console({
            format: winston_1.default.format.combine(winston_1.default.format.colorize(), winston_1.default.format.printf((info) => {
                const { level, message, timestamp, component, ...rest } = info;
                const emoji = component && typeof component === 'string' ? componentEmojis[component] || '📝' : '📝';
                let logString = `${timestamp} [${level}]`;
                if (component) {
                    logString += ` [${component}${emoji}]`;
                }
                logString += `: ${message}`;
                // Add any additional metadata if available
                const metaKeys = Object.keys(rest).filter(key => key !== 'level' && key !== 'message' && key !== 'timestamp' && key !== 'component');
                if (metaKeys.length > 0 && !rest.stack) {
                    try {
                        const metaStr = JSON.stringify(metaKeys.reduce((obj, key) => {
                            obj[key] = rest[key];
                            return obj;
                        }, {}));
                        logString += ` ${metaStr}`;
                    }
                    catch (e) {
                        // Ignore stringify errors
                    }
                }
                return logString;
            }))
        })
    ]
});
// Helper to format any type of error safely for logging
function formatError(err) {
    if (err instanceof Error) {
        return {
            error: {
                message: err.message,
                name: err.name,
                stack: err.stack
            }
        };
    }
    else if (typeof err === 'object' && err !== null) {
        return { error: err };
    }
    else if (typeof err === 'string') {
        return { error: { message: err } };
    }
    else {
        return { error: { toString: String(err) } };
    }
}
const createComponentLogger = (component) => {
    return {
        debug: (message, error) => {
            if (error !== undefined) {
                const formattedError = formatError(error);
                logger.debug(message, { component, ...formattedError });
            }
            else {
                logger.debug(message, { component });
            }
        },
        info: (message, error) => {
            if (error !== undefined) {
                const formattedError = formatError(error);
                logger.info(message, { component, ...formattedError });
            }
            else {
                logger.info(message, { component });
            }
        },
        warn: (message, error) => {
            if (error !== undefined) {
                const formattedError = formatError(error);
                logger.warn(message, { component, ...formattedError });
            }
            else {
                logger.warn(message, { component });
            }
        },
        error: (message, error) => {
            if (error !== undefined) {
                const formattedError = formatError(error);
                logger.error(message, { component, ...formattedError });
            }
            else {
                logger.error(message, { component });
            }
        }
    };
};
exports.createComponentLogger = createComponentLogger;
exports.default = logger;
