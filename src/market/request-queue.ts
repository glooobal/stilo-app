/**
 * One queue for every request to the market data provider, shared by all
 * screens: with many positions and portfolios the app would otherwise fire
 * dozens of requests at once and get rate limited (HTTP 429).
 *
 * - at most `maxConcurrent` requests run at a time, the rest wait in order;
 * - consecutive requests start at least `minIntervalMs` apart;
 * - after a 429 the queue pauses for `cooldownMs` and new requests fail
 *   right away (screens then use stored prices), instead of making it worse.
 */
export class RateLimitedError extends Error {
  constructor() {
    super('Zbyt wiele zapytań. Spróbuj ponownie za chwilę.');
  }
}

type QueueOptions = {
  maxConcurrent: number;
  minIntervalMs: number;
  cooldownMs: number;
  now?: () => number;
  wait?: (ms: number) => Promise<void>;
};

type Waiter = { start: () => void; reject: (reason: unknown) => void; signal?: AbortSignal };

function abortError(): Error {
  const error = new Error('Aborted');
  error.name = 'AbortError';
  return error;
}

export class RequestQueue {
  private running = 0;
  private lastStart = Number.NEGATIVE_INFINITY;
  private cooldownUntil = 0;
  private readonly waiting: Waiter[] = [];
  private readonly options: Required<QueueOptions>;

  constructor(options: QueueOptions) {
    this.options = {
      now: () => Date.now(),
      wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      ...options,
    };
  }

  /** Number of requests waiting for a free slot (for tests). */
  get pending(): number {
    return this.waiting.length;
  }

  get isCoolingDown(): boolean {
    return this.options.now() < this.cooldownUntil;
  }

  /** Call when the provider answered 429: pauses new requests for a while. */
  markRateLimited() {
    this.cooldownUntil = this.options.now() + this.options.cooldownMs;
  }

  async run<T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) throw abortError();
    if (this.isCoolingDown) throw new RateLimitedError();
    await this.acquire(signal);
    try {
      if (this.isCoolingDown) throw new RateLimitedError();
      return await task();
    } finally {
      this.release();
    }
  }

  private acquire(signal?: AbortSignal): Promise<void> {
    if (this.running < this.options.maxConcurrent && this.waiting.length === 0) {
      this.running++;
      return this.spaceOut();
    }
    return new Promise<void>((resolve, reject) => {
      const waiter: Waiter = {
        signal,
        reject,
        start: () => {
          signal?.removeEventListener('abort', onAbort);
          this.spaceOut().then(resolve, reject);
        },
      };
      const onAbort = () => {
        const index = this.waiting.indexOf(waiter);
        if (index >= 0) this.waiting.splice(index, 1);
        reject(abortError());
      };
      signal?.addEventListener('abort', onAbort, { once: true });
      this.waiting.push(waiter);
    });
  }

  /** Keeps request starts at least `minIntervalMs` apart. */
  private async spaceOut() {
    const now = this.options.now();
    const startAt = Math.max(now, this.lastStart + this.options.minIntervalMs);
    this.lastStart = startAt;
    if (startAt > now) await this.options.wait(startAt - now);
  }

  private release() {
    const next = this.waiting.shift();
    if (next) {
      // The slot passes straight to the next request.
      next.start();
    } else {
      this.running--;
    }
  }
}
