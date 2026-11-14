import { readFileSync } from "node:fs";
import type { Store } from "../src/parse.ts";

export const fixture = (name: string): any => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), "utf8"));
export const html = (nd: unknown) => `<html><head><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(nd)}</script></head></html>`;
export const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

export const store = (id: string, name: string, lat: number, lon: number, extra: Partial<Store> = {}): Store => ({
  id, name, address: "1 Test St", suburb: name, state: "VIC", postcode: "3000", lat, lon, region: "VICMetro", url: "", hours: {}, ...extra,
});
export const STORES: Store[] = [
  store("6400", "Mentone", -37.9768, 145.0695, { postcode: "3194" }),
  store("6390", "Thomastown", -37.6932, 145.023, { postcode: "3074" }),
  store("6037", "Eltham", -37.71, 145.14, { postcode: "3095" }),
  store("2010", "Joondalup", -31.74, 115.77, { state: "WA", postcode: "6027", region: "WAMetro" }),
];

type Stock = { stock: number; aisle?: string; bay?: string };
/** Product fixture as the site would render it for another store and stock level. */
export function productFor(storeId: string, s: Stock, itemNumber?: string) {
  const nd = clone(fixture("product"));
  const qs = nd.props.pageProps.dehydratedState.queries;
  const f = qs.find((q: any) => q.queryKey[0] === "product-fulfilment");
  f.queryKey[2] = storeId;
  f.state.data.inStorePickUpData.stock = s.stock;
  f.state.data.inStorePickUpData.inStoreItemLocation = s.aisle ? [{ aisle: `Aisle ${s.aisle}`, bay: `Bay ${s.bay ?? "1"}` }] : [];
  if (itemNumber) qs.find((q: any) => q.queryKey[0] === "retail-product").state.data.itemNumber = itemNumber;
  return nd;
}

export interface Call { url: string; cookie: string }
/** A fetch stub. `route` returns page JSON (or a Response) for a URL and store id. */
export function stubFetch(route: (url: URL, storeId: string) => unknown | Response, calls: Call[] = []): typeof fetch {
  return (async (input: any, init: any) => {
    const url = new URL(String(input));
    const cookie = init?.headers?.cookie ?? "";
    calls.push({ url: String(input), cookie });
    const r = route(url, /storeId=(\d+)/.exec(cookie)?.[1] ?? "");
    if (r instanceof Response) return r;
    const res = new Response(html(r), { status: 200 });
    Object.defineProperty(res, "url", { value: String(input).replace("/_p", "/some-slug_p") });
    return res;
  }) as typeof fetch;
}
