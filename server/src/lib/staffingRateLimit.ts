type Key = string

type WindowBucket = {
  ts: number[]
}

function nowMs(): number {
  return Date.now()
}

function prune(bucket: WindowBucket, cutoff: number) {
  while (bucket.ts.length > 0 && bucket.ts[0]! < cutoff) bucket.ts.shift()
}

/**
 * Minimal in-memory rate limiter (best-effort).
 * In serverless/multi-instance deploys this is not globally consistent, but is still useful as a first-line throttle.
 */
export class InMemoryRateLimiter {
  private buckets = new Map<Key, WindowBucket>()

  constructor(
    private readonly windowMs: number,
    private readonly maxHits: number,
  ) {}

  hit(key: Key): { allowed: boolean; remaining: number; retryAfterSeconds: number } {
    const t = nowMs()
    const cutoff = t - this.windowMs
    const b = this.buckets.get(key) ?? { ts: [] }
    prune(b, cutoff)

    if (b.ts.length >= this.maxHits) {
      const oldest = b.ts[0] ?? t
      const retryAfterMs = Math.max(0, oldest + this.windowMs - t)
      return { allowed: false, remaining: 0, retryAfterSeconds: Math.ceil(retryAfterMs / 1000) }
    }

    b.ts.push(t)
    this.buckets.set(key, b)
    return { allowed: true, remaining: Math.max(0, this.maxHits - b.ts.length), retryAfterSeconds: 0 }
  }
}

