import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleEchoHealth } from '../server/echoApiCore';
import { applyCors, handleOptions } from '../server/vercelHandlerUtils';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (handleOptions(req, res)) return;
  applyCors(req, res);

  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'method not allowed' }));
    return;
  }

  try {
    const json = await handleEchoHealth();
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify(json));
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: false, error: msg }));
  }
}
