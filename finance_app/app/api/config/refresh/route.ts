import { NextResponse } from 'next/server';
import { getConfigRefreshDashboard } from '@/lib/snowflake/config-queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const data = await getConfigRefreshDashboard();
    return NextResponse.json({ data });
  } catch (error) {
    console.error('[api/config/refresh] failed', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
