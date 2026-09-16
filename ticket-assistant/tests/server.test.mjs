import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app.mjs';
import { loadPreferences, savePreferences } from '../server/store.mjs';
import { defaultPreferences } from '../shared/model.mjs';
import { Runner } from '../server/automation.mjs';
import { BrowserManager } from '../server/browser.mjs';

test('로컬 API가 토큰과 요청 출처를 검사하고 선택한 티켓처만 연결한다', async t => {
  const opened = [];
  const browsers = { snapshot: () => ({}), sessions: new Map(), open: async id => { opened.push(id); return { status: 'required' }; }, check: async () => ({ status: 'required' }), close: async () => {} };
  const runtime = createApp({ browsers, load: async () => defaultPreferences(), save: async input => input });
  const server = runtime.app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.on('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const boot = await fetch(origin + '/api/bootstrap').then(r => r.json());
  assert.equal(boot.providers.length, 5);
  assert.equal(boot.capabilities.seatMaps, true);
  assert.equal(boot.capabilities.venueMaps, true);
  assert.equal(boot.capabilities.schedules, true);
  assert.equal(typeof boot.revision, 'string');
  const request = (headers = {}, id = 'melon') => fetch(origin + '/api/providers/' + id + '/open', { method: 'POST', headers });
  assert.equal((await request()).status, 403);
  assert.equal((await request({ 'x-ticket-token': boot.token, origin: 'https://evil.com' })).status, 403);
  assert.equal((await request({ 'x-ticket-token': boot.token, 'sec-fetch-site': 'cross-site' })).status, 403);
  assert.equal((await request({ 'x-ticket-token': boot.token }, 'unknown')).status, 400);
  assert.equal((await request({ 'x-ticket-token': boot.token })).status, 200);
  assert.deepEqual(opened, ['melon']);
});
test('설정을 저장하고 재시작 후 복원하며 손상된 파일을 조용히 덮어쓰지 않는다', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'ticket-settings-test-'));
  t.after(() => rm(directory, { recursive: true }));
  const file = join(directory, 'settings.json');
  assert.deepEqual(await loadPreferences(file), defaultPreferences());
  await savePreferences({ ...defaultPreferences(), selected: ['melon'], zones: 'A구역' }, file);
  assert.equal((await loadPreferences(file)).zones, 'A구역');
  await writeFile(file, '{broken', 'utf8');
  await assert.rejects(loadPreferences(file), /덮어쓰지/);
  assert.equal(await readFile(file, 'utf8'), '{broken');
});
const runnable = () => ({ ...defaultPreferences(), selected: ['melon'], date: '2099-10-17', time: '19:00', zones: 'A구역', urls: { melon: 'https://ticket.melon.com/performance/index.htm?prodId=1' } });

test('좌석도 API도 토큰·출처를 검사하며 준비 요청만 미리보기 모드를 사용한다', async t => {
  const runtime = createApp({ browsers: { sessions: new Map(), snapshot: () => ({}), close: async () => {} } });
  const server = runtime.app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = 'http://127.0.0.1:' + server.address().port;
  const boot = await fetch(url + '/api/bootstrap').then(response => response.json());
  const calls = [];
  runtime.runner.start = async (body, options) => { calls.push({ body, options }); return { status: 'prepared' }; };
  const request = (path, body, headers = {}) => fetch(url + '/api' + path, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) });
  assert.equal((await request('/seat-maps/prepare', runnable())).status, 403);
  const headers = { 'x-ticket-token': boot.token };
  assert.equal((await request('/seat-maps/prepare', runnable(), { ...headers, origin: 'https://evil.com' })).status, 403);
  assert.equal((await request('/seat-maps/prepare', runnable(), headers)).status, 200);
  assert.deepEqual(calls[0].options, { preview: true });
  assert.equal((await request('/run', { ...runnable(), preview: true }, headers)).status, 200);
  assert.equal(calls[1].options, undefined);
  runtime.runner.seatMaps.set('melon', { key: 'fixture-map', seats: [] });
  assert.equal((await request('/providers/melon/seat-map')).status, 403);
  assert.equal((await request('/providers/melon/seat-map', null, headers)).status, 200);
  assert.equal((await request('/providers/nol/seat-map', null, headers)).status, 404);
  assert.equal((await request('/providers/unknown/seat-map', null, headers)).status, 400);
  assert.equal((await request('/providers/melon/seat-map/refresh', {}, headers)).status, 400);
});
test('공연장 찾기 API는 토큰을 검사하고 공개 공연 주소만 검사기에 전달한다', async t => {
  const calls = [];
  const runtime = createApp({
    browsers: { sessions: new Map(), snapshot: () => ({}), close: async () => {} },
    inspect: async input => { calls.push(input); return { title: '테스트 공연', venue: '블루스퀘어 우리은행홀', venueId: 'blue-square-woori' }; },
  });
  const server = runtime.app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => { await runtime.close(); await new Promise(resolve => server.close(resolve)); });
  const origin = 'http://127.0.0.1:' + server.address().port;
  const boot = await fetch(origin + '/api/bootstrap').then(response => response.json());
  const body = { url: 'https://ticket.melon.com/performance/index.htm?prodId=213480' };
  const post = headers => fetch(origin + '/api/providers/melon/performance/inspect', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  assert.equal((await post()).status, 403);
  const response = await post({ 'x-ticket-token': boot.token });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).venueId, 'blue-square-woori');
  assert.deepEqual(calls, [{ id: 'melon', url: body.url }]);
  runtime.runner.state.status = 'running';
  assert.equal((await post({ 'x-ticket-token': boot.token })).status, 409);
});
test('실제 회차 API는 선택한 티켓처, URL, 날짜를 연결된 브라우저에 전달한다', async t => {
  const calls = [];
  const browsers = {
    sessions: new Map(), snapshot: () => ({}), close: async () => {},
    schedule: async (id, input) => { calls.push({ id, ...input }); return { provider: id, date: input.date, sessions: [{ time: '14:00', casting: '테스트 배우' }] }; },
  };
  const runtime = createApp({ browsers, load: async () => defaultPreferences() });
  const server = runtime.app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => { await runtime.close(); await new Promise(resolve => server.close(resolve)); });
  const origin = 'http://127.0.0.1:' + server.address().port;
  const boot = await fetch(origin + '/api/bootstrap').then(response => response.json());
  const body = { url: 'https://nol.yanolja.com/ticket/products/26009625', date: '2026-09-12' };
  const response = await fetch(origin + '/api/providers/nol/performance/schedule', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-ticket-token': boot.token }, body: JSON.stringify(body) });
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).sessions, [{ time: '14:00', casting: '테스트 배우' }]);
  assert.deepEqual(calls, [{ id: 'nol', ...body }]);
  runtime.runner.state.status = 'waiting';
  assert.equal((await fetch(origin + '/api/providers/nol/performance/schedule', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-ticket-token': boot.token }, body: JSON.stringify(body) })).status, 409);
});
test('실제 로그인 확인 전에는 예매 실행이 시작되지 않는다', async () => {
  const runner = new Runner({ check: async () => ({ status: 'unknown' }) });
  await assert.rejects(runner.start(runnable()), /로그인/);
  assert.equal(runner.task, undefined);
});
test('동시에 들어온 시작 요청과 예약 대기 중지를 처리한다', async () => {
  let unlock;
  const runner = new Runner({ check: () => new Promise(resolve => { unlock = resolve; }) });
  const config = { ...runnable(), scheduledAt: '2099-10-17T18:00:00' };
  const first = runner.start(config);
  await assert.rejects(runner.start(config), /이미 실행/);
  unlock({ status: 'verified' });
  await first;
  runner.stop();
  await runner.task;
  assert.equal(runner.state.status, 'stopped');
});
test('자동화가 이전 공연 탭과 로그인 탭의 요소를 선택하지 않는다', () => {
  const frame = url => ({ url: () => url });
  const runner = new Runner({ sessions: new Map() });
  const actual = frame('https://ticket.melon.com/reservation/index.htm');
  runner.jobPages.set('melon', new Set([{ isClosed: () => false, url: actual.url, frames: () => [actual, frame('https://accounts.kakao.com/')] }]));
  assert.deepEqual(runner.frames('melon'), [actual]);
});
test('다른 티켓처가 좌석을 잡으면 추가 클릭을 하지 않는다', async () => {
  const runner = new Runner({});
  runner.state.winner = 'melon';
  await assert.rejects(runner.clickOne('yes24', ['button'], 0), /다른 티켓처/);
});
test('SSO 계정의 로그아웃 표시만으로 티켓처 로그인 성공을 판정하지 않는다', async () => {
  const manager = new BrowserManager();
  const fakeFrame = { url: () => 'https://accounts.kakao.com/', evaluate: async () => ({ logoutVisible: true }) };
  manager.sessions.set('melon', { context: { pages: () => [{ isClosed: () => false, url: fakeFrame.url, frames: () => [fakeFrame] }] } });
  assert.equal((await manager.check('melon')).status, 'unknown');
});
test('YES24 보안 확인 리디렉션을 로그인 성공이나 일반 오류로 표시하지 않는다', async () => {
  const manager = new BrowserManager();
  manager.sessions.set('yes24', { context: { pages: () => [{ isClosed: () => false, url: () => 'https://cdn-botmanager.stclab.com/challenge', frames: () => [] }] } });
  assert.equal((await manager.check('yes24')).status, 'challenge');
});

test('검증 중 중지하면 뒤늦은 로그인 성공으로 실행을 시작하지 않는다', async () => {
  let release;
  const runner = new Runner({ check: () => new Promise(resolve => { release = resolve; }) });
  const start = runner.start(runnable());
  assert.equal(runner.state.status, 'validating');
  runner.stop();
  release({ status: 'verified' });
  await assert.rejects(start, /중지/);
  assert.equal(runner.state.status, 'stopped');
  assert.equal(runner.task, undefined);
});

test('로그인 새로 확인과 이어가기 API가 옵션을 전달하고 실행 중 새 연결을 거부한다', async t => {
  const calls = [];
  const browsers = {
    sessions: new Map(), snapshot: () => ({}), close: async () => {},
    check: async (id, options) => { calls.push({ id, ...options }); return { status: 'unknown' }; },
    focus: async (id, options) => { calls.push({ id, ...options }); },
  };
  const runtime = createApp({ browsers, load: async () => defaultPreferences() });
  const server = runtime.app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.on('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const boot = await fetch(origin + '/api/bootstrap').then(r => r.json());
  const post = (path, body = {}) => fetch(origin + '/api' + path, { method: 'POST', headers: { 'x-ticket-token': boot.token, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await post('/providers/melon/check')).status, 200);
  assert.deepEqual(calls[0], { id: 'melon', fresh: true });
  for (const state of ['validating', 'running', 'scheduled', 'stopping']) {
    runtime.runner.state.status = state;
    assert.equal((await post('/providers/melon/open')).status, 409);
    assert.equal((await post('/providers/melon/check')).status, 409);
  }
  runtime.runner.state.status = 'waiting';
  assert.equal((await post('/providers/melon/open')).status, 409);
  assert.equal((await post('/providers/melon/focus', { view: 'login' })).status, 200);
  assert.deepEqual(calls.at(-1), { id: 'melon', allowOpen: false, verification: true });
  assert.equal((await post('/providers/melon/resume', { runId: 999, phase: 'date' })).status, 400);
});
