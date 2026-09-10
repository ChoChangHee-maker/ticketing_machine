import { allowedUrl, getProvider } from './providers.mjs';
import { getVenue } from './venues.mjs';

export const seatKey = seat => JSON.stringify([seat.zone, seat.row, seat.number]);
export const mapKey = (url, date, time) => JSON.stringify([String(url || '').trim(), date || '', time || '']);
export function matchingPreference(config, id) {
  const preference = config.seatPreferences?.[id];
  if (!preference || String(preference.url).trim() !== String(config.urls?.[id] || '').trim()) return null;
  if (preference.venueId) return !config.venues?.[id] || preference.venueId === config.venues[id] ? preference : null;
  return mapKey(preference.url, preference.date, preference.time) === mapKey(config.urls?.[id], config.date, config.time) ? preference : null;
}

export function validateSeatPreferences(value) {
  const result = {};
  if (value === undefined) return result;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('공연별 선호 좌석 설정을 확인해주세요.');
  for (const [id, preference] of Object.entries(value)) {
    const provider = getProvider(id);
    const venueId = typeof preference?.venueId === 'string' ? preference.venueId : '';
    if (venueId) getVenue(venueId);
    const staticMap = Boolean(venueId);
    if (!preference || !allowedUrl(preference.url, provider) || (!staticMap && !/^\d{4}-\d{2}-\d{2}$/.test(preference.date)) || (!staticMap && !/^([01]\d|2[0-3]):[0-5]\d$/.test(preference.time)) || !Array.isArray(preference.seats) || preference.seats.length > 1000) throw new Error(provider.name + '의 공연별 좌석 설정이 올바르지 않습니다.');
    if (!staticMap && (!Number.isFinite(Date.parse(preference.date)) || new Date(preference.date).toISOString().slice(0, 10) !== preference.date)) throw new Error('선호 좌석의 관람 날짜를 확인해주세요.');
    const seats = [];
    const keys = new Set();
    for (const seat of preference.seats) {
      if (!seat || typeof seat.zone !== 'string' || !seat.zone.trim() || seat.zone.length > 100 || typeof seat.row !== 'string' || !seat.row.trim() || seat.row.length > 40 || !Number.isInteger(seat.number) || seat.number < 1 || seat.number > 100000) throw new Error('좌석의 구역·열·번호를 확인해주세요.');
      const normalized = { zone: seat.zone.normalize('NFKC').replace(/\s+/g, ' ').trim(), row: seat.row.normalize('NFKC').replace(/\s*열$/, '').trim(), number: seat.number };
      if (!normalized.zone || !normalized.row) throw new Error('좌석의 구역·열을 확인해주세요.');
      const key = seatKey(normalized);
      if (!keys.has(key)) { keys.add(key); seats.push(normalized); }
    }
    result[id] = { url: preference.url.trim(), date: staticMap ? '' : preference.date, time: staticMap ? '' : preference.time, ...(venueId ? { venueId } : {}), seats };
  }
  return result;
}
