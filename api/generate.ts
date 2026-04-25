import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI, Modality } from '@google/genai';
import path from 'node:path';
import { mkdtempSync, writeFileSync } from 'node:fs';
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

const MAX_JSON_BODY_CHARS = 22 * 1024 * 1024;
const BUILDING_STYLE_IDS = ['flat', 'pixel', 'ink', 'healing'] as const;
type BuildingStyleId = (typeof BUILDING_STYLE_IDS)[number];
const DEFAULT_BUILDING_STYLE: BuildingStyleId = 'flat';

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

function getJsonInput(req: VercelRequest): string | Record<string, unknown> | null {
  const b = req.body;
  if (b == null) return null;
  if (typeof b === 'string') return b;
  if (Buffer.isBuffer(b)) return b.toString('utf8');
  if (typeof b === 'object') return b as Record<string, unknown>;
  return null;
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

function isBuildingStyleId(s: string | undefined | null): s is BuildingStyleId {
  return s != null && (BUILDING_STYLE_IDS as readonly string[]).includes(s);
}

function buildEchoImageSystemInstruction(style: BuildingStyleId = DEFAULT_BUILDING_STYLE): string {
  const styleFragments: Record<BuildingStyleId, string> = {
    flat: '风格：扁平插画风；svg（300dpi）的视觉等价效果；细节清晰。',
    pixel: '风格：pixel art；色块约 32px 量级感。',
    ink: '风格：png (8k) 观感；ink wash；baimiao；细节丰富；色彩鲜明且雅致。',
    healing: '风格：png (300px) 观感；治愈绘本插画风；线条随性松散；marker sketch + charcoal。',
  };
  return [
    '针对图中主体建筑，创建一个3D等轴测视角建筑。建筑应被单独分离，无任何背景，无阴影。',
    '可在保持单主体清晰可读前提下，轻微变化等轴测观察朝向（例如略偏左前与略偏右前交替），使地图上多个建筑不会完全同一视角。',
    styleFragments[style],
    '只保留建筑主体本身，四周留白。',
    '严禁出现任何底座、白色矩形托底、地台、地面切片、平台、路面、阴影或漂浮投影。',
    '输出为纯白背景（#FFFFFF），方便后续自动抠图。No cast shadows, text, or watermark.',
  ].join(' ');
}

function buildInitialUserPrompt(buildingName?: string): string {
  const trimmed = buildingName?.trim();
  const context = trimmed
    ? `The traveler labeled this building or place as: "${trimmed}". If this clearly refers to a famous landmark, use public-domain architectural knowledge to refine proportions, roofline, and materials while matching the uploaded photo as the primary reference. If the label is ambiguous or not a landmark, rely on the photo only.`
    : 'Use only the uploaded photograph as reference for the structure; do not invent unrelated buildings.';
  return [
    'Task: From the provided travel photo, create one depiction of the main building or object only, following the system style.',
    context,
    'Preserve the subject identity from the photo; do not add unrelated scenery, roads, or ground geometry.',
    'Do not place the building on any base slab, white rectangle, platform, road slice, podium, shadow plane, or floating ground.',
  ].join(' ');
}

function buildEditUserPrompt(editInstruction: string, buildingName?: string): string {
  const extra = buildingName?.trim() ? ` Context label (optional): "${buildingName.trim()}".` : '';
  return `${editInstruction.trim()}${extra} Keep the Echo Map style rules from your system instructions.`;
}

function extractInlineImageFromResponse(response: {
  promptFeedback?: { blockReason?: string; blockReasonMessage?: string };
  candidates?: Array<{
    finishReason?: string;
    finishMessage?: string;
    content?: { parts?: Array<Record<string, unknown>> };
  }>;
  data?: string;
  text?: string;
}): { imageUrl: string } | { error: string } {
  const pf = response.promptFeedback;
  if (pf?.blockReason) {
    return { error: `Prompt blocked (${pf.blockReason}) ${pf.blockReasonMessage || ''}`.trim() };
  }
  const candidates = response.candidates;
  if (!candidates?.length) return { error: 'No candidates returned (empty or filtered).' };
  for (const cand of candidates) {
    for (const part of cand.content?.parts || []) {
      const inline = part.inlineData as { data?: string; mimeType?: string } | undefined;
      if (inline?.data) return { imageUrl: `data:${inline.mimeType || 'image/png'};base64,${inline.data}` };
    }
  }
  if (typeof response.data === 'string' && response.data.length > 0) {
    return { imageUrl: `data:image/png;base64,${response.data}` };
  }
  const c0 = candidates[0];
  const textPart = c0?.content?.parts?.find((p) => typeof p.text === 'string')?.text as string | undefined;
  return { error: response.text || textPart || c0?.finishMessage || c0?.finishReason || 'No image in API response.' };
}

export const config = { maxDuration: 120 };

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

  const rawBody = typeof input === 'string' ? input : JSON.stringify(input);
  if (rawBody.length > MAX_JSON_BODY_CHARS) {
    res.statusCode = 413;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'payload too large' }));
    return;
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
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'invalid JSON' }));
    return;
  }

  if (!body.imageBase64) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'imageBase64 required' }));
    return;
  }

  try {
    const env = envFromProcess();
    const ai = createGenAI(env);
    if (!ai) {
      res.statusCode = 503;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          error: 'No AI client: set GEMINI_API_KEY or GOOGLE_CLOUD_PROJECT + GOOGLE_SERVICE_ACCOUNT_JSON / GOOGLE_APPLICATION_CREDENTIALS',
        })
      );
      return;
    }

    const imageModel = resolveImageModel(env);
    const userText = body.userPrompt?.trim()
      ? buildEditUserPrompt(body.userPrompt, body.buildingName)
      : buildInitialUserPrompt(body.buildingName);
    const buildingStyle = isBuildingStyleId(body.buildingStyle) ? body.buildingStyle : DEFAULT_BUILDING_STYLE;

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
        systemInstruction: buildEchoImageSystemInstruction(buildingStyle),
        responseModalities: [Modality.IMAGE, Modality.TEXT],
      },
    });

    const extracted = extractInlineImageFromResponse(response as Record<string, unknown>);
    res.statusCode = 'error' in extracted ? 500 : 200;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    res.end(
      JSON.stringify(
        'error' in extracted
          ? { error: extracted.error }
          : { imageUrl: extracted.imageUrl, model: imageModel, backend: env.GOOGLE_CLOUD_PROJECT ? 'vertex-ai' : 'google-genai' }
      )
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: msg }));
  }
}
