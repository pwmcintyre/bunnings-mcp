# bunnings-mcp

An unofficial, read-only [MCP](https://modelcontextprotocol.io) server for the Australian Bunnings Warehouse website (bunnings.com.au). It lets an AI assistant check a product from a pasted URL, look up price, aisle and bay at a store, check stock across a shopping list, and search for substitutes.

This project is not affiliated with, endorsed by or connected to Bunnings Group Limited. It reads the public pages of the website anonymously, the same pages a browser sees. It does not log in, add to a trolley or place orders. The website can change at any time and break it. Prices and stock are whatever the website shows and can be out of date by the time you drive to the store.

## Tools

| tool | what it does |
|---|---|
| `search_products` | Site search at a store. Returns a full page (up to 36 rows, one request whatever `limit` is) of item number, name, price, unit price, URL and brand, with `returned`, `total` and `hasMore`; use `page` to continue. `in_stock_only` filters by stock using each candidate's product page (up to 15 extra requests). |
| `get_product` | Details from a product URL or item number: price, specs, stock quantity, aisle and bay, click and collect and delivery flags. |
| `check_stock` | Stock and aisle/bay for a list of item numbers, sorted by aisle. Leave out `store` to check the preferred stores; pass it only for a store the user names. With several preferred stores and no `store` argument, every preferred store is reported per item. Missing data is reported as `unknown`. Statuses apply only to the items checked. |
| `find_stores` | Finds stores by name, suburb, postcode or state, nearest first when `lat` and `lon` are given. Backed by `data/stores.json` (every Australian store). |
| `set_store` / `get_store` | Sets and reads the default store for the life of the server process. |

Every tool that takes a `store` accepts a store id, or a name, suburb or postcode that matches exactly one store. Stock status is one of `in_stock`, `out_of_stock`, `not_sold` (the store does not range the item) or `unknown`.

## Install

Requires Node 22 or newer.

### Agentic install

You can ask a coding agent such as Codex or Claude Code to install it. Give it this prompt:

```
install this: https://github.com/pwmcintyre/bunnings-mcp
```

An agent follows these steps:

1. Clone the repo to a location the user chooses.
2. Run `npm install` in the clone.
3. Ask the user for their nearest Bunnings store or stores, rather than guessing. Find ids with `npm run find:store -- <suburb or postcode>` (or the `find_stores` tool once installed).
4. Register the stdio server in the user's harness with the snippets below. The command is `npm start --silent --prefix <path to clone>` and the environment variable is `BUNNINGS_STORE_ID`, one id or an ordered comma-separated list.
5. Restart the harness and call `get_store` to confirm.

### Manual install

```sh
git clone https://github.com/pwmcintyre/bunnings-mcp bunnings-mcp
cd bunnings-mcp
npm install
```

### Claude Code

```sh
claude mcp add bunnings --env BUNNINGS_STORE_ID=6400 -- npm start --silent --prefix /absolute/path/to/bunnings-mcp
```

### Codex

Add to `~/.codex/config.toml`:

```toml
[mcp_servers.bunnings]
command = "npm"
args = ["start", "--silent", "--prefix", "/absolute/path/to/bunnings-mcp"]
env = { BUNNINGS_STORE_ID = "6400" }
```

### OpenCode

Add to `opencode.json`:

```json
{
  "mcp": {
    "bunnings": {
      "type": "local",
      "command": ["npm", "start", "--silent", "--prefix", "/absolute/path/to/bunnings-mcp"],
      "environment": { "BUNNINGS_STORE_ID": "6400" }
    }
  }
}
```

## Choosing your store

Price, stock and aisle all depend on the store. Set `BUNNINGS_STORE_ID` to your store's id, or to an ordered, comma-separated list such as `6400,6404,6174` (the first is the default; an unknown id stops the server at startup), or leave it unset to use the website's own default store (Mentone, 6400). Find your id by asking the assistant to run `find_stores` with your suburb or postcode, or run it from the shell:

```sh
npm run find:store -- mentone
```

The default can be changed during a session with `set_store`. It is held in memory and resets when the server restarts. `set_store` leaves the preferred list unchanged, and `get_store` returns both.

With several preferred stores, `check_stock` without a `store` argument reports every preferred store per item, in priority order, plus the first one with stock. Each store is one more sequential page fetch per item, so three stores make three times the requests. `get_product` and `search_products` use the default store only.

## Development

```sh
npm test               # unit tests and the MCP stdio smoke test (no network)
npm run typecheck
npm run test:live      # LIVE=1, about five requests to the real site, detects page changes
npm run build:stores   # rebuilds data/stores.json (about 310 requests, one per second)
npm run refresh:fixtures
npm run eval           # scores the search benchmark
```

See [docs/architecture.md](docs/architecture.md) for how it works, [docs/eval/search-benchmark.md](docs/eval/search-benchmark.md) for the search comparison, and [CONTRIBUTING.md](CONTRIBUTING.md) for refreshing fixtures when the site changes.

## Behaving politely

One request at a time, at least 500 ms apart, a 20 second timeout, a five minute in-memory cache, and no retries. If the site starts refusing requests (HTTP 403, 429 or 503) the tool reports it and stops. Do not point it at bulk jobs.
