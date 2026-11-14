import type { Store } from "./parse.ts";
import { findStores } from "./stores.ts";

/** The site's own default store (Mentone). Used only when nothing is configured. */
export const SITE_DEFAULT_STORE_ID = "6400";

/** Per-process default store plus an ordered preferred list. In memory only. */
export class Session {
  private current: Store;
  private preferred: Store[];
  /** `initial` is one store id or a comma-separated, ordered list of ids; the first is the default. */
  constructor(private stores: Store[], initial = process.env.BUNNINGS_STORE_ID) {
    const ids = (initial ?? "").split(",").map((x) => x.trim()).filter(Boolean);
    if (!ids.length) ids.push(SITE_DEFAULT_STORE_ID);
    this.preferred = ids.map((id) => {
      const s = stores.find((x) => x.id === id);
      if (!s) throw new Error(`No store matches id "${id}" in BUNNINGS_STORE_ID. Use store ids from find_stores.`);
      return s;
    });
    this.current = this.preferred[0];
  }
  get(): Store { return this.current; }
  /** The preferred stores in priority order. set() does not change it. */
  list(): Store[] { return this.preferred; }
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
