const seatKey = seat => JSON.stringify([seat.zone, seat.row, seat.number]);

const rows = (from, to, range) => Array.from({ length: to - from + 1 }, (_, index) => ({
  row: from + index,
  ranges: typeof range === 'function' ? range(from + index) : range,
}));

function globalFloor(id, label, specs) {
  const values = specs.flatMap(spec => spec.ranges.flatMap(([from, to]) => [from, to]));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const step = Math.min(17, 790 / Math.max(1, max - min + 1));
  const seats = [];
  specs.forEach((spec, rowIndex) => {
    for (const [from, to] of spec.ranges) for (let number = from; number <= to; number++) {
      const seat = {
        zone: spec.zone || label, row: String(spec.row), number, available: true, panel: id,
        x: 55 + (number - min) * step, y: 88 + rowIndex * 23,
        width: Math.max(8, step - 2), height: 15,
      };
      seats.push({ ...seat, key: seatKey(seat) });
    }
  });
  return { id, label, mode: 'rows', width: 900, height: Math.max(260, 135 + specs.length * 23), seats };
}

function groupedFloor(id, label, groups) {
  const width = 920;
  const gap = 28;
  const groupWidth = (width - 80 - gap * (groups.length - 1)) / groups.length;
  const seats = [];
  groups.forEach((group, groupIndex) => {
    const maxCount = Math.max(...group.rows.map(spec => spec.ranges.reduce((sum, [from, to]) => sum + to - from + 1, 0)));
    const step = Math.min(17, (groupWidth - 20) / Math.max(1, maxCount));
    group.rows.forEach((spec, rowIndex) => {
      let column = 0;
      for (const [from, to] of spec.ranges) for (let number = from; number <= to; number++) {
        const seat = {
          zone: `${label} ${group.id}구역`, row: String(spec.row), number, available: true, panel: id,
          section: group.id, x: 40 + groupIndex * (groupWidth + gap) + column++ * step,
          y: 105 + rowIndex * 23, width: Math.max(7, step - 2), height: 15,
        };
        seats.push({ ...seat, key: seatKey(seat) });
      }
    });
  });
  return { id, label, mode: 'sections', sections: groups.map(group => group.id), width, height: Math.max(280, 155 + Math.max(...groups.map(group => group.rows.length)) * 23), seats };
}

function evenRows(count, rowCount) {
  const base = Math.floor(count / rowCount);
  const remainder = count % rowCount;
  return Array.from({ length: rowCount }, (_, index) => ({ row: index + 1, ranges: [[1, base + (index < remainder ? 1 : 0)]] }));
}

const blue1 = [
  { row: 1, ranges: [[8, 15], [16, 31], [34, 41]] }, { row: 2, ranges: [[7, 15], [16, 32], [34, 42]] },
  { row: 3, ranges: [[6, 15], [16, 32], [34, 43]] }, { row: 4, ranges: [[5, 15], [16, 32], [34, 44]] },
  { row: 5, ranges: [[4, 15], [16, 32], [34, 45]] }, { row: 6, ranges: [[3, 15], [16, 32], [34, 46]] },
  { row: 7, ranges: [[2, 15], [16, 31], [34, 47]] }, ...rows(8, 22, [[1, 15], [16, 32], [34, 48]]),
  { row: 23, ranges: [[1, 9], [10, 18]] },
];
const blue2 = rows(1, 6, row => [[1, 15], [16, row === 1 ? 31 : 32], [34, 48]]);
const blue3 = [
  ...rows(1, 5, [[1, 15], [16, 31], [33, 46]]), { row: 6, ranges: [[3, 15], [16, 30], [33, 44]] },
  { row: 7, ranges: [[4, 15], [16, 29], [33, 43]] }, { row: 8, ranges: [[8, 15], [16, 28], [33, 39]] },
  { row: 9, ranges: [[9, 15], [16, 28], [33, 38]] }, { row: 10, ranges: [[1, 15], [16, 28], [33, 46]] },
];

const bbch1 = [
  { row: 'OP1', zone: '1층 OP', ranges: [[1, 22]] }, { row: 'OP2', zone: '1층 OP', ranges: [[23, 46]] },
  { row: 'A', ranges: [[6, 10], [11, 30], [31, 35]] }, { row: 'B', ranges: [[5, 10], [11, 30], [31, 36]] },
  { row: 'C', ranges: [[4, 10], [11, 30], [31, 37]] }, { row: 'D', ranges: [[3, 10], [11, 30], [31, 38]] },
  { row: 'E', ranges: [[3, 10], [11, 30], [31, 38]] }, { row: 'F', ranges: [[2, 10], [11, 30], [31, 39]] },
  { row: 'G', ranges: [[1, 10], [11, 30], [31, 40]] }, { row: 'H', ranges: [[1, 10], [11, 30], [31, 40]] },
  { row: 'I', ranges: [[1, 10], [11, 28], [31, 40]] }, { row: 'J', ranges: [[1, 10], [11, 28], [31, 40]] },
  ...'KLMN'.split('').map(row => ({ row, ranges: [[1, 10], [11, 30], [31, 40]] })),
  { row: 'O', ranges: [[1, 10], [11, 29], [31, 40]] }, { row: 'P', ranges: [[1, 10], [11, 30], [31, 40]] },
  { row: 'Q', ranges: [[1, 10], [11, 30], [31, 40]] }, { row: 'R', ranges: [[11, 16], [25, 30]] },
];
const bbch2 = 'STUVWXYZ'.split('').map(row => ({ row, ranges: ['U', 'V'].includes(row) ? [[1, 10], [11, 29], [32, 41]] : [[1, 10], [11, 31], [32, 41]] }));

const charlotte1 = groupedFloor('charlotte-1f', '1층', [
  { id: 'A', rows: rows(1, 20, row => [[row === 1 ? 12 : row === 2 ? 10 : row === 3 ? 9 : row <= 5 ? 7 : row <= 7 ? 5 : row <= 9 ? 4 : row <= 11 ? 3 : row === 12 ? 2 : 1, 14]]) },
  { id: 'B', rows: rows(1, 20, [[15, 30]]) },
  { id: 'C', rows: rows(1, 20, row => [[31, row === 1 ? 33 : row === 2 ? 35 : row === 3 ? 36 : row === 4 ? 38 : row === 5 ? 39 : row === 6 ? 40 : row === 7 ? 41 : row <= 9 ? 42 : row <= 12 ? 43 : 44]]) },
]);
const charlotte2 = groupedFloor('charlotte-2f', '2층', [
  { id: 'A', rows: rows(1, 12, row => [[row === 1 ? 2 : 1, 14]]) }, { id: 'B', rows: rows(1, 12, row => [[15, row === 12 ? 29 : 30]]) },
  { id: 'C', rows: rows(1, 12, row => [[31, row < 3 ? 43 : 44]]) },
]);

const coex1 = groupedFloor('coex-1f', '1층', [
  { id: 'A', rows: rows(1, 21, row => [[row > 6 && row < 9 ? 2 : 1, 8]]) },
  { id: 'B', rows: rows(1, 23, row => [[1, row >= 21 ? 17 : row % 3 === 2 ? 15 : 16]]) },
  { id: 'C', rows: rows(1, 21, row => [[1, row > 6 && row < 9 ? 5 : row === 21 ? 7 : 8]]) },
]);
const coex2 = groupedFloor('coex-2f', '2층', [
  { id: 'A', rows: rows(1, 8, row => [[1, row < 6 ? 8 : row === 6 ? 5 : 4]]) },
  { id: 'B', rows: rows(1, 8, row => [[1, row === 3 || row === 4 ? 17 : row === 7 ? 15 : 16]]) },
  { id: 'C', rows: rows(1, 8, row => [[1, row < 6 ? 8 : row === 6 ? 5 : 4]]) },
]);

const hongik1 = groupedFloor('hongik-1f', '1층', [
  { id: 'A', rows: rows(1, 17, [[1, 6]]) }, { id: 'B', rows: rows(1, 16, row => [[1, row === 1 ? 13 : row >= 15 ? 14 : 15]]) },
  { id: 'C', rows: rows(1, 17, [[1, 6]]) },
]);
const hongik2 = groupedFloor('hongik-2f', '2층', [
  { id: 'A', rows: rows(1, 8, [[1, 6]]) }, { id: 'B', rows: rows(1, 11, row => [[1, row <= 9 ? 15 : row === 10 ? 14 : 12]]) },
  { id: 'C', rows: rows(1, 8, [[1, 6]]) },
]);

const sacCj1 = groupedFloor('sac-cj-1f', '1층', [
  { id: 'A', rows: rows(1, 14, row => [[1, row < 10 ? 11 : row < 13 ? 9 : row === 13 ? 8 : 3]]) },
  { id: 'B', rows: rows(1, 14, row => [[1, row < 13 ? 16 : row === 13 ? 17 : 9]]) },
  { id: 'C', rows: rows(1, 14, row => [[1, row < 10 ? 12 : row < 13 ? 10 : row === 13 ? 8 : 3]]) },
]);
const sacCj2 = groupedFloor('sac-cj-2f', '2층', [
  { id: 'A', rows: rows(1, 10, row => [[1, row < 5 ? 3 : row < 9 ? 15 : row === 9 ? 9 : 3]]) },
  { id: 'B', rows: rows(5, 10, row => [[1, row < 9 ? 18 : row === 9 ? 17 : 12]]) },
  { id: 'C', rows: rows(1, 10, row => [[1, row < 5 ? 3 : row < 9 ? 16 : row === 9 ? 10 : 3]]) },
]);
const sacCj3 = groupedFloor('sac-cj-3f', '3층', [
  { id: 'A', rows: rows(1, 7, row => [[1, row < 4 ? 3 : row < 7 ? 15 : 4]]) },
  { id: 'B', rows: rows(3, 7, row => [[1, row < 6 ? 17 : row === 6 ? 13 : 9]]) },
  { id: 'C', rows: rows(1, 7, row => [[1, row < 4 ? 3 : row < 7 ? 15 : 3]]) },
]);

const sacOpera = [
  groupedFloor('sac-opera-1f', '1층', [
    { id: 'A', rows: rows(1, 25, [[1, 10]]) }, { id: 'B', rows: rows(1, 25, [[1, 16]]) }, { id: 'C', rows: rows(1, 25, [[1, 10]]) },
  ]),
  ...[2, 3, 4].map((floor, index) => groupedFloor(`sac-opera-${floor}f`, `${floor}층`, [
    { id: 'A', rows: evenRows([157, 139, 119][index], [9, 8, 7][index]) },
    { id: 'B', rows: evenRows([161, 161, 144][index], [8, 8, 7][index]) },
    { id: 'C', rows: evenRows([157, 139, 119][index], [9, 8, 7][index]) },
  ])),
];

const lgFloors = [
  globalFloor('lg-1f', '1층', [...rows(1, 23, row => [[row < 5 ? 6 : row < 18 ? 1 : 2, row < 5 ? 32 : row < 18 ? 34 : 33]]), ...rows(1, 5, row => [[1, row === 1 ? 17 : 24]]).map(spec => ({ ...spec, row: `OP${spec.row}`, zone: '1층 OP' }))]),
  globalFloor('lg-2f', '2층', rows(1, 8, row => [[row < 3 ? 2 : 1, row < 3 ? 44 : row < 7 ? 45 : 43]])),
  globalFloor('lg-3f', '3층', rows(1, 8, row => [[row < 3 ? 2 : 1, row < 3 ? 41 : row < 7 ? 42 : 40]])),
];

const linkPayco = [['A', 22], ['B', 23], ['C', 26], ['D', 26], ['E', 26], ['F', 26], ['G', 25], ['H', 26], ['I', 26], ['J', 26], ['K', 26], ['L', 26], ['M', 26], ['N', 25], ['O', 25], ['P', 26], ['Q', 26], ['R', 27], ['S', 16]].map(([row, count]) => ({ row, ranges: [[1, count]] }));
const linkBugs = [['A', 22], ['B', 26], ...'CDEFGHIJK'.split('').map(row => [row, 28]), ['L', 25], ['M', 25], ['N', 25], ['O', 27]].map(([row, count]) => ({ row, ranges: [[1, count]] }));

const sectionCounts = (id, label, counts, rowCounts) => groupedFloor(id, label, counts.map(([section, count], index) => ({ id: section, rows: evenRows(count, rowCounts[index]) })));

export const VENUES = [
  { id: 'blue-square-woori', name: '블루스퀘어 우리은행홀', aliases: ['블루스퀘어 우리은행홀', '블루스퀘어 신한카드홀', '블루스퀘어 삼성전자홀'], source: 'https://www.bluesquare.kr/', accuracy: 'standard', note: '공식 기본 배치도를 옮긴 기준 좌석도입니다. 공연별 OP석·통제석은 달라질 수 있습니다.', floors: [globalFloor('blue-1f', '1층', blue1), globalFloor('blue-2f', '2층', blue2), globalFloor('blue-3f', '3층', blue3)] },
  { id: 'dcube-theater', name: '디큐브 링크아트센터 디큐브씨어터', aliases: ['디큐브 링크아트센터 디큐브씨어터', '디큐브 링크아트센터', '디큐브링크아트센터', '디큐브씨어터', '디큐브 시어터', 'D-CUBE THEATER', 'D-CUBE LINK ARTS CENTER', '대성 디큐브아트센터'], source: 'https://www.d3art.co.kr/oart/OAFRDcube.droafr?goTo=acting1', accuracy: 'reference', note: '공식 안내의 1층 724석·2층 510석과 A/B/C 구역 구조를 단순화한 참고 도면입니다. OP석·휠체어석과 정확한 열·번호는 실제 예매창을 우선합니다.', floors: [sectionCounts('dcube-1f', '1층', [['A', 187], ['B', 350], ['C', 187]], [20, 20, 20]), sectionCounts('dcube-2f', '2층', [['A', 161], ['B', 188], ['C', 161]], [12, 12, 12])] },
  { id: 'klarts-bbch', name: '광림아트센터 BBCH홀', aliases: ['광림아트센터 BBCH홀', '광림아트센터 비비씨에이치홀', 'BBCH홀'], source: 'http://www.klarts.kr/seat', accuracy: 'standard', note: '광림아트센터 공식 좌석배치도의 A~Z열과 좌석번호를 반영했습니다.', floors: [globalFloor('bbch-1f', '1층', bbch1), globalFloor('bbch-2f', '2층', bbch2)] },
  { id: 'charlotte-theater', name: '샤롯데씨어터', aliases: ['샤롯데씨어터', '샤롯데시어터', 'Charlotte Theater'], source: 'https://www.charlottetheater.co.kr/stage/seat_guide.asp', accuracy: 'standard', note: '공식 1·2층 A/B/C구역 기준 좌석도입니다. H석·휠체어석과 공연별 통제석은 공식 예매창에서 다시 확인합니다.', floors: [charlotte1, charlotte2] },
  { id: 'sac-cj-towol', name: '예술의전당 CJ 토월극장', aliases: ['예술의전당 CJ 토월극장', 'CJ 토월극장', 'CJ토월극장'], source: 'https://www.sac.or.kr/site/main/content/cjTowolTheater', accuracy: 'reference', note: '예술의전당 공식 1·2·3층 배치도를 단순화한 기준 좌석도입니다.', floors: [sacCj1, sacCj2, sacCj3] },
  { id: 'sac-opera', name: '예술의전당 오페라극장', aliases: ['예술의전당 오페라극장', '오페라극장'], source: 'https://www.sac.or.kr/site/main/content/operaTheater', accuracy: 'reference', note: '예술의전당 공식 1~4층 A/B/C구역을 단순화한 기준 좌석도입니다. BOX·BALCONY·OP석은 공식 예매창을 따릅니다.', floors: sacOpera },
  { id: 'chungmu-grand', name: '충무아트센터 대극장', aliases: ['충무아트센터 대극장', '충무아트홀 대극장'], source: 'https://www.caci.or.kr/', accuracy: 'reference', note: '1,250석 규모의 3개 층을 구역별로 단순화한 참고 좌석도입니다. 시설 보수 이후 실제 좌석은 공식 예매창을 우선합니다.', floors: [sectionCounts('chungmu-1f', '1층', [['A', 190], ['B', 310], ['C', 190]], [20, 20, 20]), sectionCounts('chungmu-2f', '2층', [['A', 75], ['B', 130], ['C', 75]], [8, 8, 8]), sectionCounts('chungmu-3f', '3층', [['A', 75], ['B', 130], ['C', 75]], [8, 8, 8])] },
  { id: 'coex-artium', name: '코엑스아티움 우리은행홀', aliases: ['코엑스아티움 우리은행홀', '코엑스아티움', 'coexartium'], source: 'https://coexartium.co.kr/coex/seatPlan', accuracy: 'standard', note: '공식 1·2층 A/B/C구역 좌석배치도를 반영했습니다. OP·휠체어석은 공식 예매창을 따릅니다.', floors: [coex1, coex2] },
  { id: 'hongik-daehakro-grand', name: '홍익대 대학로 아트센터 대극장', aliases: ['홍익대 대학로 아트센터 대극장', '홍익대학교 대학로 아트센터 대극장', '홍익대 아트센터 대극장'], source: 'https://artscenter.hongik.ac.kr/artcenter/010303.do', accuracy: 'standard', note: '공식 1·2층 A/B/C구역 좌석배치도를 반영했습니다. OP·휠체어석은 공식 예매창을 따릅니다.', floors: [hongik1, hongik2] },
  { id: 'lg-signature', name: 'LG아트센터 서울 LG SIGNATURE 홀', aliases: ['LG아트센터 서울 LG SIGNATURE 홀', 'LG SIGNATURE 홀', 'LG 시그니처 홀', 'LG아트센터 서울'], source: 'https://www.lgart.com/home/display/region/content/JSVFVEttNlczRTZZaGZIYUs5ckNNM0hHTDBQRVcrak5adTFTcFE2YkVYRTBGVT0=', accuracy: 'reference', note: '공식 1·2·3층 배치도를 단순화한 기준 좌석도입니다. OP·발코니·이동형 좌석은 공식 예매창을 따릅니다.', floors: lgFloors },
  { id: 'sejong-grand', name: '세종문화회관 세종대극장', aliases: ['세종대극장', '세종문화회관 대극장', '세종문화회관 세종대극장'], source: 'https://www.sejongpac.or.kr/portal/main/contents.do?menuNo=200368', accuracy: 'reference', note: '공식 층·구역별 좌석 수를 구역 도면으로 단순화했습니다. 정확한 열·번호는 공식 예매창을 우선합니다.', floors: [sectionCounts('sejong-1f', '1층', [['A', 198], ['B', 221], ['C', 192], ['D', 221], ['E', 198]], [15, 17, 16, 17, 15]), sectionCounts('sejong-2f', '2층', [['A', 88], ['B', 144], ['C', 154], ['D', 192], ['E', 154], ['F', 144], ['G', 88]], [10, 18, 12, 16, 12, 18, 10]), sectionCounts('sejong-3f', '3층', [['A', 119], ['B', 136], ['C', 96], ['D', 163], ['E', 163], ['F', 96], ['G', 136], ['H', 119]], [12, 17, 12, 17, 17, 12, 17, 12])] },
  { id: 'link-payco', name: '링크아트센터 PAYCO홀', aliases: ['링크아트센터 페이코홀', '링크아트센터 PAYCO홀', 'PAYCO홀', '페이코홀'], source: 'https://www.linkartcenter.co.kr/rent', accuracy: 'standard', note: '공식 좌석배치도의 A~S열 일반 좌석을 반영했습니다.', floors: [globalFloor('link-payco-1f', '1층', linkPayco)] },
  { id: 'link-bugs', name: '링크아트센터 BUGS홀', aliases: ['링크아트센터 벅스홀', '링크아트센터 BUGS홀', 'BUGS홀', '벅스홀'], source: 'https://www.linkartcenter.co.kr/rent', accuracy: 'standard', note: '공식 좌석배치도의 A~O열 일반 좌석을 반영했습니다.', floors: [globalFloor('link-bugs-1f', '1층', linkBugs)] },
];

export function getVenue(id) {
  const venue = VENUES.find(item => item.id === id);
  if (!venue) throw new Error('등록되지 않은 공연장입니다.');
  return venue;
}

export function findVenue(name) {
  const normalized = String(name || '').normalize('NFKC').replace(/\s+/g, '').toLowerCase();
  if (!normalized) return null;
  return VENUES.find(venue => venue.aliases.some(alias => normalized.includes(alias.normalize('NFKC').replace(/\s+/g, '').toLowerCase()))) || null;
}
