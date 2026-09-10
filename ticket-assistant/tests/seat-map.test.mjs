import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chooseSeats, defaultPreferences, validatePreferences } from '../shared/model.mjs';
import { matchingPreference, validateSeatPreferences } from '../shared/seat-map.mjs';
import { savePreferences, loadPreferences } from '../server/store.mjs';
import { PROVIDERS } from '../shared/providers.mjs';

const seat = (zone, row, number, rest = {}) => ({ zone, row, number, available: true, selected: false, ...rest });
const base = () => ({ ...defaultPreferences(), selected: ['melon'], date: '2099-10-17', time: '19:00', urls: { melon: 'https://ticket.melon.com/performance/index.htm?prodId=1' } });
const preferences = (config, seats) => ({ melon: { url: config.urls.melon, date: config.date, time: config.time, seats } });

test('구역·열 입력 없이 좌석도 선호 좌석만으로 실행 설정을 검증한다', () => {
  const config = base();
  config.seatPreferences = preferences(config, [seat('2층 B구역', '가', 5)]);
  const result = validatePreferences(config, true);
  assert.equal(result.zones, '');
  assert.deepEqual(result.seatPreferences.melon.seats, [{ zone: '2층 B구역', row: '가', number: 5 }]);
});

test('공연장 기준 선호 좌석은 날짜·회차가 바뀌어도 같은 공연 URL과 공연장에서 재사용한다', () => {
  const config = base();
  config.venues = { melon: 'blue-square-woori' };
  config.seatPreferences = { melon: { url: config.urls.melon, venueId: 'blue-square-woori', seats: [seat('1층', '3', 10)] } };
  const changed = { ...config, date: '2099-10-18', time: '14:00' };
  assert.equal(matchingPreference(changed, 'melon').seats[0].number, 10);
  const validated = validatePreferences(changed, true);
  assert.deepEqual(validated.seatPreferences.melon, { url: config.urls.melon, date: '', time: '', venueId: 'blue-square-woori', seats: [{ zone: '1층', row: '3', number: 10 }] });
  assert.throws(() => validatePreferences({ ...changed, venues: { melon: 'lg-signature' } }, true), /공연이나 회차/);
});

test('공연장 기준 층 표기는 실제 예매창의 세부 구역 좌석과 호환된다', () => {
  const available = [seat('1층 A구역', '3', 10), seat('2층 A구역', '3', 10)];
  assert.deepEqual(chooseSeats(available, { quantity: 1, adjacent: false, preferredSeats: [seat('1층', '3', 10)] }), [available[0]]);
});

test('다른 공연·날짜·시간의 선호 좌석을 저장할 수 있지만 실행에는 재사용하지 않는다', () => {
  const config = base();
  config.seatPreferences = preferences(config, [seat('A구역', '1', 1)]);
  for (const patch of [{ date: '2099-10-18' }, { time: '14:00' }, { urls: { melon: config.urls.melon.replace('=1', '=2') } }]) {
    const changed = { ...config, ...patch, zones: 'A구역' };
    assert.equal(matchingPreference(changed, 'melon'), null);
    assert.doesNotThrow(() => validatePreferences(changed));
    assert.throws(() => validatePreferences(changed, true), /공연이나 회차가 바뀌었습니다/);
    assert.doesNotThrow(() => validatePreferences(changed, true, { preview: true }));
  }
});

test('선호 좌석을 해제하면 기존 구역 조건으로 몰래 실행하지 않는다', () => {
  const config = base();
  config.zones = 'A구역';
  config.seatPreferences = preferences(config, []);
  assert.throws(() => validatePreferences(config, true), /예매 매수/);
  assert.doesNotThrow(() => validatePreferences(config, true, { preview: true }));
});

test('좌석도에서 고른 좌석만 선택하고 우선순위와 판매 상태를 반영한다', () => {
  const available = [seat('A구역', '1', 1), seat('A구역', '1', 2), seat('B구역', '가', 3), seat('B구역', '가', 4, { available: false })];
  const preferredSeats = [available[3], available[2], available[1]];
  assert.deepEqual(chooseSeats(available, { quantity: 2, adjacent: false, preferredSeats }).map(s => s.number), [3, 2]);
  assert.deepEqual(chooseSeats(available, { quantity: 3, adjacent: false, preferredSeats }), []);
});

test('좌석도 연석 선택은 구역·열이 같은 연속 번호의 선호 좌석으로 제한한다', () => {
  const seats = [seat('A구역', '1', 1), seat('A구역', '1', 2), seat('A구역', '2', 3), seat('B구역', '1', 4), seat('B구역', '1', 5)];
  const preferredSeats = [seats[3], seats[4], seats[0], seats[1], seats[2]];
  assert.deepEqual(chooseSeats(seats, { quantity: 2, adjacent: true, preferredSeats }).map(s => s.number), [4, 5]);
  assert.deepEqual(chooseSeats(seats, { quantity: 2, adjacent: true, preferredSeats: [seats[1], seats[2], seats[3]] }), []);
});

test('5개 티켓처의 선호 좌석을 각각 저장하고 복원한다', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'seat-map-settings-'));
  t.after(() => rm(directory, { recursive: true }));
  const config = { ...base(), selected: PROVIDERS.map(p => p.id), urls: Object.fromEntries(PROVIDERS.map(p => [p.id, p.home])) };
  config.seatPreferences = Object.fromEntries(PROVIDERS.map((p, i) => [p.id, { url: p.home, date: config.date, time: config.time, seats: [seat(`${i + 1}층 A구역`, '가', i + 1)] }]));
  const path = join(directory, 'settings.json');
  await savePreferences(config, path);
  const restored = await loadPreferences(path);
  assert.doesNotThrow(() => validatePreferences(restored, true));
  for (const [index, provider] of PROVIDERS.entries()) assert.equal(matchingPreference(restored, provider.id).seats[0].number, index + 1);
});

test('선호 좌석 입력은 날짜·수량·좌석 필드를 검증하고 좌표 및 임의 필드를 저장하지 않는다', () => {
  const config = base();
  assert.throws(() => validateSeatPreferences({ melon: { ...preferences(config, []).melon, date: '2099-02-30' } }), /날짜/);
  assert.throws(() => validateSeatPreferences(preferences(config, [seat('A구역', '열', 1)])), /구역·열/);
  assert.throws(() => validateSeatPreferences(preferences(config, Array.from({ length: 1001 }, (_, i) => seat('A구역', '1', i + 1)))), /올바르지/);
  const result = validateSeatPreferences(preferences(config, [seat('A구역', '３열', 1, { x: 123, token: 'omit' }), seat('A구역', '3', 1)]));
  assert.deepEqual(result.melon.seats, [{ zone: 'A구역', row: '3', number: 1 }]);
});
