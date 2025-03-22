import { createComponentLogger } from './logger';

// Just use a string for the logger component since we don't need strict typing here
const logger = createComponentLogger('App');

/**
 * Get a private key from environment variables, handling various formats
 * @param envName The environment variable name
 * @returns The normalized private key
 */
export function getPrivateKey(envName: string): string {
  const value = process.env[envName];
  
  if (!value) {
    logger.error(`Environment variable ${envName} is not set`);
    throw new Error(`${envName} not set`);
  }
  
  let privateKey = value.trim();
  
  // If it's already in the right format with 0x prefix, return it
  if (privateKey.startsWith('0x') && privateKey.length === 66) {
    return privateKey;
  }
  
  // If it has single quotes around it, remove them
  if (privateKey.startsWith("'") && privateKey.endsWith("'")) {
    privateKey = privateKey.substring(1, privateKey.length - 1);
  }
  
  // If it has double quotes around it, remove them
  if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
    privateKey = privateKey.substring(1, privateKey.length - 1);
  }
  
  // If it doesn't have the 0x prefix but is the right length, add it
  if (!privateKey.startsWith('0x') && privateKey.length === 64) {
    privateKey = `0x${privateKey}`;
  }
  
  // Final validation
  if (!privateKey.match(/^0x[0-9a-fA-F]{64}$/)) {
    logger.error(`Invalid private key format for ${envName}`);
    throw new Error(`Invalid private key format for ${envName}`);
  }
  
  return privateKey;
}

/**
 * Get a required environment variable
 * @param name The environment variable name
 * @returns The environment variable value
 */
export function getRequiredEnv(name: string): string {
  const value = process.env[name];
  
  if (!value) {
    logger.error(`Environment variable ${name} is not set`);
    throw new Error(`${name} not set`);
  }
  
  return value;
} 