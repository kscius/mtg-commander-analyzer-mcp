import { afterEach, describe, expect, it, vi } from 'vitest';
import { pickCardNamesFromCandidates } from './llmCategoryEnhancer';

const mockCreate = vi.fn();

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
    resolveModelForRole: () => 'gpt-5.4-nano',
  };
});

describe('pickCardNamesFromCandidates', () => {
  afterEach(() => {
    mockCreate.mockReset();
  });

  it('returns only names present in the candidate list', async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(['Sol Ring', 'Fake Card']) } }],
    });

    const picked = await pickCardNamesFromCandidates({
      categoryName: 'ramp',
      commanderName: 'Atraxa, Praetors Voice',
      colorIdentity: ['W', 'U', 'B', 'G'],
      candidateNames: ['Sol Ring', 'Arcane Signet'],
      count: 2,
      modelRole: 'fast',
    });

    expect(picked).toEqual(['Sol Ring']);
    expect(mockCreate).toHaveBeenCalledOnce();
    expect(mockCreate.mock.calls[0][0]).toMatchObject({
      model: 'gpt-5.4-nano',
      max_completion_tokens: 400,
    });
    expect(mockCreate.mock.calls[0][0]).not.toHaveProperty('max_tokens');
  });

  it('returns empty when OpenAI returns invalid JSON shape', async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: '{"oops": true}' } }],
    });

    const picked = await pickCardNamesFromCandidates({
      categoryName: 'card_draw',
      commanderName: 'Test Commander',
      colorIdentity: ['U'],
      candidateNames: ['Rhystic Study'],
      count: 1,
    });

    expect(picked).toEqual([]);
  });
});
