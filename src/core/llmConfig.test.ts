import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getOpenAIConfig,
  getOpenAIConfigForLogging,
  isOpenAIAvailable,
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
});
