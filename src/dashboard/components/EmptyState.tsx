/**
 * Sensible empty state for an empty pane / vault / result set.
 */
import type { ComponentChildren } from 'preact';

export interface EmptyStateProps {
  title: string;
  hint?: string;
  /** A small decorative glyph (emoji/text). Not load-bearing; aria-hidden. */
  icon?: string;
  action?: ComponentChildren;
}

export function EmptyState({ title, hint, icon, action }: EmptyStateProps) {
  return (
    <div class="etg-empty">
      {icon ? (
        <div class="etg-empty__icon" aria-hidden="true">
          {icon}
        </div>
      ) : null}
      <div class="etg-empty__title">{title}</div>
      {hint ? <p class="etg-empty__hint">{hint}</p> : null}
      {action ? <div class="etg-empty__action">{action}</div> : null}
    </div>
  );
}
