import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { chromium } from 'playwright';
import { createApp } from '../../server/app.mjs';
import { defaultPreferences, validatePreferences } from '../../shared/model.mjs';
import { PROVIDERS } from '../../shared/providers.mjs';

test('공연 주소에서 공연장을 찾아 기준 좌석을 선택·저장하고 모바일에서도 조작한다', { timeout: 60000 }, async () => {
  const browser = await chromium.launch({ headless: true });
  let runtime, server, ui;
  try {
    let saved = {
      ...defaultPreferences(), selected: PROVIDERS.map(provider => provider.id), date: '2099-10-17', time: '19:00',
      urls: Object.fromEntries(PROVIDERS.map(provider => [provider.id, provider.home])),
    };
    const suppliedBrowsers = {
      sessions: new Map(),
      snapshot: () => Object.fromEntries(PROVIDERS.map(provider => [provider.id, { status: 'verified' }])),
      check: async () => ({ status: 'verified' }), close: async () => {},
    };
    runtime = createApp({
      browsers: suppliedBrowsers,
      load: async () => saved,
      save: async input => { saved = validatePreferences(input); return saved; },
      inspect: async ({ id, url }) => ({ title: `${id} 테스트 공연`, venue: '블루스퀘어 우리은행홀', venueId: 'blue-square-woori', url }),
    });
    runtime.app.use(express.static(fileURLToPath(new URL('../../dist', import.meta.url))));
    const proxy = express();
    proxy.use('/api', (req, _res, next) => { req.headers.origin = 'http://127.0.0.1:5174'; next(); });
    proxy.use(runtime.app);
    server = proxy.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    ui = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
    const page = await ui.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
    page.setDefaultTimeout(10000);
    await page.goto('http://127.0.0.1:' + server.address().port);
    await page.getByRole('heading', { name: '공연장 좌석도에서 선택' }).waitFor();
    assert.equal(await page.locator('.provider-seat-map').count(), 5);

    for (const [index, provider] of PROVIDERS.entries()) {
      const card = page.locator('.provider-seat-map').nth(index);
      await card.getByRole('button', { name: '공연장에서 좌석도 찾기' }).click();
      const seat = card.getByRole('button', { name: '1층 1열 8번', exact: true });
      await seat.waitFor();
      await seat.click();
      assert.equal(await seat.getAttribute('aria-pressed'), 'true', provider.name);
      assert.match(await card.locator('.seat-map-heading').innerText(), /블루스퀘어 우리은행홀/);
    }

    const melon = page.locator('.provider-seat-map').first();
    await melon.getByRole('button', { name: '1열', exact: true }).click();
    assert.ok(await melon.locator('.diagram-seat[aria-pressed="true"]').count() > 20);
    await melon.getByRole('button', { name: '1열', exact: true }).click();
    assert.equal(await melon.locator('.diagram-seat[aria-pressed="true"]').count(), 0);
    await melon.getByRole('button', { name: '1층 1열 8번', exact: true }).click();

    await page.getByRole('button', { name: '설정 저장', exact: true }).click();
    await page.getByText('이 PC에 예매 설정을 저장했습니다.').waitFor();
    assert.equal(saved.seatPreferences.melon.seats.length, 1);
    assert.equal(saved.seatPreferences.nol.seats.length, 1);
    assert.equal(saved.venues.melon, 'blue-square-woori');
    assert.equal(await page.getByRole('button', { name: '좌석 선택 실행' }).isEnabled(), true);

    await mkdir('.local/audit', { recursive: true });
    await melon.scrollIntoViewIfNeeded();
    await page.screenshot({ path: '.local/audit/venue-map-desktop.png' });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await melon.getByRole('button', { name: '1층 1열 8번', exact: true }).focus();
    await page.keyboard.press('Enter');
    assert.equal(await melon.locator('.diagram-seat[aria-pressed="true"]').count(), 0);
    await page.screenshot({ path: '.local/audit/venue-map-mobile.png' });

    await page.reload();
    await page.waitForFunction(() => document.querySelector('.provider-seat-map .chosen-seats'));
    assert.match(await page.locator('.provider-seat-map').first().locator('.chosen-seats').innerText(), /1석/);
    await page.getByLabel('관람 날짜', { exact: true }).fill('2099-10-18');
    assert.equal(await page.getByRole('button', { name: '좌석 선택 실행' }).isEnabled(), true);

    await page.getByLabel('멜론티켓 공연 URL').fill('https://ticket.melon.com/performance/index.htm?prodId=999');
    assert.equal(await melon.locator('.seat-diagram').count(), 0);
    assert.equal(await page.getByRole('button', { name: '좌석 선택 실행' }).isEnabled(), false);
    await melon.getByLabel('멜론티켓 공연장 직접 선택').selectOption('klarts-bbch');
    await melon.getByRole('button', { name: '1층 A열 6번', exact: true }).click();
    assert.match(await melon.locator('.chosen-seats').innerText(), /1층 A열 6번/);
    assert.deepEqual(errors, []);
  } finally {
    if (runtime) await runtime.close();
    if (server) await new Promise(resolve => server.close(resolve));
    await ui?.close();
    await browser.close();
  }
});
