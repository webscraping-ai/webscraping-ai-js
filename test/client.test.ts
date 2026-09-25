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

  it('serp: GET /serp with q/engine/gl/hl/page, returns parsed JSON', async () => {
    const body = {
      search_parameters: { engine: 'google', q: 'coffee machines', gl: 'de', hl: 'de', page: 2 },
      search_information: {
        query_displayed: 'coffee machines',
        organic_results_state: 'Results for exact spelling',
      },
      organic_results: [
        {
          position: 1,
          title: 'Best',
          link: 'https://example.com/',
          domain: 'example.com',
          displayed_link: 'example.com',
        },
      ],
      pagination: { current: 2, next: 3 },
    };
    const { fn, calls } = fakeFetch(jsonResponse(body));
    const client = new WebScrapingAI({ apiKey: API_KEY, fetch: fn });
    const out = await client.serp({
      q: 'coffee machines',
      engine: 'google',
      gl: 'de',
      hl: 'de',
      page: 2,
    });

    expect(out).toEqual(body);
    expect(out.organic_results[0]?.domain).toBe('example.com');
    const { url } = calls[0]!;
    expect(url.origin + url.pathname).toBe(`${BASE}/serp`);
    expect(url.search).toContain('q=coffee%20machines');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      q: 'coffee machines',
      engine: 'google',
      gl: 'de',
      hl: 'de',
      page: '2',
      api_key: API_KEY,
    });
  });

  it('serp: omits unset optional params and ignores scraping options', async () => {
    const { fn, calls } = fakeFetch(jsonResponse({ organic_results: [] }));
    const client = new WebScrapingAI({ apiKey: API_KEY, fetch: fn });
    await client.serp({ q: 'coffee', js: true } as unknown as { q: string });

    expect([...calls[0]!.url.searchParams.keys()].sort()).toEqual(['api_key', 'q']);
  });

  it('serp: rejects an empty q without sending a request', async () => {
    const { fn, calls } = fakeFetch(jsonResponse({}));
    const client = new WebScrapingAI({ apiKey: API_KEY, fetch: fn });

    await expect(client.serp({ q: '' })).rejects.toBeInstanceOf(WebScrapingAIError);
    expect(calls).toHaveLength(0);
  });

  it.each([' ', ' \t\n '])(
    'serp: rejects whitespace-only q %j without sending a request',
    async (q) => {
      const { fn, calls } = fakeFetch(jsonResponse({}));
      const client = new WebScrapingAI({ apiKey: API_KEY, fetch: fn });

      await expect(client.serp({ q })).rejects.toBeInstanceOf(WebScrapingAIError);
      expect(calls).toHaveLength(0);
    },
  );

  it('serp: rejects a non-string q without sending a request', async () => {
    const { fn, calls } = fakeFetch(jsonResponse({}));
    const client = new WebScrapingAI({ apiKey: API_KEY, fetch: fn });

    await expect(client.serp({ q: 42 } as unknown as { q: string })).rejects.toBeInstanceOf(
      WebScrapingAIError,
    );
    expect(calls).toHaveLength(0);
  });

  it('serp: sends q untrimmed', async () => {
    const { fn, calls } = fakeFetch(jsonResponse({ organic_results: [] }));
    const client = new WebScrapingAI({ apiKey: API_KEY, fetch: fn });
    await client.serp({ q: '  coffee ' });

    expect(calls[0]!.url.searchParams.get('q')).toBe('  coffee ');
  });

  it.each([Number.NaN, 1.5, 0, -1, -3, 1e21, Number.POSITIVE_INFINITY])(
    'serp: rejects page %s without sending a request',
    async (page) => {
      const { fn, calls } = fakeFetch(jsonResponse({}));
      const client = new WebScrapingAI({ apiKey: API_KEY, fetch: fn });

      const promise = client.serp({ q: 'coffee', page });
      await expect(promise).rejects.toBeInstanceOf(WebScrapingAIError);
      await expect(promise).rejects.toThrow(/page must be an integer >= 1/);
      expect(calls).toHaveLength(0);
    },
  );

  it('serp: rejects a non-number page without sending a request', async () => {
    const { fn, calls } = fakeFetch(jsonResponse({}));
    const client = new WebScrapingAI({ apiKey: API_KEY, fetch: fn });

    await expect(
      client.serp({ q: 'coffee', page: '2' } as unknown as { q: string; page: number }),
    ).rejects.toBeInstanceOf(WebScrapingAIError);
    expect(calls).toHaveLength(0);
  });

  it('serp: accepts page 1', async () => {
    const { fn, calls } = fakeFetch(jsonResponse({ organic_results: [] }));
    const client = new WebScrapingAI({ apiKey: API_KEY, fetch: fn });
    await client.serp({ q: 'coffee', page: 1 });

    expect(calls[0]!.url.searchParams.get('page')).toBe('1');
  });

  it('data: GET /data with url/country/transcript/transcript_language + params', async () => {
    const body = {
      request_parameters: {
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        provider: 'youtube',
        type: 'video',
      },
      parse_status: 'ok',
      data: { video_id: 'dQw4w9WgXcQ', title: 'Never Gonna Give You Up' },
    };
    const { fn, calls } = fakeFetch(jsonResponse(body));
    const client = new WebScrapingAI({ apiKey: API_KEY, fetch: fn });
    const out = await client.data<{ video_id: string; title: string }>({
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      country: 'gb',
      transcript: true,
      transcript_language: 'de',
      params: { comments: 20, 'a&b=c': 'x&y=z', include: false, skipped: undefined },
    });

    expect(out).toEqual(body);
    expect(out.data?.title).toBe('Never Gonna Give You Up');
    const { url } = calls[0]!;
    expect(url.origin + url.pathname).toBe(`${BASE}/data`);
    // `&`/`=` in extra keys and values are escaped, not smuggled as new params.
    expect(url.search).toContain('a%26b%3Dc=x%26y%3Dz');
    expect(url.search).toContain('url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DdQw4w9WgXcQ');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      api_key: API_KEY,
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      country: 'gb',
      transcript: 'true',
      transcript_language: 'de',
      comments: '20',
      'a&b=c': 'x&y=z',
      include: 'false',
    });
  });

  it('data: sends transcript=false as the string "false"', async () => {
    const { fn, calls } = fakeFetch(jsonResponse({}));
    const client = new WebScrapingAI({ apiKey: API_KEY, fetch: fn });
    await client.data({ url: 'https://www.youtube.com/watch?v=x', transcript: false });

    expect(calls[0]!.url.searchParams.get('transcript')).toBe('false');
  });

  it('data: omits unset optional params and ignores scraping options', async () => {
    const { fn, calls } = fakeFetch(jsonResponse({}));
    const client = new WebScrapingAI({ apiKey: API_KEY, fetch: fn });
    await client.data({
      url: 'https://www.tiktok.com/@nasa',
      js: true,
      proxy: 'residential',
    } as unknown as { url: string });

    expect([...calls[0]!.url.searchParams.keys()].sort()).toEqual(['api_key', 'url']);
  });

  it.each([
    ['country', { country: 'de' }],
    ['transcript', { transcript: true }],
    ['transcript_language', { transcript_language: 'en' }],
  ])(
    'data: rejects %s in params (set or not as a named option) without a request',
    async (key, params) => {
      const { fn, calls } = fakeFetch(jsonResponse({}));
      const client = new WebScrapingAI({ apiKey: API_KEY, fetch: fn });

      for (const named of [{}, { [key]: (params as Record<string, unknown>)[key] }]) {
        const promise = client.data({ url: 'https://www.youtube.com/watch?v=x', ...named, params });
        await expect(promise).rejects.toBeInstanceOf(WebScrapingAIError);
        await expect(promise).rejects.toThrow(new RegExp(`use the named \`${key}\` option`));
      }
      expect(calls).toHaveLength(0);
    },
  );

  it.each([
    'https://example.com/anything',
    '  https://Example.COM/A%2Fb/ünï?x=1&y=a b#Frag  ',
    'not even a url',
  ])('data: sends an arbitrary URL %j unmodified with no client-side check', async (target) => {
    const raw: string[] = [];
    const fn = vi.fn(async (input: string | URL | Request) => {
      raw.push(String(input));
      return jsonResponse({});
    }) as unknown as typeof fetch;
    const client = new WebScrapingAI({ apiKey: API_KEY, fetch: fn });
    await client.data({ url: target });

    expect(raw).toHaveLength(1);
    const query = raw[0]!.split('?')[1]!;
    // Exact bytes: the value percent-encoded once, nothing trimmed, lower-cased or dropped.
    expect(query.split('&')).toContain(`url=${encodeURIComponent(target)}`);
    expect(new URLSearchParams(query).get('url')).toBe(target);
  });

  it('data: rejects __proto__ in params without sending a request', async () => {
    const { fn, calls } = fakeFetch(jsonResponse({}));
    const client = new WebScrapingAI({ apiKey: API_KEY, fetch: fn });
    const params = JSON.parse('{"__proto__": "x"}') as Record<string, string>;

    await expect(client.data({ url: 'https://example.com/', params })).rejects.toThrow(
      /must not contain "__proto__"/,
    );
    expect(calls).toHaveLength(0);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'data: rejects non-finite number %s in params without a request',
    async (value) => {
      const { fn, calls } = fakeFetch(jsonResponse({}));
      const client = new WebScrapingAI({ apiKey: API_KEY, fetch: fn });

      await expect(
        client.data({ url: 'https://example.com/', params: { n: value } }),
      ).rejects.toThrow(/params.n must be a finite number/);
      expect(calls).toHaveLength(0);
    },
  );

  it.each([
    ['url', { url: 'https://x.test/\uD800' }],
    ['a param value', { url: 'https://x.test/', params: { k: 'a\uDC00' } }],
    ['a param key', { url: 'https://x.test/', params: { ['k\uD800']: 'v' } }],
  ])(
    'data: an unpaired surrogate in %s rejects with WebScrapingAIError, not URIError',
    async (_label, options) => {
      const { fn, calls } = fakeFetch(jsonResponse({}));
      const client = new WebScrapingAI({ apiKey: API_KEY, fetch: fn });

      const err = await client.data(options).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(WebScrapingAIError);
      expect(err).not.toBeInstanceOf(URIError);
      expect((err as Error).message).toMatch(/unpaired UTF-16 surrogate/);
      expect(calls).toHaveLength(0);
    },
  );

  it('an unpaired surrogate is mapped on every endpoint (html)', async () => {
    const { fn, calls } = fakeFetch(textResponse(''));
    const client = new WebScrapingAI({ apiKey: API_KEY, fetch: fn });

    await expect(client.html({ url: 'https://x.test/\uD800' })).rejects.toBeInstanceOf(
      WebScrapingAIError,
    );
    expect(calls).toHaveLength(0);
  });

  it('serp: sends params as-is alongside the named options', async () => {
    const { fn, calls } = fakeFetch(jsonResponse({ organic_results: [] }));
    const client = new WebScrapingAI({ apiKey: API_KEY, fetch: fn });
    await client.serp({ q: 'coffee', gl: 'de', params: { from_cli: true, 'a&b': 'c=d', n: 2 } });

    const { url } = calls[0]!;
    expect(url.search).toContain('a%26b=c%3Dd');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      api_key: API_KEY,
      q: 'coffee',
      gl: 'de',
      from_cli: 'true',
      'a&b': 'c=d',
      n: '2',
    });
  });

  it.each(['api_key', 'q', 'engine', 'gl', 'hl', 'page', '__proto__'])(
    'serp: rejects %s in params without sending a request',
    async (key) => {
      const { fn, calls } = fakeFetch(jsonResponse({}));
      const client = new WebScrapingAI({ apiKey: API_KEY, fetch: fn });
      const params = JSON.parse(JSON.stringify({ [key]: 'x' })) as Record<string, string>;

      await expect(client.serp({ q: 'coffee', params })).rejects.toThrow(
        new RegExp(`must not contain "${key}"`),
      );
      expect(calls).toHaveLength(0);
    },
  );

  it('serp: rejects non-scalar and non-finite params values', async () => {
    const { fn, calls } = fakeFetch(jsonResponse({}));
    const client = new WebScrapingAI({ apiKey: API_KEY, fetch: fn });

    await expect(client.serp({ q: 'coffee', params: { n: Number.NaN } })).rejects.toThrow(
      /finite number/,
    );
    await expect(
      client.serp({ q: 'coffee', params: { o: {} } as unknown as Record<string, string> }),
    ).rejects.toThrow(/string, number or boolean/);
    expect(calls).toHaveLength(0);
  });

  it.each(['', ' ', ' \t\n '])(
    'data: rejects blank url %j without sending a request',
    async (url) => {
      const { fn, calls } = fakeFetch(jsonResponse({}));
      const client = new WebScrapingAI({ apiKey: API_KEY, fetch: fn });

      const promise = client.data({ url });
      await expect(promise).rejects.toBeInstanceOf(WebScrapingAIError);
      await expect(promise).rejects.toThrow(/url is required/);
      expect(calls).toHaveLength(0);
    },
  );

  it('data: rejects a missing or non-string url without sending a request', async () => {
    const { fn, calls } = fakeFetch(jsonResponse({}));
    const client = new WebScrapingAI({ apiKey: API_KEY, fetch: fn });

    await expect(client.data({} as unknown as { url: string })).rejects.toBeInstanceOf(
      WebScrapingAIError,
    );
    await expect(client.data({ url: 42 } as unknown as { url: string })).rejects.toBeInstanceOf(
      WebScrapingAIError,
    );
    expect(calls).toHaveLength(0);
  });

  it.each(['api_key', 'url'])(
    'data: rejects %s in params without sending a request',
    async (key) => {
      const { fn, calls } = fakeFetch(jsonResponse({}));
      const client = new WebScrapingAI({ apiKey: API_KEY, fetch: fn });

      const promise = client.data({ url: 'https://example.com/', params: { [key]: 'evil' } });
      await expect(promise).rejects.toBeInstanceOf(WebScrapingAIError);
      await expect(promise).rejects.toThrow(new RegExp(`must not contain "${key}"`));
      expect(calls).toHaveLength(0);
    },
  );

  it('data: rejects non-scalar params values without sending a request', async () => {
    const { fn, calls } = fakeFetch(jsonResponse({}));
    const client = new WebScrapingAI({ apiKey: API_KEY, fetch: fn });

    await expect(
      client.data({
        url: 'https://example.com/',
        params: { nested: { a: 1 } } as unknown as Record<string, string>,
      }),
    ).rejects.toThrow(/params.nested must be a string, number or boolean/);
    await expect(
      client.data({
        url: 'https://example.com/',
        params: ['x'] as unknown as Record<string, string>,
      }),
    ).rejects.toThrow(/params must be a plain object/);
    expect(calls).toHaveLength(0);
  });

  it('data: passes unknown provider/type and parse_failed with data: null through', async () => {
    const body = {
      request_parameters: {
        url: 'https://newsite.example/p/1',
        provider: 'some_future_site',
        type: 'hologram',
      },
      parse_status: 'parse_failed',
      data: null,
    };
    const { fn } = fakeFetch(jsonResponse(body));
    const client = new WebScrapingAI({ apiKey: API_KEY, fetch: fn });
    const out = await client.data({ url: 'https://newsite.example/p/1' });

    expect(out).toEqual(body);
    expect(out.request_parameters.provider).toBe('some_future_site');
    expect(out.request_parameters.type).toBe('hologram');
    expect(out.parse_status).toBe('parse_failed');
    expect(out.data).toBeNull();
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

  it('serp: maps an error body without the scraping envelope to a typed error', async () => {
    const { fn } = fakeFetch(jsonResponse({ message: 'Not enough credits' }, 402));
    const client = new WebScrapingAI({ apiKey: API_KEY, fetch: fn });
    await expect(client.serp({ q: 'coffee' })).rejects.toMatchObject({
      name: 'PaymentRequiredError',
      status: 402,
      message: 'Not enough credits',
      statusCode: null,
    });
  });

  it('data: maps a 400 {message} (unsupported URL) to BadRequestError', async () => {
    const message =
      'Unsupported URL for /data. Supported sites: youtube, tiktok, twitter, linkedin, instagram, reddit. For other sites, use /ai/fields';
    const { fn } = fakeFetch(jsonResponse({ message }, 400));
    const client = new WebScrapingAI({ apiKey: API_KEY, fetch: fn });
    const err = await client.data({ url: 'https://example.com/' }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(BadRequestError);
    expect(err).toMatchObject({ status: 400, message, statusCode: null });
    expect((err as Error).message).not.toContain(API_KEY);
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
