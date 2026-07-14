/**
 * OpenAI configuration for in-process deck build enhancement (not a second host LLM).
 * Loads from repo-root .env via dotenv.
 */

import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import OpenAI from 'openai';

const PLACEHOLDER_KEYS = new Set(['sk-your-api-key-here', '']);

/** Allowed OpenAI-compatible base URL schemes (blocks file:/data: SSRF via env). */
const ALLOWED_BASE_URL_PROTOCOLS = new Set(['http:', 'https:']);

/** Clamp bounds for OPENAI_TEMPERATURE (OpenAI API range). */
export const OPENAI_TEMPERATURE_MIN = 0;
export const OPENAI_TEMPERATURE_MAX = 2;

/** Clamp bounds for OPENAI_MAX_TOKENS (DoS / runaway cost guard). */
export const OPENAI_MAX_TOKENS_MIN = 1;
export const OPENAI_MAX_TOKENS_MAX = 16_384;
export const OPENAI_MAX_TOKENS_DEFAULT = 4096;

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
 * Parse and validate OPENAI_BASE_URL.
 * Returns null when unset/invalid so a compromised env cannot point the client at file: or other schemes.
 */
export function parseOpenAIBaseURL(raw: string | undefined | null): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (!ALLOWED_BASE_URL_PROTOCOLS.has(url.protocol)) {
    return null;
  }
  return trimmed;
}

/** Clamp temperature to the OpenAI-supported range; fall back to default on NaN. */
export function clampOpenAITemperature(value: number, fallback = 0.7): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(OPENAI_TEMPERATURE_MAX, Math.max(OPENAI_TEMPERATURE_MIN, value));
}

/** Clamp max tokens to a safe range; fall back to default on NaN. */
export function clampOpenAIMaxTokens(
  value: number,
  fallback = OPENAI_MAX_TOKENS_DEFAULT
): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(
    OPENAI_MAX_TOKENS_MAX,
    Math.max(OPENAI_MAX_TOKENS_MIN, Math.trunc(value))
  );
}

/**
 * Load OpenAI settings from environment (with defaults aligned to current API catalog).
 */
export function getOpenAIConfig(): OpenAIConfig {
  const rawKey = process.env.OPENAI_API_KEY?.trim() ?? '';
  const apiKey = PLACEHOLDER_KEYS.has(rawKey) ? null : rawKey || null;
  const baseURL = parseOpenAIBaseURL(process.env.OPENAI_BASE_URL);

  const base: Omit<OpenAIConfig, 'isAvailable'> = {
    apiKey,
    baseURL,
    model: process.env.OPENAI_MODEL?.trim() || 'gpt-5.4',
    modelFast: process.env.OPENAI_MODEL_FAST?.trim() || 'gpt-5.4-nano',
    modelPremium: process.env.OPENAI_MODEL_PREMIUM?.trim() || 'gpt-5.5',
    modelAgent: process.env.OPENAI_MODEL_AGENT?.trim() || 'gpt-5.4-mini',
    temperature: clampOpenAITemperature(
      parseFloat(process.env.OPENAI_TEMPERATURE || '0.7')
    ),
    maxTokens: clampOpenAIMaxTokens(
      parseInt(process.env.OPENAI_MAX_TOKENS || String(OPENAI_MAX_TOKENS_DEFAULT), 10)
    ),
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
