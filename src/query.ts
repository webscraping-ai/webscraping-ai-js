/**
 * Query-string encoding for the WebScraping.AI API.
 *
 * The API mixes three OpenAPI query-string styles, and no off-the-shelf
 * encoder handles the combination correctly:
 *
 *   - deepObject + explode for `headers` and `fields` dicts
 *       → `headers[Cookie]=foo&fields[title]=bar`
 *   - form + explode for the `selectors` array
 *       → `selectors=h1&selectors=.price` (no `[]` brackets)
 *   - flat `key=value` for everything else, with booleans serialised as
 *     the strings `"true"` / `"false"`.
 *
 * `null` / `undefined` values are dropped at every level. Spaces are
 * encoded as `%20` (not `+`) so the output matches what hits the wire.
 *
 * Returns a `[key, value]` tuple list of *un*-percent-encoded pairs —
 * pass through `URLSearchParams` or our own `encodeToString` to serialise.
 */

export type ParamValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | readonly (string | number | boolean | null | undefined)[]
  | Readonly<Record<string, string | number | boolean | null | undefined>>;

export type Params = Record<string, ParamValue>;

export type EncodedPairs = [string, string][];

function scalar(value: string | number | boolean): string {
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value);
}

export function encode(params: Params): EncodedPairs {
  const out: EncodedPairs = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined) continue;

    if (Array.isArray(value)) {
      for (const item of value) {
        if (item === null || item === undefined) continue;
        out.push([key, scalar(item)]);
      }
      continue;
    }

    if (typeof value === 'object') {
      for (const [subKey, subValue] of Object.entries(value)) {
        if (subValue === null || subValue === undefined) continue;
        out.push([`${key}[${subKey}]`, scalar(subValue)]);
      }
      continue;
    }

    out.push([key, scalar(value)]);
  }
  return out;
}

function percent(value: string): string {
  // encodeURIComponent already encodes spaces as %20 (not +), matching the
  // API's expectations. It also encodes `[` and `]`, which we want for
  // deepObject keys.
  return encodeURIComponent(value);
}

export function encodeToString(params: Params): string {
  return encode(params)
    .map(([k, v]) => `${percent(k)}=${percent(v)}`)
    .join('&');
}
