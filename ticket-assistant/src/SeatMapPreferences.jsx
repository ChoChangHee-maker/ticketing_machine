import { useState } from 'react';
import { ExternalLink, LoaderCircle, MapPin, Search } from 'lucide-react';
import { matchingPreference, seatKey } from '../shared/seat-map.mjs';
import { VENUES } from '../shared/venues.mjs';
import './seat-map.css';

export default function SeatMapPreferences({ providers, config, busy, connected, supported, locked, performanceInfo, onInspect, onVenueChange, onChange }) {
  return <div className="seat-map-preferences">
    <p className="seat-map-intro">공연 주소에서 공연장을 찾은 뒤, 그 공연장의 기준 좌석도에서 원하는 좌석을 눌러주세요. 예매창을 미리 여는 기능이 아니며 선택한 자리는 실행할 때 잔여 여부를 확인합니다.</p>
    {!providers.length && <div className="seat-map-empty">티켓처와 공연 주소를 먼저 선택해주세요.</div>}
    {providers.map(provider => <ProviderVenueMap key={provider.id} {...{ provider, config, busy, connected, supported, locked, performanceInfo, onInspect, onVenueChange, onChange }} />)}
  </div>;
}

function ProviderVenueMap({ provider, config, busy, connected, supported, locked, performanceInfo, onInspect, onVenueChange, onChange }) {
  const id = provider.id;
  const info = performanceInfo[id];
  const venueId = config.venues?.[id] || '';
  const venue = VENUES.find(item => item.id === venueId);
  const preference = matchingPreference(config, id);
  const chosen = preference?.seats || [];
  const selectedKeys = new Set(chosen.map(seatKey));
  const [floorId, setFloorId] = useState('');
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState('');
  const floor = venue?.floors.find(item => item.id === floorId) || venue?.floors[0];
  const reading = busy['inspect-' + id];
  const rowGroups = floor ? [...new Map(floor.seats.map(seat => [`${seat.zone}\u0000${seat.row}`, { zone: seat.zone, row: seat.row }])).values()] : [];

  function choose(items) {
    const allSelected = items.every(seat => selectedKeys.has(seatKey(seat)));
    const keys = new Set(items.map(seatKey));
    const next = allSelected
      ? chosen.filter(seat => !keys.has(seatKey(seat)))
      : [...chosen, ...items.filter(seat => !selectedKeys.has(seatKey(seat))).map(({ zone, row, number }) => ({ zone, row, number }))];
    if (next.length > 1000) {
      setError('선호 좌석은 티켓처별로 1,000석까지 지정할 수 있습니다. 층이나 열을 더 좁혀주세요.');
      return;
    }
    setError('');
    onChange(id, { url: config.urls[id].trim(), date: '', time: '', venueId: venue.id, seats: next });
  }

  return <article className="provider-seat-map">
    <div className="seat-map-heading"><div><strong>{provider.name}{venue ? ` · ${venue.name}` : ''}</strong><span>{info?.title || config.title || '선택한 공연'}{info?.venue && info.venue !== venue?.name ? ` · 확인된 공연장: ${info.venue}` : ''}</span></div><b>{chosen.length}석 선호</b></div>
    <div className="seat-map-actions">
      <button type="button" className="button secondary" disabled={locked || !connected || !supported || reading || !config.urls[id]} onClick={() => onInspect(id)}>{reading ? <LoaderCircle size={14} className="spin" /> : <Search size={14} />} 공연장에서 좌석도 찾기</button>
      <label className="venue-picker"><span className="sr-only">{provider.name} 공연장 직접 선택</span><select disabled={locked} value={venueId} onChange={event => onVenueChange(id, event.target.value)}><option value="">공연장을 직접 선택하세요</option>{VENUES.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
    </div>
    {connected && !supported && <div className="seat-map-message" role="alert"><p>이 기능이 포함된 새 서버가 필요합니다. 기존 실행 창을 닫고 프로그램을 다시 시작해주세요.</p></div>}
    {info && !info.venueId && <div className="seat-map-message" role="status"><p>{info.venue ? `공연장은 “${info.venue}”로 확인했지만 등록된 좌석도가 없습니다.` : '공연 페이지에서 공연장 이름을 자동으로 찾지 못했습니다.'} 위 목록에서 공연장을 직접 선택할 수 있습니다.</p></div>}
    {!venue && <div className="seat-map-empty">공연 주소를 입력하고 ‘공연장에서 좌석도 찾기’를 누르거나 공연장을 직접 선택해주세요.</div>}
    {venue && <>
      <div className="venue-map-meta"><div><MapPin size={15} /><span><strong>{venue.name}</strong><small>{venue.accuracy === 'reference' ? '공식 자료 기반 단순 도면' : '공식 기본 좌석도 반영'}</small></span></div><a href={venue.source} target="_blank" rel="noreferrer">공식 좌석도 확인 <ExternalLink size={12} /></a></div>
      <p className="venue-map-note">{venue.note}</p>
      <div className="seat-map-toolbar"><div className="floor-tabs" role="tablist" aria-label={`${venue.name} 층 선택`}>{venue.floors.map(item => <button type="button" role="tab" aria-selected={item.id === floor.id} key={item.id} onClick={() => setFloorId(item.id)}>{item.label}</button>)}</div><label>확대<input type="range" min="0.75" max="3" step="0.25" value={zoom} onChange={event => setZoom(Number(event.target.value))} /></label></div>
      <div className="seat-map-legend"><span><i className="seat-legend selected" />희망 좌석</span><span><i className="seat-legend" />기준 좌석</span><span>무대가 위쪽입니다</span></div>
      <SeatDiagram floor={floor} selectedKeys={selectedKeys} zoom={zoom} locked={locked} onChoose={seat => choose([seat])} />
      <div className="seat-group-actions"><strong>{floor.label}의 열을 한 번에 선택</strong><div>{rowGroups.map(group => { const seats = floor.seats.filter(seat => seat.zone === group.zone && seat.row === group.row); const prefix = group.zone === floor.label ? '' : group.zone.replace(floor.label, '').trim() + ' '; return <button type="button" key={`${group.zone}-${group.row}`} disabled={locked} aria-pressed={seats.every(seat => selectedKeys.has(seat.key))} onClick={() => choose(seats)}>{prefix}{group.row}열</button>; })}</div></div>
      <p className="seat-map-caption">이 좌석도는 희망 위치를 정하는 기준 도면입니다. 실제 판매 좌석, OP석, 휠체어석, 시야제한석과 공연별 통제석은 예매 실행 시 공식 좌석창을 따릅니다.</p>
    </>}
    {chosen.length > 0 && <div className="chosen-seats"><div><strong>선택한 순서대로 우선 확인 · {chosen.length}석</strong><button type="button" disabled={locked} onClick={() => onChange(id, { ...preference, seats: [] })}>모두 해제</button></div><p>{chosen.slice(0, 10).map(seat => `${seat.zone} ${seat.row}열 ${seat.number}번`).join(' · ')}{chosen.length > 10 ? ` 외 ${chosen.length - 10}석` : ''}</p></div>}
    {error && <p role="alert" className="seat-map-error">{error}</p>}
  </article>;
}

function SeatDiagram({ floor, selectedKeys, zoom, locked, onChoose }) {
  const rowLabels = [...new Map(floor.seats.map(seat => [`${seat.zone}\u0000${seat.row}`, { key: `${seat.zone}-${seat.row}`, row: seat.row, x: seat.x, y: seat.y }])).values()];
  return <div className="seat-diagram-scroll"><svg className="seat-diagram venue-diagram" style={{ width: `${zoom * 100}%` }} viewBox={`0 0 ${floor.width} ${floor.height}`} aria-label={`${floor.label} 기준 좌석 배치도`}>
    <rect className="diagram-stage" x={floor.width * 0.3} y="18" width={floor.width * 0.4} height="38" rx="6" />
    <text className="diagram-stage-label" x={floor.width / 2} y="42" textAnchor="middle">STAGE</text>
    {floor.sections?.map((section, index) => <text className="diagram-section-label" key={section} x={40 + index * ((floor.width - 80 - 28 * (floor.sections.length - 1)) / floor.sections.length + 28)} y="88">{section}구역</text>)}
    {rowLabels.map(item => <text className="diagram-row-label" key={item.key} x={item.x - 5} y={item.y + 11} textAnchor="end">{item.row}</text>)}
    {floor.seats.map(seat => {
      const selected = selectedKeys.has(seat.key);
      const label = `${seat.zone} ${seat.row}열 ${seat.number}번`;
      return <g key={seat.key} role="button" tabIndex={locked ? -1 : 0} aria-label={label} aria-pressed={selected} aria-disabled={locked} className={`diagram-seat ${selected ? 'chosen' : ''}`} onClick={() => { if (!locked) onChoose(seat); }} onKeyDown={event => { if (!locked && ['Enter', ' '].includes(event.key)) { event.preventDefault(); onChoose(seat); } }}><title>{label}{selected ? ' · 희망 좌석' : ''}</title><rect x={seat.x} y={seat.y} width={seat.width} height={seat.height} rx={Math.min(3, seat.width / 5)} />{seat.width > 9 && <text x={seat.x + seat.width / 2} y={seat.y + seat.height / 2} dominantBaseline="central" textAnchor="middle" fontSize={Math.min(10, seat.height * 0.62, seat.width / 2)}>{seat.number}</text>}</g>;
    })}
  </svg></div>;
}
