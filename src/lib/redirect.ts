import { NextResponse } from 'next/server';

/**
 * Redirect to a path on this site, whatever address the browser is using.
 *
 * `request.nextUrl.origin` is the address the Node server itself listens on.
 * Behind the reverse proxy on the trial server that is `http://0.0.0.0:3000`,
 * so building the redirect from it sent the browser to 0.0.0.0 — logging out
 * ended on "This site can't be reached". A relative `Location` is resolved by
 * the browser against the address it is already on, so it is right behind a
 * proxy, on localhost and on the real domain alike.
 *
 * 303 (See Other) makes the browser follow with a GET, which is what a POST
 * such as logout needs, and is equally correct after a GET.
 */
export function redirectToPath(path: string): NextResponse {
  return new NextResponse(null, { status: 303, headers: { Location: path } });
}
