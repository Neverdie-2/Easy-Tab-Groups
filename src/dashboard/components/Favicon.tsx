/**
 * Favicon (docs/PLAN.md §3.16, DESIGN §7.2). Renders the browser's LOCAL cached
 * favicon via the MV3 `_favicon/` endpoint — an EXTENSION-LOCAL url, never a
 * network request. If the local cache has no icon (image `error`), it degrades
 * to a deterministic letter/color chip. Still zero network in both branches.
 */
import { useEffect, useState } from 'preact/hooks';
import { faviconUrl } from '../favicon';
import { domainOf } from '../../core/url';

export interface FaviconProps {
  url: string;
  size?: number;
}

/** Deterministic chip: first alphanumeric of the domain + a hashed hue. */
function chipParts(url: string): { letter: string; hue: number } {
  const basis = domainOf(url) || url || '?';
  const letter = (basis.match(/[a-z0-9]/i)?.[0] ?? '?').toUpperCase();
  let hash = 0;
  for (let i = 0; i < basis.length; i++) {
    hash = (hash * 31 + basis.charCodeAt(i)) | 0;
  }
  return { letter, hue: Math.abs(hash) % 360 };
}

export function Favicon({ url, size = 16 }: FaviconProps) {
  const [failed, setFailed] = useState(false);

  // A recycled row may receive a new url; reset the error state so the new
  // icon gets a fresh chance before falling back to a chip.
  useEffect(() => {
    setFailed(false);
  }, [url]);

  if (failed) {
    const { letter, hue } = chipParts(url);
    return (
      <span
        class="etg-favicon etg-favicon--chip"
        aria-hidden="true"
        style={{
          width: `${size}px`,
          height: `${size}px`,
          background: `hsl(${hue}deg 45% 38%)`,
          fontSize: `${Math.round(size * 0.6)}px`,
          lineHeight: `${size}px`,
        }}
      >
        {letter}
      </span>
    );
  }

  return (
    <img
      class="etg-favicon"
      alt=""
      width={size}
      height={size}
      src={faviconUrl(url, size)}
      onError={() => setFailed(true)}
    />
  );
}
