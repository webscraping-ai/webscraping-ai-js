/**
 * Internal fetch wrapper used by `WebScrapingAI`.
 *
 * Handles:
 *   - assembling the URL with our custom query encoding
 *   - per-request AbortController timeout
 *   - mapping non-2xx responses to typed `APIError` subclasses
 *   - mapping fetch transport errors to `APITimeoutError` / `APIConnectionError`
 *   - parsing the response body as JSON or text based on Content-Type
 */

import { encodeToString, type Params } from './query.js';
import {
  APIConnectionError,
  APIError,
  APITimeoutError,
  WebScrapingAIError,
  STATUS_TO_ERROR,
  type APIErrorInit,
} from './errors.js';

export const DEFAULT_BASE_URL = 'https://api.webscraping.ai';
export const DEFAULT_TIMEOUT_MS = 60_000;

export type FetchLike = typeof fetch;

export interface RequestOptions {
  baseUrl: string;
  path: string;
  apiKey: string;
  params: Params;
  timeoutMs: number;
  fetchImpl: FetchLike;
  userAgent: string;
}

export async function request(opts: RequestOptions): Promise<unknown> {
  const merged: Params = { api_key: opts.apiKey, ...opts.params };
  const query = encodeToString(merged);
  const url = `${opts.baseUrl}${opts.path}${query ? `?${query}` : ''}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);

  try {
    let response: Response;
    try {
      response = await opts.fetchImpl(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json, text/plain, text/html, */*',
          'User-Agent': opts.userAgent,
        },
        signal: controller.signal,
      });
    } catch (err) {
      throw wrapFetchError(err);
    }

    // Keep the timeout active until the body is fully read: a stalled body
    // read must still be aborted by the timer (and surfaced as a timeout),
    // not hang forever after the response headers arrive.
    try {
      await raiseForStatus(response);
      return await parseResponse(response);
    } catch (err) {
      throw wrapBodyError(err);
    }
  } finally {
    clearTimeout(timer);
  }
}

async function parseResponse(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return response.json();
  }
  return response.text();
}

async function raiseForStatus(response: Response): Promise<void> {
  if (response.status >= 200 && response.status < 300) return;

  const responseBody = await response.text();
  const payload = safeParseErrorBody(responseBody);
  const ErrorClass = STATUS_TO_ERROR[response.status] ?? APIError;

  const init: APIErrorInit = {
    message: payload.message ?? responseBody ?? response.statusText,
    status: response.status,
    statusCode: payload.status_code ?? null,
    statusMessage: payload.status_message ?? null,
    body: payload.body ?? null,
    responseBody,
  };
  throw new ErrorClass(init);
}

interface ErrorPayload {
  message?: string;
  status_code?: number;
  status_message?: string;
  body?: string;
}

function safeParseErrorBody(text: string): ErrorPayload {
  if (!text) return {};
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as ErrorPayload;
    }
  } catch {
    // fall through
  }
  return {};
}

function wrapBodyError(err: unknown): Error {
  // Typed errors from this library (e.g. APIError subclasses raised by
  // `raiseForStatus`) must propagate unchanged. Anything else — an abort
  // during the body read, a stream/network failure — is a transport error
  // and gets mapped to APITimeoutError / APIConnectionError.
  if (err instanceof WebScrapingAIError) return err;
  return wrapFetchError(err);
}

function wrapFetchError(err: unknown): Error {
  if (err instanceof Error) {
    if (err.name === 'AbortError' || err.name === 'TimeoutError') {
      return new APITimeoutError(err.message || 'Request timed out');
    }
    // DOMException with AbortError name on some runtimes
    if ((err as { code?: string }).code === 'ABORT_ERR') {
      return new APITimeoutError(err.message || 'Request timed out');
    }
    return new APIConnectionError(err.message || 'Connection failed');
  }
  return new APIConnectionError(String(err));
}
