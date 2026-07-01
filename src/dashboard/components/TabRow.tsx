/**
 * One tab row (favicon + title + url), reused for live tabs, folder leaves and
 * search results.
 *
 * XSS-safety (DESIGN §7.4): `title` and `url` are untrusted strings from page
 * metadata. They are rendered as JSX children / attributes, which Preact sets
 * via `textContent` — NEVER as markup. There is no `innerHTML` /
 * `dangerouslySetInnerHTML` anywhere in this tree.
 */
import type { ComponentChildren } from 'preact';
import { Favicon } from './Favicon';

export interface TabRowProps {
  url: string;
  title: string;
  selectable?: boolean;
  selected?: boolean;
  onSelectChange?: (checked: boolean) => void;
  /** Optional secondary line (e.g. the folder path for a search result). */
  subtitle?: string;
  trailing?: ComponentChildren;
  draggable?: boolean;
  onDragStart?: (e: DragEvent) => void;
  onDragEnd?: (e: DragEvent) => void;
  faviconSize?: number;
}

export function TabRow({
  url,
  title,
  selectable,
  selected,
  onSelectChange,
  subtitle,
  trailing,
  draggable,
  onDragStart,
  onDragEnd,
  faviconSize = 16,
}: TabRowProps) {
  const displayTitle = title.trim().length > 0 ? title : url;
  return (
    <div
      class={draggable ? 'etg-tabrow etg-tabrow--draggable' : 'etg-tabrow'}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      {selectable ? (
        <input
          type="checkbox"
          class="etg-tabrow__check"
          checked={!!selected}
          aria-label={`Select ${displayTitle}`}
          onChange={(e) =>
            onSelectChange?.((e.currentTarget as HTMLInputElement).checked)
          }
        />
      ) : null}
      <Favicon url={url} size={faviconSize} />
      <div class="etg-tabrow__main">
        <div class="etg-tabrow__title" title={displayTitle}>
          {displayTitle}
        </div>
        <div class="etg-tabrow__url" title={url}>
          {url}
        </div>
        {subtitle ? <div class="etg-tabrow__sub">{subtitle}</div> : null}
      </div>
      {trailing ? <div class="etg-tabrow__actions">{trailing}</div> : null}
    </div>
  );
}
