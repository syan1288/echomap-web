import type { VercelRequest, VercelResponse } from '@vercel/node';

export function applyCors(req: VercelRequest, res: VercelResponse): void {
  const allow = process.env.ALLOW_ORIGIN?.trim() || '*';
  res.setHeader('Access-Control-Allow-Origin', allow);
  if (allow !== '*') {
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
}

/** @returns true if response was fully sent (preflight). */
export function handleOptions(req: VercelRequest, res: VercelResponse): boolean {
  if (req.method !== 'OPTIONS') return false;
  applyCors(req, res);
  res.statusCode = 204;
  res.end();
  return true;
}

/**
 * Vercel may parse JSON into `req.body`, leave a string/buffer, or leave undefined.
 */
export function getJsonInput(req: VercelRequest): string | Record<string, unknown> | null {
  const b = req.body;
  if (b === undefined || b === null) return null;
  if (typeof b === 'string') return b;
  if (Buffer.isBuffer(b)) return b.toString('utf8');
  if (typeof b === 'object') return b as Record<string, unknown>;
  return null;
}
