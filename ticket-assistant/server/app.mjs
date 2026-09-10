import express from 'express';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { PROVIDERS, getProvider } from '../shared/providers.mjs';
import { BrowserManager } from './browser.mjs';
import { Runner } from './automation.mjs';
import { loadPreferences, savePreferences } from './store.mjs';
import { ACTIVE_RUN_STATES } from '../shared/model.mjs';
import { API_REVISION } from '../shared/app-version.mjs';
import { inspectPerformance } from './performance-inspector.mjs';

export function createApp({ browsers: suppliedBrowsers, load = loadPreferences, save = savePreferences, inspect = inspectPerformance } = {}) {
  const app = express();
  const token = randomBytes(32).toString('hex');
  const logs = [];
  let sequence = 0;
  const loginStatuses = new Map();
  const emit = event => {
    if (event.type === 'login') {
      if (loginStatuses.get(event.provider) === event.status) return;
      loginStatuses.set(event.provider, event.status);
      event = { ...event, message: event.detail };
    }
    logs.push({ id: ++sequence, at: new Date().toISOString(), ...event });
    if (logs.length > 200) logs.shift();
  };
  const browsers = suppliedBrowsers || new BrowserManager({ emit });
  const runner = new Runner(browsers, emit);
  app.disable('x-powered-by');
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    const host = req.headers.host || '';
    if (!/^(127\.0\.0\.1|localhost):(4318|5173|\d{4,5})$/.test(host)) return res.status(403).json({ error: '로컬 프로그램에서만 접근할 수 있습니다.' });
    const origin = req.headers.origin;
    if (origin && !['http://127.0.0.1:5174', 'http://localhost:5174', 'http://127.0.0.1:4318', 'http://localhost:4318'].includes(origin)) return res.status(403).json({ error: '허용되지 않은 접근입니다.' });
    if (req.headers['sec-fetch-site'] === 'cross-site') return res.status(403).json({ error: '다른 사이트의 접근은 허용되지 않습니다.' });
    if (req.path === '/bootstrap' || req.path === '/health') return next();
    const given = Buffer.from(String(req.headers['x-ticket-token'] || ''));
    const expected = Buffer.from(token);
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return res.status(403).json({ error: '연결이 만료되었습니다. 프로그램 화면을 새로고침해주세요.' });
    next();
  });
  app.use(express.json({ limit: '1mb' }));
  app.get('/api/health', (_req, res) => res.json({ ok: true, app: 'ticket-assistant', revision: API_REVISION }));
  app.get('/api/bootstrap', async (_req, res) => {
    let settings = null;
    let settingsError = '';
    try { settings = await load(); } catch (error) { settingsError = error.message; }
    res.json({ token, providers: PROVIDERS, settings, settingsError, revision: API_REVISION, capabilities: { seatMaps: true, venueMaps: true } });
  });
  app.get('/api/status', (_req, res) => res.json({ logins: browsers.snapshot(), run: runner.snapshot(), logs }));
  app.post('/api/settings', async (req, res) => { res.json(await save(req.body)); });
  app.post('/api/providers/:id/open', async (req, res) => {
    getProvider(req.params.id);
    if (ACTIVE_RUN_STATES.includes(runner.state.status)) return res.status(409).json({ error: '실행 중에는 연결을 바꿀 수 없습니다.' });
    res.json(await browsers.open(req.params.id));
  });
  app.post('/api/providers/:id/check', async (req, res) => {
    getProvider(req.params.id);
    if (['validating', 'running', 'scheduled', 'stopping'].includes(runner.state.status)) return res.status(409).json({ error: '실행을 멈춘 뒤 로그인 상태를 새로 확인해주세요.' });
    res.json(await browsers.check(req.params.id, { fresh: true }));
  });
  app.post('/api/providers/:id/focus', async (req, res) => {
    getProvider(req.params.id);
    if (req.body?.view === 'login') await browsers.focus(req.params.id, { allowOpen: !ACTIVE_RUN_STATES.includes(runner.state.status), verification: true });
    else await runner.focus(req.params.id);
    res.json({ ok: true });
  });
  app.post('/api/providers/:id/resume', async (req, res) => { res.json(await runner.resume(req.params.id, req.body)); });
  app.post('/api/run', async (req, res) => { res.json(await runner.start(req.body)); });
  app.post('/api/seat-maps/prepare', async (req, res) => { res.json(await runner.start(req.body, { preview: true })); });
  app.get('/api/providers/:id/seat-map', (req, res) => {
    getProvider(req.params.id);
    const map = runner.seatMaps.get(req.params.id);
    if (!map) return res.status(404).json({ error: '아직 불러온 좌석도가 없습니다.' });
    res.json(map);
  });
  app.post('/api/providers/:id/performance/inspect', async (req, res) => {
    getProvider(req.params.id);
    if (ACTIVE_RUN_STATES.includes(runner.state.status)) return res.status(409).json({ error: '실행 중에는 공연 설정을 바꿀 수 없습니다.' });
    res.json(await inspect({ id: req.params.id, url: req.body?.url }));
  });
  app.post('/api/providers/:id/seat-map/refresh', async (req, res) => { res.json(await runner.refreshSeatMap(req.params.id)); });
  app.post('/api/stop', (_req, res) => { runner.stop(); res.json({ ok: true }); });
  app.use('/api', (_req, res) => res.status(404).json({ error: '요청한 기능을 찾지 못했습니다.' }));
  app.use((error, _req, res, _next) => { res.status(error.status || 400).json({ error: error.message || '요청을 처리하지 못했습니다.' }); });
  return { app, browsers, runner, async close() { runner.stop(); await runner.task; await browsers.close(); } };
}
