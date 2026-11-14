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
