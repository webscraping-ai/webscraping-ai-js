import { describe, expect, it } from 'vitest';
import { encode, encodeToString } from '../src/query.js';

describe('encode', () => {
  it('drops null and undefined at the top level', () => {
    expect(encode({ a: 'x', b: null, c: undefined })).toEqual([['a', 'x']]);
  });

  it('encodes booleans as "true"/"false" strings', () => {
    expect(encode({ js: true, error_on_404: false })).toEqual([
      ['js', 'true'],
      ['error_on_404', 'false'],
    ]);
  });

  it('encodes numbers as strings', () => {
    expect(encode({ timeout: 15000 })).toEqual([['timeout', '15000']]);
  });

  it('uses deepObject form for nested objects (headers, fields)', () => {
    expect(
      encode({
        headers: { Cookie: 'session=abc', 'User-Agent': 'X' },
        fields: { title: 'Main title' },
      }),
    ).toEqual([
      ['headers[Cookie]', 'session=abc'],
      ['headers[User-Agent]', 'X'],
      ['fields[title]', 'Main title'],
    ]);
  });

  it('drops null values inside nested objects', () => {
    expect(encode({ headers: { Cookie: 'a', Skip: null } })).toEqual([['headers[Cookie]', 'a']]);
  });

  it('uses form-explode without `[]` for arrays (selectors)', () => {
    expect(encode({ selectors: ['h1', '.price', '#title'] })).toEqual([
      ['selectors', 'h1'],
      ['selectors', '.price'],
      ['selectors', '#title'],
    ]);
  });

  it('drops nulls inside arrays', () => {
    expect(encode({ selectors: ['h1', null, '.price'] })).toEqual([
      ['selectors', 'h1'],
      ['selectors', '.price'],
    ]);
  });

  it('preserves insertion order', () => {
    const pairs = encode({ url: 'https://example.com', js: false, proxy: 'datacenter' });
    expect(pairs.map(([k]) => k)).toEqual(['url', 'js', 'proxy']);
  });
});

describe('encodeToString', () => {
  it('percent-encodes spaces as %20, not +', () => {
    expect(encodeToString({ q: 'hello world' })).toBe('q=hello%20world');
  });

  it('percent-encodes deepObject brackets', () => {
    expect(encodeToString({ headers: { 'X-Foo': 'bar' } })).toBe('headers%5BX-Foo%5D=bar');
  });

  it('joins multiple selectors with &', () => {
    expect(encodeToString({ selectors: ['h1', '.price'] })).toBe('selectors=h1&selectors=.price');
  });

  it('returns "" for empty params', () => {
    expect(encodeToString({})).toBe('');
  });
});
