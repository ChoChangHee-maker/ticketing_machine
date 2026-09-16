import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { Runner } from '../../server/automation.mjs';
import { nolDateLabel, nolSelectors, parseNolPerformanceText, revealNolDate } from '../../server/nol.mjs';
import { defaultPreferences } from '../../shared/model.mjs';
import { readPerformanceSchedule } from '../../server/schedule.mjs';

let browser;
before(async () => { browser = await chromium.launch({ headless: true }); });
after(async () => { await browser?.close(); });

const config = () => ({
  ...defaultPreferences(), selected: ['nol'], date: '2099-10-17', time: '14:00', zones: 'A구역',
  urls: { nol: 'https://nol.yanolja.com/ticket/products/26009625' },
});

const dateButton = () => `<button type="button" class="react-calendar__tile"><abbr aria-label="${nolDateLabel(config().date)}">17</abbr></button>`;
const times = () => `<ul id="performances">
  <li><button type="button" data-is-selected="false" id="matinee">14:00 <span>VIP석 5</span> <span>R석 5</span> <span>이석훈, 차지연</span></button></li>
  <li><button type="button" data-is-selected="false" id="evening">18:30 <span>VIP석 7</span> <span>R석 123</span> <span>손준호, 선예</span></button></li>
</ul>`;

function markup({ previousMonth = false } = {}) {
  return `<!doctype html><meta charset="utf-8">
    <div class="react-calendar">
      <button type="button" class="react-calendar__navigation__prev-button">prev</button>
      <button type="button" class="react-calendar__navigation__label">${previousMonth ? '2099.09' : '2099.10'}</button>
      <button type="button" class="react-calendar__navigation__next-button">next</button>
      <div id="days">${previousMonth ? '' : dateButton()}</div>
    </div>
    <div id="times">${previousMonth ? '' : times()}</div>
    <button type="button" id="entry">예매하기</button>
    <div id="seat-map" hidden><button data-seat-id="seat-1" data-zone="A구역" data-row="3" data-seat-no="1" aria-selected="false">A구역 3열 1번</button></div>
    <script>
      window.clicks = [];
      document.querySelector('.react-calendar__navigation__next-button').onclick = () => {
        window.clicks.push('next');
        document.querySelector('.react-calendar__navigation__label').textContent = '2099.10';
        document.querySelector('#days').innerHTML = ${JSON.stringify(dateButton())};
        document.querySelector('#times').innerHTML = ${JSON.stringify(times())};
        bind();
      };
      function bind() {
        document.querySelector('.react-calendar__tile')?.addEventListener('click', () => window.clicks.push('date'));
        document.querySelector('#matinee')?.addEventListener('click', () => window.clicks.push('matinee'));
        document.querySelector('#evening')?.addEventListener('click', () => window.clicks.push('evening'));
      }
      bind();
      document.querySelector('#entry').onclick = () => { window.clicks.push('entry'); document.querySelector('#seat-map').hidden = false; };
      document.querySelector('[data-seat-id]').onclick = event => { window.clicks.push('seat'); event.currentTarget.setAttribute('aria-selected', 'true'); };
    </script>`;
}

async function withPage(html, fn) {
  const context = await browser.newContext();
  try {
    await context.route('**/*', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: html }));
    const page = await context.newPage();
    await page.goto(config().urls.nol);
    await fn(page, context);
  } finally { await context.close(); }
}

test('NOL 달력의 한국어 접근성 날짜와 캐스팅이 붙은 회차를 정확히 찾는다', async () => {
  await withPage(markup(), async page => {
    assert.equal(await page.locator(nolSelectors(config()).date[0]).count(), 1);
    assert.equal(await page.locator(nolSelectors(config()).time[0]).getAttribute('id'), 'matinee');
  });
});

test('NOL 달력이 다른 달이면 공식 다음 달 버튼으로 이동한다', async () => {
  await withPage(markup({ previousMonth: true }), async page => {
    await revealNolDate(page.frames(), config());
    assert.equal(await page.locator(nolSelectors(config()).date[0]).count(), 1);
    assert.deepEqual(await page.evaluate(() => window.clicks), ['next']);
  });
});

test('NOL 회차 문구에서 시간, 잔여석, 캐스팅을 분리한다', () => {
  assert.deepEqual(parseNolPerformanceText('14:00 VIP석 5 R석 5 S석 35 A석 42 이석훈, 차지연, 류승주'), {
    time: '14:00',
    casting: '이석훈, 차지연, 류승주',
    availability: [{ grade: 'VIP석', count: 5 }, { grade: 'R석', count: 5 }, { grade: 'S석', count: 35 }, { grade: 'A석', count: 42 }],
  });
});

test('선택한 NOL 날짜에서 실제 회차 목록과 캐스팅을 읽는다', async () => {
  await withPage(markup({ previousMonth: true }), async page => {
    const result = await readPerformanceSchedule({ page, id: 'nol', date: config().date, timeoutMs: 800 });
    assert.deepEqual(result.sessions.map(session => ({ time: session.time, casting: session.casting })), [
      { time: '14:00', casting: '이석훈, 차지연' },
      { time: '18:30', casting: '손준호, 선예' },
    ]);
  });
});

test('Runner가 NOL 날짜와 회차를 선택한 뒤 예매와 좌석 단계로 진행한다', async () => {
  await withPage(markup({ previousMonth: true }), async (_page, context) => {
    const browsers = { sessions: new Map([['nol', { context }]]), check: async () => ({ status: 'verified' }) };
    const runner = new Runner(browsers, () => {}, { elementWaitMs: 800, pollMs: 15, afterClickMs: 0 });
    await runner.start(config());
    await runner.task;
    const booking = runner.pages('nol')[0];
    assert.equal(runner.state.jobs.nol.status, 'selected');
    assert.deepEqual(await booking.evaluate(() => window.clicks), ['next', 'date', 'matinee', 'entry', 'seat']);
  });
});
