import { RateLimitedError, RequestQueue } from '@/market/request-queue';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('RequestQueue', () => {
  it('runs at most maxConcurrent requests at a time', async () => {
    const queue = new RequestQueue({ maxConcurrent: 2, minIntervalMs: 0, cooldownMs: 0 });
    let running = 0;
    let peak = 0;
    const gates = Array.from({ length: 5 }, () => deferred<void>());
    const results = gates.map((gate, index) =>
      queue.run(async () => {
        running++;
        peak = Math.max(peak, running);
        await gate.promise;
        running--;
        return index;
      })
    );
    await flush();
    expect(running).toBe(2);
    expect(queue.pending).toBe(3);
    for (const gate of gates) {
      gate.resolve();
      await flush();
    }
    expect(await Promise.all(results)).toEqual([0, 1, 2, 3, 4]);
    expect(peak).toBe(2);
  });

  it('fails new requests right away while cooling down after a rate limit', async () => {
    let now = 1000;
    const queue = new RequestQueue({
      maxConcurrent: 1,
      minIntervalMs: 0,
      cooldownMs: 30_000,
      now: () => now,
    });
    queue.markRateLimited();
    await expect(queue.run(async () => 'ok')).rejects.toBeInstanceOf(RateLimitedError);
    now += 30_001;
    await expect(queue.run(async () => 'ok')).resolves.toBe('ok');
  });

  it('spaces request starts apart', async () => {
    const waits: number[] = [];
    const queue = new RequestQueue({
      maxConcurrent: 3,
      minIntervalMs: 100,
      cooldownMs: 0,
      now: () => 0,
      wait: async (ms) => {
        waits.push(ms);
      },
    });
    await Promise.all([1, 2, 3].map(() => queue.run(async () => null)));
    expect(waits).toEqual([100, 200]);
  });

  it('frees the slot when a request fails', async () => {
    const queue = new RequestQueue({ maxConcurrent: 1, minIntervalMs: 0, cooldownMs: 0 });
    await expect(queue.run(async () => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    await expect(queue.run(async () => 'next')).resolves.toBe('next');
  });
});
