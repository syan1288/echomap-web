import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleGeocode } from '../server/echoApiCore';
import { applyCors, getJsonInput, handleOptions } from '../server/vercelHandlerUtils';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (handleOptions(req, res)) return;
  applyCors(req, res);

  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'method not allowed' }));
    return;
  }

  const input = getJsonInput(req);
  if (input === null) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'expected JSON body' }));
    return;
  }

  const { status, json } = await handleGeocode(input);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(json));
}
