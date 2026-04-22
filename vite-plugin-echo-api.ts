import type { Plugin } from 'vite';
import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { GoogleGenAI, Modality } from '@google/genai';
import { buildInitialUserPrompt, buildEditUserPrompt } from './prompts/echoImageGen';
import {
  buildEchoImageSystemInstruction,
  DEFAULT_BUILDING_STYLE,
  isBuildingStyleId,
} from './prompts/buildingStyle';

const MAX_JSON_BODY_CHARS = 22 * 1024 * 1024; // ~16MB binary as base64 upper bound guard

export interface EchoApiEnv {
  GEMINI_API_KEY?: string;
  GOOGLE_CLOUD_PROJECT?: string;
  GOOGLE_CLOUD_LOCATION?: string;
  GOOGLE_APPLICATION_CREDENTIALS?: string;
  /**
   * Vertex 上用于出图的模型 ID（与控制台「任务」下拉无关，见 resolveImageModel 注释）。
   * 例：gemini-2.5-flash-image（默认 GA）、gemini-3.1-flash-image-preview（Nano Banana 2）
   */
  GEMINI_IMAGE_MODEL?: string;
  ECHO_IMAGE_MODEL?: string;
}

function readBody(req: { on: (ev: string, fn: (...args: unknown[]) => void) => void }): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c: Buffer) => {
      data += c;
    });
    req.on('end', () => {
      if (data.length > MAX_JSON_BODY_CHARS) {
        reject(new Error('payload too large'));
        return;
      }
      resolve(data);
    });
    req.on('error', reject);
  });
}

/** Nominatim 无结果或不可达时，用 Open-Meteo 免费地理编码（无需 key，对部分网络更友好） */
async function geocodeOpenMeteo(q: string): Promise<{
  lat: number;
  lng: number;
  display_name: string;
} | null> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=10&language=zh&format=json`;
  const r = await fetch(url, { headers: { 'User-Agent': 'EchoMap/1.0 (dev)' } });
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

/** 在多条 Nominatim 结果中选最优：importance + 与查询词重合度，减少「整市 bbox」误中区县名的情况 */
function pickBestNominatimHit(
  data: Array<{
    lat: string;
    lon: string;
    display_name: string;
    importance?: number;
    class?: string;
    type?: string;
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

function logLine(kind: string, payload: Record<string, unknown>) {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    kind,
    ...payload,
  });
  console.info(`[echo-api] ${line}`);
  try {
    const dir = path.join(process.cwd(), 'logs');
    mkdirSync(dir, { recursive: true });
    appendFileSync(path.join(dir, 'echo-api.log'), line + '\n', { encoding: 'utf8' });
  } catch {
    /* ignore file log failures (e.g. read-only fs) */
  }
}

function applyCredentialsEnv(env: EchoApiEnv) {
  const cred = env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  if (cred) {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = path.isAbsolute(cred)
      ? cred
      : path.resolve(process.cwd(), cred);
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

/**
 * 默认用 Vertex 文档中的 GA 模型 `gemini-2.5-flash-image`。
 * 旧名 `gemini-2.5-flash-image-preview` 会 404，勿用。
 * Nano Banana 2 对应 `gemini-3.1-flash-image-preview`（预览，需在项目/区域可用）。
 */
function resolveImageModel(env: EchoApiEnv): string {
  const explicit = env.GEMINI_IMAGE_MODEL?.trim() || env.ECHO_IMAGE_MODEL?.trim();
  if (explicit) return explicit;
  return 'gemini-2.5-flash-image';
}

/** 从 generateContent 响应中提取第一张内联图片；失败时返回可展示的诊断信息 */
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
    const msg = [
      `Prompt blocked (${pf.blockReason})`,
      pf.blockReasonMessage ? String(pf.blockReasonMessage) : '',
    ]
      .filter(Boolean)
      .join(' ');
    return {
      error: msg,
      logPayload: { reason: 'prompt_blocked', blockReason: pf.blockReason },
    };
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
    if (!parts?.length) {
      continue;
    }
    for (const part of parts) {
      const inline = part.inlineData as { data?: string; mimeType?: string } | undefined;
      const raw = inline?.data;
      const mime = inline?.mimeType || 'image/png';
      if (raw && typeof raw === 'string') {
        return { imageUrl: `data:${mime};base64,${raw}` };
      }
    }
  }

  // SDK 聚合 getter：部分版本下手写遍历未命中时可仍取到 base64
  const fromGetter = response.data;
  if (typeof fromGetter === 'string' && fromGetter.length > 0) {
    const parts = candidates[0]?.content?.parts;
    const mime =
      parts?.map((p) => (p.inlineData as { mimeType?: string } | undefined)?.mimeType).find(Boolean) ||
      'image/png';
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

  const err =
    errorBits.join(' · ') ||
    'No image in API response (no inlineData parts).';

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

/**
 * Dev / preview：
 * - POST /api/generate → Google Gemini（Vertex 或 GEMINI_API_KEY）
 * - POST /api/geocode → Nominatim，失败则 Open-Meteo（均非「Google 地图」）
 * - GET  /api/echo-health → 检查本地 API 与生成凭证是否就绪
 */
export function echoApiPlugin(env: EchoApiEnv): Plugin {
  const imageModel = resolveImageModel(env);
  let aiSingleton: GoogleGenAI | null | undefined;

  const getAi = () => {
    if (aiSingleton !== undefined) return aiSingleton;
    try {
      aiSingleton = createGenAI(env);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      logLine('createGenAI_error', { error: msg });
      aiSingleton = null;
    }
    return aiSingleton;
  };

  const resolvedCredentialsPath = (): string | null => {
    const cred = env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
    if (!cred) return null;
    return path.isAbsolute(cred) ? cred : path.resolve(process.cwd(), cred);
  };

  const attach = (middlewares: { use: (fn: (req: any, res: any, next: () => void) => void) => void }) => {
    middlewares.use(async (req, res, next) => {
      const pathname = req.url?.split('?')[0] ?? '';
      if (!pathname.startsWith('/api/')) {
        next();
        return;
      }

      if (pathname === '/api/echo-health' && req.method === 'GET') {
        try {
          const credPath = resolvedCredentialsPath();
          const credentialsFileExists = credPath ? existsSync(credPath) : false;
          const hasProject = Boolean(env.GOOGLE_CLOUD_PROJECT?.trim());
          const hasCredVar = Boolean(env.GOOGLE_APPLICATION_CREDENTIALS?.trim());
          const hasGeminiKey = Boolean(env.GEMINI_API_KEY?.trim());
          const ai = getAi();
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'no-store');
          res.end(
            JSON.stringify({
              ok: true,
              echoApi: true,
              /** 为 true 时 POST /api/generate 才会成功（否则 503） */
              generateConfigured: Boolean(ai),
              /** 以下为诊断字段（不含密钥内容） */
              env: {
                hasGoogleCloudProject: hasProject,
                hasGoogleApplicationCredentials: hasCredVar,
                credentialsFileExists,
                credentialsResolvedPath: credPath,
                hasGeminiApiKey: hasGeminiKey,
                googleCloudLocation: (env.GOOGLE_CLOUD_LOCATION || 'us-central1').trim(),
              },
              geocode: 'nominatim+open-meteo',
              imageModel,
              message:
                ai == null
                  ? hasProject && hasCredVar && !credentialsFileExists
                    ? 'GOOGLE_APPLICATION_CREDENTIALS path not found on disk — check the file path in echomap-web/.env'
                    : 'Set GEMINI_API_KEY or GOOGLE_CLOUD_PROJECT + GOOGLE_APPLICATION_CREDENTIALS in echomap-web/.env'
                  : 'POST /api/generate available',
            })
          );
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: false, error: msg }));
        }
        return;
      }

      if (req.method !== 'POST') {
        next();
        return;
      }

      if (pathname === '/api/generate') {
        const reqId = `gen_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        const t0 = Date.now();
        let raw = '';
        try {
          raw = await readBody(req);
        } catch (e) {
          res.statusCode = 413;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'payload too large' }));
          logLine('generate_reject', { reqId, reason: 'payload_too_large' });
          return;
        }

        try {
          const body = JSON.parse(raw) as {
            imageBase64?: string;
            mimeType?: string;
            buildingName?: string;
            userPrompt?: string;
            /** flat | pixel | ink | healing */
            buildingStyle?: string;
          };
          if (!body.imageBase64) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'imageBase64 required' }));
            return;
          }

          const ai = getAi();
          if (!ai) {
            res.statusCode = 503;
            res.setHeader('Content-Type', 'application/json');
            res.end(
              JSON.stringify({
                error:
                  'No AI client: set GOOGLE_CLOUD_PROJECT (+ GOOGLE_APPLICATION_CREDENTIALS for Vertex) or GEMINI_API_KEY in .env',
              })
            );
            logLine('generate_config_error', { reqId, reason: 'no_client' });
            return;
          }

          const userText = body.userPrompt?.trim()
            ? buildEditUserPrompt(body.userPrompt, body.buildingName)
            : buildInitialUserPrompt(body.buildingName);

          const buildingStyle = isBuildingStyleId(body.buildingStyle)
            ? body.buildingStyle
            : DEFAULT_BUILDING_STYLE;
          const systemInstruction = buildEchoImageSystemInstruction(buildingStyle);

          logLine('generate_start', {
            reqId,
            model: imageModel,
            buildingStyle,
            backend: env.GOOGLE_CLOUD_PROJECT ? 'vertex' : 'api_key',
            project: env.GOOGLE_CLOUD_PROJECT || null,
            hasBuildingName: Boolean(body.buildingName?.trim()),
            mode: body.userPrompt ? 'edit' : 'initial',
          });

          // Vertex 要求每条 Content 带 role：user | model，否则 400 INVALID_ARGUMENT
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
            throw new Error(extracted.error);
          }
          const imageUrl = extracted.imageUrl;

          const ms = Date.now() - t0;
          logLine('generate_ok', { reqId, ms, model: imageModel });

          res.setHeader('Content-Type', 'application/json');
          res.end(
            JSON.stringify({
              imageUrl,
              model: imageModel,
              backend: env.GOOGLE_CLOUD_PROJECT ? 'vertex-ai' : 'google-genai',
            })
          );
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          logLine('generate_error', { reqId, ms: Date.now() - t0, error: msg });
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: msg }));
        }
        return;
      }

      if (pathname === '/api/geocode') {
        const raw = await readBody(req);
        try {
          const body = JSON.parse(raw) as { query?: string; centerFromBbox?: boolean };
          const q = String(body.query || '').trim();
          const centerFromBbox = body.centerFromBbox !== false;
          if (!q) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'query required' }));
            return;
          }

          let lat: number | undefined;
          let lng: number | undefined;
          let display_name: string | undefined;
          let provider: 'nominatim' | 'open-meteo' | undefined;

          try {
            const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(q)}&limit=10`;
            const r = await fetch(url, { headers: { 'User-Agent': 'EchoMap/1.0 (dev)' } });
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
            res.setHeader('Content-Type', 'application/json');
            res.end(
              JSON.stringify({
                found: true,
                lat,
                lng,
                display_name,
                provider,
              })
            );
            return;
          }

          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ found: false, provider: null }));
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: msg }));
        }
        return;
      }

      next();
    });
  };

  return {
    name: 'echo-api',
    configureServer(server) {
      attach(server.middlewares);
      server.httpServer?.once('listening', () => {
        console.info(
          '[echo-api] Ready: GET /api/echo-health · POST /api/generate · POST /api/geocode (use this dev server URL, not file:// or raw dist/)'
        );
      });
    },
    configurePreviewServer(server) {
      attach(server.middlewares);
      server.httpServer?.once('listening', () => {
        console.info('[echo-api] Preview: same APIs as dev — open the printed http:// URL');
      });
    },
  };
}
