import test from 'node:test';
import assert from 'node:assert/strict';
import { VENUES, findVenue, getVenue } from '../shared/venues.mjs';

test('요청한 대극장과 기존 공연장을 이름 변형으로 찾는다', () => {
  const names = {
    '광림아트센터 BBCH홀': 'klarts-bbch',
    '샤롯데씨어터': 'charlotte-theater',
    '예술의전당 CJ토월극장': 'sac-cj-towol',
    '예술의전당 오페라극장': 'sac-opera',
    '충무아트센터 대극장': 'chungmu-grand',
    '코엑스아티움 우리은행홀': 'coex-artium',
    '홍익대학교 대학로 아트센터 대극장': 'hongik-daehakro-grand',
    'LG아트센터 서울 LG SIGNATURE 홀': 'lg-signature',
    '블루스퀘어 우리은행홀': 'blue-square-woori',
    '세종문화회관 대극장': 'sejong-grand',
    '링크아트센터 PAYCO홀': 'link-payco',
  };
  for (const [name, id] of Object.entries(names)) assert.equal(findVenue(`공연장: ${name}`)?.id, id, name);
  assert.equal(new Set(VENUES.map(venue => venue.id)).size, VENUES.length);
});

test('공연장 도면은 중복되지 않는 실제 선택 키와 공식 자료 주소를 가진다', () => {
  for (const venue of VENUES) {
    assert.match(venue.source, /^https?:\/\//);
    assert.ok(venue.floors.length > 0, venue.name);
    for (const floor of venue.floors) {
      assert.ok(floor.seats.length > 0, `${venue.name} ${floor.label}`);
      assert.equal(new Set(floor.seats.map(seat => seat.key)).size, floor.seats.length, `${venue.name} ${floor.label}`);
      assert.ok(floor.seats.every(seat => seat.zone && seat.row && Number.isInteger(seat.number)));
    }
  }
  assert.equal(getVenue('sejong-grand').floors[0].seats.length, 1030);
  assert.equal(getVenue('sejong-grand').floors[1].seats.length, 964);
  assert.equal(getVenue('sejong-grand').floors[2].seats.length, 1028);
  assert.ok(getVenue('klarts-bbch').floors[0].seats.some(seat => seat.row === 'A' && seat.number === 6));
});
