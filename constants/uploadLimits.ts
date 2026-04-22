/** 与服务端 /api/generate 校验一致（约 10MB 原图 → base64 膨胀后仍可控） */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export function assertFileSizeOk(file: File): { ok: true } | { ok: false; message: string } {
  if (file.size > MAX_UPLOAD_BYTES) {
    const mb = Math.round(MAX_UPLOAD_BYTES / (1024 * 1024));
    return {
      ok: false,
      message: `File too large (max ${mb}MB).`,
    };
  }
  return { ok: true };
}
