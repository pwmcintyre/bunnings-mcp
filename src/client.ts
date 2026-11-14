// The one module that knows how bunnings.com.au works: URLs, cookies, politeness, page shapes.
// Small interface out (search, getProduct, checkStock, stores); everything fragile stays in here and parse.ts.
import { TtlCache } from "./cache.ts";
import { ORIGIN, extractNextData, parseProduct, parseSearch, type Product, type Search, type Store, type Stock } from "./parse.ts";
import type { Session } from "./session.ts";
import { findStores, type FindOptions, type StoreMatch } from "./stores.ts";

const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

export class HttpError extends Error {
  constructor(public status: number, url: string) { super(`HTTP ${status} from ${url}`); this.name = "HttpError"; }
}
/** Cloudflare (or the site) pushed back. Never retried: stop and tell the user. */
export class BlockedError extends HttpError {
  constructor(status: number, url: string) {
    super(status, url);
    this.name = "BlockedError";
    this.message += ". The site is blocking automated requests right now; wait a while before trying again.";
  }
}

export interface ClientOptions {
  stores: Store[];
  session: Session;
  fetch?: typeof fetch;
  delayMs?: number;
  ttlMs?: number;
  timeoutMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export interface ProductRef { itemNumber: string; path: string }

export function parseProductRef(input: string): ProductRef {
  const s = input.trim();
  if (/^\d{5,9}$/.test(s)) return { itemNumber: s, path: `/_p${s}` };
  const href = s.startsWith("/") ? ORIGIN + s : /^https?:\/\//.test(s) ? s : `https://${s}`;
  let u: URL;
  try { u = new URL(href); } catch { throw new Error(`Not a Bunnings product URL or item number: "${input}"`); }
  const m = u.pathname.match(/_p(\d{5,9})$/);
  if (!/(^|\.)bunnings\.com\.au$/.test(u.hostname) || !m) throw new Error(`Not a Bunnings product URL or item number: "${input}"`);
  return { itemNumber: m[1], path: u.pathname };
}

export interface StockRow {
  itemNumber: string;
  name: string | null;
  price: number | null;
  stock: Stock;
  aisle: string | null;
  bay: string | null;
  note?: string;
  /** Every preferred store in priority order. Present only when check_stock fans out. */
  stores?: { store: string; storeId: string; status: Stock["status"]; quantity: number | null; aisle: string | null; bay: string | null; note?: string }[];
  /** First preferred store that has stock, when fanning out. */
  firstInStock?: { store: string; storeId: string } | null;
}

const aisleOf = (s: Stock) => ({ aisle: s.locations[0]?.aisle ?? null, bay: s.locations[0]?.bay ?? null });

export class Bunnings {
  private f: typeof fetch;
  private cache: TtlCache<{ nd: any; url: string }>;
  private delayMs: number;
  private now: () => number;
  private sleep: (ms: number) => Promise<void>;
  private last = -Infinity;
  private chain: Promise<unknown> = Promise.resolve();

  constructor(private o: ClientOptions) {
    this.f = o.fetch ?? fetch;
    this.now = o.now ?? Date.now;
    this.sleep = o.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.delayMs = o.delayMs ?? 500;
    this.cache = new TtlCache(o.ttlMs ?? 5 * 60_000, this.now);
  }

  readonly stores = {
    find: (opts: FindOptions): StoreMatch[] => findStores(this.o.stores, opts),
    resolve: (q: string): Store => this.o.session.resolve(q),
  };

  /** One request in flight, at least delayMs between requests. */
  private throttled<T>(fn: () => Promise<T>): Promise<T> {
    const run = async () => {
      const wait = this.last + this.delayMs - this.now();
      if (wait > 0) await this.sleep(wait);
      try { return await fn(); } finally { this.last = this.now(); }
    };
    const p = this.chain.then(run, run);
    this.chain = p.catch(() => {});
    return p;
  }

  private async page(path: string, store: Store): Promise<{ nd: any; url: string }> {
    const key = `${store.id}${path}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    const url = ORIGIN + path;
    const out = await this.throttled(async () => {
      const res = await this.f(url, {
        headers: { "user-agent": UA, "accept-language": "en-AU", cookie: `storeId=${store.id}; regionCode=${store.region}` },
        signal: AbortSignal.timeout(this.o.timeoutMs ?? 20_000),
      });
      if (res.status === 403 || res.status === 429 || res.status === 503) throw new BlockedError(res.status, url);
      if (!res.ok) throw new HttpError(res.status, url);
      return { nd: extractNextData(await res.text()), url: res.url || url };
    });
    this.cache.set(key, out);
    return out;
  }

  async search(query: string, opts: { store?: string; limit?: number; page?: number; inStockOnly?: boolean } = {}) {
    const store = opts.store ? this.stores.resolve(opts.store) : this.o.session.get();
    const limit = Math.min(Math.max(opts.limit ?? 36, 1), 36);
    const params = new URLSearchParams({ q: query });
    if (opts.page && opts.page > 1) params.set("page", String(opts.page));
    const { nd } = await this.page(`/search/products?${params}`, store);
    const s: Search = parseSearch(nd);
    if (s.storeId !== store.id) throw new Error(`Search ran for store ${s.storeId}, not ${store.id}: the store cookie was not honoured. Check regionCode ${store.region}.`);
    // Compact rows for picking; hasMore means more matches exist beyond the rows returned (on this or later pages).
    const { results: all, ...head } = s;
    const row = ({ rating, ratingCount, ...r }: Search["results"][number]) => r;
    const done = <R extends ReturnType<typeof row>>(results: R[], extra = {}) => ({ ...head, store: store.name, returned: results.length, hasMore: (s.page - 1) * 36 + all.length < s.total, results, ...extra });
    if (!opts.inStockOnly) return done(all.slice(0, limit).map(row));
    // Search data carries no stock, so filtering costs one product page per candidate (cached, throttled).
    const SCAN_CAP = 15;
    const kept: (ReturnType<typeof row> & { stock: Stock })[] = [];
    let scanned = 0;
    for (const r of all.slice(0, SCAN_CAP)) {
      if (kept.length >= limit) break;
      scanned++;
      const p = await this.getProduct(r.itemNumber, { store: store.id });
      if (p.stock.status === "in_stock") kept.push({ ...row(r), stock: p.stock });
    }
    return done(kept, { scanned, scanCap: SCAN_CAP });
  }

  async getProduct(input: string, opts: { store?: string } = {}): Promise<Product> {
    const ref = parseProductRef(input);
    const store = opts.store ? this.stores.resolve(opts.store) : this.o.session.get();
    const { nd, url } = await this.page(ref.path, store);
    const p = parseProduct(nd);
    if (p.itemNumber !== ref.itemNumber) throw new Error(`Asked for item ${ref.itemNumber} but the page is item ${p.itemNumber}.`);
    if (p.storeId !== store.id) throw new Error(`Product page ran for store ${p.storeId}, not ${store.id}: the store cookie was not honoured. Check regionCode ${store.region}.`);
    return { ...p, url };
  }

  async checkStock(items: string[], opts: { store?: string } = {}): Promise<{ store: string; storeId: string; rows: StockRow[] }> {
    const store = opts.store ? this.stores.resolve(opts.store) : this.o.session.get();
    const fan = !opts.store && this.o.session.list().length > 1 ? this.o.session.list() : null;
    const rows: StockRow[] = [];
    for (const item of items) {
      let p: Product;
      try {
        p = await this.getProduct(item, { store: store.id });
      } catch (e) {
        // A missing item is a row, not a failed batch. Drift and blocking still fail loudly.
        if (e instanceof HttpError && e.status === 404 && !(e instanceof BlockedError)) {
          rows.push({ itemNumber: item, name: null, price: null, stock: { storeId: store.id, storeName: store.name, status: "unknown", quantity: null, stockText: null, locations: [] }, aisle: null, bay: null, note: `not found (${e.message})` });
          continue;
        }
        throw e;
      }
      const row: StockRow = { itemNumber: p.itemNumber, name: p.name, price: p.price, stock: p.stock, ...aisleOf(p.stock) };
      if (fan) {
        row.stores = [];
        for (const n of fan) {
          let st: Stock = p.stock, note: string | undefined;
          if (n.id !== store.id) {
            try { st = (await this.getProduct(p.itemNumber, { store: n.id })).stock; }
            catch (e) {
              if (!(e instanceof HttpError) || e.status !== 404 || e instanceof BlockedError) throw e;
              st = { storeId: n.id, storeName: n.name, status: "unknown", quantity: null, stockText: null, locations: [] };
              note = `not found (${e.message})`;
            }
          }
          row.stores.push({ store: n.name, storeId: n.id, status: st.status, quantity: st.quantity, ...aisleOf(st), ...(note && { note }) });
        }
        const hit = row.stores.find((x) => x.status === "in_stock");
        row.firstInStock = hit ? { store: hit.store, storeId: hit.storeId } : null;
      }
      rows.push(row);
    }
    // Sort by aisle so the list matches a walk round the store; unknown aisles go last.
    const key = (r: StockRow) => (r.aisle == null ? Infinity : Number.isNaN(parseInt(r.aisle)) ? 1e6 : parseInt(r.aisle));
    rows.sort((a, b) => key(a) - key(b) || a.itemNumber.localeCompare(b.itemNumber));
    return { store: store.name, storeId: store.id, rows };
  }
}
