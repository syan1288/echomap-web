import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';
import path from 'node:path';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

type EchoApiEnv = {
  GEMINI_API_KEY?: string;
  GOOGLE_CLOUD_PROJECT?: string;
  GOOGLE_CLOUD_LOCATION?: string;
  GOOGLE_APPLICATION_CREDENTIALS?: string;
  GOOGLE_SERVICE_ACCOUNT_JSON?: string;
  GEMINI_IMAGE_MODEL?: string;
  ECHO_IMAGE_MODEL?: string;
};

function applyCors(req: VercelRequest, res: VercelResponse): void {
  const allow = process.env.ALLOW_ORIGIN?.trim() || '*';
  res.setHeader('Access-Control-Allow-Origin', allow);
  if (allow !== '*') res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
}

function handleOptions(req: VercelRequest, res: VercelResponse): boolean {
  if (req.method !== 'OPTIONS') return false;
  applyCors(req, res);
  res.statusCode = 204;
  res.end();
  return true;
}

function envFromProcess(): EchoApiEnv {
  return {
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    GOOGLE_CLOUD_PROJECT: process.env.GOOGLE_CLOUD_PROJECT,
    GOOGLE_CLOUD_LOCATION: process.env.GOOGLE_CLOUD_LOCATION,
    GOOGLE_APPLICATION_CREDENTIALS: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    GOOGLE_SERVICE_ACCOUNT_JSON: process.env.GOOGLE_SERVICE_ACCOUNT_JSON,
    GEMINI_IMAGE_MODEL: process.env.GEMINI_IMAGE_MODEL,
    ECHO_IMAGE_MODEL: process.env.ECHO_IMAGE_MODEL,
  };
}

function applyCredentialsEnv(env: EchoApiEnv) {
  const json = env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (json && !env.GOOGLE_APPLICATION_CREDENTIALS?.trim()) {
    const dir = mkdtempSync(path.join(tmpdir(), 'echo-gcp-'));
    const p = path.join(dir, 'sa.json');
    writeFileSync(p, json, 'utf8');
    process.env.GOOGLE_APPLICATION_CREDENTIALS = p;
  }
  const cred = env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  if (cred && !cred.startsWith('{')) {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = path.isAbsolute(cred) ? cred : path.resolve(process.cwd(), cred);
  }
  const project = env.GOOGLE_CLOUD_PROJECT?.trim();
  const location = (env.GOOGLE_CLOUD_LOCATION || 'us-central1').trim();
  if (project) {
    process.env.GOOGLE_GENAI_USE_VERTEXAI = 'true';
    process.env.GOOGLE_CLOUD_PROJECT = project;
    process.env.GOOGLE_CLOUD_LOCATION = location;
  }
}

function createGenAI(env: EchoApiEnv): GoogleGenAI | null {
  applyCredentialsEnv(env);
  const project = env.GOOGLE_CLOUD_PROJECT?.trim();
  const location = (env.GOOGLE_CLOUD_LOCATION || 'us-central1').trim();
  if (project) {
    return new GoogleGenAI({ vertexai: true, project, location, apiVersion: 'v1' });
  }
  const key = env.GEMINI_API_KEY?.trim();
  if (key) return new GoogleGenAI({ apiKey: key });
  return null;
}

function resolveImageModel(env: EchoApiEnv): string {
  return env.GEMINI_IMAGE_MODEL?.trim() || env.ECHO_IMAGE_MODEL?.trim() || 'gemini-2.5-flash-image';
}

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
    const env = envFromProcess();
    const credPath = env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
    const credentialsFileExists = credPath && !credPath.startsWith('{') ? existsSync(credPath) : false;
    const hasProject = Boolean(env.GOOGLE_CLOUD_PROJECT?.trim());
    const hasCredVar = Boolean(env.GOOGLE_APPLICATION_CREDENTIALS?.trim() || env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim());
    const hasGeminiKey = Boolean(env.GEMINI_API_KEY?.trim());
    const ai = createGenAI(env);
    const imageModel = resolveImageModel(env);

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    res.end(
      JSON.stringify({
        ok: true,
        echoApi: true,
        generateConfigured: Boolean(ai),
        env: {
          hasGoogleCloudProject: hasProject,
          hasGoogleApplicationCredentials: hasCredVar,
          credentialsFileExists,
          hasGeminiApiKey: hasGeminiKey,
          googleCloudLocation: (env.GOOGLE_CLOUD_LOCATION || 'us-central1').trim(),
        },
        geocode: 'nominatim+open-meteo',
        imageModel,
        message: ai
          ? 'POST /api/generate available'
          : hasProject && hasCredVar && !credentialsFileExists && !env.GOOGLE_SERVICE_ACCOUNT_JSON
            ? 'GOOGLE_APPLICATION_CREDENTIALS path not found — use GOOGLE_SERVICE_ACCOUNT_JSON on Vercel'
            : 'Set GEMINI_API_KEY or GOOGLE_CLOUD_PROJECT + credentials (file or GOOGLE_SERVICE_ACCOUNT_JSON)',
      })
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: false, error: msg }));
  }
}
