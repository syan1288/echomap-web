/**
 * Vercel Serverless 与本地 Vite 插件共用的 Echo API 核心逻辑（无 Vite 依赖）。
 */
import { GoogleGenAI, Modality } from '@google/genai';
import path from 'node:path';
import { appendFileSync, existsSync, mkdirSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { buildInitialUserPrompt, buildEditUserPrompt } from '../prompts/echoImageGen.js';
import {
  buildEchoImageSystemInstruction,
  DEFAULT_BUILDING_STYLE,
  isBuildingStyleId,
} from '../prompts/buildingStyle.js';

export type EchoApiEnv = {
  GEMINI_API_KEY?: string;
  GOOGLE_CLOUD_PROJECT?: string;
  GOOGLE_CLOUD_LOCATION?: string;
  GOOGLE_APPLICATION_CREDENTIALS?: string;
  /** 整份 service account JSON（Vercel 等无文件系统时用），会写入临时文件并设置 GOOGLE_APPLICATION_CREDENTIALS */
  GOOGLE_SERVICE_ACCOUNT_JSON?: string;
  GEMINI_IMAGE_MODEL?: string;
  ECHO_IMAGE_MODEL?: string;
};

const MAX_JSON_BODY_CHARS = 22 * 1024 * 1024;

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

function logLine(kind: string, payload: Record<string, unknown>) {
  const line = JSON.stringify({ ts: new Date().toISOString(), kind, ...payload });
  console.info(`[echo-api] ${line}`);
  try {
    const dir = path.join(process.cwd(), 'logs');
    mkdirSync(dir, { recursive: true });
    appendFileSync(path.join(dir, 'echo-api.log'), `${line}\n`, { encoding: 'utf8' });
  } catch {
    /* Vercel 等只读环境忽略写文件 */
  }
}

async function geocodeOpenMeteo(q: string): Promise<{
  lat: number;
  lng: number;
  display_name: string;
} | null> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=10&language=zh&format=json`;
  const r = await fetch(url, { headers: { 'User-Agent': 'EchoMap/1.0' } });
  if (!r.ok) {
    logLine('geocode_openmeteo_http', { status: r.status, q });
    return null;
  }
  const j = (await r.json()) as {
    results?: Array<{
      name?: string;
      admin1?: string;
      country?: string;
      latitude?: number;
      longitude?: number;
      population?: number;
    }>;
  };
  const list = j.results;
  if (!list?.length) return null;
  const qLow = q.toLowerCase();
  const hit =
    [...list].sort((a, b) => {
      const popA = typeof a.population === 'number' ? a.population : 0;
      const popB = typeof b.population === 'number' ? b.population : 0;
      const nameA = [a.name, a.admin1, a.country].filter(Boolean).join(', ').toLowerCase();
      const nameB = [b.name, b.admin1, b.country].filter(Boolean).join(', ').toLowerCase();
      const ma = nameA.includes(qLow) || qLow.split(/[\s,，]+/).some((t) => t.length > 1 && nameA.includes(t));
      const mb = nameB.includes(qLow) || qLow.split(/[\s,，]+/).some((t) => t.length > 1 && nameB.includes(t));
      if (ma !== mb) return ma ? -1 : 1;
      return popB - popA;
    })[0] ?? list[0];
  if (
    !hit ||
    typeof hit.latitude !== 'number' ||
    typeof hit.longitude !== 'number' ||
    !Number.isFinite(hit.latitude) ||
    !Number.isFinite(hit.longitude)
  ) {
    return null;
  }
  const display_name = [hit.name, hit.admin1, hit.country].filter(Boolean).join(', ') || q;
  return { lat: hit.latitude, lng: hit.longitude, display_name };
}

function pickBestNominatimHit(
  data: Array<{
    lat: string;
    lon: string;
    display_name: string;
    importance?: number;
    class?: string;
    type?: string;
    boundingbox?: [string, string, string, string];
  }>,
  rawQuery: string
): (typeof data)[0] | null {
  if (!data.length) return null;
  const q = rawQuery.toLowerCase();
  const tokens = q.split(/[\s,，、]+/).filter((t) => t.length >= 2);
  const scored = data.map((hit, idx) => {
    const imp = typeof hit.importance === 'number' && Number.isFinite(hit.importance) ? hit.importance : 0;
    const dn = (hit.display_name || '').toLowerCase();
    let bonus = 0;
    for (const t of tokens) {
      if (dn.includes(t)) bonus += 0.12;
    }
    if (hit.class === 'boundary' && hit.type === 'administrative') bonus += 0.04;
    if (hit.type === 'administrative' || hit.type === 'city' || hit.type === 'town') bonus += 0.02;
    return { hit, score: imp + bonus, idx };
  });
  scored.sort((a, b) => b.score - a.score || a.idx - b.idx);
  return scored[0]?.hit ?? null;
}

function applyCredentialsEnv(env: EchoApiEnv) {
  const json = env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (json && !env.GOOGLE_APPLICATION_CREDENTIALS?.trim()) {
    try {
      const dir = mkdtempSync(path.join(tmpdir(), 'echo-gcp-'));
      const p = path.join(dir, 'sa.json');
      writeFileSync(p, json, 'utf8');
      process.env.GOOGLE_APPLICATION_CREDENTIALS = p;
    } catch (e) {
      logLine('sa_json_write_error', { error: e instanceof Error ? e.message : String(e) });
    }
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
    return new GoogleGenAI({
      vertexai: true,
      project,
      location,
      apiVersion: 'v1',
    });
  }
  const key = env.GEMINI_API_KEY?.trim();
  if (key) {
    return new GoogleGenAI({ apiKey: key });
  }
  return null;
}

function resolveImageModel(env: EchoApiEnv): string {
  const explicit = env.GEMINI_IMAGE_MODEL?.trim() || env.ECHO_IMAGE_MODEL?.trim();
  if (explicit) return explicit;
  return 'gemini-2.5-flash-image';
}

function extractInlineImageFromResponse(response: {
  promptFeedback?: { blockReason?: string; blockReasonMessage?: string; safetyRatings?: unknown[] };
  candidates?: Array<{
    finishReason?: string;
    finishMessage?: string;
    safetyRatings?: unknown[];
    content?: { parts?: Array<Record<string, unknown>> };
  }>;
  data?: string;
  text?: string;
}): { imageUrl: string } | { error: string; logPayload: Record<string, unknown> } {
  const pf = response.promptFeedback;
  if (pf?.blockReason) {
    const msg = [`Prompt blocked (${pf.blockReason})`, pf.blockReasonMessage ? String(pf.blockReasonMessage) : '']
      .filter(Boolean)
      .join(' ');
    return { error: msg, logPayload: { reason: 'prompt_blocked', blockReason: pf.blockReason } };
  }
  const candidates = response.candidates;
  if (!candidates?.length) {
    return {
      error: 'No candidates returned (empty or filtered). Check promptFeedback / model availability.',
      logPayload: { reason: 'no_candidates', hasPromptFeedback: Boolean(pf) },
    };
  }
  for (let ci = 0; ci < candidates.length; ci++) {
    const cand = candidates[ci];
    const parts = cand.content?.parts;
    if (!parts?.length) continue;
    for (const part of parts) {
      const inline = part.inlineData as { data?: string; mimeType?: string } | undefined;
      const raw = inline?.data;
      const mime = inline?.mimeType || 'image/png';
      if (raw && typeof raw === 'string') {
        return { imageUrl: `data:${mime};base64,${raw}` };
      }
    }
  }
  const fromGetter = response.data;
  if (typeof fromGetter === 'string' && fromGetter.length > 0) {
    const parts = candidates[0]?.content?.parts;
    const mime =
      parts?.map((p) => (p.inlineData as { mimeType?: string } | undefined)?.mimeType).find(Boolean) || 'image/png';
    return { imageUrl: `data:${mime};base64,${fromGetter}` };
  }
  const c0 = candidates[0];
  const textPart = c0?.content?.parts?.find((p) => typeof p.text === 'string')?.text as string | undefined;
  const modelNote = response.text || textPart;
  const partSummary =
    c0?.content?.parts?.map((p) => {
      const keys = Object.keys(p).filter((k) => p[k] != null && k !== 'thought');
      return keys.join('+');
    }) ?? [];
  const errorBits = [
    modelNote ? `Model text: ${modelNote.slice(0, 200)}${modelNote.length > 200 ? '…' : ''}` : null,
    c0?.finishReason ? `finishReason=${c0.finishReason}` : null,
    c0?.finishMessage ? `finishMessage=${String(c0.finishMessage).slice(0, 120)}` : null,
  ].filter(Boolean);
  const err = errorBits.join(' · ') || 'No image in API response (no inlineData parts).';
  return {
    error: err,
    logPayload: {
      reason: 'no_inline_image',
      candidateCount: candidates.length,
      finishReason: c0?.finishReason,
      finishMessage: c0?.finishMessage,
      partSummary,
      safetyFirst: c0?.safetyRatings,
    },
  };
}

let aiSingleton: GoogleGenAI | null | undefined;

function getAi(env: EchoApiEnv): GoogleGenAI | null {
  if (aiSingleton !== undefined) return aiSingleton;
  try {
    aiSingleton = createGenAI(env);
  } catch (e: unknown) {
    logLine('createGenAI_error', { error: e instanceof Error ? e.message : String(e) });
    aiSingleton = null;
  }
  return aiSingleton;
}

export async function handleEchoHealth(): Promise<Record<string, unknown>> {
  const env = envFromProcess();
  const credPath = env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  const credentialsFileExists = credPath && !credPath.startsWith('{') ? existsSync(credPath) : false;
  const hasProject = Boolean(env.GOOGLE_CLOUD_PROJECT?.trim());
  const hasCredVar = Boolean(env.GOOGLE_APPLICATION_CREDENTIALS?.trim() || env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim());
  const hasGeminiKey = Boolean(env.GEMINI_API_KEY?.trim());
  const ai = getAi(env);
  const imageModel = resolveImageModel(env);
  return {
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
  };
}

export async function handleGenerate(
  input: string | Record<string, unknown>
): Promise<{ status: number; json: Record<string, unknown> }> {
  const env = envFromProcess();
  const imageModel = resolveImageModel(env);
  const reqId = `gen_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const t0 = Date.now();

  const rawBody = typeof input === 'string' ? input : JSON.stringify(input);
  if (rawBody.length > MAX_JSON_BODY_CHARS) {
    return { status: 413, json: { error: 'payload too large' } };
  }

  let body: {
    imageBase64?: string;
    mimeType?: string;
    buildingName?: string;
    userPrompt?: string;
    buildingStyle?: string;
  };
  try {
    body = (typeof input === 'object' ? input : JSON.parse(rawBody)) as typeof body;
  } catch {
    return { status: 400, json: { error: 'invalid JSON' } };
  }

  if (!body.imageBase64) {
    return { status: 400, json: { error: 'imageBase64 required' } };
  }

  const ai = getAi(env);
  if (!ai) {
    logLine('generate_config_error', { reqId, reason: 'no_client' });
    return {
      status: 503,
      json: {
        error:
          'No AI client: set GEMINI_API_KEY or GOOGLE_CLOUD_PROJECT + GOOGLE_SERVICE_ACCOUNT_JSON / GOOGLE_APPLICATION_CREDENTIALS',
      },
    };
  }

  const userText = body.userPrompt?.trim()
    ? buildEditUserPrompt(body.userPrompt, body.buildingName)
    : buildInitialUserPrompt(body.buildingName);
  const buildingStyle = isBuildingStyleId(body.buildingStyle) ? body.buildingStyle : DEFAULT_BUILDING_STYLE;
  const systemInstruction = buildEchoImageSystemInstruction(buildingStyle);

  try {
    logLine('generate_start', {
      reqId,
      model: imageModel,
      buildingStyle,
      backend: env.GOOGLE_CLOUD_PROJECT ? 'vertex' : 'api_key',
      hasBuildingName: Boolean(body.buildingName?.trim()),
      mode: body.userPrompt ? 'edit' : 'initial',
    });

    const response = await ai.models.generateContent({
      model: imageModel,
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                data: body.imageBase64,
                mimeType: body.mimeType || 'image/jpeg',
              },
            },
            { text: userText },
          ],
        },
      ],
      config: {
        systemInstruction,
        responseModalities: [Modality.IMAGE, Modality.TEXT],
      },
    });

    const extracted = extractInlineImageFromResponse(response as Record<string, unknown>);
    if ('error' in extracted) {
      logLine('generate_no_image', { reqId, ...extracted.logPayload, error: extracted.error });
      return { status: 500, json: { error: extracted.error } };
    }
    logLine('generate_ok', { reqId, ms: Date.now() - t0, model: imageModel });
    return {
      status: 200,
      json: {
        imageUrl: extracted.imageUrl,
        model: imageModel,
        backend: env.GOOGLE_CLOUD_PROJECT ? 'vertex-ai' : 'google-genai',
      },
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    logLine('generate_error', { reqId, ms: Date.now() - t0, error: msg });
    return { status: 500, json: { error: msg } };
  }
}

export async function handleGeocode(
  input: string | Record<string, unknown>
): Promise<{ status: number; json: Record<string, unknown> }> {
  let body: { query?: string; centerFromBbox?: boolean };
  try {
    body = (typeof input === 'object' ? input : JSON.parse(input)) as { query?: string; centerFromBbox?: boolean };
  } catch {
    return { status: 400, json: { error: 'invalid JSON' } };
  }
  const q = String(body.query || '').trim();
  const centerFromBbox = body.centerFromBbox !== false;
  if (!q) {
    return { status: 400, json: { error: 'query required' } };
  }

  let lat: number | undefined;
  let lng: number | undefined;
  let display_name: string | undefined;
  let provider: 'nominatim' | 'open-meteo' | undefined;

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(q)}&limit=10`;
    const r = await fetch(url, { headers: { 'User-Agent': 'EchoMap/1.0 (vercel)' } });
    if (r.ok) {
      const data = (await r.json()) as Array<{
        lat: string;
        lon: string;
        display_name: string;
        importance?: number;
        class?: string;
        type?: string;
        boundingbox?: [string, string, string, string];
      }>;
      const hit = pickBestNominatimHit(Array.isArray(data) ? data : [], q);
      if (hit) {
        let la = parseFloat(hit.lat);
        let ln = parseFloat(hit.lon);
        if (
          centerFromBbox &&
          hit.boundingbox &&
          Array.isArray(hit.boundingbox) &&
          hit.boundingbox.length >= 4
        ) {
          const south = parseFloat(hit.boundingbox[0]);
          const north = parseFloat(hit.boundingbox[1]);
          const west = parseFloat(hit.boundingbox[2]);
          const east = parseFloat(hit.boundingbox[3]);
          if ([south, north, west, east].every((n) => Number.isFinite(n))) {
            la = (south + north) / 2;
            ln = (west + east) / 2;
          }
        }
        lat = la;
        lng = ln;
        display_name = hit.display_name;
        provider = 'nominatim';
      }
    } else {
      logLine('geocode_nominatim_http', { status: r.status, q });
    }
  } catch (e: unknown) {
    logLine('geocode_nominatim_error', { q, error: e instanceof Error ? e.message : String(e) });
  }

  if (lat == null || lng == null) {
    const om = await geocodeOpenMeteo(q);
    if (om) {
      lat = om.lat;
      lng = om.lng;
      display_name = om.display_name;
      provider = 'open-meteo';
      logLine('geocode_ok', { q, provider: 'open-meteo' });
    }
  } else {
    logLine('geocode_ok', { q, provider: 'nominatim' });
  }

  if (lat != null && lng != null && display_name) {
    return { status: 200, json: { found: true, lat, lng, display_name, provider } };
  }
  return { status: 200, json: { found: false, provider: null } };
}
