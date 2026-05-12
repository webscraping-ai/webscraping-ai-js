# Changelog

All notable changes to `webscraping-ai` will be documented in this file.

## 4.0.0 — 2026-05-12

First release of the hand-authored JavaScript / TypeScript client. This is a
clean break from any earlier OpenAPI-generated client under the same package
name; the public surface is entirely new and intentionally not source-compatible
with prior versions.

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

### Migration from 3.x

3.x was OpenAPI-generated and had a class-per-tag layout
(`HTMLApi`, `TextApi`, …). 4.0 has no deprecation shims and no compatibility
layer; if you cannot update call sites, stay on the 3.x line.
