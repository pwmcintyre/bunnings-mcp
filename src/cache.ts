/** Tiny TTL cache. The clock is injectable so tests don't sleep. */
export class TtlCache<V> {
  private m = new Map<string, { v: V; exp: number }>();
  constructor(private ttlMs: number, private now: () => number = Date.now, private maxEntries = 500) {}
  get(k: string): V | undefined {
    const e = this.m.get(k);
    if (!e) return undefined;
    if (e.exp <= this.now()) { this.m.delete(k); return undefined; }
    return e.v;
  }
  set(k: string, v: V): void {
    const now = this.now();
    for (const [key, entry] of this.m) if (entry.exp <= now) this.m.delete(key);
    this.m.delete(k);
    while (this.m.size >= Math.max(1, this.maxEntries)) this.m.delete(this.m.keys().next().value!);
    this.m.set(k, { v, exp: now + this.ttlMs });
  }
}
