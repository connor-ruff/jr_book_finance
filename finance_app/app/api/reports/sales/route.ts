import { NextResponse } from 'next/server';
import { getDailySales } from '@/lib/snowflake/queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function toLocalIsoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function defaultRange(): { from: string; to: string } {
  const today = new Date();
  // First of the month 3 months back: rolling quarter plus month-to-date
  const start = new Date(today.getFullYear(), today.getMonth() - 3, 1);
  return { from: toLocalIsoDate(start), to: toLocalIsoDate(today) };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const defaults = defaultRange();
    const from = searchParams.get('from') ?? defaults.from;
    const to = searchParams.get('to') ?? defaults.to;

    if (!ISO_DATE.test(from) || !ISO_DATE.test(to)) {
      return NextResponse.json(
        { error: 'from and to must be YYYY-MM-DD' },
        { status: 400 },
      );
    }
    if (from > to) {
      return NextResponse.json(
        { error: 'from must be on or before to' },
        { status: 400 },
      );
    }

    const data = await getDailySales({ from, to });
    return NextResponse.json({ data });
  } catch (error) {
    console.error('[api/reports/sales] failed', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
