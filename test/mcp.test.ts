import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

let client: Client;
before(async () => {
  client = new Client({ name: "smoke", version: "0" });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: ["--import", "tsx", "test/stdio-server.ts"], env: { ...process.env } as Record<string, string> }));
});
after(() => client.close());

const call = async (name: string, args: Record<string, unknown> = {}) => {
  const r: any = await client.callTool({ name, arguments: args });
  return { isError: !!r.isError, data: r.isError ? r.content[0].text : JSON.parse(r.content[0].text) };
};

test("lists all six tools", async () => {
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((t) => t.name).sort(), ["check_stock", "find_stores", "get_product", "get_store", "search_products", "set_store"]);
});

test("search_products", async () => {
  const { data } = await call("search_products", { query: "treated pine", limit: 3 });
  assert.equal(data.results.length, 3);
  assert.equal(data.results[0].itemNumber, "8032174");
});

test("get_product by url", async () => {
  const { data } = await call("get_product", { url_or_item_number: "https://www.bunnings.com.au/x_p8032174" });
  assert.equal(data.stock.status, "in_stock");
  assert.equal(data.stock.locations[0].aisle, "403");
});

test("check_stock with nearby fallback", async () => {
  const { data } = await call("check_stock", { item_numbers: ["8032174"], store: "Dandenong", nearby_stores: 2 });
  assert.equal(data.items[0].status, "out_of_stock");
  assert.equal(data.items[0].aisle, "unknown");
  assert.deepEqual(data.items[0].elsewhere.map((x: any) => x.storeId), ["6222", "6400"]);
  assert.equal(data.items[0].elsewhere[1].aisle, "403");
});

test("find_stores", async () => {
  const { data } = await call("find_stores", { query: "joondalup" });
  assert.equal(data[0].id, "2010");
  const near = await call("find_stores", { lat: -37.99, lon: 145.2, limit: 1 });
  assert.equal(near.data[0].name, "Dandenong");
});

test("set_store and get_store", async () => {
  const g = (await call("get_store")).data;
  assert.equal(g.id, "6400");
  assert.deepEqual(g.preferred.map((x: any) => x.id), ["6400"]);
  assert.equal((await call("set_store", { store: "Dandenong" })).data.id, "6111");
  assert.equal((await call("get_store")).data.id, "6111");
  const bad = await call("set_store", { store: "Atlantis" });
  assert.ok(bad.isError);
  assert.match(bad.data, /No store matches/);
});
