/**
 * `WebScrapingAI` — the single public entry point for this library.
 *
 * All methods take a single options object (`{ url, ... }`) for clarity and
 * forward-compatibility with new optional params. Methods return parsed
 * response bodies (object for JSON responses, string for HTML/text).
 *
 *     const client = new WebScrapingAI({ apiKey: '...' });
 *     const html = await client.html({ url: 'https://example.com' });
 */

import { request, DEFAULT_BASE_URL, DEFAULT_TIMEOUT_MS, type FetchLike } from './transport.js';
import type { Params } from './query.js';
import { VERSION } from './version.js';
import { WebScrapingAIError } from './errors.js';

export interface ClientOptions {
  apiKey?: string;
  baseUrl?: string;
  /** Per-request timeout in milliseconds. Default: 60000. */
  timeoutMs?: number;
  /** Optional fetch implementation (defaults to global `fetch`). */
  fetch?: FetchLike;
}

/**
 * Options common to every endpoint. Each endpoint may add a few of its own
 * on top of these.
 */
export interface CommonRequestOptions {
  /** Custom HTTP headers to forward to the target page. */
  headers?: Record<string, string>;
  /** Maximum page-retrieval time in ms (API default: 10000, max 30000). */
  timeout?: number;
  /** Execute on-page JavaScript via a headless browser (API default: true). */
  js?: boolean;
  /** Max JS rendering time in ms after page load (API default: 2000). */
  js_timeout?: number;
  /** CSS selector to wait for before returning the page content. */
  wait_for?: string;
  /** Proxy pool: 'datacenter' | 'residential' | 'stealth'. */
  proxy?: 'datacenter' | 'residential' | 'stealth';
  /** Country of the proxy IP (e.g. 'us', 'gb'). */
  country?: string;
  /** Custom proxy URL: 'http://user:password@host:port'. */
  custom_proxy?: string;
  /** Device emulation: 'desktop' | 'mobile' | 'tablet'. */
  device?: 'desktop' | 'mobile' | 'tablet';
  /** Throw a 500-level API error if the target page returns a 404. */
  error_on_404?: boolean;
  /** Throw a 500-level API error if the target page redirects. */
  error_on_redirect?: boolean;
  /** Custom JavaScript snippet to evaluate on the target page. */
  js_script?: string;
}

export interface HtmlOptions extends CommonRequestOptions {
  url: string;
  /** Return the value returned by `js_script` instead of the rendered HTML. */
  return_script_result?: boolean;
  /** Response wrapping: 'json' wraps under `{html: "..."}`. */
  format?: 'json' | 'text';
}

export interface TextOptions extends CommonRequestOptions {
  url: string;
  text_format?: 'plain' | 'xml' | 'json';
  return_links?: boolean;
}

export interface SelectedOptions extends CommonRequestOptions {
  url: string;
  /** CSS selector of the area to return. Omit to return the whole-page HTML. */
  selector?: string;
  format?: 'json' | 'text';
}

export interface SelectedMultipleOptions extends CommonRequestOptions {
  url: string;
  /** CSS selectors of the areas to return. Omit to return the whole-page HTML. */
  selectors?: readonly string[];
}

export interface QuestionOptions extends CommonRequestOptions {
  url: string;
  question: string;
  format?: 'json' | 'text';
}

export interface FieldsOptions extends CommonRequestOptions {
  url: string;
  fields: Record<string, string>;
}

/**
 * Options for `serp()`. Query-shaped, not URL-shaped: none of the
 * page-scraping options in `CommonRequestOptions` apply to `/serp`.
 */
export interface SerpOptions {
  /** Search query. Required; must not be empty or whitespace-only. Sent untrimmed. */
  q: string;
  /** Search engine to query (API default: 'google'). */
  engine?: 'google';
  /**
   * Two-letter country code for the search. Defaults to the country of
   * `location`, `lat`/`lon` or `uule` when one is given, otherwise 'us'.
   */
  gl?: string;
  /** Two-letter language code for the results (API default: 'en'). */
  hl?: string;
  /**
   * Results page number, 1-based, 10 results per page (API default: 1).
   * Must be an integer >= 1; the server rejects values above 100 with a 400 (not billed).
   */
  page?: number;
  /**
   * Number of consecutive results pages to fetch in one call, starting at
   * `page` (API default: 1). Duplicates across pages are removed, `position`
   * counts through the combined list and each result gets a `page` field.
   * Billed per results page returned. Must be an integer >= 1; the server
   * rejects values above 5 (or past page 100) with a 400 (not billed).
   */
  pages?: number;
  /**
   * Where the search runs from: a location name such as
   * 'Austin,Texas,United States' or 'Austin, TX', or an `id` from
   * `serpLocations()`. Sent as given. An unknown name returns a 400 (not
   * billed). Cannot be combined with `uule`, `lat` or `lon`.
   */
  location?: string;
  /**
   * Google-encoded location ('w+CAIQICI…' or 'a+…'). Cannot be combined with
   * `location`, `lat` or `lon`.
   */
  uule?: string;
  /**
   * Latitude of the search origin in decimal degrees (-90 to 90). Requires
   * `lon`. Must be a finite number; sent as a plain decimal with at most 7
   * fractional digits.
   */
  lat?: number;
  /** Longitude of the search origin in decimal degrees (-180 to 180). Requires `lat`. */
  lon?: number;
  /**
   * Radius in meters around `location` or `lat`/`lon` (server: 1 to 1000).
   * Must be an integer >= 1.
   */
  radius?: number;
  /**
   * Extra query parameters sent as-is, for options added server-side after
   * this SDK version. Same rules as `DataOptions.params`: scalar values only;
   * `api_key`, `q`, `__proto__` and the named options (`engine`, `gl`, `hl`,
   * `page`, `pages`, `location`, `uule`, `lat`, `lon`, `radius`) are rejected.
   */
  params?: Readonly<Record<string, ExtraParamValue>>;
}

/** One organic (non-ad) result, in rank order. */
export interface SerpOrganicResult {
  /**
   * Rank within this page, starting at 1 on every page. With `pages` > 1 it
   * counts through the combined, de-duplicated list instead.
   */
  position: number;
  /** The results page this result came from. Present only when `pages` > 1. */
  page?: number;
  title: string;
  link: string;
  /** Hostname of `link` without a leading `www.`. */
  domain: string;
  /** Breadcrumb-style URL shown under the title; falls back to `domain`. */
  displayed_link: string;
  /** Result description snippet, when the engine shows one. */
  snippet?: string;
  /** Date shown next to the snippet, as displayed (absolute or relative). */
  date?: string;
}

/** Parsed search engine results returned by `GET /serp`. Optional keys may be absent. */
export interface SerpResult {
  /** The normalized parameters the search was run with. */
  search_parameters: {
    engine: string;
    q: string;
    gl: string;
    hl: string;
    page: number;
    /** The `pages` asked for. Present only when it is above 1. */
    pages?: number;
    /** The `location` or `uule` as sent. Omitted when neither was given. */
    location_requested?: string;
    /**
     * Canonical name of the location the search ran from (the `location`
     * match, or the capital of the `gl` country). Omitted for searches
     * located by `lat`/`lon` or a coordinate `uule`.
     */
    location_used?: string;
    /** Latitude the search was sent from. */
    lat?: number;
    /** Longitude the search was sent from. */
    lon?: number;
    /** The `radius` sent, when one was. */
    radius?: number;
  };
  /** What the engine reported about the search itself. */
  search_information: {
    /** The query the results are for; equals `q` unless a spelling fix was applied. */
    query_displayed: string;
    organic_results_state:
      'Results for exact spelling' | 'Empty showing fixed spelling results' | 'Fully empty';
    /** The auto-corrected query, present only when a spelling fix was applied. */
    showing_results_for?: string;
    /** Estimated total result count, when the upstream page reports it. */
    total_results?: number;
  };
  organic_results: SerpOrganicResult[];
  /** "Related searches" suggestions; omitted when the page shows none. */
  related_searches?: Array<{ query: string }>;
  pagination: {
    current: number;
    /** How many pages came back and were billed. Present only when `pages` > 1. */
    pages_returned?: number;
    /** Next page number after the last page returned; omitted when there is no further page. */
    next?: number;
  };
}

/** Options for `serpLocations()`. */
export interface SerpLocationsOptions {
  /** Part of a location name, e.g. 'austin'. Omit to get the most populous locations. */
  q?: string;
  /**
   * Maximum number of locations to return (API default: 10). Must be an
   * integer >= 1; the server rejects values above 10 with a 400.
   */
  limit?: number;
}

/** One location returned by `GET /serp/locations`. */
export interface SerpLocation {
  /** Location id (a string), usable as `serp()`'s `location`. */
  id: string;
  google_id: number;
  /** Parent geo target id; may be absent or null (e.g. for countries). */
  google_parent_id?: number | null;
  name: string;
  /** Full name to pass as `serp()`'s `location`. */
  canonical_name: string;
  country_code: string;
  /** e.g. 'City', 'District', 'State', 'Region', 'Country'. An open set. */
  target_type: string;
  /** Approximate population, used for ordering. */
  reach: number;
  /** Coordinates the search is sent from, as `[longitude, latitude]`. */
  gps: [longitude: number, latitude: number];
}

/**
 * A scalar value accepted in the `params` escape hatch of `data()` / `serp()`.
 * Numbers must be finite; `null`/`undefined` mean "omit".
 */
export type ExtraParamValue = string | number | boolean | null | undefined;

/**
 * Options for `data()`. URL-shaped; the page-scraping options in
 * `CommonRequestOptions` are not exposed for `data()`.
 */
export interface DataOptions {
  /**
   * URL of any public web page, e.g.
   * `https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html`.
   * Required; must be a non-blank string, and is sent exactly as given.
   */
  url: string;
  /** Two-letter country code of the proxy used to fetch the page, `us` by default. */
  country?: string;
  /**
   * Video pages on sites with a dedicated parser only. Also fetch the video's transcript into
   * `data.transcript`. It's null when no matching captions are available. If
   * the transcript fetch itself fails, the whole request fails with a 500
   * (`ServerError`) and is not charged.
   */
  transcript?: boolean;
  /**
   * With `transcript: true`, the caption language to pick, e.g. `en` or `de`. Without it, English is
   * preferred, then the first available track. If the video has no captions
   * in that language, `data.transcript` is null.
   */
  transcript_language?: string;
  /**
   * Extra query parameters sent as-is, for options added server-side after
   * this SDK version. Values must be strings, finite
   * numbers or booleans (`null`/`undefined` are omitted). `api_key`, `url`,
   * `__proto__` and the named options above (`country`, `transcript`,
   * `transcript_language`) are rejected: use the named option instead.
   */
  params?: Readonly<Record<string, ExtraParamValue>>;
}

/** How `/data` classified the requested URL. */
export interface DataRequestParameters {
  url: string;
  /** The site the page belongs to, e.g. 'toscrape.com'. An open set. */
  provider: string;
  /** The kind of page, e.g. 'product'. Also an open set. */
  type: string;
}

/**
 * Structured page data returned by `GET /data`. The shape of `data` depends on
 * `request_parameters.provider` and `.type`; pass your own `T` to narrow it.
 */
export interface DataResult<T = Record<string, unknown>> {
  request_parameters: DataRequestParameters;
  /**
   * 'ok', 'parse_failed' (fetched but not parsed; `data` may be null or
   * partial) or 'not_found'. All three are charged successes. Kept as a
   * plain string so new values round-trip.
   */
  parse_status: string;
  data: T | null;
}

export class WebScrapingAI {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: FetchLike;
  private readonly userAgent: string;

  constructor(options: ClientOptions = {}) {
    const apiKey = options.apiKey ?? readEnvApiKey();
    if (!apiKey) {
      throw new WebScrapingAIError(
        'apiKey is required. Pass it to the constructor or set the WEBSCRAPING_AI_API_KEY environment variable.',
      );
    }
    this.apiKey = apiKey;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    const fetchImpl = options.fetch ?? (globalThis.fetch as FetchLike | undefined);
    if (!fetchImpl) {
      throw new WebScrapingAIError(
        'No fetch implementation found. Pass one as `fetch` or run on Node 18+ / a runtime with a global fetch.',
      );
    }
    this.fetchImpl = fetchImpl;
    this.userAgent = `webscraping-ai-js/${VERSION}`;
  }

  /** `GET /html` — full HTML of the target page. */
  html(options: HtmlOptions): Promise<unknown> {
    return this.get('/html', options);
  }

  /** `GET /text` — visible text content of the target page. */
  text(options: TextOptions): Promise<unknown> {
    return this.get('/text', options);
  }

  /** `GET /selected` — HTML of a single CSS-selected page area. */
  selected(options: SelectedOptions): Promise<unknown> {
    return this.get('/selected', options);
  }

  /**
   * `GET /selected-multiple` — HTML of multiple CSS-selected page areas.
   *
   * **Response-shape note:** the live API currently wraps the result in an
   * outer array (`Array<Array<string>>`), not the flat array the spec
   * implies. The client passes the response through unchanged.
   */
  selectedMultiple(options: SelectedMultipleOptions): Promise<unknown> {
    return this.get('/selected-multiple', options);
  }

  /** `GET /ai/question` — LLM-generated answer about the target page. */
  question(options: QuestionOptions): Promise<unknown> {
    return this.get('/ai/question', options);
  }

  /**
   * `GET /ai/fields` — structured fields extracted from a page.
   *
   * **Response-shape note:** the API currently wraps the extracted fields
   * under a `result` key: `{ result: { title: '...', price: '...' } }`. The
   * client returns this raw shape.
   */
  fields(options: FieldsOptions): Promise<unknown> {
    return this.get('/ai/fields', options);
  }

  /**
   * `GET /serp` — parsed search engine results for a query. Billed per results
   * page returned (see https://webscraping.ai/docs#serp); failed searches are
   * not charged.
   *
   * Every search runs from one fixed location (`location`, `lat` + `lon` or
   * `uule`, otherwise the capital of the `gl` country), so repeats and later
   * pages stay consistent. Exclusivity and ranges of the location options are
   * checked server-side (400, not billed).
   *
   * Rejects with `WebScrapingAIError` (no request sent) when `q` is empty or
   * whitespace-only, `page`, `pages` or `radius` is not an integer >= 1, or
   * `lat`/`lon` is not a finite number. `q` and `location` are sent as given.
   */
  serp(options: SerpOptions): Promise<SerpResult> {
    if (typeof options?.q !== 'string' || options.q.trim() === '') {
      return Promise.reject(
        new WebScrapingAIError('q is required and must be a non-empty, non-whitespace string.'),
      );
    }
    const { q, engine, gl, hl, page, pages, location, uule, lat, lon, radius, params } = options;
    let query: Params;
    try {
      // isSafeInteger, not isInteger: 1e21 is an "integer" but serializes as
      // "1e+21", which the server rejects with a 400 (not billed); checking
      // client-side saves the round trip.
      checkPositiveInteger('page', page);
      checkPositiveInteger('pages', pages);
      checkPositiveInteger('radius', radius);
      const extra = extraParams(
        params,
        ['q'],
        ['engine', 'gl', 'hl', 'page', 'pages', 'location', 'uule', 'lat', 'lon', 'radius'],
      );
      query = {
        q,
        engine,
        gl,
        hl,
        page,
        pages,
        location,
        uule,
        lat: decimalDegrees('lat', lat),
        lon: decimalDegrees('lon', lon),
        radius,
        ...extra,
      };
    } catch (err) {
      return Promise.reject(err);
    }
    return this.get('/serp', query) as Promise<SerpResult>;
  }

  /**
   * `GET /serp/locations` — look up names for `serp()`'s `location`. Returns up
   * to 10 matching locations, most populous first; pass a result's
   * `canonical_name` (or `id`) as `location`. Matches English names. Free.
   *
   * Rejects with `WebScrapingAIError` (no request sent) when `limit` is not an
   * integer >= 1.
   */
  serpLocations(options: SerpLocationsOptions = {}): Promise<SerpLocation[]> {
    const { q, limit } = options ?? {};
    try {
      checkPositiveInteger('limit', limit);
    } catch (err) {
      return Promise.reject(err);
    }
    return this.get('/serp/locations', { q, limit }) as Promise<SerpLocation[]>;
  }

  /**
   * `GET /data` — structured JSON for any public web page. Some popular
   * sites have dedicated parsers with fixed fields; for other sites an AI
   * model learns each new kind of page once. Pricing:
   * https://webscraping.ai/docs#data. `parse_failed` and `not_found` results
   * are charged; failed fetches are not.
   *
   * The first request for a new kind of page also learns its structure, so
   * it can take up to about 45 seconds (keep `timeoutMs` above that). When
   * learning takes longer, or another request is already learning that
   * site, the API returns HTTP 503 with
   * `{ message, error_code: 'structure_processing', retry_after }` (not
   * charged), which rejects with a generic `APIError` (`status` 503;
   * `error_code` and `retry_after` are in the JSON `responseBody`): retry
   * after `retry_after` seconds, which can return data. When no structured data can be found (empty
   * page, login wall) the API returns a 422 `structure_unavailable` (not
   * charged), which rejects with a generic `APIError` (`status` 422); use
   * `fields()` for such pages.
   *
   * Rejects with `WebScrapingAIError` (no request sent) when `url` is not a
   * non-blank string, or `params` has a reserved/named key or a value that
   * isn't a string, finite number or boolean.
   */
  data<T = Record<string, unknown>>(options: DataOptions): Promise<DataResult<T>> {
    if (typeof options?.url !== 'string' || options.url.trim() === '') {
      return Promise.reject(
        new WebScrapingAIError('url is required and must be a non-empty, non-whitespace string.'),
      );
    }
    const { url, country, transcript, transcript_language, params } = options;
    let extra: Params;
    try {
      extra = extraParams(params, ['url'], ['country', 'transcript', 'transcript_language']);
    } catch (err) {
      return Promise.reject(err);
    }
    const query: Params = { url, country, transcript, transcript_language, ...extra };
    return this.get('/data', query) as Promise<DataResult<T>>;
  }

  /** `GET /account` — credit / quota info for the API key. */
  account(): Promise<unknown> {
    return this.get('/account', {});
  }

  private get(path: string, opts: object): Promise<unknown> {
    return request({
      baseUrl: this.baseUrl,
      path,
      apiKey: this.apiKey,
      params: opts as Params,
      timeoutMs: this.timeoutMs,
      fetchImpl: this.fetchImpl,
      userAgent: this.userAgent,
    });
  }
}

/**
 * Validates a `params` escape hatch and returns it as query params. Throws
 * `WebScrapingAIError` on a non-object, a reserved key (`api_key`, `__proto__`,
 * the endpoint's required arg), a key that repeats a named option (use the
 * option instead), or a value that isn't a string, finite number or boolean.
 */
function extraParams(
  params: unknown,
  required: readonly string[],
  named: readonly string[],
): Params {
  // Null prototype: a `__proto__` key can't reach Object.prototype (and is
  // rejected below anyway).
  const out: Params = Object.create(null) as Params;
  if (params === undefined || params === null) return out;
  if (typeof params !== 'object' || Array.isArray(params)) {
    throw new WebScrapingAIError('params must be a plain object.');
  }
  for (const [key, value] of Object.entries(params)) {
    if (key === 'api_key') {
      throw new WebScrapingAIError('params must not contain "api_key"; set it on the client.');
    }
    if (key === '__proto__') {
      throw new WebScrapingAIError('params must not contain "__proto__".');
    }
    if (required.includes(key) || named.includes(key)) {
      throw new WebScrapingAIError(
        `params must not contain "${key}"; use the named \`${key}\` option instead.`,
      );
    }
    if (value === null || value === undefined) continue;
    if (typeof value === 'number' && !Number.isFinite(value)) {
      throw new WebScrapingAIError(`params.${key} must be a finite number.`);
    }
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
      throw new WebScrapingAIError(`params.${key} must be a string, number or boolean.`);
    }
    out[key] = value;
  }
  return out;
}

/**
 * Throws `WebScrapingAIError` unless `value` is a safe integer >= 1.
 * `null`/`undefined` mean "omit", as in the query encoder.
 */
function checkPositiveInteger(name: string, value: unknown): void {
  if (value === undefined || value === null) return;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    throw new WebScrapingAIError(`${name} must be an integer >= 1.`);
  }
}

/**
 * Formats a latitude/longitude for the wire. The server accepts only plain
 * decimals (`-?digits(.digits)?`), and `String()` gives `1e-7` for tiny
 * values, so this uses at most 7 fractional digits (~1 cm) with trailing
 * zeros and a trailing `.` trimmed: `1e-7` -> `"0.0000001"`, `48` -> `"48"`.
 * Throws `WebScrapingAIError` unless `value` is a finite number;
 * `null`/`undefined` mean "omit".
 */
function decimalDegrees(name: string, value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new WebScrapingAIError(`${name} must be a finite number.`);
  }
  // Out-of-range values (|value| >= 1e21 stays exponential) are left for the
  // server's free 400.
  const fixed = value
    .toFixed(7)
    .replace(/(\.\d*?)0+$/, '$1')
    .replace(/\.$/, '');
  return fixed === '-0' ? '0' : fixed;
}

function readEnvApiKey(): string | undefined {
  // Guarded so we work in browsers / edge runtimes that have no `process`.
  if (typeof process !== 'undefined' && process.env) {
    return process.env.WEBSCRAPING_AI_API_KEY;
  }
  return undefined;
}
