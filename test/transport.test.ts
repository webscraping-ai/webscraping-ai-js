import { describe, expect, it, vi } from 'vitest';
import { APIConnectionError, APITimeoutError, WebScrapingAI } from '../src/index.js';

describe('transport error wrapping', () => {
  it('maps an AbortError into APITimeoutError', async () => {
    const fn = vi.fn(async () => {
      const err = new Error('aborted');
      err.name = 'AbortError';
      throw err;
    }) as unknown as typeof fetch;

    const client = new WebScrapingAI({ apiKey: 'k', fetch: fn });
    await expect(client.html({ url: 'https://example.com' })).rejects.toBeInstanceOf(
      APITimeoutError,
    );
  });

  it('maps a generic fetch failure into APIConnectionError', async () => {
    const fn = vi.fn(async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;

    const client = new WebScrapingAI({ apiKey: 'k', fetch: fn });
    await expect(client.html({ url: 'https://example.com' })).rejects.toBeInstanceOf(
      APIConnectionError,
    );
  });

  it('honors the per-client timeoutMs (AbortController fires)', async () => {
    let abortedSignalled = false;
    const fn = vi.fn(
      (_input: unknown, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            abortedSignalled = true;
            const err = new Error('aborted');
            err.name = 'AbortError';
            reject(err);
          });
          // Never resolve — wait for the abort
        }),
    ) as unknown as typeof fetch;

    const client = new WebScrapingAI({ apiKey: 'k', fetch: fn, timeoutMs: 10 });
    await expect(client.html({ url: 'https://example.com' })).rejects.toBeInstanceOf(
      APITimeoutError,
    );
    expect(abortedSignalled).toBe(true);
  });

  it('times out when the response body read hangs past timeoutMs', async () => {
    let bodyReadAborted = false;
    const fn = vi.fn((_input: unknown, init?: RequestInit): Promise<Response> => {
      // Resolve the response (headers received) immediately, but make the
      // body read hang until the abort signal fires.
      const response = {
        status: 200,
        statusText: 'OK',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
              bodyReadAborted = true;
              const err = new Error('aborted');
              err.name = 'AbortError';
              reject(err);
            });
            // Never resolve — wait for the abort.
          }),
        text: () => Promise.resolve(''),
      } as unknown as Response;
      return Promise.resolve(response);
    }) as unknown as typeof fetch;

    const client = new WebScrapingAI({ apiKey: 'k', fetch: fn, timeoutMs: 10 });
    await expect(client.html({ url: 'https://example.com' })).rejects.toBeInstanceOf(
      APITimeoutError,
    );
    expect(bodyReadAborted).toBe(true);
  });
});
