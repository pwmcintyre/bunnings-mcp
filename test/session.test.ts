import { test } from "node:test";
import assert from "node:assert/strict";
import { Session, SITE_DEFAULT_STORE_ID } from "../src/session.ts";
import { STORES } from "./helpers.ts";

test("starts on the env store, else the site default", () => {
  assert.equal(new Session(STORES, "6111").get().name, "Dandenong");
  assert.equal(new Session(STORES, undefined).get().id, SITE_DEFAULT_STORE_ID);
});

test("set_store takes an id or a unique name, and is per instance", () => {
  const a = new Session(STORES, "6400"), b = new Session(STORES, "6400");
  assert.equal(a.set("Dandenong").id, "6111");
  assert.equal(a.set("2010").name, "Joondalup");
  assert.equal(b.get().id, "6400");
});

test("unknown or ambiguous stores fail with a useful message", () => {
  const s = new Session(STORES, "6400");
  assert.throws(() => s.set("Atlantis"), /No store matches/);
  assert.throws(() => s.set("vic"), /several stores/);
  assert.equal(s.get().id, "6400", "failed set leaves the store unchanged");
  assert.throws(() => new Session(STORES, "9999"), /No store matches/);
});

test("BUNNINGS_STORE_ID takes an ordered list; the first is the default", () => {
  const ids = (x: string) => new Session(STORES, x).list().map((s) => s.id);
  assert.deepEqual(ids("6111"), ["6111"]);
  assert.deepEqual(ids("6111,6222,6400"), ["6111", "6222", "6400"]);
  assert.deepEqual(ids(" 6222 , ,6400,"), ["6222", "6400"]);
  assert.equal(new Session(STORES, "6222,6400").get().id, "6222");
  assert.deepEqual(ids(""), [SITE_DEFAULT_STORE_ID]);
  assert.throws(() => new Session(STORES, "6400,9999"), /No store matches id "9999"/);
});

test("set_store changes the default but not the preferred list", () => {
  const s = new Session(STORES, "6222,6400");
  s.set("Dandenong");
  assert.equal(s.get().id, "6111");
  assert.deepEqual(s.list().map((x) => x.id), ["6222", "6400"]);
});
