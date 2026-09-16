import { melonSelectors, revealMelonDate } from './melon.mjs';
import { nolSelectors, parseNolPerformanceText, revealNolDate } from './nol.mjs';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function parseMelonPerformanceText(value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  const match = /^(\d{1,2})\s*(?::|시)\s*([0-5]?\d)\s*분?(?:\s|$)/.exec(text);
  if (!match || Number(match[1]) > 23) return null;
  const casting = text.match(/(?:출연|캐스팅)\s*[:：]\s*(.+)$/)?.[1]?.trim() || '';
  return { time: `${match[1].padStart(2, '0')}:${match[2].padStart(2, '0')}`, casting, availability: [], soldOut: /매진/.test(text) };
}

async function visibleFrames(page) {
  const frames = [];
  for (const frame of page.frames()) {
    try {
      if (frame.parentFrame?.() && !await (await frame.frameElement()).isVisible()) continue;
      frames.push(frame);
    } catch { /* A detached frame cannot provide schedule data. */ }
  }
  return frames;
}

async function oneVisible(frames, selectors) {
  for (const selector of selectors) {
    const found = [];
    for (const frame of frames) {
      const nodes = frame.locator(selector);
      for (let i = 0, count = await nodes.count(); i < count; i++) if (await nodes.nth(i).isVisible()) found.push(nodes.nth(i));
    }
    if (found.length > 1) throw new Error('같은 날짜가 여러 곳에 표시되어 회차를 안전하게 확인할 수 없습니다.');
    if (found.length === 1) return found[0];
  }
  return null;
}

async function chooseDate(page, id, date, timeoutMs) {
  const config = { date, time: '' };
  const selectors = id === 'nol' ? nolSelectors(config).date : melonSelectors(config).date;
  const deadline = Date.now() + timeoutMs;
  do {
    const frames = await visibleFrames(page);
    const target = await oneVisible(frames, selectors);
    if (target) {
      if (!await target.isEnabled()) throw new Error('선택한 날짜에는 예매 가능한 공연이 없습니다.');
      await target.click({ timeout: 4000 });
      await wait(350);
      return;
    }
    if (id === 'nol') await revealNolDate(frames, config);
    else await revealMelonDate(frames, config);
    await wait(100);
  } while (Date.now() < deadline);
  throw new Error('공식 공연 페이지에서 선택한 관람 날짜를 찾지 못했습니다.');
}

async function readNolSessions(page) {
  const results = [];
  for (const frame of await visibleFrames(page)) {
    const buttons = frame.locator('button');
    const texts = await buttons.evaluateAll(elements => elements.filter(element => element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden' && getComputedStyle(element).display !== 'none').map(element => element.innerText || element.textContent || ''));
    for (const text of texts) {
      const parsed = parseNolPerformanceText(text);
      if (parsed) results.push(parsed);
    }
  }
  return results;
}

async function readMelonSessions(page, date) {
  const compact = date.replaceAll('-', '');
  const results = [];
  for (const frame of await visibleFrames(page)) {
    const buttons = frame.locator(`#list_time li.item_time[data-perfday="${compact}"] > button`);
    const texts = await buttons.evaluateAll(elements => elements.filter(element => element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden' && getComputedStyle(element).display !== 'none').map(element => element.innerText || element.textContent || ''));
    for (const text of texts) {
      const parsed = parseMelonPerformanceText(text);
      if (parsed) results.push(parsed);
    }
  }
  return results;
}

export async function readPerformanceSchedule({ page, id, date, timeoutMs = 6000 }) {
  if (!['nol', 'melon'].includes(id)) throw new Error('이 티켓처의 실제 회차 자동 확인은 공연 URL 검증 후 지원됩니다.');
  await chooseDate(page, id, date, timeoutMs);
  const deadline = Date.now() + timeoutMs;
  let sessions = [];
  do {
    sessions = id === 'nol' ? await readNolSessions(page) : await readMelonSessions(page, date);
    if (sessions.length) break;
    await wait(200);
  } while (Date.now() < deadline);
  if (!sessions.length) throw new Error('선택한 날짜의 실제 공연 회차를 공식 페이지에서 찾지 못했습니다.');
  const byTime = new Map();
  for (const session of sessions) {
    if (byTime.has(session.time)) throw new Error(`${session.time} 회차가 여러 곳에 표시되어 자동 선택을 중단했습니다.`);
    byTime.set(session.time, session);
  }
  return { date, sessions: [...byTime.values()].sort((a, b) => a.time.localeCompare(b.time)), checkedAt: new Date().toISOString() };
}

export { parseMelonPerformanceText };
