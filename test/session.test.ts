import { test } from "node:test";
import assert from "node:assert/strict";
import { Session, SITE_DEFAULT_STORE_ID } from "../src/session.ts";
import { STORES } from "./helpers.ts";

test("starts on the env store, else the site default", () => {
  assert.equal(new Session(STORES, "6037").get().name, "Eltham");
  assert.equal(new Session(STORES, undefined).get().id, SITE_DEFAULT_STORE_ID);
});

test("set_store takes an id or a unique name, and is per instance", () => {
  const a = new Session(STORES, "6400"), b = new Session(STORES, "6400");
  assert.equal(a.set("Eltham").id, "6037");
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
