const escapeRegex = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

export function nolDateLabel(date) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date));
  if (!match) return '';
  return `${Number(match[1])}년 ${Number(match[2])}월 ${Number(match[3])}일`;
}

export function nolSelectors(config) {
  const label = nolDateLabel(config.date);
  const [hours, minutes] = String(config.time || '').split(':');
  const clock = hours && minutes ? `${escapeRegex(hours)}\\s*:\\s*${escapeRegex(minutes)}` : '';
  return {
    date: [
      `button.react-calendar__tile:has(abbr[aria-label=${JSON.stringify(label)}])`,
      `role=button[name=${JSON.stringify(label)}s]`,
    ],
    time: clock ? [`role=button[name=/^\\s*${clock}(?:\\s|$)/]`] : [],
    entry: ['role=button[name="예매하기"s]'],
  };
}

function monthNumber(value) {
  const match = /(\d{4})\D+(\d{1,2})/.exec(String(value));
  return match ? Number(match[1]) * 12 + Number(match[2]) - 1 : null;
}

// NOL renders the booking calendar with react-calendar. Move only through the
// calendar's own navigation buttons and stop once the requested month is shown.
export async function revealNolDate(frames, config, guard = () => {}) {
  const target = monthNumber(config.date.slice(0, 7).replace('-', '.'));
  if (target === null) return;
  for (const frame of frames) {
    const labels = frame.locator('button.react-calendar__navigation__label');
    for (let i = 0, count = await labels.count(); i < count; i++) {
      const label = labels.nth(i);
      if (!await label.isVisible()) continue;
      const current = monthNumber(await label.textContent());
      if (current === null || current === target) return;
      const selector = current < target
        ? 'button.react-calendar__navigation__next-button'
        : 'button.react-calendar__navigation__prev-button';
      const arrows = frame.locator(selector);
      const usable = [];
      for (let index = 0, total = await arrows.count(); index < total; index++) {
        if (await arrows.nth(index).isVisible() && await arrows.nth(index).isEnabled()) usable.push(arrows.nth(index));
      }
      if (usable.length !== 1) return;
      guard();
      await usable[0].click({ timeout: 4000 });
      await pause(100);
      guard();
      return;
    }
  }
}

export function parseNolPerformanceText(value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  const match = /^(\d{1,2})\s*:\s*([0-5]\d)(?:\s|$)/.exec(text);
  if (!match || Number(match[1]) > 23) return null;
  const availability = [];
  const casting = text.slice(match[0].length).replace(/(?:^|\s)([A-Za-z0-9가-힣]+석)\s*(\d+|매진)(?=\s|$)/g, (_all, grade, count) => {
    availability.push({ grade, count: count === '매진' ? null : Number(count) });
    return ' ';
  }).replace(/\s+/g, ' ').trim();
  return { time: `${match[1].padStart(2, '0')}:${match[2]}`, casting, availability };
}
