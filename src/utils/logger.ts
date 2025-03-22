import winston from 'winston';

export type Component = 
  | 'WalletMonitor' 
  | 'USDC' 
  | 'Gas' 
  | 'Network' 
  | 'Database' 
  | 'Health' 
  | 'API' 
  | 'Supabase' 
  | 'App' 
  | 'USDCListener' 
  | 'TestScript';

// Emoji mappings for different components
const componentEmojis: Record<string, string> = {
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
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf((info) => {
          const { level, message, timestamp, component, ...rest } = info;
          const emoji = component && typeof component === 'string' ? componentEmojis[component] || '📝' : '📝';
          let logString = `${timestamp} [${level}]`;
          
          if (component) {
            logString += ` [${component}${emoji}]`;
          }
          
          logString += `: ${message}`;
          
          // Add any additional metadata if available
          const metaKeys = Object.keys(rest).filter(key => 
            key !== 'level' && key !== 'message' && key !== 'timestamp' && key !== 'component'
          );
          
          if (metaKeys.length > 0 && !rest.stack) {
            try {
              const metaStr = JSON.stringify(
                metaKeys.reduce((obj, key) => {
                  obj[key] = rest[key];
                  return obj;
                }, {} as Record<string, any>)
              );
              logString += ` ${metaStr}`;
            } catch (e) {
              // Ignore stringify errors
            }
          }
          
          return logString;
        })
      )
    })
  ]
});

// Helper to format any type of error safely for logging
function formatError(err: unknown): Record<string, any> {
  if (err instanceof Error) {
    return { 
      error: {
        message: err.message,
        name: err.name,
        stack: err.stack
      }
    };
  } else if (typeof err === 'object' && err !== null) {
    return { error: err };
  } else if (typeof err === 'string') {
    return { error: { message: err } };
  } else {
    return { error: { toString: String(err) } };
  }
}

export const createComponentLogger = (component: Component) => {
  return {
    debug: (message: string, error?: unknown): void => {
      if (error !== undefined) {
        const formattedError = formatError(error);
        logger.debug(message, { component, ...formattedError });
      } else {
        logger.debug(message, { component });
      }
    },
    info: (message: string, error?: unknown): void => {
      if (error !== undefined) {
        const formattedError = formatError(error);
        logger.info(message, { component, ...formattedError });
      } else {
        logger.info(message, { component });
      }
    },
    warn: (message: string, error?: unknown): void => {
      if (error !== undefined) {
        const formattedError = formatError(error);
        logger.warn(message, { component, ...formattedError });
      } else {
        logger.warn(message, { component });
      }
    },
    error: (message: string, error?: unknown): void => {
      if (error !== undefined) {
        const formattedError = formatError(error);
        logger.error(message, { component, ...formattedError });
      } else {
        logger.error(message, { component });
      }
    }
  };
};

export default logger; 