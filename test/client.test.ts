import { test } from "node:test";
import assert from "node:assert/strict";
import { Bunnings, BlockedError, HttpError, parseProductRef } from "../src/client.ts";
import { SiteChangedError } from "../src/parse.ts";
import { Session } from "../src/session.ts";
import { STORES, clone, fixture, productFor, stubFetch, type Call } from "./helpers.ts";

const make = (route: Parameters<typeof stubFetch>[0], opts: { store?: string; now?: () => number; sleeps?: number[] } = {}) => {
  const calls: Call[] = [];
  const sleeps = opts.sleeps ?? [];
  const client = new Bunnings({
    stores: STORES, session: new Session(STORES, opts.store ?? "6400"),
    fetch: stubFetch(route, calls), now: opts.now, sleep: async (ms) => { sleeps.push(ms); },
  });
  return { client, calls, sleeps };
};
const searchFor = (storeId: string) => { const nd = clone(fixture("search")); nd.props.pageProps.dehydratedState.queries[0].queryKey[4] = storeId; return nd; };

test("parseProductRef accepts urls, paths and item numbers", () => {
  assert.equal(parseProductRef("8032174").path, "/_p8032174");
  assert.equal(parseProductRef("0616143").itemNumber, "0616143");
  assert.equal(parseProductRef("https://www.bunnings.com.au/some-thing_p8032174?x=1").path, "/some-thing_p8032174");
  assert.equal(parseProductRef("/some-thing_p8032174").itemNumber, "8032174");
  assert.throws(() => parseProductRef("https://evil.example/x_p8032174"), /Not a Bunnings/);
  assert.throws(() => parseProductRef("https://www.bunnings.com.au/stores"), /Not a Bunnings/);
  assert.throws(() => parseProductRef("hello"), /Not a Bunnings/);
});

test("sends the store and region cookies for the chosen store", async () => {
  const { client, calls } = make((u, s) => (u.pathname === "/search/products" ? searchFor(s) : productFor(s, { stock: 5 })), { store: "2010" });
  await client.search("bolt");
  assert.equal(calls[0].cookie, "storeId=2010; regionCode=WAMetro");
  assert.match(calls[0].url, /search\/products\?q=bolt$/);
  await client.search("bolt", { store: "6400", page: 2 });
  assert.equal(calls[1].cookie, "storeId=6400; regionCode=VICMetro");
  assert.match(calls[1].url, /page=2/);
});

test("fails when the site ignores the store cookie", async () => {
  const { client } = make(() => fixture("search"), { store: "2010" });
  await assert.rejects(client.search("bolt"), /store cookie was not honoured/);
});

test("caches pages per store and path; throttles between requests", async () => {
  let t = 0;
  const { client, calls, sleeps } = make((u, s) => productFor(s, { stock: 5 }), { now: () => t });
  await client.getProduct("8032174");
  await client.getProduct("8032174");
  assert.equal(calls.length, 1, "second call served from cache");
  await client.getProduct("8032174", { store: "6222" });
  assert.equal(calls.length, 2, "another store is another cache key");
  assert.equal(sleeps.length, 1, "second real request waited for the delay");
  assert.ok(sleeps[0] > 0 && sleeps[0] <= 500);
  t = 10 * 60_000;
  await client.getProduct("8032174");
  assert.equal(calls.length, 3, "cache entry expired");
});

test("requests never overlap", async () => {
  let inFlight = 0, peak = 0;
  const f = (async (input: any) => {
    inFlight++; peak = Math.max(peak, inFlight);
    await new Promise((r) => setTimeout(r, 5));
    inFlight--;
    return new Response(`<script id="__NEXT_DATA__">${JSON.stringify(productFor("6400", { stock: 1 }, String(input).match(/_p(\d+)/)![1]))}</script>`);
  }) as typeof fetch;
  const client = new Bunnings({ stores: STORES, session: new Session(STORES, "6400"), fetch: f, delayMs: 0 });
  await Promise.all(["1000001", "1000002", "1000003"].map((n) => client.getProduct(n)));
  assert.equal(peak, 1);
});

test("blocking and http errors are loud and not retried", async () => {
  const blocked = make(() => new Response("", { status: 403 }));
  await assert.rejects(blocked.client.getProduct("8032174"), BlockedError);
  await assert.rejects(blocked.client.getProduct("8032174"), BlockedError);
  assert.equal(blocked.calls.length, 2, "one request per call, no retries");
  await assert.rejects(make(() => new Response("", { status: 404 })).client.getProduct("8032174"), HttpError);
});

test("drift surfaces as SiteChangedError", async () => {
  const nd = clone(fixture("product"));
  nd.props.pageProps.dehydratedState.queries.splice(0, 1);
  await assert.rejects(make(() => nd).client.getProduct("8032174"), SiteChangedError);
});

test("getProduct checks the page is the item asked for", async () => {
  await assert.rejects(make((u, s) => productFor(s, { stock: 1 }, "1111111")).client.getProduct("8032174"), /Asked for item 8032174/);
});

test("search in_stock_only keeps only items with stock and attaches it", async () => {
  const { client, calls } = make((u, s) => {
    if (u.pathname === "/search/products") return searchFor(s);
    return productFor(s, u.pathname.endsWith("8032174") ? { stock: 3, aisle: "7" } : { stock: 0 }, u.pathname.match(/_p(\d+)/)![1]);
  });
  const r: any = await client.search("treated pine", { inStockOnly: true });
  assert.deepEqual(r.results.map((x: any) => x.itemNumber), ["8032174"]);
  assert.equal(r.results[0].stock.locations[0].aisle, "7");
  assert.equal(r.scanned, 6);
  assert.equal(calls.length, 1 + 6);
});

test("check_stock sorts by aisle, marks unknown, and tolerates a missing item", async () => {
  const stock: Record<string, any> = { "1000001": { stock: 4, aisle: "20" }, "1000002": { stock: 4, aisle: "3" }, "1000003": { stock: 4 } };
  const { client } = make((u, s) => {
    const n = u.pathname.match(/_p(\d+)/)![1];
    return n === "1000004" ? new Response("", { status: 404 }) : productFor(s, stock[n], n);
  });
  const r = await client.checkStock(["1000001", "1000004", "1000003", "1000002"]);
  assert.deepEqual(r.rows.map((x) => x.itemNumber), ["1000002", "1000001", "1000003", "1000004"]);
  assert.equal(r.rows[2].aisle, null, "no aisle data stays null (the tool prints unknown)");
  assert.match(r.rows[3].note!, /not found/);
  assert.equal(r.rows[3].stock.status, "unknown");
});

test("check_stock only treats 404 as a missing item", async () => {
  const { client } = make(() => new Response("upstream failure", { status: 500 }));
  await assert.rejects(client.checkStock(["1000001"]), (e: unknown) => e instanceof HttpError && e.status === 500);
});

test("check_stock fan out propagates non-404 HTTP errors", async () => {
  const client = new Bunnings({
    stores: STORES, session: new Session(STORES, "6222,6400"), delayMs: 0,
    fetch: stubFetch((_u, s) => s === "6222" ? productFor(s, { stock: 1 }, "8032174") : new Response("upstream failure", { status: 500 })),
  });
  await assert.rejects(client.checkStock(["8032174"]), (e: unknown) => e instanceof HttpError && e.status === 500);
});

test("search returns the full fixture page with counts, and limit trims it", async () => {
  const { client } = make((u, s) => searchFor(s));
  const r: any = await client.search("treated pine");
  assert.equal(r.results.length, 6);
  assert.equal(r.returned, 6);
  assert.equal(r.total, 24);
  assert.equal(r.hasMore, true);
  assert.equal(r.results[0].brand !== undefined, true);
  assert.equal("rating" in r.results[0], false);
  assert.equal(((await client.search("treated pine", { limit: 2 })) as any).returned, 2);
});

test("check_stock fans out over preferred stores in order, with not_sold and unknown", async () => {
  const calls: Call[] = [];
  const client = new Bunnings({
    stores: STORES, session: new Session(STORES, "6222,6111,6400"), delayMs: 0,
    fetch: stubFetch((u, s) => {
      const nd = productFor(s, s === "6400" ? { stock: 7, aisle: "12", bay: "3" } : { stock: 0 }, "8032174");
      const f = nd.props.pageProps.dehydratedState.queries.find((q: any) => q.queryKey[0] === "product-fulfilment");
      if (s === "6222") f.state.data.inStorePickUpData = { inStorePickUpAvailable: false, inStoreStockMsg: "notSoldAtThisStore" };
      if (s === "6111") f.state.data = undefined;
      return nd;
    }, calls),
  });
  const r = await client.checkStock(["8032174"]);
  const row = r.rows[0];
  assert.equal(r.storeId, "6222");
  assert.deepEqual(row.stores!.map((x) => [x.storeId, x.status]), [["6222", "not_sold"], ["6111", "unknown"], ["6400", "in_stock"]]);
  assert.equal(row.stores![2].aisle, "12");
  assert.deepEqual(row.firstInStock, { store: "Mentone", storeId: "6400" });
  assert.deepEqual(calls.map((c) => /storeId=(\d+)/.exec(c.cookie)![1]), ["6222", "6111", "6400"], "one sequential fetch per store");

  const one = await client.checkStock(["8032174"], { store: "6400" });
  assert.equal(one.rows[0].stores, undefined, "an explicit store stays single-store");
});
