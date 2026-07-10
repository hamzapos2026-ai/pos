import { describe, expect, it } from 'vitest';
import { runInBatches } from '../src/utils/asyncBatch';

describe('runInBatches', () => {
  it('executes items in small chunks and reports progress', async () => {
    const calls = [];
    const progress = [];

    const result = await runInBatches({
      items: [1, 2, 3, 4],
      batchSize: 2,
      delayMs: 0,
      worker: async (item) => {
        calls.push(item);
        return item * 2;
      },
      onProgress: ({ completed, total }) => progress.push({ completed, total }),
    });

    expect(calls).toEqual([1, 2, 3, 4]);
    expect(result).toEqual({ completed: 4, total: 4 });
    expect(progress).toEqual([
      { completed: 2, total: 4 },
      { completed: 4, total: 4 },
    ]);
  });

  it('handles empty input without errors', async () => {
    const result = await runInBatches({
      items: [],
      batchSize: 5,
      delayMs: 0,
      worker: async () => true,
    });

    expect(result).toEqual({ completed: 0, total: 0 });
  });
});
