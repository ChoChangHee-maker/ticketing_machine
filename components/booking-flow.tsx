'use client';

import { useState } from 'react';
import { ArrowLeft, ArrowRight, CalendarDays, Check, CheckCircle2, Download, MapPin, Ticket } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { BOOKING_FEE, MAX_SEATS, ROWS, occupiedSeats, seatGrade, seatPrice, totalPrice, ticketText, type AppState, type Booking } from '@/lib/booking';
import { formatDate, shows, won, type Show } from '@/lib/shows';

export function downloadTicket(booking: Booking) {
  const url = URL.createObjectURL(new Blob(['\uFEFF' + ticketText(booking)], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = booking.id + '.txt';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

type BookingProps = {
  show: Show;
  state: AppState;
  onClose: () => void;
  onBook: (input: { showId: string; date: string; seats: string[]; name: string }) => Promise<Booking>;
  onTickets: () => void;
};

export function BookingFlow({ show, state, onClose, onBook, onTickets }: BookingProps) {
  const [date, setDate] = useState(show.dates.find(d => new Date(d + 'T' + show.time + ':00+09:00') > new Date()) || show.dates[0]);
  const [seats, setSeats] = useState<string[]>([]);
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [booking, setBooking] = useState<Booking | null>(null);
  const occupied = occupiedSeats(state, show.id, date);
  const total = totalPrice(show, seats);

  function toggleSeat(seat: string) {
    setError('');
    if (occupied.has(seat)) return;
    if (seats.includes(seat)) setSeats(prev => prev.filter(s => s !== seat));
    else if (seats.length >= MAX_SEATS) setError('한 번에 최대 4석까지 예매할 수 있어요.');
    else setSeats(prev => [...prev, seat]);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!agreed) { setError('체험용 예매 안내를 확인해주세요.'); return; }
    setBusy(true);
    setError('');
    try { setBooking(await onBook({ showId: show.id, date, seats, name })); setStep(3); }
    catch (e) { setError(e instanceof Error ? e.message : '예매를 완료하지 못했습니다. 다시 시도해주세요.'); }
    finally { setBusy(false); }
  }

  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}>
    <DialogContent className="booking-modal" showCloseButton={!busy}>
      <div className="booking-head"><p className="eyebrow">YOUR NEXT GREAT NIGHT</p><DialogTitle>{step === 3 ? '설레는 순간이 기다리고 있어요.' : show.title}</DialogTitle><DialogDescription>{step === 3 ? '체험용 예매가 완료되었습니다. 나의 티켓에서 다시 확인할 수 있어요.' : show.description}</DialogDescription></div>
      <ol className="booking-steps" aria-label="예매 진행 단계">{['날짜 · 좌석 선택', '예매 정보 확인', '예매 완료'].map((label, i) => <li key={label} className={step >= i + 1 ? 'current' : ''} aria-current={step === i + 1 ? 'step' : undefined}><span>{step > i + 1 ? <Check size={12} /> : '0' + (i + 1)}</span>{label}</li>)}</ol>
      {step === 1 && <>
        <div className="booking-detail"><span><MapPin size={14} />{show.place}</span><span><CalendarDays size={14} />{show.time} · {show.duration} · 8세 이상</span></div>
        <div className="field-title">관람 날짜 <small>모든 시간은 한국 시간 기준입니다.</small></div>
        <div className="date-options">{show.dates.map(d => { const ended = new Date(d + 'T' + show.time + ':00+09:00') <= new Date(); return <Button key={d} variant="outline" className={date === d ? 'chosen' : ''} aria-pressed={date === d} disabled={ended} onClick={() => { setDate(d); setSeats([]); setError(''); }}>{formatDate(d)} <span>{ended ? '마감' : show.time}</span></Button>; })}</div>
        <div className="field-title">좌석 선택 <small>최대 {MAX_SEATS}석 · 체험용 좌석 배치도</small></div>
        <div className="seat-map"><div className="stage">S T A G E <span>무대</span></div><div className="seat-rows">{ROWS.map(row => <div className="seat-row" key={row}><span className="row-label">{row}</span>{Array.from({ length: 10 }, (_, i) => { const seat = row + (i + 1); const taken = occupied.has(seat); return <Button key={seat} variant="outline" className={'seat grade-' + seatGrade(seat).toLowerCase() + (seats.includes(seat) ? ' chosen' : '')} disabled={taken} aria-label={row + '열 ' + (i + 1) + '번 ' + seatGrade(seat) + '석 ' + won(seatPrice(show, seat)) + (taken ? ' 예매 완료' : '')} aria-pressed={seats.includes(seat)} onClick={() => toggleSeat(seat)}>{taken ? '×' : i + 1}</Button>; })}<span className="row-label">{row}</span></div>)}</div><div className="seat-legend"><span><i className="vip" />VIP {won(show.price + 30000)}</span><span><i className="r" />R {won(show.price + 15000)}</span><span><i className="s" />S {won(show.price)}</span><span><i className="unavailable" />예매 완료</span></div></div>
        <div className="selected-seats" aria-live="polite"><span>선택 좌석 <b>{seats.length}</b></span><strong>{seats.length ? seats.map(s => s[0] + '열 ' + s.slice(1) + '번').join(' · ') : '원하는 좌석을 선택해주세요'}</strong></div>
      </>}
      {step === 2 && <form id="booking-form" onSubmit={submit} className="booking-form"><div className="order-summary"><h3>예매 내용을 확인해주세요</h3><dl><div><dt>공연</dt><dd>{show.title}</dd></div><div><dt>일시</dt><dd>{formatDate(date)} {show.time}</dd></div><div><dt>공연장</dt><dd>{show.place}</dd></div><div><dt>선택 좌석</dt><dd>{seats.map(s => seatGrade(s) + ' ' + s).join(', ')} ({seats.length}매)</dd></div><div><dt>티켓 금액</dt><dd>{won(total - seats.length * BOOKING_FEE)}</dd></div><div><dt>예매 수수료</dt><dd>{won(seats.length * BOOKING_FEE)}</dd></div></dl></div><label className="name-field" htmlFor="booking-name">예매자 이름 또는 닉네임<Input id="booking-name" name="name" value={name} onChange={e => setName(e.target.value)} placeholder="2~30자로 입력해주세요" required minLength={2} maxLength={30} autoComplete="off" disabled={busy} /></label><p className="local-note">예매 정보는 이 브라우저에만 저장됩니다. 이메일·문자는 발송되지 않습니다.</p><label className="agreement" htmlFor="demo-agree"><Checkbox id="demo-agree" checked={agreed} onCheckedChange={checked => setAgreed(checked === true)} disabled={busy} /><span>실제 결제 및 공연 입장이 없는 <strong>체험용 예매</strong>임을 확인했습니다.</span></label></form>}
      {step === 3 && booking && <div className="success-panel"><CheckCircle2 size={46} strokeWidth={1.4} /><span className="success-label">YOU'RE ON THE LIST.</span><div className="digital-ticket"><span className="eyebrow">ONSTAGE · DEMO TICKET</span><h3>{show.title}</h3><p>{formatDate(date)} · {show.time}</p><p>{show.place}</p><div className="ticket-seat-line"><span>{booking.name} 님</span><b>{seats.join(' · ')} / {seats.length}매</b></div><div className="ticket-number"><small>예매 번호</small><strong>{booking.id}</strong></div><small>실제 입장권이 아닌 체험용 티켓입니다.</small></div><div className="success-actions"><Button variant="outline" onClick={() => downloadTicket(booking)}><Download size={15} /> 확인서 저장</Button><Button onClick={onTickets}><Ticket size={15} /> 나의 티켓 보기</Button></div></div>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {step < 3 && <div className="booking-bottom"><div><span>총 예매 금액 <small>수수료 포함</small></span><strong>{won(total)}</strong></div>{step === 2 && <Button variant="ghost" disabled={busy} onClick={() => { setStep(1); setError(''); }}><ArrowLeft size={15} /> 이전</Button>}{step === 1 ? <Button disabled={!seats.length || seats.some(s => occupied.has(s))} onClick={() => { setStep(2); setError(''); }}>다음 단계 <ArrowRight size={15} /></Button> : <Button form="booking-form" type="submit" disabled={busy || !agreed}>{busy ? '저장 중…' : '체험 예매 확정'} <ArrowRight size={15} /></Button>}</div>}
    </DialogContent>
  </Dialog>;
}

export function TicketsDialog({ state, onClose, onCancel }: { state: AppState; onClose: () => void; onCancel: (id: string) => Promise<void> }) {
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}><DialogContent className="tickets-modal" showCloseButton={!busy}><div className="booking-head"><p className="eyebrow">YOUR MOMENTS, ALL IN ONE PLACE</p><DialogTitle>나의 티켓</DialogTitle><DialogDescription>이 브라우저에 저장된 체험용 예매 내역입니다.</DialogDescription></div>{!state.bookings.length ? <div className="empty-state"><Ticket size={36} /><h3>아직 예매한 공연이 없어요</h3><p>당신의 다음 설렘을 찾아보세요.</p><Button onClick={onClose}>공연 둘러보기 <ArrowRight size={15} /></Button></div> : <div className="ticket-list">{state.bookings.map(b => { const show = shows.find(s => s.id === b.showId)!; return <article className={'ticket-list-item ' + b.status} key={b.id}><div className="ticket-date"><b>{b.date.slice(-2)}</b><span>{show.month}</span></div><div className="ticket-details"><span className={'status-badge ' + b.status}>{b.status === 'confirmed' ? '예매 완료' : '취소 완료'}</span><h3>{show.title}</h3><p>{formatDate(b.date)} {show.time} · {show.place}</p><p>{b.name} 님 · {b.seats.join(', ')} · {won(totalPrice(show, b.seats))}</p><small>{b.id}</small><div className="ticket-actions"><Button variant="ghost" size="sm" onClick={() => downloadTicket(b)}><Download size={13} /> 확인서 저장</Button>{b.status === 'confirmed' && <Button variant="ghost" size="sm" disabled={busy} onClick={() => { setCancelId(b.id); setError(''); }}>예매 취소</Button>}</div>{cancelId === b.id && <div className="cancel-confirm"><p>예매를 취소할까요? 선택했던 좌석이 다시 열립니다.</p><div><Button variant="outline" size="sm" disabled={busy} onClick={() => setCancelId(null)}>유지하기</Button><Button variant="destructive" size="sm" disabled={busy} onClick={async () => { if (busy) return; setBusy(true); setError(''); try { await onCancel(b.id); setCancelId(null); } catch (e) { setError(e instanceof Error ? e.message : '취소하지 못했습니다.'); } finally { setBusy(false); } }}>{busy ? '취소 중…' : '취소 확정'}</Button></div></div>}</div></article>; })}</div>}{error && <p className="form-error" role="alert">{error}</p>}</DialogContent></Dialog>;
}
