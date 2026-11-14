import { test } from "node:test";
import assert from "node:assert/strict";
import { distanceKm, findStores, loadStores, nearestStores } from "../src/stores.ts";
import { STORES } from "./helpers.ts";

test("distance is sane", () => {
  assert.ok(Math.abs(distanceKm(-37.8136, 144.9631, -33.8688, 151.2093) - 713) < 5, "Melbourne to Sydney");
  assert.equal(distanceKm(1, 1, 1, 1), 0);
});

test("find by id, name, suburb, postcode and state", () => {
  assert.equal(findStores(STORES, { query: "6222" })[0].name, "Springvale");
  assert.equal(findStores(STORES, { query: "mentone" })[0].id, "6400");
  assert.equal(findStores(STORES, { query: "3175" })[0].name, "Dandenong");
  assert.deepEqual(findStores(STORES, { query: "wa" }).map((s) => s.name), ["Joondalup"]);
  assert.deepEqual(findStores(STORES, { query: "nowhere" }), []);
});

test("exact name outranks partial match", () => {
  const list = [...STORES, { ...STORES[0], id: "9", name: "Mentone Extra", suburb: "Mentone Extra" }];
  assert.equal(findStores(list, { query: "mentone" })[0].id, "6400");
});

test("lat/lon sorts by distance and reports it", () => {
  const r = findStores(STORES, { lat: -37.99, lon: 145.2, limit: 3 });
  assert.deepEqual(r.map((s) => s.name), ["Dandenong", "Springvale", "Mentone"]);
  assert.ok(r[0].distanceKm! < r[1].distanceKm!);
  const near = findStores(STORES, { query: "vic", lat: -31.7, lon: 115.8, limit: 5 });
  assert.equal(near[0].name, "Mentone", "nearest Victorian store to Perth");
  assert.ok(near.every((s) => s.state === "VIC"), "query filters");
});

test("needs a query or a point", () => {
  assert.throws(() => findStores(STORES, {}), /query/);
});

test("nearestStores excludes the base store", () => {
  const r = nearestStores(STORES, STORES[0], 2);
  assert.ok(r.every((s) => s.id !== "6400"));
  assert.equal(r.length, 2);
});

test("committed data/stores.json covers the country", () => {
  const stores = loadStores();
  assert.ok(stores.length > 250, `only ${stores.length} stores`);
  assert.ok(new Set(stores.map((s) => s.id)).size === stores.length, "unique ids");
  for (const st of ["VIC", "NSW", "QLD", "WA", "SA", "TAS", "ACT", "NT"]) assert.ok(stores.some((s) => s.state === st), st);
  assert.ok(stores.every((s) => s.region && s.lat && s.lon));
});
