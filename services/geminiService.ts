import { assertFileSizeOk, MAX_UPLOAD_BYTES } from '../constants/uploadLimits';
import { apiUrl } from '../lib/apiBase';
import type { BuildingStyleId } from '../prompts/buildingStyle';

/** 与后端 POST 路径一致；本地由 Vite 插件提供，生产由 VITE_API_BASE_URL 指向的服务提供 */
function generateEndpoint(): string {
  if (typeof window !== 'undefined' && window.location.protocol === 'file:') {
    throw new Error(
      'Cannot call /api/generate from file://. Run: cd echomap-web && npm run dev, then open the printed http://localhost:… URL.'
    );
  }
  return apiUrl('/api/generate');
}

const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.onerror = (error) => reject(error);
  });
};

export interface GenerateImageOptions {
  /** M01 或 geocode 得到的建筑名，用于补充知名地标信息 */
  buildingName?: string;
  /** 编辑/重混时的自然语言指令（与 buildingName 可同时存在） */
  userPrompt?: string;
  /** 与 AddBuildingModal 一致，决定 Vertex systemInstruction 风格 */
  buildingStyle?: BuildingStyleId;
}

/** POST /api/generate：开发时由 Vite 插件转发 Vertex；生产需部署等价接口 */
export const generateImageWithPrompt = async (
  imageFile: File,
  options: GenerateImageOptions = {}
): Promise<{ imageUrl: string | null; text: string | null }> => {
  const sizeCheck = assertFileSizeOk(imageFile);
  if (!sizeCheck.ok) {
    throw new Error(sizeCheck.message);
  }

  const imageBase64 = await fileToBase64(imageFile);
  const res = await fetch(generateEndpoint(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imageBase64,
      mimeType: imageFile.type || 'image/jpeg',
      buildingName: options.buildingName?.trim() || undefined,
      userPrompt: options.userPrompt?.trim() || undefined,
      buildingStyle: options.buildingStyle || undefined,
    }),
  });

  const data = (await res.json().catch(() => ({}))) as {
    imageUrl?: string;
    error?: string;
    model?: string;
    backend?: string;
  };

  if (!res.ok) {
    if (res.status === 404) {
      throw new Error(
        data.error ||
          'POST /api/generate returned 404. Start the app with `npm run dev` or `npm run preview` in echomap-web (static file hosting has no API unless you deploy a backend).'
      );
    }
    throw new Error(data.error || `Generate failed (${res.status})`);
  }
  if (!data.imageUrl) {
    throw new Error(data.error || 'No imageUrl in response');
  }

  return { imageUrl: data.imageUrl, text: null };
};

export { MAX_UPLOAD_BYTES };
