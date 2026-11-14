# Search source

Status: proposed. The owner decides.

## Context

`search_products` needs a source of candidate products. Two are available: the site's own search (the `coveo-search` data on `/search/products`) and a web search restricted to `site:bunnings.com.au`. The [search benchmark](../eval/search-benchmark.md) compared them on 20 queries.

## Evidence

- Site search: precision@5 0.58, MRR 0.74, every result a store-priced product page, about one second per query.
- Web search: precision@5 0.49, MRR 0.75, 57 percent product pages, a quarter of results on bunnings.co.nz or the trade site, no store price.
- Site search wins on brand queries and queries that use the catalogue's words. Web search wins when the shopper's words differ from the catalogue's (nyloc nut, self drilling screw).

## Options

1. Site search only. Simple, store-scoped, no extra dependency.
2. Web search only. Better at vocabulary gaps but needs a search service, leaks other sites and has no store price.
3. Site search in the server, with the calling assistant retrying in catalogue vocabulary or using its own web search to find an item number, then `get_product`. Recommended.

## Proposed decision

Option 3. Keep `search_products` on site search. Put the vocabulary advice in the tool description ("nylon lock nut", "TEKS screws") and let the assistant fall back to web search for an item number when results look wrong. `get_product` accepts an item number or URL so the web result can be priced and stock-checked at the chosen store. The server does not call a web search service itself.

## Consequences

- No search dependency or key inside the server.
- Weak queries still need a second attempt by the assistant.
- The benchmark should be rerun when the site changes its search.
