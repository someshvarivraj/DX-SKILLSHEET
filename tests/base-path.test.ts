import { describe, expect, it } from 'vitest';
import { withBasePath } from '../src/lib/base-path';

/**
 * Guards the fix for the 2026-09-28 production incident: login-link emails
 * and every raw <a>/<form>/<iframe> URL 404ing once skill-sheet-2 moved under
 * https://dx.morabu.com/skill-sheet-2, because they were built as plain
 * strings that next.config.ts's basePath does not rewrite on its own.
 */
describe('withBasePath', () => {
  const base = '/skill-sheet-2';

  it('leaves every path unchanged when no base path is configured (the trial)', () => {
    for (const p of ['/', '/login', '/api/files/abc', '/people/1/preview?tab=x']) {
      expect(withBasePath(p, '')).toBe(p);
    }
  });

  it('prefixes an ordinary path', () => {
    expect(withBasePath('/login', base)).toBe('/skill-sheet-2/login');
    expect(withBasePath('/api/files/abc%20def', base)).toBe('/skill-sheet-2/api/files/abc%20def');
  });

  it('prefixes the root path without a double slash', () => {
    expect(withBasePath('/', base)).toBe('/skill-sheet-2/');
  });

  it('keeps the query string and hash after the prefix', () => {
    expect(withBasePath('/people/1/preview?tab=education', base)).toBe(
      '/skill-sheet-2/people/1/preview?tab=education',
    );
    expect(withBasePath('/admin/fields/preview?section=personal#top', base)).toBe(
      '/skill-sheet-2/admin/fields/preview?section=personal#top',
    );
  });

  it('is idempotent — a path that already carries the base path is not doubled', () => {
    expect(withBasePath('/skill-sheet-2/login', base)).toBe('/skill-sheet-2/login');
    expect(withBasePath('/skill-sheet-2', base)).toBe('/skill-sheet-2');
  });

  it('leaves absolute URLs alone (an email link built from APP_URL, or an external link)', () => {
    expect(withBasePath('https://dx.morabu.com/skill-sheet-2/auth/verify?token=x', base)).toBe(
      'https://dx.morabu.com/skill-sheet-2/auth/verify?token=x',
    );
    expect(withBasePath('//other-host/path', base)).toBe('//other-host/path');
  });

  it('adds a leading slash to a bare relative path', () => {
    expect(withBasePath('login', base)).toBe('/skill-sheet-2/login');
  });
});
