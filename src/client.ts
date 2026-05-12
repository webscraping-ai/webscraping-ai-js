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
  selector: string;
  format?: 'json' | 'text';
}

export interface SelectedMultipleOptions extends CommonRequestOptions {
  url: string;
  selectors: readonly string[];
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

function readEnvApiKey(): string | undefined {
  // Guarded so we work in browsers / edge runtimes that have no `process`.
  if (typeof process !== 'undefined' && process.env) {
    return process.env.WEBSCRAPING_AI_API_KEY;
  }
  return undefined;
}
