import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildChatCompletionTokenLimit,
  clampOpenAIMaxTokens,
  clampOpenAITemperature,
  getOpenAIConfig,
  getOpenAIConfigForLogging,
  isOpenAIAvailable,
  modelRequiresMaxCompletionTokens,
  OPENAI_MAX_TOKENS_DEFAULT,
  OPENAI_MAX_TOKENS_MAX,
  parseOpenAIBaseURL,
  resolveModelForRole,
} from './llmConfig';

describe('llmConfig', () => {
  const env = { ...process.env };

  afterEach(() => {
    process.env = { ...env };
    vi.unstubAllEnvs();
  });

  it('reports unavailable when OPENAI_API_KEY is missing', () => {
    delete process.env.OPENAI_API_KEY;
    const config = getOpenAIConfig();
    expect(config.isAvailable).toBe(false);
    expect(isOpenAIAvailable()).toBe(false);
  });

  it('rejects placeholder API key', () => {
    process.env.OPENAI_API_KEY = 'sk-your-api-key-here';
    expect(getOpenAIConfig().isAvailable).toBe(false);
  });

  it('uses model env vars with GPT-5.4 defaults', () => {
    process.env.OPENAI_API_KEY = 'sk-test-key-1234567890';
    delete process.env.OPENAI_MODEL;
    delete process.env.OPENAI_MODEL_FAST;
    const config = getOpenAIConfig();
    expect(config.isAvailable).toBe(true);
    expect(config.model).toBe('gpt-5.4');
    expect(config.modelFast).toBe('gpt-5.4-nano');
    expect(resolveModelForRole('fast', config)).toBe('gpt-5.4-nano');
  });

  it('masks API key in logging config', () => {
    process.env.OPENAI_API_KEY = 'sk-test-key-1234567890';
    const logged = getOpenAIConfigForLogging();
    expect(logged.apiKey).toMatch(/^sk-\.\.\./);
    expect(logged.apiKey).not.toContain('1234567890');
  });

  it('uses max_completion_tokens for GPT-5 and o-series models', () => {
    expect(modelRequiresMaxCompletionTokens('gpt-5.4-nano')).toBe(true);
    expect(modelRequiresMaxCompletionTokens('o3-mini')).toBe(true);
    expect(modelRequiresMaxCompletionTokens('gpt-4o')).toBe(false);
    expect(buildChatCompletionTokenLimit('gpt-5.4-nano', 400)).toEqual({
      max_completion_tokens: 400,
    });
    expect(buildChatCompletionTokenLimit('gpt-4o', 400)).toEqual({ max_tokens: 400 });
  });

  it('accepts http(s) OPENAI_BASE_URL and rejects other schemes', () => {
    expect(parseOpenAIBaseURL('https://api.openai.com/v1')).toBe(
      'https://api.openai.com/v1'
    );
    expect(parseOpenAIBaseURL('http://localhost:8080/v1')).toBe(
      'http://localhost:8080/v1'
    );
    expect(parseOpenAIBaseURL('file:///etc/passwd')).toBeNull();
    expect(parseOpenAIBaseURL('ftp://evil.example/v1')).toBeNull();
    expect(parseOpenAIBaseURL('not a url')).toBeNull();
    expect(parseOpenAIBaseURL('')).toBeNull();
    expect(parseOpenAIBaseURL(undefined)).toBeNull();
  });

  it('ignores invalid OPENAI_BASE_URL from env', () => {
    process.env.OPENAI_API_KEY = 'sk-test-key-1234567890';
    process.env.OPENAI_BASE_URL = 'file:///tmp/secrets';
    expect(getOpenAIConfig().baseURL).toBeNull();
  });

  it('clamps temperature and maxTokens from env', () => {
    process.env.OPENAI_API_KEY = 'sk-test-key-1234567890';
    process.env.OPENAI_TEMPERATURE = '99';
    process.env.OPENAI_MAX_TOKENS = '999999';
    const config = getOpenAIConfig();
    expect(config.temperature).toBe(2);
    expect(config.maxTokens).toBe(OPENAI_MAX_TOKENS_MAX);

    process.env.OPENAI_TEMPERATURE = 'not-a-number';
    process.env.OPENAI_MAX_TOKENS = 'abc';
    const fallback = getOpenAIConfig();
    expect(fallback.temperature).toBe(0.7);
    expect(fallback.maxTokens).toBe(OPENAI_MAX_TOKENS_DEFAULT);
  });

  it('clamp helpers bound numeric ranges', () => {
    expect(clampOpenAITemperature(-1)).toBe(0);
    expect(clampOpenAITemperature(1.5)).toBe(1.5);
    expect(clampOpenAIMaxTokens(0)).toBe(1);
    expect(clampOpenAIMaxTokens(100.9)).toBe(100);
  });
});
