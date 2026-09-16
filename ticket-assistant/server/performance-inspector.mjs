import { allowedUrl, getProvider } from '../shared/providers.mjs';
import { VENUES, findVenue } from '../shared/venues.mjs';

const MAX_HTML = 2 * 1024 * 1024;
const REDIRECTS = new Set([301, 302, 303, 307, 308]);

function decodeHtml(value) {
  return String(value || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, number) => String.fromCodePoint(Number(number)))
    .replace(/&#x([0-9a-f]+);/gi, (_, number) => String.fromCodePoint(parseInt(number, 16)))
    .replace(/\s+/g, ' ').trim();
}

function attribute(html, tagPattern, attributeName) {
  const match = html.match(new RegExp(`<${tagPattern}\\b[^>]*\\b${attributeName}=["']([^"']+)["'][^>]*>`, 'i'));
  return decodeHtml(match?.[1]);
}

function cleanTitle(value) {
  return String(value || '')
    .replace(/^\(([^)]+)\)\s*-\s*(?:현재|예정)\s*공연(?:\s*\|.*)?$/i, '$1')
    .replace(/\s*[|｜]\s*(?:예스24\s*티켓|YES24\s*TICKET|멜론\s*티켓|Melon\s*Ticket|NOL\s*티켓|샤롯데씨어터|세종문화회관).*$/i, '')
    .trim();
}

function parseDetails(html) {
  const title = cleanTitle(attribute(html, 'meta(?=[^>]*property=["\']og:title["\'])', 'content')
    || attribute(html, 'meta(?=[^>]*name=["\']twitter:title["\'])', 'content')
    || decodeHtml(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]));
  const candidates = [
    attribute(html, '(?:a|button)(?=[^>]*id=["\']performanceHallBtn["\'])', 'title'),
    decodeHtml(html.match(/<span\b[^>]*class=["'][^"']*\bplace\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)?.[1]),
    decodeHtml(html.match(/<dt\b[^>]*>\s*공연장\s*<\/dt>\s*<dd\b[^>]*>([\s\S]*?)<\/dd>/i)?.[1]),
    decodeHtml(html.match(/(?:"(?:placeName|venueName|hallName|locationName)"\s*:\s*"|data-(?:place|venue|hall)(?:-name)?=["'])([^"']+)/i)?.[1]),
  ].filter(Boolean);
  const decoded = decodeHtml(html);
  const recognized = candidates.map(findVenue).find(Boolean) || VENUES.find(venue => venue.aliases.some(alias => decoded.includes(alias)));
  return { title, venue: recognized?.name || candidates[0] || '', venueId: recognized?.id || '' };
}

async function fetchHtml(url, provider, fetcher) {
  let current = url;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    for (let count = 0; count <= 5; count++) {
      if (!allowedUrl(current, provider)) throw new Error('공식 티켓처 주소 밖으로 이동하여 공연장 확인을 중단했습니다.');
      const response = await fetcher(current, { redirect: 'manual', signal: controller.signal, headers: { 'User-Agent': 'TicketAssistant/1.0 venue-inspector' } });
      if (REDIRECTS.has(response.status)) {
        const location = response.headers.get('location');
        if (!location) throw new Error('공연 정보 이동 주소가 비어 있습니다.');
        current = new URL(location, current).href;
        continue;
      }
      if (!response.ok) throw new Error(`공식 공연 페이지가 HTTP ${response.status} 응답을 반환했습니다.`);
      if (response.url && !allowedUrl(response.url, provider)) throw new Error('공식 티켓처 주소 밖의 응답을 거부했습니다.');
      const declared = Number(response.headers.get('content-length') || 0);
      if (declared > MAX_HTML) throw new Error('공연 페이지가 너무 커서 자동 확인하지 못했습니다.');
      const html = await response.text();
      if (Buffer.byteLength(html) > MAX_HTML) throw new Error('공연 페이지가 너무 커서 자동 확인하지 못했습니다.');
      return { html, finalUrl: response.url || current };
    }
    throw new Error('공연 페이지 이동 횟수가 너무 많습니다.');
  } finally {
    clearTimeout(timer);
  }
}

export async function inspectPerformance({ id, url, fetcher = fetch }) {
  const provider = getProvider(id);
  const address = typeof url === 'string' ? url.trim() : '';
  if (!allowedUrl(address, provider)) throw new Error(`${provider.name}의 공식 공연 상세 URL을 입력해주세요.`);
  const { html, finalUrl } = await fetchHtml(address, provider, fetcher);
  const details = parseDetails(html);
  return {
    ...details,
    url: address,
    finalUrl,
    provider: provider.name,
    host: new URL(finalUrl).hostname,
    checkedAt: new Date().toISOString(),
    complete: Boolean(details.title && details.venue),
  };
}

export { parseDetails };
