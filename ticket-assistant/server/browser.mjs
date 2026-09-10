import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { getProvider, allowedUrl } from '../shared/providers.mjs';
import { classifyLogin } from '../shared/model.mjs';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

export function readLoginSignals() {
  const visible = el => Boolean(el && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden' && getComputedStyle(el).display !== 'none');
  const controls = [...document.querySelectorAll('a,button,[role="button"],input[type="button"],input[type="submit"]')].filter(visible);
  const names = controls.map(el => (el.getAttribute('aria-label') || el.textContent?.trim() || el.querySelector('img[alt]')?.getAttribute('alt') || el.getAttribute('value') || '').replace(/\s+/g, '').toLowerCase());
  // Read only visibility and labels, never login input values or cookies.
  const passwordVisible = [...document.querySelectorAll('input[type="password"]')].some(visible);
  const blocked = [...document.querySelectorAll('input[id*="captcha" i],input[name*="captcha" i],iframe[src*="recaptcha"],iframe[src*="hcaptcha"],input[placeholder*="보안문자"]')].some(visible);
  const logoutVisible = names.some(name => /^(로그아웃|logout|signout)$/.test(name)) || controls.some(el => /logout|logoff/i.test(el.getAttribute('href') || '') && !/로그인/.test(el.textContent || ''));
  const loginVisible = names.some(name => /^(로그인|login|signin|로그인하기|회원로그인)$/.test(name));
  return { passwordVisible, blocked, logoutVisible, loginVisible };
}

export async function inspectLoginPage(page, provider) {
  const signals = { trusted: false, logoutVisible: false, loginVisible: false, passwordVisible: false, blocked: false };
  const pageUrl = page.url();
  if (/^https:\/\/cdn-botmanager\.stclab\.com\//.test(page.url())) return { ...signals, blocked: true };
  if (!allowedUrl(page.url(), provider, true)) return signals;
  for (const frame of page.frames()) {
    if (!allowedUrl(frame.url(), provider, true)) continue;
    try {
      if (frame.parentFrame?.() && !await (await frame.frameElement()).isVisible()) continue;
      const frameUrl = frame.url();
      const observed = await frame.evaluate(readLoginSignals);
      if (page.url() !== pageUrl || frame.url() !== frameUrl) continue;
      const trusted = allowedUrl(frame.url(), provider);
      signals.logoutVisible ||= trusted && observed.logoutVisible;
      signals.trusted ||= trusted;
      signals.passwordVisible ||= observed.passwordVisible;
      signals.blocked ||= observed.blocked;
      signals.loginVisible ||= trusted && observed.loginVisible;
    } catch { /* A navigating frame cannot supply login evidence. */ }
  }
  return signals;
}

export class BrowserManager {
  constructor({ driver = chromium, dataDir = join(process.env.LOCALAPPDATA || homedir(), 'TicketAssistant', 'profiles'), emit = () => {}, settleMs = 4000 } = {}) {
    Object.assign(this, { driver, dataDir, emit, settleMs });
    this.sessions = new Map();
    this.opening = new Map();
    this.checking = new Map();
    this.states = new Map();
  }

  setState(id, patch) {
    const next = { ...(this.states.get(id) || {}), ...patch, checkedAt: new Date().toISOString() };
    if (next.status !== 'verified') next.verifiedAt = null;
    this.states.set(id, next);
    this.emit({ type: 'login', provider: id, ...next });
    return next;
  }

  snapshot() { return Object.fromEntries(this.states); }

  watch(id, session, page) {
    session.observedPage = page;
    page.on('framenavigated', frame => {
      if (frame === page.mainFrame() && allowedUrl(page.url(), session.provider, true)) session.observedPage = page;
    });
  }

  poll(id, session) {
    if (session.timer) return;
    session.timer = setInterval(() => { if (!session.suspended) this.check(id).catch(() => {}); }, 3500);
    session.timer.unref?.();
  }

  async open(id) {
    getProvider(id);
    if (this.opening.has(id)) return this.opening.get(id);
    const operation = this.openInternal(id).finally(() => this.opening.delete(id));
    this.opening.set(id, operation);
    return operation;
  }

  async openInternal(id) {
    const provider = getProvider(id);
    let session = this.sessions.get(id);
    try {
      if (!session?.context.pages().some(p => !p.isClosed())) {
        this.setState(id, { status: 'opening', origin: '', detail: '공식 티켓처의 로그인 상태를 확인합니다.' });
        const profile = join(this.dataDir, id);
        await mkdir(profile, { recursive: true });
        const context = await this.driver.launchPersistentContext(profile, { headless: false, viewport: null, locale: 'ko-KR', timezoneId: 'Asia/Seoul', args: ['--start-maximized'] });
        context.setDefaultTimeout(4000);
        session = { context, provider, timer: null, suspended: false };
        this.sessions.set(id, session);
        const owned = session;
        context.on('close', () => {
          clearInterval(owned.timer);
          if (this.sessions.get(id) !== owned) return;
          this.sessions.delete(id);
          this.setState(id, { status: 'closed', origin: '', detail: '브라우저가 닫혔습니다. 티켓처를 다시 연결해주세요.' });
        });
        context.on('page', page => this.watch(id, owned, page));
        for (const page of context.pages()) this.watch(id, owned, page);
      }
      this.poll(id, session);
      let result = await this.check(id, { fresh: true });
      const page = session.verificationPage;
      if (page && !page.isClosed()) await page.bringToFront();
      if (result.status === 'required' && page) {
        for (const role of ['link', 'button']) {
          const login = page.getByRole(role, { name: /^(로그인|로그인하기|회원로그인|Login|Sign in)$/i });
          const count = await login.count();
          for (let i = 0; i < Math.min(count, 4); i++) {
            if (!await login.nth(i).isVisible()) continue;
            await login.nth(i).click({ timeout: 3000 });
            return this.check(id);
          }
        }
      }
      return result;
    } catch (error) {
      if (session && this.sessions.get(id) !== session) return this.states.get(id);
      const detail = error.message.includes("Executable doesn't exist") ? '전용 브라우저가 설치되지 않았습니다. 브라우저 설치.cmd를 실행해주세요.' : error.message;
      return this.setState(id, { status: 'error', detail: detail.slice(0, 350) });
    }
  }

  async check(id, options = {}) {
    getProvider(id);
    const pending = this.checking.get(id);
    if (pending) {
      if (!options.fresh || pending.fresh) return pending.task;
      await pending.task;
      return this.check(id, options);
    }
    const entry = { fresh: Boolean(options.fresh) };
    entry.task = this.checkInternal(id, options).finally(() => {
      if (this.checking.get(id) === entry) this.checking.delete(id);
    });
    this.checking.set(id, entry);
    return entry.task;
  }

  async checkInternal(id, { fresh = false, maxAgeMs = 0 } = {}) {
    const provider = getProvider(id);
    const session = this.sessions.get(id);
    if (!session) return this.states.get(id) || { status: 'idle', detail: '티켓처를 선택해주세요.' };
    const commit = patch => this.sessions.get(id) === session ? this.setState(id, patch) : this.states.get(id);
    const pages = session.context.pages().filter(p => !p.isClosed());
    if (!pages.length) return commit({ status: 'closed', detail: '열린 티켓처 창이 없습니다.' });
    try {
      let page = session.observedPage && !session.observedPage.isClosed() ? session.observedPage : pages.at(-1);
      const recent = session.verificationPage === page && session.freshAt && Date.now() - session.freshAt <= maxAgeMs;
      if (fresh && !recent) {
        commit({ status: 'checking', detail: '공식 사이트를 새로 열어 로그인 유효 여부를 확인합니다.' });
        page = session.verificationPage && !session.verificationPage.isClosed() ? session.verificationPage : await session.context.newPage();
        session.verificationPage = page;
        session.observedPage = page;
        session.freshAt = null;
        const response = await page.goto(provider.account || provider.home, { waitUntil: 'domcontentloaded', timeout: 30000 });
        if (response && response.status() >= 400) throw new Error('공식 사이트가 HTTP ' + response.status() + ' 응답을 반환했습니다.');
        session.freshAt = Date.now();
      }
      const deadline = Date.now() + (fresh ? this.settleMs : 0);
      let result;
      do {
        result = classifyLogin(await inspectLoginPage(page, provider));
        if (result.status !== 'unknown' || Date.now() >= deadline || page.isClosed() || this.sessions.get(id) !== session) break;
        await wait(250);
      } while (true);
      if (page.isClosed()) return commit({ status: 'unknown', detail: '확인하던 창이 닫혔습니다. 열린 로그인 창에서 다시 확인해주세요.' });
      if (session.observedPage && session.observedPage !== page) return commit({ status: 'checking', detail: '이동한 로그인 화면을 확인하고 있습니다.' });
      const origin = allowedUrl(page.url(), provider, true) ? new URL(page.url()).origin : '';
      return commit({ ...result, origin, verifiedAt: result.status === 'verified' ? new Date().toISOString() : null, refreshedAt: session.freshAt ? new Date(session.freshAt).toISOString() : null });
    } catch (error) {
      return commit({ status: 'error', detail: '로그인 확인 실패: ' + error.message.slice(0, 280) });
    }
  }

  async focus(id, { allowOpen = true, verification = false } = {}) {
    const session = this.sessions.get(id);
    let page = session?.observedPage && !session.observedPage.isClosed() ? session.observedPage : session?.context.pages().filter(p => !p.isClosed()).at(-1);
    const onAuthPage = page && allowedUrl(page.url(), getProvider(id), true) && !allowedUrl(page.url(), getProvider(id));
    if (verification && !onAuthPage && session?.verificationPage && !session.verificationPage.isClosed()) page = session.verificationPage;
    if (page) await page.bringToFront();
    else if (allowOpen) await this.open(id);
    else throw new Error('티켓처 창이 닫혔습니다. 실행을 중지하고 다시 연결해주세요.');
  }

  async close() {
    await Promise.allSettled([...this.sessions.values()].map(s => { clearInterval(s.timer); return s.context.close(); }));
  }
}
