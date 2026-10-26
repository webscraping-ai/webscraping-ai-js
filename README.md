# webscraping-ai

[![npm](https://img.shields.io/npm/v/webscraping-ai.svg)](https://www.npmjs.com/package/webscraping-ai)
[![CI](https://github.com/webscraping-ai/webscraping-ai-js/actions/workflows/ci.yml/badge.svg)](https://github.com/webscraping-ai/webscraping-ai-js/actions/workflows/ci.yml)

Official JavaScript / TypeScript client for the [WebScraping.AI](https://webscraping.ai)
API — web scraping with Chromium JavaScript rendering, rotating
datacenter/residential/stealth proxies, and AI-powered question answering and
structured field extraction on any page. See the
[API documentation](https://webscraping.ai/docs) for the full parameter reference.

## Install

```bash
npm install webscraping-ai
# or: pnpm add webscraping-ai / yarn add webscraping-ai / bun add webscraping-ai
```

Requires Node.js 20 or newer. Also works in any runtime with a global `fetch`
(Bun, Deno, Cloudflare Workers, modern browsers).

## Quick start

[Sign up](https://webscraping.ai/auth/sign_up) to get an API key — a free
trial, no credit card required. Your key lives in the
[dashboard](https://webscraping.ai/dashboard).

```ts
import { WebScrapingAI } from 'webscraping-ai';

const client = new WebScrapingAI({ apiKey: 'YOUR_API_KEY' });

// Full HTML
const html = await client.html({ url: 'https://example.com' });

// Visible text, optionally as structured JSON
const text = await client.text({
  url: 'https://example.com',
  text_format: 'json',
  return_links: true,
});

// CSS-selected HTML
const heading = await client.selected({ url: 'https://example.com', selector: 'h1' });
const multi = await client.selectedMultiple({
  url: 'https://example.com',
  selectors: ['h1', 'p'],
});

// LLM-powered helpers
const answer = await client.question({
  url: 'https://example.com',
  question: 'What is the page title?',
});
const fields = await client.fields({
  url: 'https://example.com',
  fields: { title: 'Main product title', price: 'Current product price' },
});

// Structured data for any public web page
const page = await client.data({
  url: 'https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html',
});
console.log(page.request_parameters.provider, page.data); // toscrape.com { title: 'A Light in the Attic', ... }

// Account quota
const info = await client.account();
```

### Search engine results (SERP)

`serp()` returns parsed Google results for a query. It takes `q` (required),
`engine` (`'google'`, the default), `gl` (country; defaults to the country of
the location, otherwise `'us'`), `hl` (language, default `'en'`), `page`
(1–100, 10 results per page; the server rejects values above 100 with a 400),
`pages`, `location`, `uule`, `lat`, `lon` and `radius` — none of the
page-scraping options apply. `params` passes extra scalar query parameters
through as-is, with the same rules as `data()`'s (`api_key`, `q`, `__proto__`
and the named option names are rejected).
Billed per results page returned (see [pricing](https://webscraping.ai/docs#serp)); failed searches are not charged.

Every search runs from one fixed location — `location`, `lat` + `lon` or
`uule`, otherwise the capital of the `gl` country — so repeats and later pages
are consistent, and `gl` defaults to the location's country. `location` is a
name such as `'Austin,Texas,United States'` or `'Austin, TX'`, or an `id` from
`serpLocations()`; an unknown name returns a 400 (not charged). `radius` (meters,
1–1000) applies around `location` or `lat`/`lon`. `pages` (1–5) fetches
consecutive pages starting at `page` as one de-duplicated list: `position`
counts through the combined list, each result gets a `page` field and
`pagination.pages_returned` says how many pages came back (and were billed).
Combinations (`location` vs `uule` vs `lat`/`lon`, `radius` without a location)
and ranges are checked by the server (400, not charged).

The client validates before sending: an empty or whitespace-only `q`, a
`page`, `pages` or `radius` that isn't an integer >= 1, or a `lat`/`lon` that
isn't a finite number, rejects with `WebScrapingAIError` and no request (or
charge) is made. `lat`/`lon` are sent as plain decimals with at most 7
fractional digits (`1e-7` goes out as `0.0000001`).

```ts
import { WebScrapingAI, type SerpResult } from 'webscraping-ai';

const serp: SerpResult = await client.serp({ q: 'coffee machines', gl: 'us', hl: 'en', page: 1 });

for (const r of serp.organic_results) {
  console.log(`${r.position}. ${r.title} — ${r.link}`);
}
const nextPage = serp.pagination.next; // undefined on the last page

// Two pages of results as one list, searched from Austin, Texas
const local = await client.serp({ q: 'coffee machines', location: 'Austin, TX', pages: 2 });
console.log(local.search_parameters.location_used); // 'Austin,Texas,United States'
```

`serpLocations()` looks up names for `location` (free). It takes an optional
`q` (part of an English location name) and `limit` (1–10, default 10) and
resolves to `SerpLocation[]`, most populous first; pass a result's
`canonical_name` (or `id`) as `location`:

```ts
const [austin] = await client.serpLocations({ q: 'austin' });
// { id: '1026201', canonical_name: 'Austin,Texas,United States', country_code: 'US',
//   target_type: 'City', reach: 974447, gps: [-97.7431, 30.2672], ... }
await client.serp({ q: 'coffee machines', location: austin!.canonical_name });
```

Optional fields (`snippet`, `date`, `related_searches`, `pagination.next`,
`search_information.showing_results_for` / `total_results`, and the location
and multi-page fields) are omitted from the response when absent, not set to
`null`.

### Structured data for any page (`/data`)

`data()` returns structured JSON for any public web page. Pass the page's
normal URL; the site (`provider`, e.g. `toscrape.com`) and the kind of page
(`type`, e.g. `product`) are detected server-side. Some popular sites have
dedicated parsers with fixed fields; for other sites, an AI model learns the
structure of each new kind of page once, and from then on pages of that kind
on that site return data straight away for every user. The client sends the
URL exactly as given; the only client-side check is that `url` is a non-blank
string.

Options:

- `url` (required).
- `country`: two-letter country code of the proxy used to fetch the page, `us`
  by default.
- `transcript`: video pages on sites with a dedicated parser only. Also fetch
  the video's transcript into `data.transcript`. It's null when no matching
  captions are available. If the transcript fetch itself fails, the whole
  request fails with a 500 (`ServerError`) and is not charged.
- `transcript_language`: with `transcript: true`, the caption language to
  pick, e.g. `en` or `de`. Without it, English is preferred, then the first
  available track. If the video has no captions in that language,
  `data.transcript` is null.
- `params`: escape hatch for parameters added after this SDK version, sent
  as-is. Values must be strings, finite numbers or booleans
  (`null`/`undefined` are omitted). `api_key`, `url`, `__proto__` and the
  named option names (`country`, `transcript`, `transcript_language`) are
  rejected with `WebScrapingAIError`: use the named option instead.

Charged results include pages that parse empty (`parse_failed`) or no longer
exist (`not_found`); failed fetches are not charged. See
[pricing](https://webscraping.ai/docs#data).

The first request for a new kind of page also learns its structure, so it can
take up to about 45 seconds; keep the client's `timeoutMs` (60 seconds by
default) above that. Two error responses need handling on pages without a
dedicated parser, and neither is charged:

- **503 `structure_processing`**: learning the page's structure took longer
  than the request, or another request is already learning that site. The body is `{"message": "...", "error_code":
"structure_processing", "retry_after": 30}` (plus a `Retry-After` header).
  `data()` rejects with a generic `APIError` (`status` 503; `error_code` and
  `retry_after` are in the JSON `responseBody`). Retry after `retry_after`
  seconds; the retry can return data (if learning failed meanwhile, it
  may learn again or return the 422 below).
- **422 `structure_unavailable`**: no structured data could be found (empty
  page, login wall). `data()` rejects with a generic `APIError` (`status`
  422; `error_code` is in the JSON `responseBody`). Use `fields()`
  (`/ai/fields`) for such pages instead.

Redirects within the same site (http→https, `www`, trailing slash) are
followed; a redirect to another site fails with a 500 (`ServerError`,
`error_code` `target_redirect`, the target in the message), not charged.
Starting too many new kinds of pages in an hour returns a 429
(`RateLimitError`, `error_code` `rate_limited`).

```ts
import { WebScrapingAI, APIError, type DataResult } from 'webscraping-ai';

const url = 'https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html';

async function getData(): Promise<DataResult> {
  try {
    return await client.data({ url });
  } catch (err) {
    if (!(err instanceof APIError) || err.status !== 503) throw err;
    // structure_processing: wait retry_after seconds, then try once more
    const { retry_after = 30 } = JSON.parse(err.responseBody ?? '{}') as { retry_after?: number };
    await new Promise((r) => setTimeout(r, retry_after * 1000));
    return client.data({ url });
  }
}

try {
  const page = await getData();
  console.log(page.request_parameters.provider, page.request_parameters.type); // toscrape.com product
  if (page.parse_status === 'ok') console.log(page.data); // { title: 'A Light in the Attic', price: 51.77, currency: 'GBP', ... }
} catch (err) {
  if (err instanceof APIError && err.status === 422) {
    // structure_unavailable: fall back to client.fields(...)
  } else throw err;
}

// Narrow `data` with your own type (it is untyped JSON; the shape depends on provider/type):
const book = await client.data<{ title: string; price: number; currency: string }>({ url });
```

`provider`, `type` and `parse_status` are plain strings (open sets), and
`data` is `null` when nothing could be parsed.

The constructor reads `WEBSCRAPING_AI_API_KEY` from the environment as a
fallback when running on Node, Deno, or Bun:

```ts
// WEBSCRAPING_AI_API_KEY="..." set in the environment
const client = new WebScrapingAI();
```

## Configuration

```ts
new WebScrapingAI({
  apiKey: 'YOUR_API_KEY',
  baseUrl: 'https://api.webscraping.ai', // default
  timeoutMs: 60_000, // default per-request timeout
  fetch: customFetch, // optional: bring your own fetch
});
```

## Error handling

Every non-2xx response is mapped to a typed `Error` subclass so you can `catch`
on the situation rather than parsing status codes:

```ts
import {
  WebScrapingAI,
  AuthenticationError,
  RateLimitError,
  PaymentRequiredError,
  APITimeoutError,
  APIConnectionError,
} from 'webscraping-ai';

const client = new WebScrapingAI({ apiKey: 'YOUR_API_KEY' });

try {
  await client.html({ url: 'https://example.com' });
} catch (err) {
  if (err instanceof AuthenticationError) {
    // 403 — wrong or missing API key
  } else if (err instanceof PaymentRequiredError) {
    // 402 — out of credits
  } else if (err instanceof RateLimitError) {
    // 429 — too many concurrent requests
  } else if (err instanceof APITimeoutError) {
    // request did not complete in time
  } else if (err instanceof APIConnectionError) {
    // transport-level failure (DNS, TLS, etc.)
  }
}
```

Full error hierarchy:

- `WebScrapingAIError` (base for everything)
  - `APIError` (HTTP response received, non-2xx)
    - `BadRequestError` — HTTP 400
    - `PaymentRequiredError` — HTTP 402
    - `AuthenticationError` — HTTP 403
    - `RateLimitError` — HTTP 429
    - `ServerError` — HTTP 500
    - `GatewayTimeoutError` — HTTP 504
  - `APITimeoutError` — no response, request timed out
  - `APIConnectionError` — no response, transport-level error

`APIError` instances expose `status`, `statusCode`, `statusMessage`, `body`,
and `responseBody`. The last four are populated when the API surfaces
target-page errors as a 500.

## Response shapes

The client returns the response body verbatim. Two endpoints currently return
shapes that differ from the OpenAPI examples — flagged here so you know what
to expect:

- **`fields`** wraps the extracted fields under `result`:
  `{ result: { title: '...', price: '...' } }`.
- **`selectedMultiple`** returns `string[][]`, not the flat `string[]` the
  spec implies.

These are upstream (spec/server) drifts; every official SDK reproduces them.

## Development

```bash
npm install
npm test           # vitest
npm run typecheck  # tsc --noEmit
npm run lint
npm run build      # tsup → dist/{index.js,index.cjs,index.d.ts}
```

Live smoke (hits production and uses real credits: page tools run with
`js: false` and the datacenter proxy to keep the cost down; two SERP searches
(one plain, one two-page Austin, TX search billed per page returned), a free
`serpLocations()` lookup, one `/data` call on a page on a site with a
dedicated parser, plus a `/data` call on example.com that must return a
success envelope, a 503 `structure_processing` or a 422
`structure_unavailable` (the last two are not charged); each case asserts on
the result shape and the script exits non-zero on any failure):

```bash
WEBSCRAPING_AI_API_KEY=... npm run smoke
```

## Links

- [WebScraping.AI](https://webscraping.ai) — features, pricing, signup
- [API documentation](https://webscraping.ai/docs)
- [Dashboard](https://webscraping.ai/dashboard) — API key, usage, request builder
- Other official clients: [Python](https://github.com/webscraping-ai/webscraping-ai-python) · [Ruby](https://github.com/webscraping-ai/webscraping-ai-ruby) · [PHP](https://github.com/webscraping-ai/webscraping-ai-php) · [Go](https://github.com/webscraping-ai/webscraping-ai-go) · [Java](https://github.com/webscraping-ai/webscraping-ai-java) · [.NET](https://github.com/webscraping-ai/webscraping-ai-dotnet) · [CLI](https://github.com/webscraping-ai/webscraping-ai-cli) · [MCP server](https://github.com/webscraping-ai/webscraping-ai-mcp-server) · [n8n node](https://github.com/webscraping-ai/webscraping-ai-n8n)
- Support: [support@webscraping.ai](mailto:support@webscraping.ai)

## License

MIT — see [LICENSE](LICENSE).
