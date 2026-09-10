import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import express from 'express';
import { createApp } from './app.mjs';

export function startServer(port = 4318) {
  const runtime = createApp();
  const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
  if (existsSync(dist)) runtime.app.use(express.static(dist));
  else runtime.app.get('/', (_req, res) => res.type('text').send('개발 화면: http://127.0.0.1:5174/'));
  return new Promise((resolve, reject) => {
    const server = runtime.app.listen(port, '127.0.0.1', () => resolve({ ...runtime, server, async close() { await runtime.close(); await new Promise(done => server.close(done)); } }));
    server.on('error', reject);
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const runtime = await startServer().catch(error => { console.error('실행 실패: ' + error.message); process.exit(1); });
  console.log('티켓팅 도우미: http://127.0.0.1:4318/');
  let closing = false;
  const stop = async () => { if (closing) return; closing = true; await runtime.close(); process.exit(0); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
