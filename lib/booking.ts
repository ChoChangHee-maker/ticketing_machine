import { shows, won, type Show } from './shows.ts';

export const STORAGE_KEY = 'onstage-demo-v1';
export const MAX_SEATS = 4;
export const BOOKING_FEE = 2000;
export const ROWS = ['A', 'B', 'C', 'D', 'E', 'F'];
export const SEATS = ROWS.flatMap(row => Array.from({ length: 10 }, (_, i) => row + (i + 1)));
export const RESERVED_SEATS = ['A3', 'A4', 'A7', 'B2', 'B3', 'B8', 'C5', 'C6', 'D1', 'D8', 'E4', 'F9'];

export type Booking = {
  id: string;
  showId: string;
  date: string;
  seats: string[];
  name: string;
  createdAt: string;
  status: 'confirmed' | 'cancelled';
};
export type AppState = { version: 1; bookings: Booking[]; favorites: string[] };
export const emptyState = (): AppState => ({ version: 1, bookings: [], favorites: [] });
export const seatGrade = (seat: string) => ['A', 'B'].includes(seat[0]) ? 'VIP' : ['C', 'D'].includes(seat[0]) ? 'R' : 'S';
export const seatPrice = (show: Show, seat: string) => show.price + (seatGrade(seat) === 'VIP' ? 30000 : seatGrade(seat) === 'R' ? 15000 : 0);
export const totalPrice = (show: Show, seats: string[]) => seats.reduce((sum, seat) => sum + seatPrice(show, seat) + BOOKING_FEE, 0);
export const occupiedSeats = (state: AppState, showId: string, date: string) => new Set([
  ...RESERVED_SEATS,
  ...state.bookings.filter(b => b.showId === showId && b.date === date && b.status === 'confirmed').flatMap(b => b.seats),
]);

export function parseState(raw: string | null): AppState {
  if (raw === null) return emptyState();
  const fail = () => { throw new Error('저장된 예매 내역을 읽을 수 없습니다. 기존 데이터는 유지됩니다. 브라우저의 사이트 저장 공간을 확인해주세요.'); };
  let value: AppState;
  try { value = JSON.parse(raw); } catch { return fail(); }
  if (!value || value.version !== 1 || !Array.isArray(value.bookings) || !Array.isArray(value.favorites)) return fail();
  if (!value.favorites.every(id => typeof id === 'string' && shows.some(show => show.id === id))) return fail();
  const ids = new Set<string>();
  const occupied = new Set<string>();
  for (const b of value.bookings) {
    if (!b || typeof b.id !== 'string' || !/^ON-[A-F0-9]{16}$/.test(b.id) || ids.has(b.id)) return fail();
    const show = shows.find(s => s.id === b.showId);
    if (!show || !show.dates.includes(b.date) || !Array.isArray(b.seats) || !b.seats.length || b.seats.length > MAX_SEATS || new Set(b.seats).size !== b.seats.length || !b.seats.every(s => SEATS.includes(s) && !RESERVED_SEATS.includes(s))) return fail();
    if (typeof b.name !== 'string' || b.name.trim().length < 2 || b.name.length > 30 || !['confirmed', 'cancelled'].includes(b.status) || typeof b.createdAt !== 'string' || !Number.isFinite(Date.parse(b.createdAt))) return fail();
    ids.add(b.id);
    if (b.status === 'confirmed') for (const seat of b.seats) {
      const key = [b.showId, b.date, seat].join('/');
      if (occupied.has(key)) return fail();
      occupied.add(key);
    }
  }
  return { version: 1, bookings: value.bookings, favorites: [...new Set(value.favorites)] };
}

export function createBooking(state: AppState, input: { showId: string; date: string; seats: string[]; name: string }, id: string, now = new Date()): AppState {
  const show = shows.find(s => s.id === input.showId);
  if (!show || !show.dates.includes(input.date)) throw new Error('유효한 공연과 날짜를 선택해주세요.');
  if (new Date(input.date + 'T' + show.time + ':00+09:00') <= now) throw new Error('예매가 마감된 회차입니다. 다른 날짜를 선택해주세요.');
  if (!input.seats.length || input.seats.length > MAX_SEATS) throw new Error('좌석은 1~4석까지 선택할 수 있습니다.');
  if (new Set(input.seats).size !== input.seats.length || input.seats.some(s => !SEATS.includes(s))) throw new Error('유효한 좌석을 선택해주세요.');
  const occupied = occupiedSeats(state, show.id, input.date);
  if (input.seats.some(s => occupied.has(s))) throw new Error('이미 예매된 좌석이 있습니다. 좌석 선택 단계에서 다른 좌석을 골라주세요.');
  const name = input.name.trim();
  if (name.length < 2 || name.length > 30) throw new Error('예매자 이름 또는 닉네임을 2~30자로 입력해주세요.');
  if (!/^ON-[A-F0-9]{16}$/.test(id) || state.bookings.some(b => b.id === id)) throw new Error('예매 번호를 생성하지 못했습니다. 다시 시도해주세요.');
  return { ...state, bookings: [{ id, showId: show.id, date: input.date, seats: [...input.seats].sort((a, b) => SEATS.indexOf(a) - SEATS.indexOf(b)), name, createdAt: now.toISOString(), status: 'confirmed' }, ...state.bookings] };
}

export function cancelBooking(state: AppState, id: string): AppState {
  const booking = state.bookings.find(b => b.id === id);
  if (!booking || booking.status === 'cancelled') throw new Error('취소할 수 있는 예매 내역이 없습니다.');
  return { ...state, bookings: state.bookings.map(b => b.id === id ? { ...b, status: 'cancelled' } : b) };
}

export function ticketText(booking: Booking): string {
  const show = shows.find(s => s.id === booking.showId)!;
  return ['ONSTAGE — DEMO TICKET', '체험용 예매 확인서 · 실제 입장 및 결제 효력 없음', '', show.title, '예매 번호: ' + booking.id, '일시: ' + booking.date + ' ' + show.time + ' (한국 시간)', '공연장: ' + show.place, '예매자: ' + booking.name, '좌석: ' + booking.seats.join(', '), '총 금액: ' + won(totalPrice(show, booking.seats)), '상태: ' + (booking.status === 'confirmed' ? '예매 완료' : '취소 완료')].join('\n');
}
