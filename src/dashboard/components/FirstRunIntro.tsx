/**
 * First-run intro explaining the capture → file → close → reopen loop and the
 * zero-network guarantee. Shown once (keyed off `prefs.firstRunSeen`).
 */
import { Modal } from './Modal';

export interface FirstRunIntroProps {
  onDismiss: () => void;
}

export function FirstRunIntro({ onDismiss }: FirstRunIntroProps) {
  return (
    <Modal title="Welcome to Easy Tab Groups" onClose={onDismiss}>
      <p class="etg-intro__lead">
        A local-only place to rescue hundreds of tabs — capture them, file them
        into an unlimited nested tree, close them to free RAM, and reopen any
        folder as a native tab group whenever you need it.
      </p>
      <ol class="etg-intro__steps">
        <li>
          <strong>Capture</strong> — import every open tab into your Inbox.
        </li>
        <li>
          <strong>File</strong> — filter by domain, multi-select, and move
          batches into folders.
        </li>
        <li>
          <strong>Close</strong> — filing can close the tabs to free memory; the
          links stay safe in the vault.
        </li>
        <li>
          <strong>Reopen</strong> — click a folder to reopen its tabs as a
          native group named after the folder.
        </li>
      </ol>
      <p class="etg-intro__privacy">
        🔒 <strong>Zero network.</strong> Everything is stored locally in your
        browser. This extension has no host permissions and cannot read your
        page contents — your wallets and logins stay private.
      </p>
      <div class="etg-modal__footer">
        <button
          type="button"
          class="etg-btn etg-btn--primary"
          onClick={onDismiss}
        >
          Get started
        </button>
      </div>
    </Modal>
  );
}
