import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { BrowserManager, findSystemChrome, readLoginSignals } from '../server/browser.mjs';
import { getProvider } from '../shared/providers.mjs';

function page(signals, url = 'https://ticket.melon.com/') {
  const events = new EventEmitter();
  const item = {
    closed: false, signals, address: url, loads: 0,
    on: events.on.bind(events),
    dispatch: events.emit.bind(events),
    isClosed() { return this.closed; },
    mainFrame() { return this; },
    url() { return this.address; },
    frames() { return [{ url: () => this.address, evaluate: async () => this.signals }]; },
    async goto(address) { this.address = address; this.loads++; this.signals = this.nextSignals || this.signals; this.dispatch('framenavigated', this); return { status: () => 200 }; },
    async bringToFront() {},
  };
  return item;
}
function managerFor(pages, id = 'melon') {
  const manager = new BrowserManager({ settleMs: 0 });
  const session = { provider: getProvider(id), context: { pages: () => pages, newPage: async () => { const added = page({}); pages.push(added); return added; } } };
  manager.sessions.set(id, session);
  return { manager, session };
}

test('새 로그인 탭의 성공 표시를 이전 로그인 폼과 섞지 않는다', async () => {
  const { manager } = managerFor([page({ passwordVisible: true }), page({ logoutVisible: true })]);
  assert.equal((await manager.check('melon')).status, 'verified');
});

test('이전 탭에 로그아웃이 있어도 최근 탭에서 성공 근거가 없으면 미확인이다', async () => {
  const { manager } = managerFor([page({ logoutVisible: true }), page({})]);
  assert.equal((await manager.check('melon')).status, 'unknown');
});

test('새로 확인은 공식 페이지를 갱신하여 만료된 로그인을 검출한다', async () => {
  const stale = page({ logoutVisible: true });
  stale.nextSignals = { loginVisible: true };
  const { manager, session } = managerFor([stale]);
  session.verificationPage = stale;
  session.observedPage = stale;
  assert.equal((await manager.check('melon')).status, 'verified');
  assert.equal((await manager.check('melon', { fresh: true })).status, 'required');
  assert.equal(stale.loads, 1);
  assert.equal(manager.states.get('melon').verifiedAt, null);
});

test('페이지를 방금 갱신한 경우에만 제한된 유효 시간 안에서 메뉴 확인을 재사용한다', async () => {
  const current = page({ logoutVisible: true });
  const { manager, session } = managerFor([current]);
  session.verificationPage = current;
  session.observedPage = current;
  session.freshAt = Date.now();
  assert.equal((await manager.check('melon', { fresh: true, maxAgeMs: 30000 })).status, 'verified');
  assert.equal(current.loads, 0);
  session.freshAt = Date.now() - 31000;
  current.nextSignals = { passwordVisible: true };
  assert.equal((await manager.check('melon', { fresh: true, maxAgeMs: 30000 })).status, 'required');
  assert.equal(current.loads, 1);
});

test('확인 도중 닫힌 세션을 뒤늦은 성공 응답이 덮어쓰지 않는다', async () => {
  let release;
  const current = page({});
  current.frames = () => [{ url: current.url.bind(current), evaluate: () => new Promise(resolve => { release = resolve; }) }];
  const { manager } = managerFor([current]);
  const check = manager.check('melon');
  manager.sessions.delete('melon');
  manager.setState('melon', { status: 'closed', detail: '닫힘' });
  release({ logoutVisible: true });
  assert.equal((await check).status, 'closed');
});

test('가벼운 확인이 진행 중이어도 새로 확인 요청은 페이지 갱신을 생략하지 않는다', async () => {
  let release;
  let first = true;
  const current = page({ loginVisible: true });
  current.frames = () => [{ url: current.url.bind(current), evaluate: () => first ? (first = false, new Promise(resolve => { release = resolve; })) : Promise.resolve(current.signals) }];
  const { manager, session } = managerFor([current]);
  session.verificationPage = current;
  const poll = manager.check('melon');
  const refresh = manager.check('melon', { fresh: true });
  release({ logoutVisible: true });
  await poll;
  assert.equal((await refresh).status, 'required');
  assert.equal(current.loads, 1);
});

test('검사 중 이동하거나 닫힌 페이지의 로그아웃 표시를 성공 근거로 쓰지 않는다', async () => {
  for (const mutate of [current => { current.address += 'login'; }, current => { current.closed = true; }]) {
    const current = page({});
    current.frames = () => [{ url: current.url.bind(current), evaluate: async () => { mutate(current); return { logoutVisible: true }; } }];
    const { manager } = managerFor([current]);
    assert.equal((await manager.check('melon')).status, 'unknown');
  }
});

test('숨겨진 프레임의 비밀번호 입력란은 로그인 상태에 섞지 않는다', async () => {
  const current = page({ logoutVisible: true });
  const visibleFrame = current.frames()[0];
  current.frames = () => [visibleFrame, {
    url: () => 'https://ticket.melon.com/login',
    parentFrame: () => visibleFrame,
    frameElement: async () => ({ isVisible: async () => false }),
    evaluate: async () => ({ passwordVisible: true }),
  }];
  const { manager } = managerFor([current]);
  assert.equal((await manager.check('melon')).status, 'verified');
});

test('닫힌 로그인 팝업 뒤에는 공식 확인 탭을 갱신하고 확인 중 상태에서 벗어난다', async () => {
  const official = page({ loginVisible: true });
  official.nextSignals = { logoutVisible: true };
  const popup = page({ passwordVisible: true }, 'https://member.melon.com/login');
  popup.closed = true;
  const { manager, session } = managerFor([official, popup]);
  session.verificationPage = official;
  session.observedPage = popup;
  session.freshAt = Date.now();
  assert.equal((await manager.check('melon')).status, 'verified');
  assert.equal(official.loads, 1);
  assert.equal(session.observedPage, official);
});

test('로그인 팝업을 닫아도 이전 탭의 로그아웃 표시만으로 성공을 인정하지 않는다', async () => {
  const official = page({ logoutVisible: true });
  official.nextSignals = { loginVisible: true };
  const popup = page({}, 'https://accounts.kakao.com/login');
  const { manager, session } = managerFor([official, popup]);
  session.verificationPage = official;
  manager.watch('melon', session, popup);
  popup.closed = true;
  popup.dispatch('close');
  clearTimeout(session.eventTimer);
  assert.equal((await manager.check('melon')).status, 'required');
  assert.equal(official.loads, 1);
});

test('공식 인증 페이지의 로그인 버튼은 직접 로그인 필요로 판정한다', async () => {
  const { manager } = managerFor([page({ loginVisible: true }, 'https://accounts.kakao.com/login')]);
  assert.equal((await manager.check('melon')).status, 'required');
});

test('현재 멜론 계정 로그인 도메인은 인증 화면으로만 인정한다', async () => {
  const login = page({ passwordVisible: true }, 'https://accounts.melon.com/login/login.htm');
  const { manager } = managerFor([login]);
  assert.equal((await manager.check('melon')).status, 'required');
  login.signals = { logoutVisible: true };
  assert.equal((await manager.check('melon')).status, 'unknown');
});

test('멜론의 로그인 방법 선택 화면을 인식하고 로그인 도움말은 제외한다', () => {
  for (const [label, expected] of [['카카오계정 로그인', true], ['카카오 QR코드 로그인', true], ['멜론아이디 로그인', true], ['로그인 또는 회원가입하기', true], ['카카오 QR코드 로그인 도움말', false]]) {
    const button = { textContent: label, getClientRects: () => [1], getAttribute: () => null, querySelector: () => null };
    const signals = runInNewContext('(' + readLoginSignals.toString() + ')()', {
      document: { querySelectorAll: selector => selector.startsWith('a,button,') ? [button] : [] },
      getComputedStyle: () => ({ visibility: 'visible', display: 'block' }),
    });
    assert.equal(signals.loginVisible, expected, label);
    assert.equal(signals.logoutVisible, false, label);
  }
});

test('NOL 마이페이지 응답에서는 로그인 여부만 보관해 성공과 만료를 판별한다', async () => {
  const current = page({}, 'https://nol.yanolja.com/member/mypage');
  const { manager, session } = managerFor([current], 'nol');
  session.suspended = true;
  manager.watch('nol', session, current);
  const response = value => ({
    url: () => 'https://nol.yanolja.com/api/v2/member-site/mypage/home/v2',
    status: () => 200,
    json: async () => ({ isLogin: value, user: { name: 'private-test-value' } }),
  });
  current.dispatch('response', response(true));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(JSON.stringify(session.loginEvidence.get(current)).includes('private-test-value'), false);
  session.suspended = false;
  assert.equal((await manager.check('nol')).status, 'verified');
  session.suspended = true;
  current.dispatch('response', response(false));
  await new Promise(resolve => setImmediate(resolve));
  session.suspended = false;
  assert.equal((await manager.check('nol')).status, 'required');
  clearTimeout(session.eventTimer);
});

test('TicketLINK의 유효하지 않은 NetFunnel 키 화면을 별도로 감지한다', () => {
  const signals = runInNewContext('(' + readLoginSignals.toString() + ')()', {
    location: { href: 'https://facility.ticketlink.co.kr/error/popup/none?errorCode=error.netfunnel.invalid.key' },
    document: { body: { innerText: '비정상적인 접근으로 이용이 일시 제한되었습니다. 정상적인 방법으로 예매를 진행해주세요.' }, querySelectorAll: () => [] },
    getComputedStyle: () => ({ visibility: 'visible', display: 'block' }),
  });
  assert.equal(signals.netFunnelInvalid, true);
});

test('로그인 이동 뒤 늦게 그려지는 인증 버튼을 새로고침 없이 기다린다', async () => {
  const current = page({}, 'https://accounts.melon.com/login/login.htm');
  let reads = 0;
  current.frames = () => [{ url: current.url.bind(current), evaluate: async () => ++reads > 1 ? { loginVisible: true } : {} }];
  const { manager } = managerFor([current]);
  manager.settleMs = 1000;
  assert.equal((await manager.check('melon', { settle: true })).status, 'required');
  assert.equal(current.loads, 0);
  assert.equal(reads, 2);
});

test('새 외부 탭이나 빈 팝업은 확인 중인 공식 로그인 탭을 가리지 않는다', async () => {
  const official = page({ logoutVisible: true });
  const { manager, session } = managerFor([official]);
  session.observedPage = official;
  for (const address of ['about:blank', 'https://example.com/']) manager.watch('melon', session, page({}, address));
  assert.equal(session.observedPage, official);
  assert.equal((await manager.check('melon')).status, 'verified');
});

test('공식 인증 페이지로 이동하면 이전 확인 탭의 갱신 시간을 재사용하지 않는다', async () => {
  const official = page({ logoutVisible: true });
  const { manager, session } = managerFor([official]);
  manager.watch('melon', session, official);
  session.freshAt = Date.now();
  official.address = 'https://member.melon.com/login';
  official.dispatch('framenavigated', official);
  clearTimeout(session.eventTimer);
  assert.equal(session.freshAt, null);
});

test('검사 중 로그인 화면이 바뀌면 주기 확인을 기다리지 않고 새 화면을 다시 읽는다', async () => {
  let release;
  let verified;
  const old = page({});
  old.frames = () => [{ url: old.url.bind(old), evaluate: () => new Promise(resolve => { release = resolve; }) }];
  const current = page({ logoutVisible: true });
  const { manager, session } = managerFor([old, current]);
  session.observedPage = old;
  const updated = new Promise(resolve => { verified = resolve; });
  manager.emit = event => { if (event.status === 'verified') verified(event); };
  const pending = manager.check('melon');
  manager.watch('melon', session, current);
  release({ loginVisible: true });
  assert.equal((await pending).status, 'checking');
  let timeout;
  try {
    const result = await Promise.race([updated, new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('로그인 이동 후 재확인이 실행되지 않았습니다.')), 1500); })]);
    assert.equal(result.status, 'verified');
  } finally {
    clearTimeout(timeout);
    clearTimeout(session.eventTimer);
  }
});

test('처음 연결할 때 브라우저의 빈 탭을 재사용한다', async () => {
  const blank = page({ logoutVisible: true }, 'about:blank');
  const pages = [blank];
  const { manager, session } = managerFor(pages);
  assert.equal((await manager.check('melon', { fresh: true })).status, 'verified');
  assert.equal(session.verificationPage, blank);
  assert.equal(pages.length, 1);
});

function contextFor(pages) {
  const events = new EventEmitter();
  return {
    closes: 0,
    pages: () => pages,
    on: events.on.bind(events),
    setDefaultTimeout() {},
    async close() { this.closes++; events.emit('close'); },
  };
}

test('설치된 일반 Chrome을 찾으면 전용 프로필 브라우저에 사용한다', async t => {
  const executable = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  assert.equal(findSystemChrome({ PROGRAMFILES: 'C:\\Program Files' }, candidate => candidate === executable), executable);
  const dataDir = await mkdtemp(join(tmpdir(), 'ticket-browser-'));
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  const context = contextFor([page({ logoutVisible: true }, 'about:blank')]);
  const manager = new BrowserManager({ dataDir, settleMs: 0, browserExecutable: executable, driver: {
    async launchPersistentContext(_profile, options) {
      assert.equal(options.executablePath, executable);
      return context;
    },
  } });
  t.after(() => manager.close());
  assert.equal((await manager.open('melon')).status, 'verified');
});

test('모든 탭이 닫힌 브라우저는 이전 프로필 연결을 닫고 다시 연다', async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'ticket-browser-'));
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  const previous = contextFor([]);
  const next = contextFor([page({ logoutVisible: true }, 'about:blank')]);
  const manager = new BrowserManager({ dataDir, settleMs: 0, driver: { async launchPersistentContext() { assert.equal(previous.closes, 1); return next; } } });
  t.after(() => manager.close());
  manager.sessions.set('melon', { context: previous });
  assert.equal((await manager.open('melon')).status, 'verified');
});

test('브라우저 시작 중 종료하면 늦게 열린 브라우저까지 닫고 기다린다', async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'ticket-browser-'));
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  let releaseLaunch;
  let started;
  const launching = new Promise(resolve => { started = resolve; });
  const context = contextFor([page({ logoutVisible: true }, 'about:blank')]);
  const manager = new BrowserManager({ dataDir, driver: { launchPersistentContext() { started(); return new Promise(resolve => { releaseLaunch = resolve; }); } } });
  const opening = manager.open('melon');
  await launching;
  let finished = false;
  const closing = manager.close().then(() => { finished = true; });
  await Promise.resolve();
  assert.equal(finished, false);
  releaseLaunch(context);
  assert.equal((await opening).status, 'closed');
  await closing;
  assert.equal(context.closes, 1);
  assert.equal(manager.sessions.size, 0);
  assert.equal((await manager.open('melon')).status, 'closed');
});
