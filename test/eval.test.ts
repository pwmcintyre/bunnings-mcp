import { test } from "node:test";
import assert from "node:assert/strict";
import { classify, metrics } from "../eval/metrics.ts";

test("classify separates warehouse products from other results", () => {
  assert.deepEqual(classify("https://www.bunnings.com.au/x-y_p0123456"), { item: "0123456", kind: "product" });
  assert.deepEqual(classify("https://www.bunnings.com.au/_p0123456"), { item: "0123456", kind: "product" });
  assert.equal(classify("https://www.bunnings.co.nz/x_p0123456").kind, "other-site-product");
  assert.equal(classify("https://trade.bunnings.com.au/x_p0123456").kind, "other-site-product");
  assert.equal(classify("https://www.bunnings.com.au/products/building-hardware/timber").kind, "non-product");
  assert.equal(classify("https://www.mitre10.com.au/x-7519762").kind, "offsite");
});

test("metrics: precision at 5, recall at 10, reciprocal rank, duplicates counted once", () => {
  const m = metrics(["a", "x", "b", "b", null, "y", "c"], new Set(["a", "b", "c", "d"]));
  assert.equal(m.p5, 2 / 5);
  assert.equal(m.r10, 3 / 4);
  assert.equal(m.mrr, 1);
  assert.equal(metrics(["x", "a"], new Set(["a"])).mrr, 0.5);
  assert.equal(metrics(["x"], new Set(["a"])).mrr, 0);
});
