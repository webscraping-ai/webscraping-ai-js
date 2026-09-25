#!/usr/bin/env tsx
/**
 * Hand-run smoke test against the live API. Not part of the test suite.
 *
 * Costs ~32 credits per full sweep: account (free), 4 page calls
 * (html/text/selected/selected_multiple) with js=false + datacenter proxy at
 * 1 credit each, question + fields at 6 each (datacenter, no JS), and one
 * SERP search at 15 -> 4 + 12 + 15 = 31.
 *
 * Each case asserts on the shape of the result, not just the absence of an
 * exception; any failure prints a FAIL line and the script exits 1.
 *
 * Usage:
 *   WEBSCRAPING_AI_API_KEY=... npm run smoke
 *   # or:
 *   WEBSCRAPING_AI_API_KEY=... npx tsx bin/smoke.ts
 */

import { WebScrapingAI } from '../src/index.js';

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
