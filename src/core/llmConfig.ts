/**
 * OpenAI configuration for in-process deck build enhancement (not a second host LLM).
 * Loads from repo-root .env via dotenv.
 */

import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import OpenAI from 'openai';

const PLACEHOLDER_KEYS = new Set(['sk-your-api-key-here', '']);

const envPath = path.join(__dirname, '..', '..', '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath, quiet: true });
}

export type OpenAIModelRole = 'default' | 'fast' | 'premium' | 'agent';

export interface OpenAIConfig {
  apiKey: string | null;
  baseURL: string | null;
  model: string;
  modelFast: string;
  modelPremium: string;
  modelAgent: string;
  temperature: number;
  maxTokens: number;
  isAvailable: boolean;
}

function readModel(role: OpenAIModelRole, config: Omit<OpenAIConfig, 'isAvailable'>): string {
  switch (role) {
    case 'fast':
      return config.modelFast;
    case 'premium':
      return config.modelPremium;
    case 'agent':
      return config.modelAgent;
    default:
      return config.model;
  }
}

/**
 * Load OpenAI settings from environment (with defaults aligned to current API catalog).
 */
export function getOpenAIConfig(): OpenAIConfig {
  const rawKey = process.env.OPENAI_API_KEY?.trim() ?? '';
  const apiKey = PLACEHOLDER_KEYS.has(rawKey) ? null : rawKey || null;
  const rawBase = process.env.OPENAI_BASE_URL?.trim();
  const baseURL = rawBase && rawBase.length > 0 ? rawBase : null;

  const base: Omit<OpenAIConfig, 'isAvailable'> = {
    apiKey,
    baseURL,
    model: process.env.OPENAI_MODEL?.trim() || 'gpt-5.4',
    modelFast: process.env.OPENAI_MODEL_FAST?.trim() || 'gpt-5.4-nano',
    modelPremium: process.env.OPENAI_MODEL_PREMIUM?.trim() || 'gpt-5.5',
    modelAgent: process.env.OPENAI_MODEL_AGENT?.trim() || 'gpt-5.4-mini',
    temperature: parseFloat(process.env.OPENAI_TEMPERATURE || '0.7'),
    maxTokens: parseInt(process.env.OPENAI_MAX_TOKENS || '4096', 10),
  };

  return {
    ...base,
    isAvailable: !!apiKey,
  };
}

export function isOpenAIAvailable(): boolean {
  return getOpenAIConfig().isAvailable;
}

/** @deprecated Use isOpenAIAvailable — alias for legacy call sites */
export const isLLMAvailable = isOpenAIAvailable;

export function getOpenAIConfigForLogging(): Omit<OpenAIConfig, 'apiKey'> & { apiKey: string } {
  const config = getOpenAIConfig();
  return {
    ...config,
    apiKey: config.apiKey ? `sk-...${config.apiKey.slice(-4)}` : 'not set',
  };
}

export function createOpenAIClient(config: OpenAIConfig = getOpenAIConfig()): OpenAI {
  if (!config.apiKey) {
    throw new Error('OPENAI_API_KEY is not configured');
  }
  return new OpenAI({
    apiKey: config.apiKey,
    ...(config.baseURL ? { baseURL: config.baseURL } : {}),
  });
}

export function resolveModelForRole(
  role: OpenAIModelRole = 'default',
  config: OpenAIConfig = getOpenAIConfig()
): string {
  return readModel(role, config);
}

/** GPT-5 / reasoning models reject `max_tokens`; use `max_completion_tokens` instead. */
export function modelRequiresMaxCompletionTokens(model: string): boolean {
  const m = model.toLowerCase();
  return m.startsWith('gpt-5') || /^o\d/.test(m);
}

/**
 * Token limit field for chat.completions.create — model-dependent per OpenAI API.
 */
export function buildChatCompletionTokenLimit(
  model: string,
  maxTokens: number
): { max_tokens: number } | { max_completion_tokens: number } {
  if (modelRequiresMaxCompletionTokens(model)) {
    return { max_completion_tokens: maxTokens };
  }
  return { max_tokens: maxTokens };
}
