import { NextResponse } from 'next/server';
import { SESSION_COOKIE_NAME, createSessionToken } from '@/lib/auth/session';

export async function POST(request: Request) {
  const expected = process.env.SITE_PASSWORD;
  if (!expected) {
    return NextResponse.json(
      { error: 'SITE_PASSWORD is not configured' },
      { status: 500 },
    );
  }

  let password: unknown;
  try {
    const body = await request.json();
    password = body?.password;
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (typeof password !== 'string' || password !== expected) {
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
  }

  const token = await createSessionToken();
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}
