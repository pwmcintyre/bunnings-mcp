// Refreshes test/fixtures/*.json from the live site, trimmed to the fields the parsers read.
// Four requests. Usage: npm run refresh:fixtures
import { mkdirSync, writeFileSync } from "node:fs";
import { extractNextData, ORIGIN } from "../src/parse.ts";

const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const COOKIE = "storeId=6400; regionCode=VICMetro"; // the site's own default store
const out = (name: string, v: unknown) => writeFileSync(new URL(`../test/fixtures/${name}.json`, import.meta.url), JSON.stringify(v, null, 1) + "\n");
const get = async (path: string) => {
  await new Promise((r) => setTimeout(r, 1000));
  const res = await fetch(ORIGIN + path, { headers: { "user-agent": UA, "accept-language": "en-AU", cookie: COOKIE }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return extractNextData(await res.text());
};
const wrap = (queries: unknown[], extra: object = {}) => ({ props: { pageProps: { dehydratedState: { queries }, ...extra } } });
const pick = (o: any, keys: string[]) => Object.fromEntries(keys.filter((k) => k in o).map((k) => [k, o[k]]));
const q = (nd: any, name: string, pos: number) => nd.props.pageProps.dehydratedState.queries.find((x: any) => x.queryKey[pos] === name);

mkdirSync(new URL("../test/fixtures", import.meta.url), { recursive: true });

const search = await get("/search/products?q=treated+pine+90x45");
const cs = q(search, "coveo-search", 1);
out("search", wrap([{
  queryKey: [...cs.queryKey.slice(0, 5), { body: pick(cs.queryKey[5].body, ["q", "firstResult", "numberOfResults"]) }],
  state: { data: { totalCount: cs.state.data.totalCount, results: cs.state.data.results.slice(0, 6).map((r: any) => ({
    raw: pick(r.raw, ["code", "name", "price", "cprice", "comparisonunitofmeasure", "productroutingurl", "rating", "ratingcount", "brandname"]) })) } },
}]));

const pdp = await get("/_p8032174");
const rp = q(pdp, "retail-product", 0).state.data;
out("product", wrap(["product-retail-price", "product-fulfilment", "product-aisle-item-location"].map((n) => pick(q(pdp, n, 0), ["queryKey", "state"]))
  .concat([{ queryKey: ["retail-product", "8032174", "6400"], state: { data: {
    ...pick(rp, ["itemNumber", "name", "averageRating", "numberOfReviews", "summary", "classifications"]),
    images: (rp.images ?? []).filter((i: any) => i.imageType === "PRIMARY").slice(0, 1).map((i: any) => pick(i, ["imageType", "url"])) } } } as any])));

const st = (await get("/stores/vic/mentone")).props.pageProps.initialState.store.data;
out("store", { props: { pageProps: { initialState: { store: { data: {
  ...pick(st, ["name", "displayName", "geoPoint", "pricingRegion", "mapUrl", "openingHours"]),
  address: pick(st.address, ["line1", "town", "postalCode", "phone", "region"]) } } } } } });
console.error("fixtures refreshed");
