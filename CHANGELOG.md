# Changelog

All notable changes to `webscraping-ai` will be documented in this file.

## 4.3.0 — 2026-10-24

### Added

- `serp()` takes new optional `pages`, `location`, `uule`, `lat`, `lon` and `radius` options. Every search runs from one fixed location (`location`, `lat` + `lon` or `uule`, otherwise the capital of the `gl` country), so repeats and later pages are consistent; `gl` defaults to the location's country. `location` is a name (`'Austin,Texas,United States'`, `'Austin, TX'`) or an id from `serpLocations()`, sent as given. `pages` (1–5) fetches consecutive pages as one de-duplicated list, billed per results page returned (see https://webscraping.ai/docs#serp).
- `serp()` validates the new options before sending: `pages` or `radius` that isn't a safe integer >= 1, or `lat`/`lon` that isn't a finite number, rejects with `WebScrapingAIError` and no request is made. Combinations and ranges stay server-side (400, not charged). `lat`/`lon` are sent as plain decimals with at most 7 fractional digits (`1e-7` → `0.0000001`, `48` → `48`), since the server rejects exponent notation.
- `serpLocations({ q?, limit? })` for the new `GET /serp/locations` endpoint (free): look up names for `location`, most populous first. Resolves to the new exported `SerpLocation[]` (`id`, `google_id`, `google_parent_id`, `name`, `canonical_name`, `country_code`, `target_type`, `reach`, `gps` as `[longitude, latitude]`); `SerpLocationsOptions` is exported too. A `limit` that isn't a safe integer >= 1 rejects with `WebScrapingAIError`.
- `SerpResult` gains the optional `search_parameters.pages` / `location_requested` / `location_used` / `lat` / `lon` / `radius`, `organic_results[].page` and `pagination.pages_returned`. With `pages` > 1, `position` counts through the combined list.
- The `serp()` `params` escape hatch also rejects the new option names (`pages`, `location`, `uule`, `lat`, `lon`, `radius`).
- `bin/smoke.ts` adds a two-page `location: 'Austin, TX'` search (asserts non-empty `organic_results` and `location_used` containing `Austin`) and a `serpLocations({ q: 'austin', limit: 3 })` lookup.

### Changed

- Docs: stop stating credit prices (they're set server-side and change); link to https://webscraping.ai/docs pricing instead.

## 4.2.1 — 2026-09-26

### Security

- Dev dependencies updated for open Dependabot alerts (`vitest` 2 → 4, `vite`, `esbuild`, `postcss`, `js-yaml`, `brace-expansion`). The SDK has no runtime dependencies, so the published code is unchanged apart from formatting.

## 4.2.0 — 2026-09-25

### Added

- `data({ url, country?, transcript?, transcript_language?, params? })` for the new `/data` endpoint: structured JSON for a page on a supported site (e.g. YouTube, TikTok, X, LinkedIn, Instagram, Reddit; more are added server-side). Resolves to the new exported `DataResult<T = Record<string, unknown>>` (`request_parameters: DataRequestParameters`, `parse_status: string`, `data: T | null`); `DataOptions`, `DataRequestParameters` and `ExtraParamValue` are exported too. Priced per site (see https://webscraping.ai/docs#data).
- The URL is sent exactly as given and never checked against a list of sites. An unsupported URL or page type returns a 400 (`BadRequestError`) that is not charged; its message lists what is supported. A non-string or blank `url` rejects with `WebScrapingAIError` and no request is made.
- `transcript` (YouTube videos only) also fetches the video's transcript into `data.transcript`; it's null when no matching captions are available, and if the transcript fetch itself fails the whole request fails with a 500 (`ServerError`) and is not charged.
- `params` escape hatch on `data()` **and `serp()`**: extra query parameters sent as-is, for options added server-side later. Values must be strings, finite numbers or booleans (`null`/`undefined` are omitted). Rejected with `WebScrapingAIError`, before any request: `api_key`, `__proto__`, the endpoint's required argument (`url` / `q`), and any named option name (`country`/`transcript`/`transcript_language` on `data`, `engine`/`gl`/`hl`/`page` on `serp`) — use the named option instead.
- `bin/smoke.ts` adds a YouTube `/data` call (asserts `parse_status` `ok`, provider `youtube`, a non-empty `data.title`) and an example.com call that must be rejected by the server with a 400 whose message contains `Unsupported URL`.

### Fixed

- A string containing an unpaired UTF-16 surrogate (e.g. `'\uD800'`) in any parameter, on any endpoint, now rejects with `WebScrapingAIError` instead of a raw `URIError` from `encodeURIComponent`.

## 4.1.0 — 2026-09-25

### Added

- `serp({ q, engine?, gl?, hl?, page? })` for the new `/serp` endpoint: parsed search engine results for a query. Resolves to the new exported `SerpResult` type (`SerpOptions` and `SerpOrganicResult` are exported too). Priced per search (see https://webscraping.ai/docs#serp); failed searches are not charged.
- `serp()` validates its input before sending: a non-string, empty or whitespace-only `q`, or a `page` that isn't a safe integer >= 1 (`NaN`, `1.5`, `0`, `-3`, `1e21`, ...), rejects with `WebScrapingAIError` and no request is made (the server also rejects an invalid page with a 400, not billed; checking client-side saves the round trip). `q` is sent untrimmed. Pages are 1–100: the server rejects a `page` above 100 with a 400.
- `bin/smoke.ts` now asserts on result shape (non-empty results, SERP `organic_results` and echoed `q`, a non-empty `selected_multiple` match, `fields` `result` key), runs page tools with `js: false` + datacenter proxy to keep the sweep cheap, catches every error per case, redacts the API key from failure output and collapses whitespace in previews.

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
