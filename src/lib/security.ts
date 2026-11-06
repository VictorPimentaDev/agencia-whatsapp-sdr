import { createHmac, timingSafeEqual } from 'node:crypto';

export function equalSecret(actual: string | null, expected: string) {
  if (!actual || !expected) return false;
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function verifySignature(body: string, signature: string | null, secret: string) {
  return equalSecret(
    signature,
    `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`,
  );
}
export function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing server configuration: ${name}`);
  return value;
}
export async function readBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Empty body');
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > 262144) {
      await reader.cancel();
      throw new Error('Body too large');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}
