export const PROVIDERS = [
  { id: 'melon', name: '멜론티켓', short: 'M', color: '#19a85a', home: 'https://ticket.melon.com/', hosts: ['ticket.melon.com', 'm.ticket.melon.com'], authHosts: ['member.melon.com', 'accounts.kakao.com', 'logins.daum.net'], hint: 'ticket.melon.com/performance/…' },
  { id: 'nol', name: 'NOL 티켓', short: 'N', color: '#5456e9', home: 'https://nol.yanolja.com/ticket', account: 'https://nol.yanolja.com/member/mypage', hosts: ['nol.yanolja.com', 'tickets.interpark.com', 'ticket.interpark.com', 'nol.interpark.com', 'poticket.interpark.com'], authHosts: ['accounts.interpark.com', 'member.interpark.com', 'accounts.yanolja.com', 'accounts.nol.com', 'accounts.kakao.com', 'nid.naver.com'], hint: 'nol.yanolja.com/ticket/… 또는 tickets.interpark.com/goods/…' },
  { id: 'yes24', name: 'YES24', short: 'Y', color: '#1878c6', home: 'https://ticket.yes24.com/', hosts: ['ticket.yes24.com', 'm.ticket.yes24.com'], authHosts: ['www.yes24.com', 'ssl.yes24.com', 'm.yes24.com', 'accounts.kakao.com', 'nid.naver.com'], hint: 'ticket.yes24.com/…/Detail.aspx?…' },
  { id: 'charlotte', name: '샤롯데씨어터', short: 'C', color: '#af6b26', home: 'https://www.charlottetheater.co.kr/', hosts: ['www.charlottetheater.co.kr', 'charlottetheater.co.kr'], authHosts: ['members.lpoint.com', 'www.lpoint.com', 'accounts.kakao.com'], hint: '샤롯데씨어터 공연 상세 주소' },
  { id: 'sejong', name: '세종문화회관', short: 'S', color: '#b6494f', home: 'https://www.sejongpac.or.kr/', hosts: ['www.sejongpac.or.kr', 'sejongpac.or.kr', 'ticket.sejongpac.or.kr'], authHosts: ['accounts.kakao.com', 'nid.naver.com'], hint: 'sejongpac.or.kr/…?performIdx=…' },
];

export function getProvider(id) {
  const provider = PROVIDERS.find(p => p.id === id);
  if (!provider) throw new Error('지원하지 않는 티켓처입니다.');
  return provider;
}

export function allowedUrl(value, provider, includeAuth = false) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && (!url.port || url.port === '443') && [...provider.hosts, ...(includeAuth ? provider.authHosts : [])].includes(url.hostname.toLowerCase());
  } catch { return false; }
}

export const LOGIN_LABELS = { idle: '선택 안 함', opening: '브라우저 연결 중', checking: '로그인 확인 중', required: '직접 로그인 필요', verified: '로그인 확인됨', unknown: '로그인 판별 필요', challenge: '보안 확인 필요', error: '접속 확인 실패', closed: '브라우저 닫힘' };
