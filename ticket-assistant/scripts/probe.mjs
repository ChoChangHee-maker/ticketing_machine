import { PROVIDERS, allowedUrl } from '../shared/providers.mjs';
import { writeFile, mkdir } from 'node:fs/promises';

// This checks public page reachability only. It is not an account login test.
const results = await Promise.all(PROVIDERS.map(async provider => {
  let url = provider.home;
  try {
    for (let redirects = 0; redirects < 6; redirects++) {
      const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(15000) });
      if (response.status >= 300 && response.status < 400 && response.headers.has('location')) {
        const destination = new URL(response.headers.get('location'), url).href;
        await response.body?.cancel();
        if (!allowedUrl(destination, provider, true)) return { provider: provider.name, reachable: false, status: response.status, note: '확인되지 않은 도메인으로 이동: ' + new URL(destination).hostname, loginVerified: false };
        url = destination;
        continue;
      }
      const status = response.status;
      await response.body?.cancel();
      return { provider: provider.name, reachable: response.ok, status, url, loginVerified: false, note: '공개 페이지 접속 검사. 실제 계정 로그인은 별도 확인 필요.' };
    }
    throw new Error('리디렉션 한도 초과');
  } catch (error) { return { provider: provider.name, reachable: false, note: error.cause?.code || error.message, loginVerified: false }; }
}));
await mkdir('.local', { recursive: true });
await writeFile('.local/connectivity.json', JSON.stringify({ checkedAt: new Date().toISOString(), results }, null, 2));
console.log(JSON.stringify(results, null, 2));
