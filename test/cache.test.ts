import { test } from "node:test";
import assert from "node:assert/strict";
import { TtlCache } from "../src/cache.ts";

test("entries expire after the ttl", () => {
  let t = 0;
  const c = new TtlCache<number>(1000, () => t);
  c.set("a", 1);
  t = 999;
  assert.equal(c.get("a"), 1);
  t = 1000;
  assert.equal(c.get("a"), undefined);
  assert.equal(c.get("missing"), undefined);
});

test("inserting entries removes expired values and stays within the size limit", () => {
  let t = 0;
  const c = new TtlCache<number>(1000, () => t, 2);
  c.set("a", 1);
  c.set("b", 2);
  c.set("c", 3);
  assert.equal(c.get("a"), undefined, "oldest live entry is evicted at capacity");
  assert.equal(c.get("b"), 2);
  t = 1000;
  c.set("d", 4);
  assert.equal(c.get("b"), undefined, "expired entries are removed during insertion");
  assert.equal(c.get("c"), undefined);
  assert.equal(c.get("d"), 4);
});
