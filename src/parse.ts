// Pure parsers over the JSON that bunnings.com.au embeds in its pages.
// No network, no clock. Every missing path throws SiteChangedError; nothing is guessed.

export const ORIGIN = "https://www.bunnings.com.au";

export class SiteChangedError extends Error {
  constructor(public readonly path: string, detail = "") {
    super(`Bunnings page shape changed: missing ${path}${detail ? ` (${detail})` : ""}. The site may have been redesigned; see CONTRIBUTING.md to refresh the fixtures.`);
    this.name = "SiteChangedError";
  }
}

export interface Store {
  id: string;
  name: string;
  address: string;
  suburb: string;
  state: string;
  postcode: string;
  lat: number;
  lon: number;
  phone?: string;
  region: string;
  url: string;
  mapUrl?: string;
  hours: Record<string, string>;
}

export interface SearchResult {
  itemNumber: string;
  name: string;
  price: number | null;
  unitPrice: { value: number; unit: string } | null;
  url: string;
  rating: number | null;
  ratingCount: number | null;
  brand: string | null;
}

export interface Search {
  query: string;
  storeId: string;
  region: string;
  total: number;
  page: number;
  results: SearchResult[];
}

export type StockStatus = "in_stock" | "out_of_stock" | "not_sold" | "unknown";

export interface Stock {
  storeId: string;
  storeName: string | null;
  status: StockStatus;
  quantity: number | null;
  stockText: string | null;
  locations: { aisle: string; bay: string }[];
}

export interface Product {
  itemNumber: string;
  name: string;
  url: string;
  storeId: string;
  price: number | null;
  priceText: string | null;
  unitPrice: { value: number; unit: string } | null;
  rating: number | null;
  ratingCount: number | null;
  summary: string | null;
  specs: Record<string, string>;
  imageUrl: string | null;
  stock: Stock;
  clickAndCollect: boolean | null;
  delivery: boolean | null;
}

type Json = any; // ponytail: untyped site JSON; every access goes through at()/opt() below

/** Read a required path; throws SiteChangedError naming it. */
export function at(obj: Json, path: string, label = path): Json {
  let cur = obj;
  for (const k of path.split(".")) {
    if (cur == null || typeof cur !== "object" || !(k in cur)) throw new SiteChangedError(label, `stopped at "${k}"`);
    cur = cur[k];
  }
  return cur;
}

const opt = (obj: Json, path: string): Json => {
  try { return at(obj, path); } catch { return undefined; }
};

export function extractNextData(html: string): Json {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new SiteChangedError("<script id=__NEXT_DATA__>");
  try { return JSON.parse(m[1]); } catch { throw new SiteChangedError("__NEXT_DATA__ JSON", "not valid JSON"); }
}

function queries(nd: Json): Json[] {
  const q = at(nd, "props.pageProps.dehydratedState.queries");
  if (!Array.isArray(q)) throw new SiteChangedError("props.pageProps.dehydratedState.queries", "not an array");
  return q;
}

function findQuery(nd: Json, name: string, pos = 0): Json {
  const q = queries(nd).find((x) => x?.queryKey?.[pos] === name);
  if (!q) throw new SiteChangedError(`dehydratedState.queries[queryKey[${pos}]=="${name}"]`);
  return q;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

export function parseSearch(nd: Json): Search {
  const q = findQuery(nd, "coveo-search", 1);
  const data = at(q, "state.data", "coveo-search state.data");
  const raws = at(data, "results", "coveo-search results");
  if (!Array.isArray(raws)) throw new SiteChangedError("coveo-search results", "not an array");
  const body = at(q, "queryKey.5.body", "coveo-search queryKey[5].body");
  const results = raws.map((r: Json, i: number): SearchResult => {
    const raw = at(r, "raw", `results[${i}].raw`);
    const itemNumber = at(raw, "code", `results[${i}].raw.code`);
    const route = at(raw, "productroutingurl", `results[${i}].raw.productroutingurl`);
    const cprice = num(raw.cprice);
    return {
      itemNumber: String(itemNumber),
      name: at(raw, "name", `results[${i}].raw.name`),
      price: num(raw.price),
      unitPrice: cprice != null && raw.comparisonunitofmeasure ? { value: cprice, unit: raw.comparisonunitofmeasure } : null,
      url: ORIGIN + route,
      rating: num(raw.rating),
      ratingCount: num(raw.ratingcount),
      brand: str(raw.brandname),
    };
  });
  return {
    query: str(body.q) ?? "",
    region: String(q.queryKey[3]),
    storeId: String(q.queryKey[4]),
    total: at(data, "totalCount", "coveo-search totalCount"),
    page: Math.floor((body.firstResult ?? 0) / (body.numberOfResults || 36)) + 1,
    results,
  };
}

const stripPrefix = (s: unknown, word: string) => String(s ?? "").replace(new RegExp(`^${word}\\s*`, "i"), "").trim();

export function parseStock(fulfilment: Json | undefined, aisle: Json | undefined, storeId: string): Stock {
  if (!fulfilment) return { storeId, storeName: null, status: "unknown", quantity: null, stockText: null, locations: [] };
  const pick = fulfilment.inStorePickUpData;
  // The fulfilment value is the one the page displays; the separate aisle query is only a fallback.
  let locs: Json[] = Array.isArray(pick?.inStoreItemLocation) ? pick.inStoreItemLocation : [];
  if (!locs.length && Array.isArray(aisle?.[0]?.inStoreLocations)) locs = aisle[0].inStoreLocations;
  const quantity = num(pick?.stock);
  return {
    storeId,
    storeName: str(pick?.storeName) ?? str(fulfilment.clickNCollectData?.storeName),
    // The site says "notSoldAtThisStore" when the item is not ranged at the store; there is no stock number then.
    status: quantity != null ? (quantity > 0 ? "in_stock" : "out_of_stock") : pick?.inStoreStockMsg === "notSoldAtThisStore" ? "not_sold" : "unknown",
    quantity,
    stockText: str(pick?.inStoreStockTxt) ?? str(pick?.inStoreStockMsg),
    locations: [...new Map(locs.map((l) => [`${l.aisle}/${l.bay}`, { aisle: stripPrefix(l.aisle, "aisle"), bay: stripPrefix(l.bay, "bay") }])).values()],
  };
}

export function parseProduct(nd: Json): Product {
  const rp = findQuery(nd, "retail-product");
  const p = at(rp, "state.data", "retail-product state.data");
  const priceQ = findQuery(nd, "product-retail-price");
  const fulfilQ = findQuery(nd, "product-fulfilment");
  const aisleQ = queries(nd).find((x) => x?.queryKey?.[0] === "product-aisle-item-location");
  const storeId = String(at(fulfilQ, "queryKey.2", "product-fulfilment queryKey[2]"));
  const price = priceQ.state?.data;
  const f = fulfilQ.state?.data;
  const specs: Record<string, string> = {};
  for (const c of p.classifications ?? []) {
    for (const ft of c.features ?? []) {
      const v = (ft.featureValues ?? []).map((x: Json) => x.value).filter(Boolean).join(", ");
      if (ft.name && v) specs[ft.name] = v;
    }
  }
  const itemNumber = String(at(p, "itemNumber", "retail-product itemNumber"));
  const img = (p.images ?? []).find((i: Json) => i.imageType === "PRIMARY") ?? p.images?.[0];
  const priceOk = price && price.priceAvailable !== false && num(price.value) != null;
  return {
    itemNumber,
    name: at(p, "name", "retail-product name"),
    url: `${ORIGIN}/_p${itemNumber}`,
    storeId,
    price: priceOk ? price.value : null,
    priceText: priceOk ? str(price.formattedValue) : null,
    unitPrice: priceOk && num(price.comparisonUnitPrice) != null ? { value: price.comparisonUnitPrice, unit: price.comparisonUnitOfMeasure } : null,
    rating: num(p.averageRating),
    ratingCount: num(p.numberOfReviews),
    summary: str(p.summary),
    specs,
    imageUrl: str(img?.url),
    stock: parseStock(f, aisleQ?.state?.data, storeId),
    clickAndCollect: typeof f?.clickNCollectData?.hasClickAndCollect === "boolean" ? f.clickNCollectData.hasClickAndCollect : null,
    delivery: typeof f?.deliveryData?.isDeliveryAvailable === "boolean" ? f.deliveryData.isDeliveryAvailable : null,
  };
}

const DAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"];

export function parseStorePage(nd: Json, url: string): Store {
  const d = at(nd, "props.pageProps.initialState.store.data", "initialState.store.data");
  const a = at(d, "address", "store.data.address");
  const hours: Record<string, string> = {};
  const list = opt(d, "openingHours.weekDayOpeningList");
  if (!Array.isArray(list)) throw new SiteChangedError("store.data.openingHours.weekDayOpeningList");
  for (const day of [...list].sort((x, y) => DAYS.indexOf(x.weekDay) - DAYS.indexOf(y.weekDay))) {
    hours[day.weekDay.toLowerCase()] = day.closed ? "closed" : `${day.openingTime.formattedHour} - ${day.closingTime.formattedHour}`;
  }
  return {
    id: String(at(d, "name", "store.data.name")),
    name: at(d, "displayName", "store.data.displayName"),
    address: at(a, "line1", "store.data.address.line1"),
    suburb: at(a, "town", "store.data.address.town"),
    state: at(a, "region.isocode", "store.data.address.region.isocode"),
    postcode: at(a, "postalCode", "store.data.address.postalCode"),
    lat: at(d, "geoPoint.latitude", "store.data.geoPoint.latitude"),
    lon: at(d, "geoPoint.longitude", "store.data.geoPoint.longitude"),
    phone: str(a.phone) ?? undefined,
    region: at(d, "pricingRegion", "store.data.pricingRegion"),
    url,
    mapUrl: str(d.mapUrl) ?? undefined,
    hours,
  };
}

/** Store page URLs from /stores.xml: /stores/{state}/{slug}, excluding coming-soon. */
export function parseStoresXml(xml: string): string[] {
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
  const pages = urls.filter((u) => /\/stores\/[a-z]+\/[^/]+$/.test(u) && !u.includes("/stores/coming-soon"));
  if (!pages.length) throw new SiteChangedError("stores.xml <loc> store pages");
  return pages;
}
