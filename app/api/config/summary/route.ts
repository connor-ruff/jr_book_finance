import { NextResponse } from 'next/server';
import {
  getConfigBookVersions,
  getConfigBooks,
  getConfigForexRates,
  getConfigKenpRates,
  getConfigMarketplaces,
} from '@/lib/snowflake/config-queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [books, bookVersions, marketplaces, kenpRates, forexRates] =
      await Promise.all([
        getConfigBooks(),
        getConfigBookVersions(),
        getConfigMarketplaces(),
        getConfigKenpRates(),
        getConfigForexRates(),
      ]);

    return NextResponse.json({
      data: { books, bookVersions, marketplaces, kenpRates, forexRates },
    });
  } catch (error) {
    console.error('[api/config/summary] failed', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
