import { describe, it, expect } from 'vitest';
import { runGetStrategyGuide } from './getStrategyGuideTool';

describe('getStrategyGuideTool security', () => {
  it('rejects path traversal in preferredStrategy before filesystem read', async () => {
    await expect(
      runGetStrategyGuide({
        commanderName: 'Atraxa, Praetors Voice',
        preferredStrategy: '../../../.env',
      })
    ).rejects.toThrow(/Invalid preferredStrategy/);
  });

  it('serves a valid strategy slug without error', async () => {
    const result = await runGetStrategyGuide({
      commanderName: 'Atraxa, Praetors Voice',
      preferredStrategy: 'tokens',
      summaryOnly: true,
    });
    expect(result.preferredStrategy).toBe('tokens');
    expect(result.summary.length).toBeGreaterThan(0);
  });
});
