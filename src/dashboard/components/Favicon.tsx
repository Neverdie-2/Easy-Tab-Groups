/**
 * Favicon (docs/PLAN.md §3.16). Renders the browser's LOCAL cached favicon via
 * the MV3 `_favicon/` endpoint (an extension-local URL — never a network
 * request). The letter/color chip fallback (on image error) lands in Phase 7.
 */
import { faviconUrl } from '../favicon';

export interface FaviconProps {
  url: string;
  size?: number;
}

export function Favicon({ url, size = 32 }: FaviconProps) {
  return (
    <img
      class="etg-favicon"
      alt=""
      width={size}
      height={size}
      src={faviconUrl(url, size)}
    />
  );
}
