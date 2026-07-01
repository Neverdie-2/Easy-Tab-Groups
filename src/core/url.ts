/**
 * Safe URL helpers for grouping / filtering / search (docs/PLAN.md §3.3). PURE.
 * Must NEVER throw.
 */

/** Parse a URL, returning null instead of throwing on invalid input. */
export function safeParseUrl(url: string): URL | null {
  if (typeof url !== 'string' || url.length === 0) return null;
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

/**
 * Registrable-ish host for grouping/filter/search. Never throws.
 *
 * - Web pages (`http`/`https`) collapse to their hostname with a leading
 *   `www.` stripped (so `www.opensea.io` and `opensea.io` group together).
 *   Port and path are ignored. We deliberately do NOT compute the eTLD+1
 *   (that needs the Public Suffix List — a runtime dependency we refuse), so
 *   other subdomains (e.g. `api.opensea.io`) stay distinct: "registrable-ish".
 * - Non-web schemes collapse to the scheme itself, so pages that share a
 *   scheme group together: `chrome://newtab` -> `chrome`, `about:blank` ->
 *   `about`, `file:///x` -> `file`.
 * - Anything unparseable -> `''`.
 */
export function domainOf(url: string): string {
  const parsed = safeParseUrl(url);
  if (parsed === null) return '';
  const scheme = parsed.protocol.replace(/:$/, '').toLowerCase();
  if (scheme === 'http' || scheme === 'https') {
    const host = parsed.hostname.toLowerCase();
    return host.startsWith('www.') ? host.slice(4) : host;
  }
  return scheme;
}
