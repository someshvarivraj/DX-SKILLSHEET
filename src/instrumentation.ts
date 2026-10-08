/**
 * Runs once when the server starts. Picks up AI generation that was queued
 * before a restart (every deployment restarts the app) — see
 * lib/sheet/generation-jobs.ts.
 *
 * The Node-only work lives in ./instrumentation-node, imported inside this
 * exact check: Next.js compiles this file for the edge runtime too, and only
 * this form keeps the database and mail libraries out of that build.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./instrumentation-node');
  }
}
