/**
 * Local favicon URL builder (docs/PLAN.md §3.16, DESIGN §7.2).
 *
 * Returns an EXTENSION-LOCAL relative URL against the MV3 `_favicon/` endpoint.
 * The relative form resolves against the extension origin, so there is NO
 * network request and no extension-id lookup is needed. NEVER build a remote
 * favicon URL here.
 */
export function faviconUrl(pageUrl: string, size = 32): string {
  const params = new URLSearchParams({ pageUrl, size: String(size) });
  return `_favicon/?${params.toString()}`;
}
