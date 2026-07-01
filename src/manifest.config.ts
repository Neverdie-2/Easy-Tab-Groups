/**
 * Single source of truth for the MV3 manifest.
 *
 * The build (`vite.config.ts`'s `makeManifest` plugin) emits this object to
 * `dist/manifest.json` and the CI no-network guard re-validates the emitted
 * file. Both call `assertManifestPolicy` so the permission allowlist is a
 * typed, test-guarded artifact we own — see docs/PLAN.md §4.
 */

/**
 * The ONLY permissions this extension may ever request. This list is the
 * security contract (docs/DESIGN.md §7.3). The build fails if the manifest's
 * `permissions` array contains anything outside it.
 */
export const ALLOWED_PERMISSIONS = [
  'tabs',
  'tabGroups',
  'storage',
  'unlimitedStorage',
  'favicon',
] as const;

/**
 * Top-level manifest keys that must NEVER appear. Their absence is what makes
 * the extension structurally unable to read page contents.
 */
export const FORBIDDEN_MANIFEST_KEYS = [
  'host_permissions',
  'optional_host_permissions',
  'content_scripts',
  'externally_connectable',
  'optional_permissions',
] as const;

/** Permission strings that are explicitly disallowed even if someone adds them. */
export const FORBIDDEN_PERMISSIONS = [
  '<all_urls>',
  'cookies',
  'history',
  'webRequest',
  'webRequestBlocking',
  'declarativeNetRequest',
  'declarativeNetRequestWithHostAccess',
  'scripting',
  'debugger',
  'management',
  'proxy',
] as const;

export const manifest: chrome.runtime.ManifestV3 = {
  manifest_version: 3,
  name: 'Easy Tab Groups',
  version: '0.1.0',
  description:
    'Local-only tab rescue + nested organizer. Zero network. Cannot read your pages.',
  action: {
    default_title: 'Easy Tab Groups',
    default_icon: {
      16: 'icons/icon16.png',
      32: 'icons/icon32.png',
      48: 'icons/icon48.png',
      128: 'icons/icon128.png',
    },
  },
  background: {
    service_worker: 'service-worker.js',
    type: 'module',
  },
  icons: {
    16: 'icons/icon16.png',
    32: 'icons/icon32.png',
    48: 'icons/icon48.png',
    128: 'icons/icon128.png',
  },
  permissions: [...ALLOWED_PERMISSIONS],
};

/**
 * Validates a manifest object against the security contract. Throws with a
 * descriptive message on the first violation. Pure (no I/O) so it can run in
 * the Vite plugin AND the standalone CI guard.
 */
export function assertManifestPolicy(m: Record<string, unknown>): void {
  for (const key of FORBIDDEN_MANIFEST_KEYS) {
    if (key in m) {
      throw new Error(
        `manifest policy violation: forbidden top-level key "${key}" is present`,
      );
    }
  }

  const permissions = m.permissions;
  if (!Array.isArray(permissions)) {
    throw new Error(
      'manifest policy violation: "permissions" must be an array',
    );
  }

  const allowed = new Set<string>(ALLOWED_PERMISSIONS);
  const forbidden = new Set<string>(FORBIDDEN_PERMISSIONS);
  for (const perm of permissions) {
    if (typeof perm !== 'string') {
      throw new Error('manifest policy violation: non-string permission entry');
    }
    if (forbidden.has(perm)) {
      throw new Error(
        `manifest policy violation: forbidden permission "${perm}"`,
      );
    }
    if (!allowed.has(perm)) {
      throw new Error(
        `manifest policy violation: permission "${perm}" is not in the allowlist [${[
          ...allowed,
        ].join(', ')}]`,
      );
    }
  }
}
