/**
 * Small shared modal primitive (overlay + focus-trap-lite + Escape/backdrop
 * close). Used by the move picker, dedupe, export/import and first-run dialogs
 * so their chrome is consistent and each dialog file stays focused on content.
 */
import type { ComponentChildren } from 'preact';
import { useEffect } from 'preact/hooks';

export interface ModalProps {
  title: string;
  onClose: () => void;
  children: ComponentChildren;
  wide?: boolean;
}

export function Modal({ title, onClose, children, wide }: ModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div class="etg-modal-overlay" onClick={onClose}>
      <div
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
