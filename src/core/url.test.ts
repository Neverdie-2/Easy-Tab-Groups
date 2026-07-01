import { describe, expect, it } from 'vitest';
import { domainOf, safeParseUrl } from './url';

describe('safeParseUrl', () => {
  it('parses a valid url into a URL', () => {
    const u = safeParseUrl('https://opensea.io/foo?x=1#h');
    expect(u).toBeInstanceOf(URL);
    expect(u?.hostname).toBe('opensea.io');
  });

  it('returns null (never throws) for garbage and empty input', () => {
    expect(safeParseUrl('')).toBeNull();
    expect(safeParseUrl('not a url')).toBeNull();
    expect(safeParseUrl('http://')).toBeNull();
    // @ts-expect-error — defensive: non-string input must not throw
    expect(safeParseUrl(undefined)).toBeNull();
  });
});

describe('domainOf', () => {
  it('returns the host for https urls', () => {
    expect(domainOf('https://opensea.io/collection/x')).toBe('opensea.io');
  });

  it('strips a leading www.', () => {
    expect(domainOf('https://www.opensea.io')).toBe('opensea.io');
  });

  it('keeps non-www subdomains distinct (registrable-ish, no PSL)', () => {
    expect(domainOf('https://api.opensea.io/v2/x')).toBe('api.opensea.io');
  });

  it('ignores the port', () => {
    expect(domainOf('https://example.com:8443/path')).toBe('example.com');
  });

  it('handles IPv4 hosts', () => {
    expect(domainOf('http://192.168.0.1:3000/x')).toBe('192.168.0.1');
  });

  it('lowercases scheme and host', () => {
    expect(domainOf('HTTPS://Example.COM/Path')).toBe('example.com');
  });

  it('collapses non-web schemes to the scheme name', () => {
    expect(domainOf('chrome://newtab')).toBe('chrome');
    expect(domainOf('chrome://extensions/')).toBe('chrome');
    expect(domainOf('about:blank')).toBe('about');
    expect(domainOf('file:///Users/me/notes.txt')).toBe('file');
    expect(domainOf('ftp://host.example/x')).toBe('ftp');
  });

  it('returns "" for empty / invalid input and never throws', () => {
    expect(domainOf('')).toBe('');
    expect(domainOf('not a url at all')).toBe('');
    // A battery of hostile inputs — must never throw.
    for (const bad of ['://', 'http://', ' ', '\n', 'javascript:void(0)']) {
      expect(() => domainOf(bad)).not.toThrow();
    }
  });
});
