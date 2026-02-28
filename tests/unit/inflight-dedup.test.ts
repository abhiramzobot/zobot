import { deduplicatedExecute, getInflightCount } from '../../src/tools/inflight-dedup';

describe('In-Flight Request Deduplication', () => {
  it('should execute the function and return the result', async () => {
    const result = await deduplicatedExecute('key-1', async () => ({
      success: true,
      data: { value: 42 },
    }));

    expect(result).toEqual({ success: true, data: { value: 42 } });
  });

  it('should deduplicate concurrent identical calls', async () => {
    let callCount = 0;
    const execute = () =>
      new Promise<{ success: boolean; data: { count: number } }>((resolve) => {
        callCount++;
        setTimeout(() => resolve({ success: true, data: { count: callCount } }), 50);
      });

    // Launch two concurrent calls with the same key
    const [result1, result2] = await Promise.all([
      deduplicatedExecute('dedup-key', execute),
      deduplicatedExecute('dedup-key', execute),
    ]);

    // Only one execution should have happened
    expect(callCount).toBe(1);
    // Both should get the same result
    expect(result1).toEqual(result2);
    expect(result1.success).toBe(true);
  });

  it('should not deduplicate calls with different keys', async () => {
    let callCount = 0;
    const execute = () =>
      new Promise<{ success: boolean }>((resolve) => {
        callCount++;
        setTimeout(() => resolve({ success: true }), 50);
      });

    await Promise.all([
      deduplicatedExecute('key-a', execute),
      deduplicatedExecute('key-b', execute),
    ]);

    expect(callCount).toBe(2);
  });

  it('should clean up inflight map after completion', async () => {
    await deduplicatedExecute('cleanup-key', async () => ({ success: true }));
    expect(getInflightCount()).toBe(0);
  });

  it('should clean up inflight map even on failure', async () => {
    try {
      await deduplicatedExecute('fail-key', async () => {
        throw new Error('Execution failed');
      });
    } catch {
      // Expected
    }
    expect(getInflightCount()).toBe(0);
  });

  it('should allow new execution after previous one completes', async () => {
    let callCount = 0;
    const execute = async () => {
      callCount++;
      return { success: true, data: { count: callCount } };
    };

    const result1 = await deduplicatedExecute('reuse-key', execute);
    const result2 = await deduplicatedExecute('reuse-key', execute);

    // Sequential calls should both execute (no dedup since first completed before second started)
    expect(callCount).toBe(2);
    expect(result1.data).toEqual({ count: 1 });
    expect(result2.data).toEqual({ count: 2 });
  });

  it('should clean up after concurrent execution completes', async () => {
    const execute = () =>
      new Promise<{ success: boolean }>((resolve) => {
        setTimeout(() => resolve({ success: true }), 50);
      });

    // Start multiple concurrent calls
    const promises = [
      deduplicatedExecute('count-key', execute),
      deduplicatedExecute('count-key', execute),
    ];
    await Promise.all(promises);
    expect(getInflightCount()).toBe(0);
  });
});
