import { createHash } from 'node:crypto';

/** Stable across JSON object key ordering; array order remains significant. */
export function contentDigest(value: unknown): string {
  function canonical(input: unknown): string {
    if (Array.isArray(input)) return `[${input.map(canonical).join(',')}]`;
    if (input !== null && typeof input === 'object')
      return `{${Object.entries(input)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
        .join(',')}}`;
    return JSON.stringify(input) ?? 'null';
  }
  return createHash('sha256').update(canonical(value)).digest('hex');
}
