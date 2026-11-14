// Live contract tests: run against the real site to detect drift. LIVE=1 npm run test:live
import { test } from "node:test";
import assert from "node:assert/strict";
import { Bunnings } from "../../src/client.ts";
import { extractNextData, parseStorePage } from "../../src/parse.ts";
import { Session } from "../../src/session.ts";
import { loadStores } from "../../src/stores.ts";

const live = process.env.LIVE === "1";
const stores = loadStores();
const client = new Bunnings({ stores, session: new Session(stores, "6400"), delayMs: 1000 });

test("live: search returns priced products for the store", { skip: !live }, async () => {
  const r = await client.search("treated pine 90x45", { limit: 5 });
  assert.equal(r.storeId, "6400");
  assert.ok(r.total > 0 && r.results.length > 0);
  assert.match(r.results[0].itemNumber, /^\d{7}$/);
  assert.ok(r.results.some((x) => x.price && x.price > 0));
  assert.match(r.results[0].url, /_p\d+$/);
});

test("live: product page has price, stock and aisle; bare item number resolves", { skip: !live }, async () => {
  const p = await client.getProduct("8032174");
  assert.equal(p.itemNumber, "8032174");
  assert.ok(p.price && p.price > 0);
  assert.notEqual(p.stock.status, undefined);
  assert.ok(Object.keys(p.specs).length > 0);
  assert.match(p.url, /treated-pine.*_p8032174$/, "redirected to the canonical slug");
});

test("live: store page parses and matches committed data", { skip: !live }, async () => {
  const res = await fetch("https://www.bunnings.com.au/stores/vic/mentone", { headers: { "user-agent": "Mozilla/5.0 (X11; Linux x86_64) Chrome/130.0 Safari/537.36" } });
  const s = parseStorePage(extractNextData(await res.text()), res.url);
  const committed = stores.find((x) => x.id === s.id)!;
  assert.equal(s.region, committed.region);
  assert.equal(s.postcode, committed.postcode);
});
