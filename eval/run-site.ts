// Site arm: runs each eval query through the client's search and records the top 10.
// Usage: npm run eval:site   (about 20 requests)
import { readFileSync, writeFileSync } from "node:fs";
import { Bunnings } from "../src/client.ts";
import { Session } from "../src/session.ts";
import { loadStores } from "../src/stores.ts";

const spec = JSON.parse(readFileSync(new URL("./queries.json", import.meta.url), "utf8"));
const stores = loadStores();
// Time the network round trip only, not the client's politeness delay.
let fetchMs = 0;
const timed: typeof fetch = async (u, init) => {
  const t0 = performance.now();
  const res = await fetch(u, init);
  const body = await res.arrayBuffer();
  fetchMs = Math.round(performance.now() - t0);
  return new Response(body, { status: res.status, headers: res.headers });
};
const client = new Bunnings({ stores, session: new Session(stores, spec.store), delayMs: 1000, fetch: timed });
const date = new Date().toISOString().slice(0, 10);

const rows = [];
for (const q of spec.queries) {
  const r = await client.search(q.query, { limit: 10 });
  const ms = fetchMs;
  rows.push({
    id: q.id, query: q.query, latencyMs: ms, total: r.total,
    results: r.results.map((x) => ({ itemNumber: x.itemNumber, name: x.name, price: x.price, url: x.url })),
  });
  console.error(`${q.id} ${ms}ms ${r.total} results`);
}
writeFileSync(new URL(`./results/site-${date}.json`, import.meta.url), JSON.stringify({ date, store: spec.store, rows }, null, 1) + "\n");
