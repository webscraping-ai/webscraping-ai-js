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

// Structured data for a page on a supported site (YouTube, TikTok, X, LinkedIn, Instagram, Reddit, ...)
const video = await client.data({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
console.log(video.request_parameters.provider, video.data?.title);

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

### Structured data for supported sites (`/data`)

`data()` returns structured JSON for a public page on a supported site — for
example a YouTube video, TikTok profile, X post, LinkedIn company, Instagram
reel or Reddit thread. Pass the page's normal URL; the site (`provider`) and
page kind (`type`) are detected server-side. More sites and page types are
added on the server over time, so the client does **not** check the URL
against a list and sends it exactly as given. An unsupported URL or page type
returns a 400 (`BadRequestError`) that is not charged; its message lists what
is supported. The only client-side check is that `url` is a non-blank string.

Options:

- `url` (required).
- `country`: two-letter country code of the proxy used to fetch the page, `us`
  by default.
- `transcript`: YouTube videos only. Also fetch the video's transcript into
  `data.transcript`. It's null when no matching captions are available. If the
  transcript fetch itself fails, the whole request fails with a 500
  (`ServerError`) and is not charged.
- `transcript_language`: caption language to pick, e.g. `en` or `de`. Without
  it, English is preferred, then the first available track. If the video has
  no captions in that language, `data.transcript` is null.
- `params`: escape hatch for site-specific parameters added after this SDK
  version, sent as-is. Values must be strings, finite numbers or booleans
  (`null`/`undefined` are omitted). `api_key`, `url`, `__proto__` and the
  named option names (`country`, `transcript`, `transcript_language`) are
  rejected with `WebScrapingAIError`: use the named option instead.

None of the page-scraping options apply. Priced per site (see
[pricing](https://webscraping.ai/docs#data)), including pages that parse empty
(`parse_failed`) or no longer exist (`not_found`); unsupported URLs and failed
fetches are not charged.

```ts
import { WebScrapingAI, BadRequestError, type DataResult } from 'webscraping-ai';

const video: DataResult = await client.data({
  url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  transcript: true,
});
console.log(video.request_parameters.provider, video.request_parameters.type); // youtube video
if (video.parse_status === 'ok') console.log(video.data?.title);

// Narrow `data` with your own type (it is untyped JSON; the shape depends on provider/type):
const post = await client.data<{ title: string; score: number }>({
  url: 'https://www.reddit.com/r/programming/comments/abc123/example/',
});

try {
  await client.data({ url: 'https://example.com/' });
} catch (err) {
  if (err instanceof BadRequestError) console.log(err.message); // "Unsupported URL for /data. ..." (lists what is supported)
}
```

`provider`, `type` and `parse_status` are plain strings (new values appear as
sites are added), and `data` is `null` when nothing could be parsed.

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

Live smoke (hits production and uses credits: the account call, four page
calls with `js: false` and the datacenter proxy, `question` and `fields`, two
SERP searches (one plain, one two-page Austin, TX search billed per page
returned), a free `serpLocations()` lookup, one YouTube `/data` call, plus a
free `/data` call on example.com that must come back as a server-side 400; each
case asserts on the result shape and the script exits non-zero on any failure):

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
