import type { Store } from "./parse.ts";
import { findStores } from "./stores.ts";

/** The site's own default store (Mentone). Used only when nothing is configured. */
export const SITE_DEFAULT_STORE_ID = "6400";

/** Per-process default store. In memory only. */
export class Session {
  private current: Store;
  constructor(private stores: Store[], initial = process.env.BUNNINGS_STORE_ID) {
    this.current = this.resolve(initial || SITE_DEFAULT_STORE_ID);
  }
  get(): Store { return this.current; }
  set(query: string): Store { return (this.current = this.resolve(query)); }
  /** Resolve an id, or a name/suburb/postcode that matches exactly one store (or one exact name). */
  resolve(query: string): Store {
    const q = query.trim();
    const byId = this.stores.find((s) => s.id === q);
    if (byId) return byId;
    const hits = findStores(this.stores, { query: q, limit: 6 });
    const exact = hits.filter((s) => s.name.toLowerCase() === q.toLowerCase() || s.suburb.toLowerCase() === q.toLowerCase());
    const pick = hits.length === 1 ? hits : exact.length === 1 ? exact : [];
    if (pick.length) return pick[0];
    if (!hits.length) throw new Error(`No store matches "${q}". Try find_stores with a suburb or postcode.`);
    throw new Error(`"${q}" matches several stores: ${hits.map((s) => `${s.name} (${s.id}, ${s.state} ${s.postcode})`).join("; ")}. Use a store id.`);
  }
}
