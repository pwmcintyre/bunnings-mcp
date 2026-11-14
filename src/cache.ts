/** Tiny TTL cache. The clock is injectable so tests don't sleep. */
export class TtlCache<V> {
  private m = new Map<string, { v: V; exp: number }>();
  constructor(private ttlMs: number, private now: () => number = Date.now) {}
  get(k: string): V | undefined {
    const e = this.m.get(k);
    if (!e) return undefined;
    if (e.exp <= this.now()) { this.m.delete(k); return undefined; }
    return e.v;
  }
  set(k: string, v: V): void { this.m.set(k, { v, exp: this.now() + this.ttlMs }); }
}
