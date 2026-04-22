import path from 'path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import { echoApiPlugin } from './vite-plugin-echo-api';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** 始终从本文件所在目录（echomap-web）读 .env，避免在上一级目录执行 npm run 时读不到变量 */
const envDir = path.resolve(__dirname);

export default defineConfig(({ mode }) => {
  const loaded = loadEnv(mode, envDir, '');
  /** 终端里 export 的变量也生效（并覆盖同名 .env，便于临时调试） */
  const env = {
    ...loaded,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY ?? loaded.GEMINI_API_KEY,
    GOOGLE_CLOUD_PROJECT: process.env.GOOGLE_CLOUD_PROJECT ?? loaded.GOOGLE_CLOUD_PROJECT,
    GOOGLE_CLOUD_LOCATION: process.env.GOOGLE_CLOUD_LOCATION ?? loaded.GOOGLE_CLOUD_LOCATION,
    GOOGLE_APPLICATION_CREDENTIALS:
      process.env.GOOGLE_APPLICATION_CREDENTIALS ?? loaded.GOOGLE_APPLICATION_CREDENTIALS,
    GEMINI_IMAGE_MODEL: process.env.GEMINI_IMAGE_MODEL ?? loaded.GEMINI_IMAGE_MODEL,
    ECHO_IMAGE_MODEL: process.env.ECHO_IMAGE_MODEL ?? loaded.ECHO_IMAGE_MODEL,
  };
  return {
    plugins: [echoApiPlugin(env)],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
  };
});
