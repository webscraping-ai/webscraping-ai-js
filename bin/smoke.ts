#!/usr/bin/env tsx
/**
 * Hand-run smoke test against the live API. Not part of the test suite.
 *
 * Uses real credits (see https://webscraping.ai/docs for pricing): account
 * (free), 4 page calls (html/text/selected/selected_multiple) and question +
 * fields with js=false + datacenter proxy to keep the cost down, one SERP
 * search, a two-page located SERP search (billed per page returned), a free
 * /serp/locations lookup and one /data call. The second /data case
 * (example.com, a site without a dedicated parser) is not charged when
 * learning its structure outlasts the request (503), when nothing is found
 * (422) or when extracting the data or loading the page runs out of time (a
 * 500 timeout); otherwise it is a normal, charged success.
 *
 * Each case asserts on the shape of the result, not just the absence of an
 * exception; any failure prints a FAIL line and the script exits 1.
 *
 * Usage:
 *   WEBSCRAPING_AI_API_KEY=... npm run smoke
 *   # or:
 *   WEBSCRAPING_AI_API_KEY=... npx tsx bin/smoke.ts
 */

import { APIError, WebScrapingAI } from '../src/index.js';

const apiKey = process.env.WEBSCRAPING_AI_API_KEY ?? process.env.WEBSCRAPING_AI_KEY;
if (!apiKey) {
  console.error('WEBSCRAPING_AI_API_KEY env var is required');
  process.exit(2);
}

const client = new WebScrapingAI({ apiKey });
const target = 'https://example.com';
const page = { js: false, proxy: 'datacenter' } as const;

/** Returns a failure reason, or null when the result looks right. */
type Check = (result: unknown) => string | null;

/**
 * Wraps a /data call on a site without a dedicated parser. A 503, 422 or 500
 * is an `APIError`; it resolves to `{ status, body }` (body parsed from the response
 * JSON) so the check can inspect `error_code`. Any other error propagates.
 */
async function captureDataError(call: () => Promise<unknown>): Promise<unknown> {
  try {
    return await call();
  } catch (err) {
    if (
      err instanceof APIError &&
      (err.status === 503 || err.status === 422 || err.status === 500)
    ) {
      let body: unknown = null;
      try {
        body = JSON.parse(err.responseBody ?? err.body ?? 'null');
      } catch {
        body = err.responseBody ?? err.body;
      }
      return { status: err.status, body };
    }
    throw err;
  }
}

/**
 * Accepts a success envelope (`request_parameters` present), a 503 with
 * `error_code: "structure_processing"`, a 422 with
 * `error_code: "structure_unavailable"`, or a 500 with `error_code: "timeout"`.
 */
const anySiteData: Check = (r) => {
  if (r === null || typeof r !== 'object') return 'expected an object';
  const o = r as {
    request_parameters?: unknown;
    status?: unknown;
    body?: { error_code?: unknown } | null;
  };
  if (o.status === 503) {
    return o.body?.error_code === 'structure_processing'
      ? null
      : `503 with error_code ${JSON.stringify(o.body?.error_code)}, expected "structure_processing"`;
  }
  if (o.status === 422) {
    return o.body?.error_code === 'structure_unavailable'
      ? null
      : `422 with error_code ${JSON.stringify(o.body?.error_code)}, expected "structure_unavailable"`;
  }
  if (o.status === 500) {
    return o.body?.error_code === 'timeout'
      ? null
      : `500 with error_code ${JSON.stringify(o.body?.error_code)}, expected "timeout"`;
  }
  if (o.request_parameters !== undefined && o.request_parameters !== null) return null;
  return 'expected request_parameters, a 503 "structure_processing", a 422 "structure_unavailable" or a 500 "timeout"';
};

function nonEmpty(value: unknown): boolean {
  if (typeof value === 'string') return value.trim() !== '';
  if (Array.isArray(value)) return value.length > 0;
  if (value !== null && typeof value === 'object') return Object.keys(value).length > 0;
  return false;
}

const notEmpty: Check = (r) => (nonEmpty(r) ? null : 'empty result');

const cases: Array<[string, () => Promise<unknown>, Check]> = [
  ['account', () => client.account(), notEmpty],
  ['html', () => client.html({ url: target, ...page }), notEmpty],
  ['text', () => client.text({ url: target, ...page }), notEmpty],
  ['selected', () => client.selected({ url: target, selector: 'h1', ...page }), notEmpty],
  [
    'selected_multiple',
    () => client.selectedMultiple({ url: target, selectors: ['h1', 'p'], ...page }),
    (r) =>
      Array.isArray(r) && r.some(nonEmpty)
        ? null
        : 'every inner array is empty (selectors mis-encoded?)',
  ],
  [
    'question',
    () =>
      client.question({
        url: target,
        question: 'What is this page about? Answer in one sentence.',
        ...page,
      }),
    notEmpty,
  ],
  [
    'fields',
    () =>
      client.fields({
        url: target,
        fields: { title: 'Page title', description: 'Short description' },
        ...page,
      }),
    (r) => (r !== null && typeof r === 'object' && 'result' in r ? null : 'missing "result" key'),
  ],
  [
    'serp',
    () => client.serp({ q: 'coffee machines' }),
    (r) => {
      const serp = r as { organic_results?: unknown; search_parameters?: { q?: unknown } };
      if (!Array.isArray(serp?.organic_results) || serp.organic_results.length === 0) {
        return 'organic_results is missing or empty';
      }
      const q = serp.search_parameters?.q;
      return q === 'coffee machines'
        ? null
        : `search_parameters.q is ${JSON.stringify(q)}, expected "coffee machines"`;
    },
  ],
  [
    'serp_location',
    () => client.serp({ q: 'coffee machines', location: 'Austin, TX', pages: 2 }),
    (r) => {
      const serp = r as {
        organic_results?: unknown;
        search_parameters?: { location_used?: unknown };
      };
      if (!Array.isArray(serp?.organic_results) || serp.organic_results.length === 0) {
        return 'organic_results is missing or empty';
      }
      const used = serp.search_parameters?.location_used;
      return typeof used === 'string' && used.includes('Austin')
        ? null
        : `search_parameters.location_used is ${JSON.stringify(used)}, expected it to contain "Austin"`;
    },
  ],
  [
    'serp_locations',
    () => client.serpLocations({ q: 'austin', limit: 3 }),
    (r) => {
      if (!Array.isArray(r) || r.length === 0) return 'empty or non-array result';
      const name = (r[0] as { canonical_name?: unknown }).canonical_name;
      return typeof name === 'string' && name.includes('Austin')
        ? null
        : `first canonical_name is ${JSON.stringify(name)}, expected it to contain "Austin"`;
    },
  ],
  [
    'data',
    () => client.data({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }),
    (r) => {
      const d = r as {
        parse_status?: unknown;
        request_parameters?: { provider?: unknown };
        data?: { title?: unknown } | null;
      };
      if (d?.parse_status !== 'ok') return `parse_status is ${JSON.stringify(d?.parse_status)}`;
      if (d.request_parameters?.provider !== 'youtube') {
        return `request_parameters.provider is ${JSON.stringify(d.request_parameters?.provider)}`;
      }
      const title = d.data?.title;
      return typeof title === 'string' && title.trim() !== ''
        ? null
        : 'data is null or has no non-empty title';
    },
  ],
  [
    'data_any_site',
    () => captureDataError(() => client.data({ url: 'https://example.com/' })),
    anySiteData,
  ],
];

function redact(message: string): string {
  return message
    .split(apiKey!)
    .join('[REDACTED]')
    .replace(/api_key=[^&\s"']*/gi, 'api_key=[REDACTED]');
}

function preview(result: unknown): string {
  const text = typeof result === 'string' ? result : (JSON.stringify(result) ?? String(result));
  return text.replace(/\s+/g, ' ').trim().slice(0, 120);
}

let failures = 0;
for (const [name, call, check] of cases) {
  try {
    const result = await call();
    const reason = check(result);
    if (reason === null) {
      console.log(`  ok   ${name.padEnd(18)}  ${preview(result)}`);
    } else {
      failures += 1;
      console.log(`  FAIL ${name.padEnd(18)}  ${redact(`${reason}: ${preview(result)}`)}`);
    }
  } catch (err) {
    failures += 1;
    const label = err instanceof Error ? err.constructor.name : 'unknown';
    const message = err instanceof Error ? err.message : String(err);
    console.log(`  FAIL ${name.padEnd(18)}  ${label}: ${redact(message)}`);
  }
}

process.exit(failures === 0 ? 0 : 1);
