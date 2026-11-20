import 'server-only';

/**
 * Small in-memory token bucket per key (IP or user). Good enough for one instance;
 * swap for Upstash Redis when running many serverless instances.
 */
const buckets = new Map<string, { tokens: number; at: number }>();

export function allow(key: string, perMinute = 30): boolean {
  const now = Date.now();
  const b = buckets.get(key) ?? { tokens: perMinute, at: now };
  b.tokens = Math.min(perMinute, b.tokens + ((now - b.at) / 60000) * perMinute);
  b.at = now;
  if (b.tokens < 1) {
    buckets.set(key, b);
    return false;
  }
  b.tokens -= 1;
  buckets.set(key, b);
  if (buckets.size > 10000) buckets.clear();
  return true;
}

export function clientIp(headers: Headers): string {
  return (
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() || headers.get('x-real-ip') || 'local'
  );
}

export const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
