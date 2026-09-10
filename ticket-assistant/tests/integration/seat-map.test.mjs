import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { Runner } from '../../server/automation.mjs';
import { defaultPreferences } from '../../shared/model.mjs';
import { PROVIDERS } from '../../shared/providers.mjs';
import { seatKey } from '../../shared/seat-map.mjs';

let browser;
before(async () => { browser = await chromium.launch({ headless: true }); });
after(async () => { await browser?.close(); });
function fixture({ canvas = false, captcha = false, seatless = false } = {}) {
  return `<!doctype html><meta charset="utf-8"><meta property="og:title" content="테스트 공연"><dl><dt>공연장</dt><dd>테스트 극장</dd></dl>
  <button id="date">관람일</button><button id="time">회차</button><button id="entry">예매하기</button>
  <div id="captcha-box" hidden><input placeholder="대소문자 구분없이 문자입력"><button id="done">입력완료</button></div>
  <div id="stage" hidden style="position:relative;width:400px;height:230px">
  ${canvas ? '<canvas width="400" height="230"></canvas>' : seatless ? '' : [1, 2, 3, 4].map(n => `<button data-seat-id="${n}" data-zone="1층 A구역" data-row="3" data-seat-no="${n}" aria-selected="false" style="position:absolute;left:${n * 35}px;top:${20 + n * n}px;width:24px;height:24px">${n}</button>`).join('')}</div>
  <script>window.clicks=[];
  for(const id of ['date','time']) document.getElementById(id).onclick=()=>clicks.push(id);
  document.querySelector('#entry').onclick=()=>{clicks.push('entry');document.querySelector('#stage').hidden=false;${captcha ? "document.querySelector('#captcha-box').hidden=false;" : ''}};
  document.querySelector('#done').onclick=()=>document.querySelector('#captcha-box').hidden=true;
  document.querySelectorAll('[data-seat-id]').forEach(el=>el.onclick=()=>{clicks.push('seat-'+el.dataset.seatId);el.setAttribute('aria-selected','true');});
  </script>`;
}
async function exercise(id, options, fn) {
  const context = await browser.newContext();
  try {
    // All five sites are mocked: these tests do not assert real-site compatibility.
    await context.route('**/*', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: fixture(options) }));
    const url = PROVIDERS.find(p => p.id === id).home;
    const config = { ...defaultPreferences(), selected: [id], date: '2099-10-17', time: '19:00', urls: { [id]: url }, profiles: { [id]: { date: '#date', time: '#time', entry: '#entry' } } };
    const runner = new Runner({ sessions: new Map([[id, { context }]]), check: async () => ({ status: 'verified' }) }, () => {}, { elementWaitMs: 70, pollMs: 10, afterClickMs: 0 });
    await runner.start(config, { preview: true });
    await runner.task;
    await fn(runner, config, runner.pages(id)[0]);
  } finally { await context.close(); }
}

for (const provider of PROVIDERS) test(`${provider.name}: 좌석도 준비는 실제 좌석을 클릭하지 않고 위치·극장 정보를 읽는다`, async () => {
  await exercise(provider.id, {}, async (runner, config, page) => {
    assert.equal(runner.state.status, 'prepared');
    assert.equal(runner.state.mode, 'map');
    const map = runner.seatMaps.get(provider.id);
    assert.equal(map.seats.length, 4);
    assert.equal(map.title, '테스트 공연');
    assert.equal(map.venue, '테스트 극장');
    assert.ok(map.seats[0].x < map.seats[1].x && map.seats[0].y < map.seats[1].y);
    assert.deepEqual(await page.evaluate(() => window.clicks), ['date', 'time', 'entry']);
    assert.equal(runner.state.winner, null);
    assert.equal('locator' in map.seats[0], false);
    const preference = { url: config.urls[provider.id], date: config.date, time: config.time, seats: [map.seats[2]] };
    await runner.start({ ...config, seatPreferences: { [provider.id]: preference } });
    await runner.task;
    assert.equal(runner.state.jobs[provider.id].status, 'selected');
    assert.deepEqual(await runner.pages(provider.id)[0].evaluate(() => window.clicks), ['date', 'time', 'entry', 'seat-3']);
  });
});

test('좌석도 준비 중 인증을 완료하고 다시 읽어도 좌석을 클릭하지 않는다', async () => {
  await exercise('melon', { captcha: true }, async (runner, config, page) => {
    assert.equal(runner.state.status, 'waiting');
    assert.equal(runner.state.jobs.melon.blockedBy, 'security');
    await runner.refreshSeatMap('melon');
    assert.equal(runner.state.status, 'waiting');
    assert.equal(runner.seatMaps.size, 0);
    await page.locator('#done').click();
    await runner.refreshSeatMap('melon');
    assert.equal(runner.state.status, 'prepared');
    assert.deepEqual(await page.evaluate(() => window.clicks), ['date', 'time', 'entry']);
    assert.equal(runner.pages('melon')[0], page);
    await page.locator('[data-seat-id="4"]').evaluate(el => { el.dataset.zone = '2층 B구역'; });
    await runner.refreshSeatMap('melon');
    assert.ok(runner.seatMaps.get('melon').seats.some(seat => seat.key === seatKey({ zone: '2층 B구역', row: '3', number: 4 })));
    runner.stop();
    await assert.rejects(runner.refreshSeatMap('melon'), /불러오기/);
  });
});

test('캔버스 좌석도는 가짜 배치를 만들지 않고 공식 창에서 확인하도록 대기한다', async () => {
  await exercise('nol', { canvas: true }, async (runner, config, page) => {
    assert.equal(runner.state.status, 'waiting');
    assert.match(runner.state.jobs.nol.message, /캔버스/);
    assert.equal(runner.seatMaps.size, 0);
    assert.deepEqual(await page.evaluate(() => window.clicks), ['date', 'time', 'entry']);
  });
});

test('실행 중이거나 다른 티켓처의 창이면 좌석도 새로 읽기를 거부한다', async () => {
  await exercise('yes24', {}, async runner => {
    await assert.rejects(runner.refreshSeatMap('melon'), /불러오기/);
    runner.state.status = 'running';
    await assert.rejects(runner.refreshSeatMap('yes24'), /불러오기/);
  });
});
