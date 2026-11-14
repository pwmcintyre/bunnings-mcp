# Search benchmark

Question: does Bunnings' own site search beat `site:bunnings.com.au` web search for finding the right products?

## Method

Twenty generic hardware queries (3 exact, 5 spec-driven, 5 vague, 4 brand, 3 small-item) were run through two arms on 2026-11-14. The site arm calls the client's `search` for the site's default store (Mentone, 6400) and takes the top ten. The web arm runs `<query> site:bunnings.com.au` through the Claude Code WebSearch tool in standard mode and takes the first ten result URLs. Relevant items were labelled by pooling the candidates from both arms and judging each against the criteria in `eval/queries.json`. A web result counts as a hit only if it is a product page on www.bunnings.com.au. `.co.nz` and `trade.bunnings.com.au` product pages, category pages, forum posts and other sites occupy a slot but never count as relevant. Raw results are in `eval/results/` and `npm run eval` reproduces the scores.

## Results

| measure | site search | web search |
|---|---|---|
| precision@5 | 0.58 | 0.49 |
| recall@10 (against the pooled labels) | 0.66 | 0.70 |
| MRR | 0.74 | 0.75 |
| results that are warehouse product pages | 100% (200 of 200) | 57% (114 of 200) |
| results on the wrong Bunnings site (.co.nz, trade) | 0% | 25% (49) |
| other Bunnings pages (category, DIY advice, forum) | 0% | 12% (24) |
| results from other sites | 0% | 6% (13) |
| price scoped to the chosen store | yes, on every result | no |
| stock and aisle | no in search data, one product page each | no |
| latency per query | about 1.0 s (median 1.05 s) | not measured |

By query type, precision@5 for site against web: exact 0.47 vs 0.20, spec 0.56 vs 0.40, vague 0.48 vs 0.40, brand 0.90 vs 0.70, small items 0.47 vs 0.80. MRR for site against web: exact 0.71 vs 0.71, spec 0.80 vs 0.73, vague 0.67 vs 0.74, brand 1.00 vs 0.75, small items 0.44 vs 0.83.

Precision@5 is capped by the number of relevant items. For `treated pine 90x45 2.4m` only two items are relevant, so the best possible score is 0.40.

## Notable queries

- `Dulux Weathershield 4L`: site search returns ten relevant Dulux paints. The first seven web results are bunnings.co.nz pages, so web precision@5 is 0.00.
- `Ryobi 18v drill`: site search returns eight relevant kits and drills in its top ten. The first ten web results are Ryobi's own site and bunnings.co.nz pages, with no Bunnings Australia product page among them.
- `50mm PVC pressure pipe 3m`: web search puts the right item (Holman 50mm x 3m Class 12 pressure pipe) first. Site search puts a 50mm DWV drain pipe first and the pressure pipe seventh.
- `nyloc nut M10`: the site calls them "nylon lock nuts". Site search returns hand nuts and U-bolts, none relevant. Web search finds both Pinnacle M10 nylon lock nuts.
- `self drilling screw 12g x 20mm`: the site's catalogue says "TEKS" and "sheet metal screws". Site search ranks a 25mm and a 35mm screw above the first 20mm one, and returns only two 20mm screws in its top five. Web search returns 12G x 20mm Buildex screws throughout.
- `M12 threaded rod 1m`: no 1m M12 rod exists. The best substitute is a 1.2m rod. Site search returns camera rod connectors and sewing thread. Web search ranks the 1.2m rod sixth, between NZ pages.
- `bolt threaded both ends`: neither arm returns threaded rod or studding, the obvious answer. Only one hanger bolt is labelled, which is why recall for this query is not informative.

Site search is consistent for brand and size-in-name queries and always returns a store-priced product page. It fails when the shopper's words differ from the catalogue's words, and then returns loosely matching products (partial matching is enabled in the request the site sends). Web search is better at that vocabulary gap because it matches on page text, but it leaks other sites and other countries.

## Known issue: bay mismatch

For the same item and store, `product-fulfilment` and `product-aisle-item-location` agree on the aisle and can differ on the bay. The server reports the fulfilment value.

| item | store | fulfilment | aisle query |
|---|---|---|---|
| 0125995 | Mentone | Aisle 12, Bay 17 | Aisle 12, Bay 9 |
| 0125995 | Armadale WA | Aisle 11, Bay 7 | Aisle 11, Bay 12 |
| 0125995 | a VIC metro store | Aisle 11, Bay 17 | Aisle 11, Bay 14 |
| 8032174 | Mentone | Aisle 403, Bay 3 | Aisle 403, Bay 3 |

## Limitations

- One labeller, and the labeller also judged what counts as relevant. Another person could label differently, especially for vague queries.
- Twenty queries is a small set. Differences of a few hundredths are noise.
- Labels cover the pool of both arms' top ten. A relevant item that neither arm returned is unlabelled and counts against both.
- The web arm is the WebSearch tool's search engine, not Google, and its results move over time. Results are one run on one day.
- The web arm's latency was not measured. The site arm's latency is the network round trip from one machine.
- The site arm used one store. Rankings could differ at other stores.
