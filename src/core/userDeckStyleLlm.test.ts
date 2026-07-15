import { afterEach, describe, expect, it, vi } from 'vitest';

const mockCreate = vi.fn();
const mockGetUserDeckStyleProfile = vi.fn();
const mockLogOpenAI = vi.fn();

vi.mock('./llmConfig', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./llmConfig')>();
  return {
    ...actual,
    isOpenAIAvailable: () => true,
    getOpenAIConfig: () => ({
      apiKey: 'sk-test',
      baseURL: null,
      model: 'gpt-5.4',
      modelFast: 'gpt-5.4-nano',
      modelPremium: 'gpt-5.5',
      modelAgent: 'gpt-5.4-mini',
      temperature: 0.7,
      maxTokens: 4096,
      isAvailable: true,
    }),
    createOpenAIClient: () => ({
      chat: {
        completions: {
          create: mockCreate,
        },
      },
    }),
    resolveModelForRole: () => 'gpt-5.4',
  };
});

vi.mock('./userDeckLibrary', () => ({
  getUserDeckStyleProfile: () => mockGetUserDeckStyleProfile(),
  getCommanderStyleHints: () => null,
}));

vi.mock('./mcpStderrLog', () => ({
  logOpenAI: (...args: unknown[]) => mockLogOpenAI(...args),
}));

import { analyzeUserDeckPreferencesWithOpenAI } from './userDeckStyleLlm';

describe('analyzeUserDeckPreferencesWithOpenAI', () => {
  afterEach(() => {
    mockCreate.mockReset();
    mockGetUserDeckStyleProfile.mockReset();
    mockLogOpenAI.mockReset();
  });

  it('redacts OpenAI API errors from the MCP-facing result', async () => {
    mockGetUserDeckStyleProfile.mockReturnValue({
      deckCount: 2,
      landCount: { avg: 36, min: 35, max: 37 },
      tappedLandCount: { avg: 8 },
      landMixAverages: {},
      categoryAverages: {},
      topLandStaples: [],
      topNonLandStaples: [],
      decks: [{ name: 'Deck A' }, { name: 'Deck B' }],
    });
    mockCreate.mockRejectedValue(
      new Error('401 Incorrect API key provided: sk-secret-leak-xyz')
    );

    const result = await analyzeUserDeckPreferencesWithOpenAI({});

    expect(result.openAiUsed).toBe(true);
    expect(result.summary).toBe('OpenAI style analysis failed.');
    expect(result.error).toBe('openai_request_failed');
    expect(JSON.stringify(result)).not.toContain('sk-secret-leak-xyz');
    expect(mockLogOpenAI).toHaveBeenCalledWith(
      expect.stringContaining('sk-secret-leak-xyz')
    );
  });
});
