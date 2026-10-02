import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/** The running build, for pages left open across a deployment (new-version-notice.tsx). */
export function GET() {
  return NextResponse.json(
    { build: process.env.NEXT_PUBLIC_BUILD_ID ?? '' },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
