// Builds data/stores.json from the public store pages. One request at a time, polite delay.
// Usage: npm run build:stores [-- --delay=800]
import { writeFileSync } from "node:fs";
import { extractNextData, parseStorePage, parseStoresXml, ORIGIN, type Store } from "../src/parse.ts";

const delay = Number(process.argv.find((a) => a.startsWith("--delay="))?.slice(8) ?? 800);
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const get = (u: string) => fetch(u, { headers: { "user-agent": UA, "accept-language": "en-AU" }, signal: AbortSignal.timeout(30_000) });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const xml = await (await get(`${ORIGIN}/stores.xml`)).text();
const urls = parseStoresXml(xml);
console.error(`${urls.length} store pages`);

const stores: Store[] = [];
for (const [i, url] of urls.entries()) {
  await sleep(delay);
  try {
    const res = await get(url);
    if (res.status === 403 || res.status === 503) throw new Error(`HTTP ${res.status}: bot protection? stopping`);
    if (!res.ok) { console.error(`skip ${url}: HTTP ${res.status}`); continue; }
    const store = parseStorePage(extractNextData(await res.text()), url);
    // A store with no coordinates is a placeholder page (closed or not yet open); it cannot be matched by distance.
    if (!store.lat || !store.lon) { console.error(`skip ${url}: no coordinates`); continue; }
    stores.push(store);
  } catch (e) {
    if (String(e).includes("stopping")) throw e;
    console.error(`skip ${url}: ${e}`);
  }
  if (i % 25 === 0) console.error(`${i + 1}/${urls.length}`);
}
stores.sort((a, b) => a.state.localeCompare(b.state) || a.name.localeCompare(b.name));
writeFileSync(new URL("../data/stores.json", import.meta.url), JSON.stringify(stores, null, 1) + "\n");
console.error(`wrote ${stores.length} stores`);
