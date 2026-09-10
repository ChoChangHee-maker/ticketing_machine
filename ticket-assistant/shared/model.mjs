import { getProvider, allowedUrl } from './providers.mjs';

export const defaultPreferences = () => ({ selected: [], title: '', date: '', time: '', quantity: 1, adjacent: true, zones: '', rows: '', urls: {}, scheduledAt: '', profiles: {} });
export const ACTIVE_RUN_STATES = ['validating', 'running', 'scheduled', 'waiting', 'stopping'];
export const PHASE_LABELS = { date: '관람 날짜 선택', time: '회차 선택', entry: '예매하기', zone: '구역·좌석 선택' };
const record = value => value && typeof value === 'object' && !Array.isArray(value);

export function validatePreferences(input, forRun = false) {
  if (!record(input)) throw new Error('올바른 설정을 입력해주세요.');
  const selected = Array.isArray(input.selected) ? [...new Set(input.selected)] : [];
  selected.forEach(getProvider);
  const quantity = Number(input.quantity);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 4) throw new Error('좌석 수는 1~4석으로 설정해주세요.');
  const result = { ...defaultPreferences(), selected, quantity, adjacent: input.adjacent !== false };
  for (const key of ['title', 'date', 'time', 'zones', 'rows', 'scheduledAt']) {
    result[key] = typeof input[key] === 'string' ? input[key].trim().slice(0, 300) : '';
  }
  const urlIds = new Set([...selected, ...Object.keys(record(input.urls) ? input.urls : {})]);
  for (const id of urlIds) {
    getProvider(id);
    const url = typeof input.urls?.[id] === 'string' ? input.urls[id].trim() : '';
    if (url && !allowedUrl(url, getProvider(id))) throw new Error(getProvider(id).name + '의 공식 공연 주소를 입력해주세요.');
    if (forRun && selected.includes(id) && !url) throw new Error(getProvider(id).name + '의 공연 상세 URL이 필요합니다.');
    result.urls[id] = url;
  }
  if (result.date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(result.date) || !Number.isFinite(Date.parse(result.date)) || new Date(result.date).toISOString().slice(0, 10) !== result.date) throw new Error('유효한 관람 날짜를 입력해주세요.');
  }
  if (result.time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(result.time)) throw new Error('회차 시간을 시:분으로 입력해주세요.');
  if (result.scheduledAt) {
    const value = result.scheduledAt.length === 16 ? result.scheduledAt + ':00' : result.scheduledAt;
    const instant = Date.parse(value + '+09:00');
    if (!/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(value) || !Number.isFinite(instant) || new Date(instant + 9 * 3600000).toISOString().slice(0, 19) !== value) throw new Error('예약 실행 시간을 확인해주세요.');
  }
  if (forRun && (!selected.length || !result.date || !result.time || !result.zones)) throw new Error('티켓처, 관람 날짜, 회차, 선호 구역을 설정해주세요.');
  if (forRun && new Date(result.date + 'T' + result.time + ':00+09:00') <= new Date()) throw new Error('이미 지난 관람 회차입니다.');
  if (forRun && result.scheduledAt && Date.parse(result.scheduledAt + '+09:00') <= Date.now()) throw new Error('예약 실행 시간은 현재보다 나중으로 설정해주세요.');
  if (record(input.profiles)) for (const [id, profile] of Object.entries(input.profiles)) {
    getProvider(id);
    result.profiles[id] = validateProfile(profile);
  }
  return result;
}

export function validateProfile(profile) {
  if (!record(profile)) throw new Error('화면 설정을 확인해주세요.');
  const result = {};
  for (const key of ['entry', 'date', 'time', 'zone', 'seat', 'selected', 'next']) {
    const selector = typeof profile[key] === 'string' ? profile[key].trim() : '';
    if (selector.length > 500) throw new Error('화면 선택자가 너무 깁니다.');
    result[key] = selector;
  }
  result.order = profile.order === 'entry-first' ? 'entry-first' : 'date-first';
  return result;
}

export function classifyLogin(signals) {
  if (signals.blocked) return { status: 'challenge', detail: '보안 확인 또는 대기 화면입니다. 브라우저에서 직접 진행해주세요.' };
  if (signals.passwordVisible || signals.loginVisible) return { status: 'required', detail: '로그인이 필요한 화면입니다. 열린 브라우저에서 직접 로그인해주세요.' };
  if (signals.logoutVisible && signals.trusted) return { status: 'verified', detail: '공식 티켓처 화면에서 로그아웃 메뉴를 확인했습니다.' };
  return { status: 'unknown', detail: '로그인 성공을 판별할 수 없습니다. 티켓처의 계정 메뉴를 열고 다시 확인해주세요.' };
}

export const splitPreferences = text => text.split(/[\n,]/).map(s => s.trim()).filter(Boolean);
export const normalize = text => String(text).normalize('NFKC').replace(/\s+/g, ' ').trim();

export function chooseSeats(seats, { quantity, adjacent, zones, rows }) {
  const wantedZones = splitPreferences(zones);
  const wantedRows = splitPreferences(rows);
  const zoneRank = seat => wantedZones.findIndex(z => normalize(seat.zone) === normalize(z));
  const candidates = seats.filter(s => s.available && !s.selected && zoneRank(s) >= 0 && (!wantedRows.length || wantedRows.includes(String(s.row))));
  candidates.sort((a, b) => zoneRank(a) - zoneRank(b) || String(a.row).localeCompare(String(b.row), 'ko', { numeric: true }) || a.number - b.number);
  if (quantity === 1 || !adjacent) return candidates.slice(0, quantity).length === quantity ? candidates.slice(0, quantity) : [];
  for (const seat of candidates) {
    const group = candidates.filter(s => s.zone === seat.zone && s.row === seat.row && s.number >= seat.number && s.number < seat.number + quantity);
    if (group.length === quantity && new Set(group.map(s => s.number)).size === quantity) return group.sort((a, b) => a.number - b.number);
  }
  return [];
}

export function parseSeat(label, attributes = {}) {
  const text = normalize(label);
  const zone = attributes.zone || text.match(/((?:\d+층\s*)?(?:[A-Za-z가-힣]+|\d+)\s*구역)/)?.[1] || '';
  const row = attributes.row || text.match(/([A-Za-z0-9]+)\s*열/)?.[1] || '';
  const number = Number(attributes.number || text.match(/(\d+)\s*번/)?.[1]);
  return { zone: normalize(zone), row, number, valid: Boolean(zone && row && Number.isInteger(number) && number > 0) };
}
