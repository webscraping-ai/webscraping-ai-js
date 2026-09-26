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
  /** Two-letter country code for the search geolocation (API default: 'us'). */
  gl?: string;
  /** Two-letter language code for the results (API default: 'en'). */
  hl?: string;
  /**
   * Results page number, 1-based, 10 results per page (API default: 1).
   * Must be an integer >= 1; the server rejects values above 100 with a 400 (not billed).
   */
  page?: number;
  /**
   * Extra query parameters sent as-is, for options added server-side after
   * this SDK version. Same rules as `DataOptions.params`: scalar values only;
   * `api_key`, `q`, `__proto__` and the named options (`engine`, `gl`, `hl`,
   * `page`) are rejected.
   */
  params?: Readonly<Record<string, ExtraParamValue>>;
}

/** One organic (non-ad) result, in rank order. */
export interface SerpOrganicResult {
  /** Rank within this page, starting at 1 on every page. */
  position: number;
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
    /** Next page number; omitted when there is no further page. */
    next?: number;
  };
}

/**
 * A scalar value accepted in the `params` escape hatch of `data()` / `serp()`.
 * Numbers must be finite; `null`/`undefined` mean "omit".
 */
export type ExtraParamValue = string | number | boolean | null | undefined;

/**
 * Options for `data()`. URL-shaped, but none of the page-scraping options in
 * `CommonRequestOptions` apply to `/data` (the server picks fetching, proxy
 * and parsing per site).
 */
export interface DataOptions {
  /**
   * URL of a page on a supported site, e.g. a YouTube video, TikTok profile,
   * X post, LinkedIn company, Instagram reel or Reddit thread. Required; must
   * be a non-blank string, and is sent exactly as given. It is **not**
   * checked against a list of sites: more are added server-side. An
   * unsupported URL or page type returns a 400 (`BadRequestError`) that is
   * not charged; its message lists what is supported.
   */
  url: string;
  /** Two-letter country code of the proxy used to fetch the page, `us` by default. */
  country?: string;
  /**
   * YouTube videos only. Also fetch the video's transcript into
   * `data.transcript`. It's null when no matching captions are available. If
   * the transcript fetch itself fails, the whole request fails with a 500
   * (`ServerError`) and is not charged.
   */
  transcript?: boolean;
  /**
   * Caption language to pick, e.g. `en` or `de`. Without it, English is
   * preferred, then the first available track. If the video has no captions
   * in that language, `data.transcript` is null.
   */
  transcript_language?: string;
  /**
   * Extra query parameters sent as-is, for site-specific options added
   * server-side after this SDK version. Values must be strings, finite
   * numbers or booleans (`null`/`undefined` are omitted). `api_key`, `url`,
   * `__proto__` and the named options above (`country`, `transcript`,
   * `transcript_language`) are rejected: use the named option instead.
   */
  params?: Readonly<Record<string, ExtraParamValue>>;
}

/** How `/data` classified the requested URL. */
export interface DataRequestParameters {
  url: string;
  /** Detected site, e.g. 'youtube'. An open set: new sites are added server-side. */
  provider: string;
  /** Detected page kind, e.g. 'video', 'profile'. Also an open set. */
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
   * `GET /serp` — parsed search engine results for a query. Priced per search
   * (see https://webscraping.ai/docs#serp); failed searches are not charged.
   *
   * Rejects with `WebScrapingAIError` (no request sent) when `q` is empty or
   * whitespace-only, or `page` is not an integer >= 1. `q` is sent as given.
   */
  serp(options: SerpOptions): Promise<SerpResult> {
    if (typeof options?.q !== 'string' || options.q.trim() === '') {
      return Promise.reject(
        new WebScrapingAIError('q is required and must be a non-empty, non-whitespace string.'),
      );
    }
    const { q, engine, gl, hl, page, params } = options;
    // isSafeInteger, not isInteger: 1e21 is an "integer" but serializes as
    // "1e+21", which the server rejects with a 400 (not billed); checking
    // client-side saves the round trip.
    if (page !== undefined && (!Number.isSafeInteger(page) || page < 1)) {
      return Promise.reject(new WebScrapingAIError('page must be an integer >= 1.'));
    }
    let extra: Params;
    try {
      extra = extraParams(params, ['q'], ['engine', 'gl', 'hl', 'page']);
    } catch (err) {
      return Promise.reject(err);
    }
    return this.get('/serp', { q, engine, gl, hl, page, ...extra }) as Promise<SerpResult>;
  }

  /**
   * `GET /data` — structured JSON for a page on a supported site (e.g.
   * YouTube, TikTok, X, LinkedIn, Instagram, Reddit; more are added
   * server-side). Priced per site (see https://webscraping.ai/docs#data),
   * including `parse_failed` and `not_found` results; unsupported URLs and
   * failed fetches are not charged.
   *
   * The URL is sent unmodified and never checked against a list of sites.
   * An unsupported URL or page type returns a 400 (`BadRequestError`) that is
   * not charged; its message lists what is supported.
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

function readEnvApiKey(): string | undefined {
  // Guarded so we work in browsers / edge runtimes that have no `process`.
  if (typeof process !== 'undefined' && process.env) {
    return process.env.WEBSCRAPING_AI_API_KEY;
  }
  return undefined;
}
