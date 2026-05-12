# webscraping-ai

Official JavaScript / TypeScript client for the [WebScraping.AI](https://webscraping.ai) API.

> **4.0 is a hard break from earlier OpenAPI-generated SDKs.** The package has
> a new, idiomatic public surface — see [CHANGELOG.md](CHANGELOG.md).

## Install

```bash
npm install webscraping-ai
# or: pnpm add webscraping-ai / yarn add webscraping-ai / bun add webscraping-ai
```

Requires Node.js 20 or newer. Also works in any runtime with a global `fetch`
(Bun, Deno, Cloudflare Workers, modern browsers).

## Quick start

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

// Account quota
const info = await client.account();
```

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

Live smoke (hits production, costs ~17 credits):

```bash
WEBSCRAPING_AI_API_KEY=... npm run smoke
```

## License

MIT — see [LICENSE](LICENSE).
