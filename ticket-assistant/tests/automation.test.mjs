import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Runner } from '../server/automation.mjs';
import { defaultPreferences } from '../shared/model.mjs';

const configFor = (selected = ['melon']) => ({
  ...defaultPreferences(), selected, date: '2099-10-17', time: '19:00', zones: 'A구역',
  urls: Object.fromEntries(selected.map(id => [id, id === 'melon' ? 'https://ticket.melon.com/performance' : 'https://ticket.yes24.com/performance'])),
  profiles: Object.fromEntries(selected.map(id => [id, { date: '#date', time: '#time', entry: '#entry', zone: '#zone', seat: '#seat' }])),
});
const seatData = (number = 1) => ({ index: number - 1, label: 'A구역 3열 ' + number + '번', zone: 'A구역', row: '3', number: String(number), selected: false, disabled: false, visible: true });

// These fixtures exercise the runner without launching or controlling a browser.
function fixture(id = 'melon') {
  const page = new EventEmitter();
  const state = { signals: {}, clicks: [], loads: 0, created: 0, closed: false, queries: [], missing: new Set(), delay: {}, seats: [seatData()], seatFailure: false };
  const frame = {
    url: () => page.address,
    evaluate: async () => state.signals,
    locator: selector => {
      state.queries.push(selector);
      const locator = {
        count: async () => {
          if (state.missing.has(selector)) return 0;
          if (state.delay[selector] > 0) { state.delay[selector]--; return 0; }
          return selector === '#seat' ? state.seats.length : 1;
        },
        evaluateAll: async () => state.seats.map(s => ({ ...s })),
        nth: index => ({
          isVisible: async () => true, isEnabled: async () => true,
          evaluate: async () => selector,
          evaluateAll: async () => state.replacement ? [state.replacement] : state.seats[index] ? [{ ...state.seats[index] }] : [],
          click: async () => {
            state.clicks.push(selector);
            if (selector === '#seat') {
              if (state.seatFailure) throw new Error('click confirmation lost');
              state.seats[index].selected = true;
              state.afterSeat?.();
            }
          },
        }),
      };
      return locator;
    },
  };
  page.address = id === 'melon' ? 'https://ticket.melon.com/performance' : 'https://ticket.yes24.com/performance';
  page.url = () => page.address;
  page.frames = () => [frame];
  page.isClosed = () => state.closed;
  page.goto = async address => { page.address = address; state.loads++; };
  page.bringToFront = async () => {};
  const session = { suspended: false, context: { newPage: async () => { state.created++; return page; } } };
  return { page, state, session };
}
function setup(ids = ['melon']) {
  const fixtures = Object.fromEntries(ids.map(id => [id, fixture(id)]));
  const checks = [];
  const browsers = {
    sessions: new Map(ids.map(id => [id, fixtures[id].session])),
    check: async (id, options) => { checks.push({ id, options }); return { status: 'verified' }; },
  };
  const runner = new Runner(browsers, () => {}, { elementWaitMs: 20, pollMs: 1, afterClickMs: 0 });
  return { runner, fixtures, checks };
}

test('요소가 늦게 나타나도 로딩을 기다려 선택하고 성공 상태를 읽는다', async () => {
  const { runner, fixtures, checks } = setup();
  fixtures.melon.state.delay['#date'] = 2;
  await runner.start(configFor());
  await runner.task;
  assert.deepEqual(fixtures.melon.state.clicks, ['#date', '#time', '#entry', '#zone', '#seat']);
  assert.equal(runner.state.jobs.melon.status, 'selected');
  assert.equal(runner.state.status, 'review');
  assert.ok(checks.every(check => check.options.fresh));
});

test('인증 후 같은 예매창에서 사용자가 지정한 다음 단계부터 이어간다', async () => {
  const { runner, fixtures } = setup();
  fixtures.melon.state.signals = { blocked: true };
  await runner.start(configFor());
  await runner.task;
  assert.equal(runner.state.status, 'waiting');
  assert.equal(runner.state.jobs.melon.phase, 'date');
  assert.deepEqual(fixtures.melon.state.clicks, []);
  await assert.rejects(runner.start(configFor()), /이미 실행/);
  fixtures.melon.state.signals = {};
  await runner.resume('melon', { runId: runner.state.runId, phase: 'time' });
  await runner.task;
  assert.deepEqual(fixtures.melon.state.clicks, ['#time', '#entry', '#zone', '#seat']);
  assert.equal(fixtures.melon.state.created, 1);
  assert.equal(fixtures.melon.state.loads, 1);
});

test('멈춘 실행의 잘못된 단계, 중복 이어가기, 중지 뒤 이어가기를 거부한다', async () => {
  const { runner, fixtures } = setup();
  fixtures.melon.state.signals = { blocked: true };
  await runner.start(configFor());
  await runner.task;
  await assert.rejects(runner.resume('melon', { runId: runner.state.runId - 1, phase: 'date' }), /이어갈/);
  await assert.rejects(runner.resume('melon', { runId: runner.state.runId, phase: 'payment' }), /이어갈/);
  const resuming = runner.resume('melon', { runId: runner.state.runId, phase: 'date' });
  await assert.rejects(runner.resume('melon', { runId: runner.state.runId, phase: 'date' }), /이어갈/);
  await resuming;
  await runner.task;
  runner.stop();
  assert.equal(runner.state.status, 'stopped');
  await assert.rejects(runner.resume('melon', { runId: runner.state.runId, phase: 'date' }), /이어갈/);
});

test('직접 지정한 선택자가 없으면 다른 기본 버튼을 임의로 클릭하지 않는다', async () => {
  const { runner, fixtures } = setup();
  fixtures.melon.state.missing.add('#date');
  await runner.start(configFor());
  await runner.task;
  assert.deepEqual(fixtures.melon.state.clicks, []);
  assert.ok(fixtures.melon.state.queries.every(selector => selector === '#date'));
  assert.equal(runner.state.status, 'waiting');
});

test('다중 티켓처가 동시에 좌석을 찾더라도 한 곳에서만 클릭한다', async () => {
  const { runner, fixtures } = setup(['melon', 'yes24']);
  await runner.start(configFor(['melon', 'yes24']));
  await runner.task;
  const clicked = Object.values(fixtures).flatMap(f => f.state.clicks).filter(selector => selector === '#seat');
  assert.equal(clicked.length, 1);
  assert.equal(Object.values(runner.state.jobs).filter(job => job.status === 'selected').length, 1);
});

test('좌석 클릭 결과가 불확실하면 이어가기를 막고 현재 선택을 직접 확인하게 한다', async () => {
  const { runner, fixtures } = setup();
  fixtures.melon.state.seatFailure = true;
  await runner.start(configFor());
  await runner.task;
  assert.equal(runner.state.status, 'review');
  assert.equal(runner.state.jobs.melon.canResume, false);
  assert.equal(fixtures.melon.state.clicks.filter(s => s === '#seat').length, 1);
  await assert.rejects(runner.resume('melon', { runId: runner.state.runId, phase: 'zone' }), /이어갈/);
});

test('읽은 좌석의 위치가 바뀌면 다른 좌석을 클릭하지 않는다', async () => {
  const { runner, fixtures } = setup();
  fixtures.melon.state.replacement = seatData(9);
  await runner.start(configFor());
  await runner.task;
  assert.equal(fixtures.melon.state.clicks.includes('#seat'), false);
  assert.match(runner.state.jobs.melon.message, /변경/);
});

test('첫 좌석 클릭 후 중지하면 두 번째 좌석을 클릭하지 않는다', async () => {
  const { runner, fixtures } = setup();
  fixtures.melon.state.seats.push(seatData(2));
  fixtures.melon.state.afterSeat = () => runner.stop();
  await runner.start({ ...configFor(), quantity: 2 });
  await runner.task;
  assert.equal(fixtures.melon.state.clicks.filter(s => s === '#seat').length, 1);
  assert.equal(runner.state.status, 'stopped');
});

test('중복된 좌석 표시는 선택 범위 오류로 멈춘다', async () => {
  const { runner, fixtures } = setup();
  fixtures.melon.state.seats.push(seatData());
  await runner.start(configFor());
  await runner.task;
  assert.equal(fixtures.melon.state.clicks.includes('#seat'), false);
  assert.match(runner.state.jobs.melon.message, /여러 개/);
});
