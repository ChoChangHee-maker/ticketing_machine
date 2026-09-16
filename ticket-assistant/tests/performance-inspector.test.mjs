import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectPerformance, parseDetails } from '../server/performance-inspector.mjs';

test('공개 공연 상세 HTML에서 제목과 등록된 공연장을 찾는다', async () => {
  const html = `<!doctype html><meta property="og:title" content="뮤지컬 &lt;테스트&gt;"><dl><dt>공연장</dt><dd><span class="place">블루스퀘어 우리은행홀&nbsp;</span></dd></dl>`;
  assert.deepEqual(parseDetails(html), { title: '뮤지컬 <테스트>', venue: '블루스퀘어 우리은행홀', venueId: 'blue-square-woori' });
  const result = await inspectPerformance({ id: 'melon', url: 'https://ticket.melon.com/performance/index.htm?prodId=1', fetcher: async () => new Response(html) });
  assert.equal(result.venueId, 'blue-square-woori');
  assert.equal(result.complete, true);
  assert.equal(result.provider, '멜론티켓');
  assert.equal(result.host, 'ticket.melon.com');
  assert.equal(result.finalUrl, result.url);
  assert.match(result.checkedAt, /^\d{4}-\d{2}-\d{2}T/);
});

test('사이트 설명이 붙은 샤롯데 공연 제목에서는 작품명만 남긴다', () => {
  const html = '<meta property="og:title" content="(겨울왕국) - 현재 공연 | 대한민국 최고의 뮤지컬 전용 공연장 샤롯데씨어터"><div>샤롯데씨어터</div>';
  assert.deepEqual(parseDetails(html), { title: '겨울왕국', venue: '샤롯데씨어터', venueId: 'charlotte-theater' });
});

test('공연 상세의 디큐브 명칭을 등록된 디큐브씨어터로 연결한다', () => {
  const html = '<meta property="og:title" content="뮤지컬 테스트"><dl><dt>공연장</dt><dd>디큐브 링크아트센터</dd></dl>';
  assert.deepEqual(parseDetails(html), { title: '뮤지컬 테스트', venue: '디큐브 링크아트센터 디큐브씨어터', venueId: 'dcube-theater' });
});

test('공식 주소 안에서 이동한 최종 공연 주소와 확인 시각을 반환한다', async () => {
  const responses = [
    new Response(null, { status: 302, headers: { location: '/performance/detail.htm?prodId=7' } }),
    new Response('<meta property="og:title" content="이동한 공연"><dl><dt>공연장</dt><dd>샤롯데씨어터</dd></dl>'),
  ];
  const result = await inspectPerformance({ id: 'melon', url: 'https://ticket.melon.com/performance/index.htm?prodId=7', fetcher: async () => responses.shift() });
  assert.equal(result.finalUrl, 'https://ticket.melon.com/performance/detail.htm?prodId=7');
  assert.equal(result.host, 'ticket.melon.com');
  assert.equal(result.title, '이동한 공연');
  assert.equal(result.venue, '샤롯데씨어터');
});

test('등록되지 않은 공연장 이름도 보여주고 공식 도메인 밖 요청과 리디렉션을 거부한다', async () => {
  const html = '<title>테스트</title><dl><dt>공연장</dt><dd>새 공연장 1관</dd></dl>';
  const result = await inspectPerformance({ id: 'melon', url: 'https://ticket.melon.com/performance/index.htm?prodId=2', fetcher: async () => new Response(html) });
  assert.equal(result.venue, '새 공연장 1관');
  assert.equal(result.venueId, '');
  assert.equal(result.complete, true);
  await assert.rejects(inspectPerformance({ id: 'melon', url: 'https://evil.example/' }), /공식 공연/);
  await assert.rejects(inspectPerformance({
    id: 'melon', url: 'https://ticket.melon.com/performance/index.htm?prodId=3',
    fetcher: async () => new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/private' } }),
  }), /공식 티켓처 주소 밖/);
});
