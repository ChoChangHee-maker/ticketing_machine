import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectPerformance, parseDetails } from '../server/performance-inspector.mjs';

test('공개 공연 상세 HTML에서 제목과 등록된 공연장을 찾는다', async () => {
  const html = `<!doctype html><meta property="og:title" content="뮤지컬 &lt;테스트&gt;"><dl><dt>공연장</dt><dd><span class="place">블루스퀘어 우리은행홀&nbsp;</span></dd></dl>`;
  assert.deepEqual(parseDetails(html), { title: '뮤지컬 <테스트>', venue: '블루스퀘어 우리은행홀', venueId: 'blue-square-woori' });
  const result = await inspectPerformance({ id: 'melon', url: 'https://ticket.melon.com/performance/index.htm?prodId=1', fetcher: async () => new Response(html) });
  assert.equal(result.venueId, 'blue-square-woori');
});

test('등록되지 않은 공연장 이름도 보여주고 공식 도메인 밖 요청과 리디렉션을 거부한다', async () => {
  const html = '<title>테스트</title><dl><dt>공연장</dt><dd>새 공연장 1관</dd></dl>';
  const result = await inspectPerformance({ id: 'melon', url: 'https://ticket.melon.com/performance/index.htm?prodId=2', fetcher: async () => new Response(html) });
  assert.equal(result.venue, '새 공연장 1관');
  assert.equal(result.venueId, '');
  await assert.rejects(inspectPerformance({ id: 'melon', url: 'https://evil.example/' }), /공식 공연/);
  await assert.rejects(inspectPerformance({
    id: 'melon', url: 'https://ticket.melon.com/performance/index.htm?prodId=3',
    fetcher: async () => new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/private' } }),
  }), /공식 티켓처 주소 밖/);
});
