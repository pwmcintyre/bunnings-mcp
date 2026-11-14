// Test double: the real MCP server over stdio, with fetch stubbed to serve fixtures.
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Bunnings } from "../src/client.ts";
import { buildServer } from "../src/server.ts";
import { Session } from "../src/session.ts";
import { STORES, clone, fixture, productFor, stubFetch } from "./helpers.ts";

const session = new Session(STORES, "6400");
const f = stubFetch((u, s) => {
  if (u.pathname === "/search/products") { const nd = clone(fixture("search")); nd.props.pageProps.dehydratedState.queries[0].queryKey[4] = s; return nd; }
  return productFor(s, s === "6400" ? { stock: 96, aisle: "403", bay: "3" } : { stock: 0 }, u.pathname.match(/_p(\d+)/)![1]);
});
await buildServer(new Bunnings({ stores: STORES, session, fetch: f, delayMs: 0 }), session).connect(new StdioServerTransport());
