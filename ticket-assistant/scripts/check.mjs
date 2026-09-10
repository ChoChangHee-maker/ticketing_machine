import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
for (const dir of ['server', 'shared', 'scripts']) for (const file of readdirSync(dir).filter(f => f.endsWith('.mjs'))) {
  const result = spawnSync(process.execPath, ['--check', dir + '/' + file], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log('서버 및 공통 모듈 구문 검사 통과');
