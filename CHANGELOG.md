# Changelog

All notable changes to `webscraping-ai` will be documented in this file.

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
