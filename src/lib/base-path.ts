/**
 * The subpath this deployment is served under, if any — e.g. `/skill-sheet-2`
 * when the app lives at `https://dx.morabu.com/skill-sheet-2` alongside other
 * apps on the same domain. The trial, and any deployment on its own domain,
 * leave `NEXT_PUBLIC_BASE_PATH` unset and this is `''`.
 *
 * Read from a `NEXT_PUBLIC_*` variable (not a plain one) because this module
 * is imported from client components too (e.g. sheet-toolbar.tsx) — a plain
 * `process.env.X` reference inside client code is not replaced at build time
 * and would read as `undefined` in the browser.
 *
 * `next.config.ts`'s own `basePath` option already rewrites every `next/link`
 * `href` and `router.push()` call automatically. This constant, and
 * `withBasePath` below, are only for the URLs Next does not rewrite on its
 * own: raw `<a href>`/`<form action>`/`<iframe src>` strings, `fetch()` paths,
 * manually built redirect `Location` headers, the session cookie's `path`,
 * and login-link emails built from `APP_URL` — see the corresponding
 * production incident (2026-09-28, "Restore production /skill-sheet-2 base
 * path") for the concrete list of what broke without it.
 */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || '';

const ABSOLUTE_URL = /^[a-z][a-z\d+.-]*:/i;

/**
 * Add a base path to a raw application URL Next.js cannot rewrite.
 *
 * `basePath` is injected (defaulting to the real, environment-derived
 * `BASE_PATH`) so this can be tested directly against a chosen value, rather
 * than through `process.env` stubbing — the same reasoning as
 * `generateUniqueCode`'s injected `exists` in the field-definition actions.
 */
export function withBasePath(path: string, basePath: string = BASE_PATH): string {
  if (!basePath) return path;
  if (ABSOLUTE_URL.test(path) || path.startsWith('//')) return path;

  const match = path.match(/^([^?#]*)([?#].*)?$/);
  const pathname = match?.[1] ?? path;
  const suffix = match?.[2] ?? '';
  const normalized =
    !pathname || pathname === '/' ? '/' : pathname.startsWith('/') ? pathname : `/${pathname}`;

  // Idempotent: a path built from a value that already carries the base path
  // (e.g. passed through twice) is returned unchanged rather than doubled.
  if (normalized === basePath || normalized.startsWith(`${basePath}/`)) {
    return `${normalized}${suffix}`;
  }
  if (normalized === '/') return `${basePath}/${suffix}`;
  return `${basePath}${normalized}${suffix}`;
}
