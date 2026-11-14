# bunnings-mcp

Unofficial, read-only MCP server for bunnings.com.au. TypeScript, Node 22, stdio.

## Commands

```sh
npm test            # offline unit and MCP smoke tests
npm run typecheck
npm run test:live   # LIVE=1, a few real requests, only when asked
npm run eval        # score the search benchmark
```

## Layout

| path | what |
|---|---|
| `src/` | `client.ts` (all site knowledge), `parse.ts` (pure parsers), `server.ts` (MCP adapter), `stores.ts`, `session.ts`, `cache.ts` |
| `test/` | unit tests, fixtures and the stdio smoke test |
| `eval/` | benchmark queries, labels, results and scoring |
| `data/stores.json` | all stores, built by `npm run build:stores` |
| `docs/` | architecture, ADRs and the benchmark write-up |

## Rules

- Site details stay in `client.ts` and `parse.ts`. Parsers are pure and throw `SiteChangedError` rather than guess.
- Stay low volume against the real site. No login, no token calls, no bot-protection workarounds.
- No personal details in the repo: no home location, personal store or names. Examples use the site default store (Mentone, 6400).
- Prose is one paragraph per line.
