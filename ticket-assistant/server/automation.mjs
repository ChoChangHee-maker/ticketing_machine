import { allowedUrl, getProvider } from '../shared/providers.mjs';
import { validatePreferences, chooseSeats, parseSeat, splitPreferences, ACTIVE_RUN_STATES, PHASE_LABELS } from '../shared/model.mjs';
import { inspectLoginPage } from './browser.mjs';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const interpolate = (selector, config, zone = '') => selector.replaceAll('{date}', config.date).replaceAll('{dateCompact}', config.date.replaceAll('-', '')).replaceAll('{day}', String(Number(config.date.slice(-2)))).replaceAll('{time}', config.time).replaceAll('{zone}', zone.replaceAll('"', '\\"'));
const DEFAULT_SEATS = '[data-seat-id],[data-seat-no],[title*="열"][title*="번"],[aria-label*="열"][aria-label*="번"]';
const sameSeat = (a, b) => a.zone === b.zone && a.row === b.row && a.number === b.number;

// A single browser round trip reads all candidates without thousands of locator calls.
export function readSeatElements(elements) {
  return elements.map((el, index) => ({
    index,
    visible: Boolean(el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden' && getComputedStyle(el).display !== 'none'),
    label: el.getAttribute('title') || el.getAttribute('aria-label') || el.textContent || '',
    zone: el.getAttribute('data-zone') || el.getAttribute('data-block') || '',
    row: el.getAttribute('data-row') || '', number: el.getAttribute('data-seat-no') || '',
    disabled: el.matches(':disabled,[aria-disabled="true"],[data-available="false"]') || /(?:^|\s)(disabled|sold|unavailable|reserved)(?:\s|$)/i.test(el.getAttribute('class') || ''),
    selected: el.matches('[aria-selected="true"],[aria-pressed="true"],[data-selected="true"]') || /(?:^|\s)(selected|on)(?:\s|$)/i.test(el.getAttribute('class') || ''),
  }));
}

export class Runner {
  constructor(browsers, emit = () => {}, { elementWaitMs = 6000, pollMs = 200, afterClickMs = 350 } = {}) {
    Object.assign(this, { browsers, emit, elementWaitMs, pollMs, afterClickMs });
    this.state = { status: 'idle', jobs: {}, winner: null, runId: 0 };
    this.stopped = false;
    this.generation = 0;
    this.jobPages = new Map();
    this.contexts = new Map();
    this.starting = false;
  }
  snapshot() { return this.state; }
  update(id, status, message, extra = {}) {
    this.state.jobs[id] = { ...this.state.jobs[id], status, message, ...extra };
    this.emit({ type: 'progress', provider: id, status, message, ...extra });
  }
  guard(generation, id) {
    if (this.stopped || generation !== this.generation) throw new Error('실행이 중지되었습니다.');
    if (id && this.state.winner && this.state.winner !== id) throw new Error('다른 티켓처에서 좌석을 선택하여 멈췄습니다.');
  }
  stop() {
    this.stopped = true;
    for (const [id, job] of Object.entries(this.state.jobs)) {
      if (job.canResume) this.update(id, 'stopped', '실행을 중지했습니다. 현재 예매창은 유지됩니다.', { canResume: false });
    }
    if (this.state.status === 'waiting') this.state.status = 'stopped';
    else if (['validating', 'running', 'scheduled'].includes(this.state.status)) this.state.status = 'stopping';
    this.emit({ type: 'log', message: '중지를 요청했습니다. 진행 중인 작업이 끝나면 추가 클릭을 멈춥니다.' });
  }

  async start(input) {
    if (this.starting || ACTIVE_RUN_STATES.includes(this.state.status)) throw new Error('이미 실행 중입니다. 먼저 중지해주세요.');
    const config = validatePreferences(input, true);
    const generation = ++this.generation;
    this.starting = true;
    this.stopped = false;
    this.config = config;
    this.contexts.clear();
    this.jobPages.clear();
    this.state = { status: 'validating', jobs: {}, winner: null, runId: generation };
    try {
      for (const id of config.selected) {
        this.guard(generation);
        this.update(id, 'checking', '실행 전 공식 사이트의 로그인 상태를 다시 확인합니다.');
        const login = await this.browsers.check(id, { fresh: true, maxAgeMs: 30000 });
        this.guard(generation);
        if (login?.status !== 'verified') {
          this.update(id, 'attention', '로그인 연결에서 로그인 상태를 확인해주세요.');
          throw new Error(getProvider(id).name + ': 실제 로그인 상태를 먼저 확인해주세요.');
        }
      }
    } catch (error) {
      this.state.status = this.stopped ? 'stopped' : 'attention';
      throw error;
    } finally { this.starting = false; }
    this.state.status = config.scheduledAt ? 'scheduled' : 'running';
    this.task = this.execute(config, generation).catch(error => {
      this.state.status = this.stopped ? 'stopped' : 'error';
      this.emit({ type: 'log', message: error.message });
    });
    return this.state;
  }

  finish() {
    this.state.status = this.stopped ? 'stopped' : this.state.winner ? 'review' : Object.values(this.state.jobs).some(job => job.canResume) ? 'waiting' : 'attention';
    if (this.state.winner) for (const [id, job] of Object.entries(this.state.jobs)) {
      if (job.canResume) this.update(id, 'stopped', '좌석 선택이 시작되어 추가 실행을 멈췄습니다.', { canResume: false });
    }
    this.emit({ type: 'complete', status: this.state.status, winner: this.state.winner });
  }

  async execute(config, generation) {
    const at = config.scheduledAt ? Date.parse(config.scheduledAt + '+09:00') : Date.now();
    for (const id of config.selected) this.update(id, at > Date.now() ? 'scheduled' : 'ready', at > Date.now() ? '지정한 실행 시간까지 대기합니다. (한국 시간)' : '예매 화면을 준비합니다.');
    while (Date.now() < at) { this.guard(generation); await wait(Math.min(250, at - Date.now())); }
    this.guard(generation);
    this.state.status = 'running';
    await Promise.allSettled(config.selected.map(id => this.runProvider(id, config, generation)));
    this.finish();
  }

  async resume(id, { runId, phase } = {}) {
    getProvider(id);
    const job = this.state.jobs[id];
    if (this.state.status !== 'waiting' || this.stopped || this.state.winner || runId !== this.generation || !job?.canResume || !job.resumeSteps?.includes(phase)) throw new Error('현재 실행에서 이어갈 수 있는 단계를 선택해주세요.');
    if (![...(this.jobPages.get(id) || [])].some(page => !page.isClosed())) throw new Error('예매창이 닫혔습니다. 실행을 중지한 뒤 다시 시작해주세요.');
    this.state.status = 'running';
    const context = this.contexts.get(id);
    context.index = context.phases.indexOf(phase);
    this.update(id, 'ready', '기존 예매창에서 ' + PHASE_LABELS[phase] + '부터 이어갑니다.', { canResume: false });
    this.task = this.runProvider(id, this.config, this.generation, true).then(() => this.finish());
    return this.state;
  }

  pages(id) { return [...(this.jobPages.get(id) || [])].reverse().filter(p => !p.isClosed()); }
  frames(id) {
    const provider = getProvider(id);
    return this.pages(id).filter(p => allowedUrl(p.url(), provider)).flatMap(p => p.frames()).filter(f => allowedUrl(f.url(), provider));
  }
  async focus(id) {
    const page = this.pages(id)[0];
    if (page) return page.bringToFront();
    return this.browsers.focus(id, { allowOpen: !ACTIVE_RUN_STATES.includes(this.state.status) });
  }
  async checkBlockers(id, generation) {
    this.guard(generation, id);
    const page = this.pages(id)[0];
    if (!page) throw new Error('예매창이 닫혔습니다.');
    const deadline = Date.now() + this.elementWaitMs;
    while (page.url() === 'about:blank' && Date.now() < deadline && !page.isClosed()) {
      this.guard(generation, id);
      await wait(this.pollMs);
    }
    const provider = getProvider(id);
    const signals = await inspectLoginPage(page, provider);
    this.guard(generation, id);
    if (page.isClosed()) throw new Error('예매창이 닫혔습니다.');
    if (signals.blocked) throw new Error('보안 확인이 필요합니다. 브라우저에서 완료한 뒤 이어갈 단계를 선택해주세요.');
    if (signals.passwordVisible || (allowedUrl(page.url(), provider, true) && !allowedUrl(page.url(), provider))) throw new Error('로그인이 필요합니다. 브라우저에서 완료한 뒤 이어갈 단계를 선택해주세요.');
    if (!allowedUrl(page.url(), provider)) throw new Error('공식 예매 화면으로 돌아온 뒤 이어갈 단계를 선택해주세요.');
  }

  async clickOne(id, selectors, generation, optional = false) {
    const deadline = Date.now() + (optional ? Math.min(1000, this.elementWaitMs) : this.elementWaitMs);
    do {
      this.guard(generation, id);
      await this.checkBlockers(id, generation);
      for (const selector of selectors.filter(Boolean)) {
        const matches = [];
        for (const frame of this.frames(id)) {
          const nodes = frame.locator(selector);
          const count = await nodes.count();
          if (count > 100) throw new Error('선택 범위가 너무 넓습니다. 화면 연결 설정을 확인해주세요.');
          for (let i = 0; i < count; i++) if (await nodes.nth(i).isVisible() && await nodes.nth(i).isEnabled()) matches.push(nodes.nth(i));
        }
        if (matches.length > 1) throw new Error('선택할 항목이 여러 개입니다. 브라우저에서 직접 선택한 뒤 다음 단계부터 이어가세요.');
        if (matches.length === 1) {
          const text = await matches[0].evaluate(el => [el.textContent, el.getAttribute('aria-label'), el.getAttribute('value')].filter(Boolean).join(' '));
          if (/결제|구매\s*확정|동의|약관|pay\s*now|checkout/i.test(text)) throw new Error('결제 또는 동의 단계입니다. 직접 진행해주세요.');
          this.guard(generation, id);
          await matches[0].click({ timeout: 4000 });
          await wait(this.afterClickMs);
          this.guard(generation, id);
          return true;
        }
      }
      if (Date.now() >= deadline) break;
      await wait(this.pollMs);
    } while (true);
    if (!optional) throw new Error('지정한 항목이 나타나지 않았습니다. 브라우저에서 직접 진행한 뒤 다음 단계부터 이어가세요.');
    return false;
  }

  async scanSeats(id, config) {
    const profile = config.profiles[id] || {};
    const seats = [];
    const keys = new Set();
    for (const frame of this.frames(id)) {
      const items = frame.locator(profile.seat || DEFAULT_SEATS);
      if (await items.count() > 3000) throw new Error('좌석 선택 범위가 너무 넓습니다. 화면 설정을 확인해주세요.');
      for (const data of await items.evaluateAll(readSeatElements)) {
        if (!data.visible) continue;
        const parsed = parseSeat(data.label, data);
        if (!parsed.valid) continue;
        const key = JSON.stringify([parsed.zone, parsed.row, parsed.number]);
        if (keys.has(key)) throw new Error('같은 좌석을 나타내는 항목이 여러 개입니다. 좌석 선택 범위를 확인해주세요.');
        keys.add(key);
        seats.push({ ...parsed, locator: items.nth(data.index), available: !data.disabled && !/매진|선택불가|판매완료/.test(data.label), selected: data.selected, label: data.label });
      }
    }
    return seats;
  }

  async waitForSeats(id, config, generation) {
    const deadline = Date.now() + this.elementWaitMs;
    do {
      await this.checkBlockers(id, generation);
      const found = await this.scanSeats(id, config);
      if (found.length || Date.now() >= deadline) return found;
      await wait(this.pollMs);
    } while (true);
  }

  async selectSeats(id, config, generation) {
    const profile = config.profiles[id] || {};
    for (const zone of splitPreferences(config.zones)) {
      this.guard(generation, id);
      const escaped = zone.replaceAll('"', '\\"');
      const selectors = profile.zone ? [interpolate(profile.zone, config, zone)] : ['role=button[name="' + escaped + '"s]', 'role=link[name="' + escaped + '"s]', '[data-zone="' + escaped + '"]:not([data-seat-id],[data-seat-no],[data-row],[title*="열"],[aria-label*="열"])'];
      await this.clickOne(id, selectors, generation, !profile.zone);
      const found = await this.waitForSeats(id, config, generation);
      this.guard(generation, id);
      if (found.some(s => s.selected)) {
        this.state.winner = id;
        throw new Error('이미 선택된 좌석이 있습니다. 브라우저에서 현재 좌석을 확인해주세요.');
      }
      const choices = chooseSeats(found, { ...config, zones: zone });
      if (!choices.length) continue;
      this.guard(generation, id);
      this.state.winner = id;
      this.update(id, 'selecting', '조건에 맞는 좌석을 선택합니다.', { canResume: false });
      for (const seat of choices) {
        await this.checkBlockers(id, generation);
        const data = (await seat.locator.evaluateAll(readSeatElements))[0];
        if (!data?.visible || data.disabled || data.selected || /매진|선택불가|판매완료/.test(data.label) || !sameSeat(seat, parseSeat(data.label, data))) throw new Error('좌석 상태나 위치가 변경되었습니다. 브라우저에서 선택 상태를 확인해주세요.');
        this.guard(generation, id);
        await seat.locator.click({ timeout: 4000 });
        await wait(150);
      }
      const selected = (await this.scanSeats(id, config)).filter(s => s.selected);
      const verified = choices.every(s => selected.some(t => sameSeat(s, t)));
      this.update(id, verified ? 'selected' : 'review', verified ? '좌석 선택 상태를 확인했습니다. 브라우저에서 최종 확인하고 직접 결제해주세요.' : '좌석 클릭 후 선택 상태를 확인하지 못했습니다. 브라우저에서 직접 확인해주세요.', { seats: choices.map(s => s.label) });
      await this.focus(id);
      return;
    }
    throw new Error('조건에 맞는 좌석을 읽지 못했습니다. 좌석이 없거나 화면 연결이 필요합니다. 캔버스 좌석도는 직접 선택해주세요.');
  }

  async runProvider(id, config, generation, resume = false) {
    const session = this.browsers.sessions.get(id);
    const profile = config.profiles[id] || {};
    let context = this.contexts.get(id);
    try {
      this.guard(generation, id);
      if (!session) throw new Error('티켓처 브라우저를 다시 연결해주세요.');
      if (!resume) {
        if ((await this.browsers.check(id, { fresh: true, maxAgeMs: 30000 }))?.status !== 'verified') throw new Error('로그인이 만료되었거나 확인되지 않습니다. 다시 로그인해주세요.');
        this.guard(generation, id);
        session.suspended = true;
        const page = await session.context.newPage();
        const pages = new Set();
        const track = opened => { pages.add(opened); opened.on('popup', track); };
        track(page);
        this.jobPages.set(id, pages);
        this.update(id, 'opening', '설정한 공연 상세 페이지를 엽니다.');
        await page.goto(config.urls[id], { waitUntil: 'domcontentloaded', timeout: 30000 });
        context = { index: 0, phases: profile.order === 'entry-first' ? ['entry', 'date', 'time', 'zone'] : ['date', 'time', 'entry', 'zone'] };
        this.contexts.set(id, context);
      }
      session.suspended = true;
      const compact = config.date.replaceAll('-', '');
      const selectors = {
        entry: profile.entry ? [profile.entry] : ['role=button[name="예매하기"s]', 'role=link[name="예매하기"s]', 'role=button[name="일반예매"s]'],
        date: profile.date ? [interpolate(profile.date, config)] : ['[data-date="' + config.date + '"]', '[data-date="' + compact + '"]', '[data-perfday="' + compact + '"]', '[aria-label="' + config.date + '"]'],
        time: profile.time ? [interpolate(profile.time, config)] : ['role=button[name="' + config.time + '"s]', 'role=link[name="' + config.time + '"s]', '[data-time="' + config.time + '"]'],
      };
      for (; context.index < context.phases.length; context.index++) {
        const phase = context.phases[context.index];
        this.guard(generation, id);
        this.update(id, phase, PHASE_LABELS[phase] + ' 중입니다.', { phase, canResume: false });
        if (phase === 'zone') await this.selectSeats(id, config, generation);
        else await this.clickOne(id, selectors[phase], generation);
      }
    } catch (error) {
      const canResume = !this.stopped && !this.state.winner && context && this.pages(id).length > 0;
      this.update(id, this.stopped ? 'stopped' : this.state.winner === id ? 'review' : this.state.winner ? 'stopped' : canResume ? 'waiting' : 'attention', error.message, {
        canResume: Boolean(canResume), resumeSteps: canResume ? context.phases.slice(context.index) : [],
        phase: context?.phases[context.index] || null,
      });
    } finally { if (session) session.suspended = false; }
  }
}
