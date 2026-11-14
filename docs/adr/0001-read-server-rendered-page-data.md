# Read server-rendered page data

Status: accepted for the prototype. The owner can change it.

## Context

The server needs price, stock, aisle and bay at a chosen store. bunnings.com.au is a Next.js site behind Cloudflare. The browser calls `apis.prod.bunnings.com.au` for stock and price, and those endpoints need a bearer token. The same data is also embedded in every server-rendered page as `__NEXT_DATA__` JSON, already scoped to the store named in the `storeId` and `regionCode` cookies.

## Options

1. Read the embedded page data with plain HTTP. Needs no token and no browser.
2. Call the token-gated APIs. Needs a token the site issues to its own front end. Getting or reusing one means impersonating that front end.
3. Drive a headless browser. Works but is heavy, slow and closer to evading bot protection.

## Decision

Read the server-rendered page data (option 1) with a normal browser User-Agent and the two store cookies.

## Consequences

- No credentials, no browser and a small dependency list.
- The data is exactly what a shopper sees at that store.
- A product page is about 700 KB, so it is slower than an API call, and the server throttles to one request at a time.
- The parsed shapes are internal to the website and can change without notice. Parsers throw `SiteChangedError` on drift and a live contract test (`npm run test:live`) detects it.
- The server does not try to get, borrow or forge a token and does not work around Cloudflare. If the site starts blocking, it stops and says so.
