/**
 * Small shared modal primitive (overlay + real focus trap + Escape/backdrop
 * close). Used by the move picker, dedupe, export/import and first-run dialogs
 * so their chrome is consistent and each dialog file stays focused on content.
 *
 * Focus handling: on open, focus moves into the dialog (first focusable, else
 * the dialog itself); Tab / Shift+Tab cycle WITHIN the dialog; on close, focus
 * is restored to whatever was focused before. Data dialogs that hold unsaved
 * work (import selection, dedupe curation) pass `dismissOnBackdrop={false}` so a
 * stray backdrop click can't discard it.
 */
import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';

export interface ModalProps {
  title: string;
  onClose: () => void;
  children: ComponentChildren;
  wide?: boolean;
  /** Close when the backdrop is clicked. Default true. */
  dismissOnBackdrop?: boolean;
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

export function Modal({
  title,
  onClose,
  children,
  wide,
  dismissOnBackdrop = true,
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const focusables = (): HTMLElement[] =>
      dialog
        ? Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
        : [];

    // Move focus INTO the dialog so keyboard/AT users land somewhere sensible.
    (focusables()[0] ?? dialog)?.focus();

    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !dialog) return;
      const items = focusables();
      if (items.length === 0) {
        e.preventDefault();
        dialog.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey) {
        if (active === first || !dialog.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last || !dialog.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      previouslyFocused?.focus?.();
    };
  }, [onClose]);

  return (
    <div
      class="etg-modal-overlay"
      onClick={() => {
        if (dismissOnBackdrop) onClose();
      }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        class={wide ? 'etg-modal etg-modal--wide' : 'etg-modal'}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <header class="etg-modal__head">
          <h2 class="etg-modal__title">{title}</h2>
          <button
            type="button"
            class="etg-btn etg-btn--icon"
            aria-label="Close"
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <div class="etg-modal__body">{children}</div>
      </div>
    </div>
  );
}
