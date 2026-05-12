#!/usr/bin/env tsx
/**
 * Hand-run smoke test against the live API. Not part of the test suite —
 * costs ~17 credits per full sweep.
 *
 * Usage:
 *   WEBSCRAPING_AI_API_KEY=... npm run smoke
 *   # or:
 *   WEBSCRAPING_AI_API_KEY=... npx tsx bin/smoke.ts
 */

import { WebScrapingAI, WebScrapingAIError } from '../src/index.js';

const apiKey = process.env.WEBSCRAPING_AI_API_KEY ?? process.env.WEBSCRAPING_AI_KEY;
if (!apiKey) {
  console.error('WEBSCRAPING_AI_API_KEY env var is required');
  process.exit(2);
}

const client = new WebScrapingAI({ apiKey });
const target = 'https://example.com';

const cases: Array<[string, () => Promise<unknown>]> = [
  ['account', () => client.account()],
  ['html', () => client.html({ url: target })],
  ['text', () => client.text({ url: target })],
  ['selected', () => client.selected({ url: target, selector: 'h1' })],
  ['selected_multiple', () => client.selectedMultiple({ url: target, selectors: ['h1', 'p'] })],
  [
    'question',
    () =>
      client.question({
        url: target,
        question: 'What is this page about? Answer in one sentence.',
      }),
  ],
  [
    'fields',
    () =>
      client.fields({
        url: target,
        fields: { title: 'Page title', description: 'Short description' },
      }),
  ],
];

let failures = 0;
for (const [name, call] of cases) {
  try {
    const result = await call();
    const preview =
      typeof result === 'string' ? result.slice(0, 120) : JSON.stringify(result).slice(0, 120);
    console.log(`  ok   ${name.padEnd(18)}  ${preview}`);
  } catch (err) {
    failures += 1;
    if (err instanceof WebScrapingAIError) {
      console.log(`  FAIL ${name.padEnd(18)}  ${err.constructor.name}: ${err.message}`);
    } else if (err instanceof Error) {
      console.log(`  FAIL ${name.padEnd(18)}  ${err.constructor.name}: ${err.message}`);
    } else {
      console.log(`  FAIL ${name.padEnd(18)}  unknown: ${String(err)}`);
    }
  }
}

process.exit(failures === 0 ? 0 : 1);
