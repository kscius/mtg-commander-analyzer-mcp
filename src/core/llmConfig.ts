/**
 * llmConfig.ts
 * 
 * Configuration for LLM (Large Language Model) integration.
 * Loads settings from environment variables with sensible defaults.
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Load .env file from project root
const envPath = path.join(__dirname, '..', '..', '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

/**
 * LLM Configuration interface
 */
export interface LLMConfig {
  /** OpenAI API key */
  apiKey: string | null;
  /** Model to use (default: gpt-4.1) */
  model: string;
  /** Temperature for responses (0.0-2.0) */
  temperature: number;
  /** Max tokens for response */
  maxTokens: number;
  /** Whether LLM is available (API key is set) */
  isAvailable: boolean;
}

/**
 * Get the current LLM configuration
 */
export function getLLMConfig(): LLMConfig {
  const apiKey = process.env.OPENAI_API_KEY || null;
  
  return {
    apiKey,
    model: process.env.OPENAI_MODEL || 'gpt-4.1',
    temperature: parseFloat(process.env.OPENAI_TEMPERATURE || '0.7'),
    maxTokens: parseInt(process.env.OPENAI_MAX_TOKENS || '4096', 10),
    isAvailable: !!apiKey && apiKey !== 'sk-your-api-key-here',
  };
}

/**
 * Check if LLM is available for use
 */
export function isLLMAvailable(): boolean {
  return getLLMConfig().isAvailable;
}

/**
 * Get a safe config object for logging (hides API key)
 */
export function getLLMConfigForLogging(): Omit<LLMConfig, 'apiKey'> & { apiKey: string } {
  const config = getLLMConfig();
  return {
    ...config,
    apiKey: config.apiKey ? `sk-...${config.apiKey.slice(-4)}` : 'not set',
  };
}

