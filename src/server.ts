#!/usr/bin/env -S npx tsx
// Thin MCP adapter: maps each tool to the Bunnings client. No site knowledge lives here.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { Bunnings } from "./client.ts";
import { Session } from "./session.ts";
import { loadStores } from "./stores.ts";
import type { Store } from "./parse.ts";

const store = z.string().optional().describe("Store id, name, suburb or postcode. Defaults to the session store (see get_store).");
const text = (v: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(v, null, 1) }] });
const guard = (fn: (a: any) => Promise<unknown> | unknown) => async (a: any) => {
  try { return text(await fn(a)); }
  catch (e) { return { isError: true, content: [{ type: "text" as const, text: `${(e as Error).name}: ${(e as Error).message}` }] }; }
};
const storeSummary = (s: Store) => ({ id: s.id, name: s.name, address: `${s.address}, ${s.suburb} ${s.state} ${s.postcode}`, region: s.region });

export function buildServer(bunnings: Bunnings, session: Session): McpServer {
  const server = new McpServer({ name: "bunnings-mcp", version: "0.1.0" });

  server.registerTool("search_products", {
    description: "Search bunnings.com.au for products at a store. Returns item number, name, price, unit price, url and rating. Stock is not in search data: set in_stock_only to check each candidate's product page (slower, up to 15 requests).",
    inputSchema: { query: z.string().describe("Use the shop's catalogue words when results look wrong, for example \"nylon lock nut\" or \"TEKS screws\". Web search can find an item number for get_product."), store, in_stock_only: z.boolean().optional(), limit: z.number().int().min(1).max(36).optional() },
  }, guard((a) => bunnings.search(a.query, { store: a.store, inStockOnly: a.in_stock_only, limit: a.limit })));

  server.registerTool("get_product", {
    description: "Product details from a bunnings.com.au URL or item number: price, specs, stock, aisle/bay, click and collect and delivery flags.",
    inputSchema: { url_or_item_number: z.string(), store },
  }, guard((a) => bunnings.getProduct(a.url_or_item_number, { store: a.store })));

  server.registerTool("check_stock", {
    description: "Stock and aisle/bay for a list of item numbers at one store, sorted by aisle. Missing data is reported as \"unknown\". Set nearby_stores (0-5) to also check the closest other stores for items not in stock.",
    inputSchema: { item_numbers: z.array(z.string()).min(1).max(30), store, nearby_stores: z.number().int().min(0).max(5).optional() },
  }, guard(async (a) => {
    const r = await bunnings.checkStock(a.item_numbers, { store: a.store, nearby: a.nearby_stores });
    return {
      store: r.store, storeId: r.storeId,
      items: r.rows.map((x) => ({ ...x, aisle: x.aisle ?? "unknown", bay: x.bay ?? "unknown", status: x.stock.status, quantity: x.stock.quantity ?? "unknown", stock: undefined })),
    };
  }));

  server.registerTool("find_stores", {
    description: "Find Bunnings stores by name, suburb, postcode or state, nearest first when lat and lon are given. Use it to find a store id.",
    inputSchema: { query: z.string().optional(), lat: z.number().optional(), lon: z.number().optional(), limit: z.number().int().min(1).max(20).optional() },
  }, guard((a) => bunnings.stores.find(a).map((s) => ({ ...storeSummary(s), postcode: s.postcode, state: s.state, phone: s.phone, distanceKm: s.distanceKm, hours: s.hours }))));

  server.registerTool("set_store", {
    description: "Set the default store for this session (kept in memory until the server restarts). Accepts a store id, or a name, suburb or postcode that matches one store.",
    inputSchema: { store: z.string() },
  }, guard((a) => storeSummary(session.set(a.store))));

  server.registerTool("get_store", {
    description: "The current default store for this session.",
    inputSchema: {},
  }, guard(() => storeSummary(session.get())));

  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const stores = loadStores();
  const session = new Session(stores);
  await buildServer(new Bunnings({ stores, session }), session).connect(new StdioServerTransport());
}
