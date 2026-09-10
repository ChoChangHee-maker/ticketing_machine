import test from 'node:test';
import assert from 'node:assert/strict';
import { BrowserManager } from '../server/browser.mjs';

function page(signals, url = 'https://ticket.melon.com/') {
  const item = {
    closed: false, signals, address: url, loads: 0,
    isClosed() { return this.closed; },
    url() { return this.address; },
    frames() { return [{ url: () => this.address, evaluate: async () => this.signals }]; },
    async goto(address) { this.address = address; this.loads++; this.signals = this.nextSignals || this.signals; return { status: () => 200 }; },
  };
  return item;
}
function managerFor(pages) {
  const manager = new BrowserManager({ settleMs: 0 });
  const session = { context: { pages: () => pages, newPage: async () => { const added = page({}); pages.push(added); return added; } } };
  manager.sessions.set('melon', session);
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
