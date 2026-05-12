import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AuthenticationError,
  BadRequestError,
  GatewayTimeoutError,
  PaymentRequiredError,
  RateLimitError,
  ServerError,
  WebScrapingAI,
  WebScrapingAIError,
} from '../src/index.js';

const API_KEY = 'test-key';
const BASE = 'https://api.webscraping.ai';

interface FetchCall {
  url: URL;
  init: RequestInit | undefined;
}

function fakeFetch(response: Response): { fn: typeof fetch; calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  const fn = vi.fn(async (input: Request | URL | string, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input.toString());
    calls.push({ url, init });
    return response.clone();
  }) as unknown as typeof fetch;
  return { fn, calls };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function textResponse(body: string, status = 200, contentType = 'text/html'): Response {
  return new Response(body, { status, headers: { 'content-type': contentType } });
}

describe('WebScrapingAI constructor', () => {
  const originalEnv = process.env.WEBSCRAPING_AI_API_KEY;

  beforeEach(() => {
    delete process.env.WEBSCRAPING_AI_API_KEY;
  });
  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.WEBSCRAPING_AI_API_KEY = originalEnv;
    }
  });

  it('requires an apiKey (constructor or env)', () => {
    expect(() => new WebScrapingAI()).toThrow(WebScrapingAIError);
  });

  it('reads WEBSCRAPING_AI_API_KEY from the environment as a fallback', () => {
    process.env.WEBSCRAPING_AI_API_KEY = 'from-env';
    const { fn } = fakeFetch(textResponse(''));
    expect(() => new WebScrapingAI({ fetch: fn })).not.toThrow();
  });

  it('constructor apiKey takes precedence over env', async () => {
    process.env.WEBSCRAPING_AI_API_KEY = 'env-key';
    const { fn, calls } = fakeFetch(textResponse('<html></html>'));
    const client = new WebScrapingAI({ apiKey: 'ctor-key', fetch: fn });
    await client.html({ url: 'https://example.com' });
    expect(calls[0]?.url.searchParams.get('api_key')).toBe('ctor-key');
  });
});

describe('endpoint methods', () => {
  it('html: GET /html with url + api_key', async () => {
    const { fn, calls } = fakeFetch(textResponse('<html><body>ok</body></html>'));
    const client = new WebScrapingAI({ apiKey: API_KEY, fetch: fn });
    const out = await client.html({ url: 'https://example.com', js: false });

    expect(out).toBe('<html><body>ok</body></html>');
    const { url } = calls[0]!;
    expect(url.origin + url.pathname).toBe(`${BASE}/html`);
    expect(url.searchParams.get('api_key')).toBe(API_KEY);
    expect(url.searchParams.get('url')).toBe('https://example.com');
    expect(url.searchParams.get('js')).toBe('false');
  });

  it('text: forwards text_format and return_links', async () => {
    const { fn, calls } = fakeFetch(jsonResponse({ title: 'T', content: 'C' }));
    const client = new WebScrapingAI({ apiKey: API_KEY, fetch: fn });
    const out = await client.text({
      url: 'https://example.com',
      text_format: 'json',
      return_links: true,
    });

    expect(out).toEqual({ title: 'T', content: 'C' });
    const { url } = calls[0]!;
    expect(url.searchParams.get('text_format')).toBe('json');
    expect(url.searchParams.get('return_links')).toBe('true');
  });

  it('selected: forwards selector', async () => {
    const { fn, calls } = fakeFetch(textResponse('<h1>x</h1>'));
    const client = new WebScrapingAI({ apiKey: API_KEY, fetch: fn });
    const out = await client.selected({ url: 'https://example.com', selector: 'h1' });

    expect(out).toBe('<h1>x</h1>');
    expect(calls[0]!.url.searchParams.get('selector')).toBe('h1');
  });

  it('selectedMultiple: form-encodes selectors without [] brackets', async () => {
    const { fn, calls } = fakeFetch(jsonResponse([['x', 'y']]));
    const client = new WebScrapingAI({ apiKey: API_KEY, fetch: fn });
    await client.selectedMultiple({
      url: 'https://example.com',
      selectors: ['h1', '.price'],
    });

    const raw = calls[0]!.url.search;
    expect(raw).toContain('selectors=h1');
    expect(raw).toContain('selectors=.price');
    expect(raw).not.toContain('selectors%5B%5D');
    expect(raw).not.toContain('selectors[]');
  });

  it('question: forwards question param', async () => {
    const { fn, calls } = fakeFetch(textResponse('An answer.'));
    const client = new WebScrapingAI({ apiKey: API_KEY, fetch: fn });
    const out = await client.question({
      url: 'https://example.com',
      question: 'What is this?',
    });

    expect(out).toBe('An answer.');
    expect(calls[0]!.url.searchParams.get('question')).toBe('What is this?');
  });

  it('fields: deepObject-encodes the fields map', async () => {
    const { fn, calls } = fakeFetch(jsonResponse({ result: { title: 'T' } }));
    const client = new WebScrapingAI({ apiKey: API_KEY, fetch: fn });
    const out = await client.fields({
      url: 'https://example.com',
      fields: { title: 'Main title', price: 'Price' },
    });

    expect(out).toEqual({ result: { title: 'T' } });
    const raw = calls[0]!.url.search;
    expect(decodeURIComponent(raw)).toContain('fields[title]=Main title');
    expect(decodeURIComponent(raw)).toContain('fields[price]=Price');
  });

  it('account: no extra params, returns parsed JSON', async () => {
    const { fn, calls } = fakeFetch(jsonResponse({ remaining_api_calls: 999 }));
    const client = new WebScrapingAI({ apiKey: API_KEY, fetch: fn });
    const out = await client.account();

    expect(out).toEqual({ remaining_api_calls: 999 });
    const url = calls[0]!.url;
    expect(url.pathname).toBe('/account');
    // Only api_key in the params
    expect([...url.searchParams.keys()]).toEqual(['api_key']);
  });

  it('headers: deepObject-encoded', async () => {
    const { fn, calls } = fakeFetch(textResponse(''));
    const client = new WebScrapingAI({ apiKey: API_KEY, fetch: fn });
    await client.html({
      url: 'https://example.com',
      headers: { Cookie: 'session=abc', 'X-Custom': 'v' },
    });

    const decoded = decodeURIComponent(calls[0]!.url.search);
    expect(decoded).toContain('headers[Cookie]=session=abc');
    expect(decoded).toContain('headers[X-Custom]=v');
  });

  it('sends a webscraping-ai-js User-Agent', async () => {
    const { fn, calls } = fakeFetch(textResponse(''));
    const client = new WebScrapingAI({ apiKey: API_KEY, fetch: fn });
    await client.html({ url: 'https://example.com' });

    const headers = calls[0]!.init?.headers as Record<string, string>;
    expect(headers['User-Agent']).toMatch(/^webscraping-ai-js\/\d+\.\d+\.\d+$/);
  });
});

describe('error mapping', () => {
  it.each([
    [400, BadRequestError],
    [402, PaymentRequiredError],
    [403, AuthenticationError],
    [429, RateLimitError],
    [500, ServerError],
    [504, GatewayTimeoutError],
  ])('status %i → typed error', async (status, ErrorClass) => {
    const { fn } = fakeFetch(jsonResponse({ message: 'oops' }, status));
    const client = new WebScrapingAI({ apiKey: API_KEY, fetch: fn });
    await expect(client.html({ url: 'https://example.com' })).rejects.toBeInstanceOf(ErrorClass);
  });

  it('parses error envelope fields (status_code/status_message/body)', async () => {
    const { fn } = fakeFetch(
      jsonResponse(
        {
          message: 'Target returned 503',
          status_code: 503,
          status_message: 'Service Unavailable',
          body: 'origin html',
        },
        500,
      ),
    );
    const client = new WebScrapingAI({ apiKey: API_KEY, fetch: fn });
    try {
      await client.html({ url: 'https://example.com' });
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ServerError);
      const e = err as ServerError;
      expect(e.status).toBe(500);
      expect(e.statusCode).toBe(503);
      expect(e.statusMessage).toBe('Service Unavailable');
      expect(e.body).toBe('origin html');
    }
  });

  it('falls back to a generic APIError for undocumented statuses', async () => {
    const { fn } = fakeFetch(jsonResponse({ message: 'teapot' }, 418));
    const client = new WebScrapingAI({ apiKey: API_KEY, fetch: fn });
    await expect(client.html({ url: 'https://example.com' })).rejects.toMatchObject({
      name: 'APIError',
      status: 418,
    });
  });
});
