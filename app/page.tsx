'use client';
import { useState } from 'react';
import { ArrowUpRight, ArrowRight, Search, Ticket, Heart, Music2, Disc3, Sparkles, Mic2, MapPin, CalendarDays } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { shows, categories, won } from '@/lib/shows';

export default function Home() {
  const [category, setCategory] = useState('전체');
  const [query, setQuery] = useState('');
  const [favorites, setFavorites] = useState<string[]>([]);
  const visible = shows.filter(s => (category === '전체' || s.category === category) && (s.title + ' ' + s.place).toLowerCase().includes(query.toLowerCase()));
  return <div className="site-shell">
    <header className="site-header"><div className="header-inner">
      <a className="brand" href="/" aria-label="온스테이지 홈">ONSTAGE<span /></a>
      <nav aria-label="메인 메뉴"><Button variant="ghost" className="nav-link active" onClick={() => setCategory('전체')}>공연 둘러보기</Button><Button variant="ghost" className="nav-link" onClick={() => setCategory('콘서트')}>콘서트</Button><Button variant="ghost" className="nav-link" onClick={() => setCategory('페스티벌')}>페스티벌</Button></nav>
      <Button variant="outline" className="my-tickets"><Ticket size={17} /> 나의 티켓 <span>0</span></Button>
    </div></header>
    <main className="main-wrap">
      <section className="page-intro"><div><p className="eyebrow"><span /> LIVE IN THE MOMENT</p><h1>다음의 설렘을, 예매하세요<span>.</span></h1><p className="intro-copy">좋아하는 아티스트와 함께하는, 잊지 못할 순간.</p></div><div className="search-box"><Search size={20} /><Input aria-label="공연 또는 공연장 검색" placeholder="어떤 공연을 찾고 있나요?" value={query} onChange={e => setQuery(e.target.value)} /><kbd>검색</kbd></div></section>
      <section className="featured-grid" aria-label="추천 공연">
        <article className="hero-show"><img src="/images/festival.jpg" alt="화려한 조명 아래 음악을 즐기는 페스티벌 관객" fetchPriority="high" /><div className="hero-shade" /><div className="hero-top"><span className="outline-label">ONSTAGE PICK</span><span className="hero-edition">THE AUTUMN EDITION — 2026</span></div><div className="hero-content"><p>도시의 소음이 음악이 되는 순간</p><h2>SEOUL<br />SOUND WAVE<span>2026</span></h2><div className="hero-meta"><span><CalendarDays size={14} /> 10.17 SAT — 10.18 SUN</span><span><MapPin size={14} /> 올림픽공원</span></div><Button className="hero-button">지금 예매하기 <ArrowUpRight size={19} /></Button></div><span className="hero-caption">FEEL THE SOUND. FIND YOUR MOMENT.</span></article>
        <aside className="editorial-card"><div className="editorial-top"><span className="eyebrow">WEEKEND PLAYLIST</span><ArrowUpRight size={25} /></div><div><p className="editorial-kicker">일상은 잠시, OFF.</p><h2>이번 주말은<br />라이브, <em>ON.</em></h2><p className="editorial-copy">가을밤을 채울 음악과<br />당신을 기다리는 무대.</p></div><div className="editorial-bottom"><span className="small-tag">가을 공연 모음</span><Button variant="ghost" size="icon" aria-label="가을 공연 전체 보기" onClick={() => { setCategory('전체'); document.getElementById('lineup')?.scrollIntoView({ behavior: 'smooth' }); }}><ArrowRight /></Button></div><div className="editorial-line">FEEL THE SOUND. FIND YOUR MOMENT.</div></aside>
      </section>
      <section id="lineup" className="lineup">
        <div className="section-heading"><div><span className="eyebrow">FIND YOUR NEXT STAGE</span><h2>지금, 주목할 공연 <span className="live-dot" /></h2></div><span className="section-note">좋은 자리는 기다려주지 않으니까</span></div>
        <div className="filter-bar"><div className="categories" aria-label="공연 장르">{categories.map((name, i) => { const Icon = [Sparkles, Mic2, Disc3, Ticket, Music2][i]; return <Button key={name} variant="ghost" className={'category ' + (category === name ? 'selected' : '')} aria-pressed={category === name} onClick={() => setCategory(name)}><Icon size={16} />{name}</Button>; })}</div><span className="result-count">총 <strong>{visible.length}</strong>개의 공연</span></div>
        <div className="show-grid">{visible.map(show => <article className="show-card" key={show.id}>
          <div className={'poster ' + show.tone}><img src={'/images/' + show.image} alt={show.title + ' 공연 분위기 이미지'} loading="lazy" /><div className="poster-overlay" /><span className="poster-tag">{show.tag}</span><Button variant="ghost" size="icon" className={'favorite ' + (favorites.includes(show.id) ? 'is-favorite' : '')} aria-label={show.title + ' 관심 공연 ' + (favorites.includes(show.id) ? '해제' : '등록')} aria-pressed={favorites.includes(show.id)} onClick={() => setFavorites(prev => prev.includes(show.id) ? prev.filter(id => id !== show.id) : [...prev, show.id])}><Heart size={18} fill={favorites.includes(show.id) ? 'currentColor' : 'none'} /></Button><div className="poster-type"><span>{show.sub}</span><h3>{show.english}</h3></div><div className="poster-footer"><span>ONSTAGE ORIGINAL</span><span>{show.month} {show.day} / 2026</span></div></div>
          <div className="show-info"><span className="show-category">{show.category}</span><h3>{show.title}</h3><p>{show.date}</p><p className="show-place"><MapPin size={12} />{show.place}</p><div className="show-price"><strong>{won(show.price)} <small>부터</small></strong><Button variant="ghost" size="icon" aria-label={show.title + ' 예매하기'}><ArrowUpRight size={19} /></Button></div></div>
        </article>)}</div>
        {!visible.length && <div className="empty-state"><Search size={28} /><h3>조건에 맞는 공연이 없어요</h3><p>다른 검색어나 장르로 찾아보세요.</p><Button variant="outline" onClick={() => { setCategory('전체'); setQuery(''); }}>전체 공연 보기</Button></div>}
      </section>
      <section className="bottom-banner"><div><span className="eyebrow">MAKE IT A NIGHT TO REMEMBER</span><h2>화면 너머의 감동, 직접 만나세요.</h2><p>당신의 다음 이야기가 시작되는 곳, ONSTAGE</p></div><div className="banner-mark"><Ticket size={42} strokeWidth={1.2} /><span>YOUR NEXT<br /><b>GREAT NIGHT.</b></span></div></section>
      <div className="service-notes"><span><Ticket size={17} /> 간편한 모바일 티켓</span><span><Heart size={17} /> 취향에 맞는 공연 발견</span><span><Sparkles size={17} /> 설레는 순간의 시작</span></div>
    </main>
    <footer className="site-footer"><div><a className="brand" href="/">ONSTAGE<span /></a><p>좋은 음악, 좋은 순간, 그리고 당신.</p></div><div className="footer-right"><span>공연 및 예매 정보는 체험용 샘플입니다.</span><span>© 2026 ONSTAGE. All moments reserved.</span></div></footer>
  </div>;
}
