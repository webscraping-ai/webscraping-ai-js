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

[Sign up](https://webscraping.ai/auth/sign_up) to get an API key — the free
trial includes 2,000 credits, no credit card required. Your key lives in the
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

## Links

- [WebScraping.AI](https://webscraping.ai) — features, pricing, signup
- [API documentation](https://webscraping.ai/docs)
- [Dashboard](https://webscraping.ai/dashboard) — API key, usage, request builder
- Other official clients: [Python](https://github.com/webscraping-ai/webscraping-ai-python) · [Ruby](https://github.com/webscraping-ai/webscraping-ai-ruby) · [PHP](https://github.com/webscraping-ai/webscraping-ai-php) · [Go](https://github.com/webscraping-ai/webscraping-ai-go) · [Java](https://github.com/webscraping-ai/webscraping-ai-java) · [.NET](https://github.com/webscraping-ai/webscraping-ai-dotnet) · [CLI](https://github.com/webscraping-ai/webscraping-ai-cli) · [MCP server](https://github.com/webscraping-ai/webscraping-ai-mcp-server) · [n8n node](https://github.com/webscraping-ai/webscraping-ai-n8n)
- Support: [support@webscraping.ai](mailto:support@webscraping.ai)

## License

MIT — see [LICENSE](LICENSE).
