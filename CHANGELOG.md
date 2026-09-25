# Changelog

All notable changes to `webscraping-ai` will be documented in this file.

## 4.1.0 — 2026-09-25

### Added

- `serp({ q, engine?, gl?, hl?, page? })` for the new `/serp` endpoint: parsed search engine results for a query. Resolves to the new exported `SerpResult` type (`SerpOptions` and `SerpOrganicResult` are exported too). Flat 15 credits per search; failed searches are not charged.
- `serp()` validates its input before sending: a non-string, empty or whitespace-only `q`, or a `page` that isn't a safe integer >= 1 (`NaN`, `1.5`, `0`, `-3`, `1e21`, ...), rejects with `WebScrapingAIError` and no request is made (the server also rejects an invalid page with a 400, not billed; checking client-side saves the round trip). `q` is sent untrimmed. Pages are 1–100: the server rejects a `page` above 100 with a 400.
- `bin/smoke.ts` now asserts on result shape (non-empty results, SERP `organic_results` and echoed `q`, a non-empty `selected_multiple` match, `fields` `result` key), runs page tools with `js: false` + datacenter proxy (~31 credits; README's old "~17" was wrong), catches every error per case, redacts the API key from failure output and collapses whitespace in previews.

### Fixed

- Transport errors no longer expose the API key: runtime error text can embed the request URL (e.g. `Failed to parse URL from …` for a malformed `baseUrl`), and `api_key=…` is now replaced with `api_key=[REDACTED]` in `APIConnectionError`/`APITimeoutError` messages.

## 4.0.2 — 2026-07-17

### Changed

- Documentation: expanded README — API docs, signup/dashboard links, badges, and links to the other official clients; package metadata homepage now points to https://webscraping.ai where it previously pointed at GitHub.

## 4.0.1 — 2026-06-21

### Fixed

- The per-request timeout now also covers reading the response body: a stalled `response.json()` / `response.text()` is aborted and surfaced as `APITimeoutError` instead of hanging past `timeoutMs`.
- `selector` (`selected`) and `selectors` (`selectedMultiple`) are now optional in the TypeScript types; omitting them returns whole-page HTML, matching the API.

## 4.0.0 — 2026-05-12

First release of the official JavaScript / TypeScript client.

The version starts at `4.0.0` to keep the version line aligned with the
other hand-authored WebScraping.AI SDKs (Ruby, Python, PHP — all at 4.0.x);
there is no `webscraping-ai` 1.x / 2.x / 3.x on npm.

### Highlights

- Single `WebScrapingAI` class with seven async methods, one per endpoint:
  `html`, `text`, `selected`, `selectedMultiple`, `question`, `fields`,
  `account`.
- Each method takes a single options object — `client.html({ url, ... })` —
  matching the convention used by Anthropic and OpenAI's JS SDKs.
- Zero runtime dependencies. Uses the platform's native `fetch` (Node 20+,
  Bun, Deno, Cloudflare Workers, browsers).
- Ships ESM, CJS, and TypeScript declarations from a single TypeScript source.
- Typed error hierarchy: `WebScrapingAIError` → `APIError` and its per-status
  subclasses, plus `APITimeoutError` / `APIConnectionError` for transport
  failures.
- `WEBSCRAPING_AI_API_KEY` is read from the environment as a fallback when no
  `apiKey` is passed to the constructor.
