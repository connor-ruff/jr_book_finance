export const SESSION_COOKIE_NAME = 'jrbf-session';
const SESSION_VALUE = 'authenticated';

async function getKey(): Promise<CryptoKey> {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('SESSION_SECRET must be set and at least 32 characters');
  }
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export async function createSessionToken(): Promise<string> {
  const key = await getKey();
  const sig = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(SESSION_VALUE),
  );
  return `${SESSION_VALUE}.${toHex(sig)}`;
}

export async function verifySessionToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const [value, signature] = token.split('.');
  if (value !== SESSION_VALUE || !signature) return false;
  try {
    const key = await getKey();
    return await crypto.subtle.verify(
      'HMAC',
      key,
      fromHex(signature),
      new TextEncoder().encode(value),
    );
  } catch {
    return false;
  }
}
