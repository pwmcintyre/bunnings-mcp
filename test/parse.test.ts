import { test } from "node:test";
import assert from "node:assert/strict";
import { SiteChangedError, extractNextData, parseProduct, parseSearch, parseStorePage, parseStoresXml } from "../src/parse.ts";
import { clone, fixture, html } from "./helpers.ts";
import { readFileSync } from "node:fs";

test("extractNextData reads the embedded JSON and rejects pages without it", () => {
  assert.deepEqual(extractNextData(html({ a: 1 })), { a: 1 });
  assert.throws(() => extractNextData("<html>Just a moment...</html>"), SiteChangedError);
});

test("parseSearch maps results, store and paging", () => {
  const s = parseSearch(fixture("search"));
  assert.equal(s.storeId, "6400");
  assert.equal(s.region, "VICMetro");
  assert.equal(s.page, 1);
  assert.equal(s.total, 24);
  assert.equal(s.results.length, 6);
  const r = s.results[0];
  assert.equal(r.itemNumber, "8032174");
  assert.equal(r.price, 23.13);
  assert.deepEqual(r.unitPrice, { value: 7.71, unit: "linear metre" });
  assert.equal(r.url, "https://www.bunnings.com.au/90-x-45mm-outdoor-framing-h3-treated-pine-3-0m_p8032174");
  assert.equal(r.rating, 3.73);
  assert.ok(s.results.some((x) => x.itemNumber.startsWith("0")), "leading zeros are kept");
  assert.ok(s.results.some((x) => x.unitPrice === null), "unit price is optional");
});

test("parseProduct maps price, specs, stock, aisle and flags", () => {
  const p = parseProduct(fixture("product"));
  assert.equal(p.itemNumber, "8032174");
  assert.equal(p.price, 23.13);
  assert.equal(p.priceText, "$23.13");
  assert.equal(p.specs["Timber Species"], "Pine");
  assert.equal(p.stock.status, "in_stock");
  assert.equal(p.stock.quantity, 96);
  assert.equal(p.stock.storeName, "Mentone");
  assert.deepEqual(p.stock.locations, [{ aisle: "403", bay: "3" }]);
  assert.equal(p.clickAndCollect, true);
  assert.equal(p.delivery, true);
  assert.equal(p.storeId, "6400");
});

test("parseProduct reports unknown stock, never guesses", () => {
  const nd = clone(fixture("product"));
  const f = nd.props.pageProps.dehydratedState.queries.find((q: any) => q.queryKey[0] === "product-fulfilment");
  delete f.state.data.inStorePickUpData.stock;
  const p = parseProduct(nd);
  assert.equal(p.stock.status, "unknown");
  assert.equal(p.stock.quantity, null);
  f.state.data = undefined;
  assert.equal(parseProduct(nd).stock.status, "unknown");
  assert.equal(parseProduct(nd).clickAndCollect, null);
});

test("zero stock is out_of_stock; aisle query is the fallback when fulfilment has no location", () => {
  const nd = clone(fixture("product"));
  const qs = nd.props.pageProps.dehydratedState.queries;
  const f = qs.find((q: any) => q.queryKey[0] === "product-fulfilment").state.data.inStorePickUpData;
  f.stock = 0;
  f.inStoreItemLocation = [];
  const p = parseProduct(nd);
  assert.equal(p.stock.status, "out_of_stock");
  assert.deepEqual(p.stock.locations, [{ aisle: "403", bay: "3" }]);
});

test("parseStorePage maps id, address, geo, region and hours", () => {
  const s = parseStorePage(fixture("store"), "https://www.bunnings.com.au/stores/vic/mentone");
  assert.equal(s.id, "6400");
  assert.equal(s.name, "Mentone");
  assert.equal(s.region, "VICMetro");
  assert.match(s.postcode, /^\d{4}$/);
  assert.ok(s.lat < -30 && s.lon > 140);
  assert.deepEqual(Object.keys(s.hours).slice(0, 2), ["monday", "tuesday"]);
});

test("parseStoresXml keeps store pages only", () => {
  const urls = parseStoresXml(readFileSync(new URL("./fixtures/stores.xml", import.meta.url), "utf8"));
  assert.deepEqual(urls, ["https://www.bunnings.com.au/stores/vic/mentone", "https://www.bunnings.com.au/stores/wa/joondalup"]);
  assert.throws(() => parseStoresXml("<urlset/>"), SiteChangedError);
});

// Drift: remove one key at a time and expect a SiteChangedError that names it.
const drop = (nd: any, fn: (qs: any[]) => void) => { const c = clone(nd); fn(c.props.pageProps.dehydratedState.queries); return c; };
const del = (qs: any[], name: string) => qs.splice(qs.findIndex((q) => q.queryKey.includes(name)), 1);

test("drift: search", () => {
  assert.throws(() => parseSearch(drop(fixture("search"), (qs) => del(qs, "coveo-search"))), (e: any) => e instanceof SiteChangedError && /coveo-search/.test(e.message));
  assert.throws(() => parseSearch(drop(fixture("search"), (qs) => delete qs[0].state.data.results[1].raw.productroutingurl)), (e: any) => e instanceof SiteChangedError && /productroutingurl/.test(e.message));
  assert.throws(() => parseSearch({ props: {} }), SiteChangedError);
});

test("drift: product", () => {
  for (const name of ["retail-product", "product-fulfilment", "product-retail-price"]) {
    assert.throws(() => parseProduct(drop(fixture("product"), (qs) => del(qs, name))), (e: any) => e instanceof SiteChangedError && e.message.includes(name), name);
  }
  assert.throws(() => parseProduct(drop(fixture("product"), (qs) => delete qs.find((q) => q.queryKey[0] === "retail-product").state.data.name)), (e: any) => e instanceof SiteChangedError && /name/.test(e.message));
});

test("drift: store page", () => {
  const nd = clone(fixture("store"));
  delete nd.props.pageProps.initialState.store.data.geoPoint;
  assert.throws(() => parseStorePage(nd, ""), (e: any) => e instanceof SiteChangedError && /geoPoint/.test(e.message));
});
