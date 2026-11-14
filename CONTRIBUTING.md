# Contributing

## Checks

```sh
npm run typecheck
npm test
```

Both run offline. CI runs them on every push and pull request.

## When the website changes

A weekly workflow and `npm run test:live` run a search, a product page and a store page against the real site. When one fails with a `SiteChangedError`, the message names the missing path.

1. Run `npm run refresh:fixtures`. It makes four requests and rewrites `test/fixtures/search.json`, `product.json` and `store.json`, trimmed to the fields the parsers read.
2. Run `npm test`. The failing parser test shows what moved.
3. Update the path in `src/parse.ts` and the list in [docs/architecture.md][1].
4. Run `npm run test:live` to confirm.

The fixtures contain only public product and store data. Do not add cookies, tokens or the site's runtime config to them.

## Rebuilding the store list

`npm run build:stores` fetches `/stores.xml` and every store page, one per second, and rewrites `data/stores.json`. Run it a few times a year. It skips stores with no coordinates.

## Rerunning the search benchmark

1. `npm run eval:site` runs the 20 queries through the client and writes `eval/results/site-<date>.json`.
2. Run the same queries as web searches with `site:bunnings.com.au`, and save the first ten result URLs per query in `eval/results/web-<date>.json` in the same shape as the existing file.
3. Add labels for any new candidates to `eval/queries.json`.
4. `npm run eval` prints the scores.

## Style

Prose is one paragraph per line, present tense. Commits follow Conventional Commits.

[1]: docs/architecture.md#the-fragile-surface
