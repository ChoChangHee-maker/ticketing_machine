import { createServer } from 'vite';
import { startServer } from '../server/index.mjs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let api;
let vite;
try {
  api = await startServer();
  vite = await createServer({ root, configFile: resolve(root, 'vite.config.js') });
  await vite.listen();
  if (process.argv.includes('--open')) vite.openBrowser();
  console.log('\n티켓팅 도우미: http://127.0.0.1:5174/\n티켓처 선택 시 전용 브라우저에서 로그인을 확인합니다.\n');
} catch (error) {
  console.error('프로그램을 시작하지 못했습니다: ' + error.message);
  await vite?.close();
  await api?.close();
  process.exit(1);
}
let closing = false;
async function stop() { if (closing) return; closing = true; await vite.close(); await api.close(); process.exit(0); }
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
