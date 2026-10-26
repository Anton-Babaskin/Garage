'use strict';
/*
 * Гараж — сервер учёта машин и водителей.
 * Без зависимостей: только Node.js ≥ 20. Данные — JSON-файлы в DATA_DIR с атомарной записью.
 * Все изменения проверяет то же ядро (core.js), что и в браузере; автор и время ставятся на сервере.
 *
 *   node server.js                 — запуск
 *   node server.js users           — список пользователей
 *   node server.js set-pin <id> <PIN>
 *   node server.js reset-pins      — выдать всем новые PIN и показать их
 *
 *   Переменные: DATABASE_URL (PostgreSQL, на Replit задаётся сам), ADMIN_PIN (6 цифр для «Антон»),
 *   DATA_DIR, PORT, COOKIE_SECURE, COOKIE_SAMESITE, TRUST_PROXY, ALLOW_FRAME, SESSION_DAYS, BACKUP_KEEP.
 */
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');

globalThis.T = s => s;
globalThis.tpl = (s, v) => s.replace(/\{(\w+)\}/g, (_, k) => (v[k] == null ? '' : v[k]));
require('./core.js');
const F = globalThis.FleetCore;

const ROOT = __dirname;
const DATA = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '0.0.0.0';
const COOKIE_SECURE = process.env.COOKIE_SECURE !== '0';
const TRUST_PROXY = process.env.TRUST_PROXY !== '0';
const SESSION_DAYS = Number(process.env.SESSION_DAYS || 365);
const BACKUP_KEEP = Number(process.env.BACKUP_KEEP || 60);
const MAX_BODY = 4 * 1024 * 1024;

const file = n => path.join(DATA, n);
const log = (...a) => console.log(new Date().toISOString(), ...a);

/* ───── хранилище: файлы в DATA_DIR или PostgreSQL (DATABASE_URL, например Replit) ───── */
if (process.env.REPLIT_DEPLOYMENT && !process.env.DATABASE_URL) {
  console.error('Опубликованный сайт на Replit без DATABASE_URL: данные пропадали бы при каждом перезапуске. Подключите PostgreSQL (Database) и опубликуйте заново.');
  process.exit(1);
}
const PG = process.env.DATABASE_URL ? new (require('pg').Pool)(Object.assign({ connectionString: process.env.DATABASE_URL, max: 3 }, process.env.PGSSL_NOVERIFY === '1' ? { ssl: { rejectUnauthorized: false } } : {})) : null;
const CACHE = {};
let CHAIN = Promise.resolve();
if (!PG) fs.mkdirSync(path.join(DATA, 'backups'), { recursive: true, mode: 0o700 });
async function storeInit() {
  if (!PG) return;
  await PG.query('CREATE TABLE IF NOT EXISTS garage_kv (k text PRIMARY KEY, v text NOT NULL, t timestamptz NOT NULL DEFAULT now())');
  const r = await PG.query("SELECT k, v FROM garage_kv WHERE k NOT LIKE 'backup:%'");
  for (const row of r.rows) CACHE[row.k] = JSON.parse(row.v);
}
function readJSON(name, fallback) {
  if (PG) return name in CACHE ? CACHE[name] : fallback;
  try { return JSON.parse(fs.readFileSync(file(name), 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; return fallback; }
}
function writeJSON(name, obj) {
  if (PG) {
    CACHE[name] = obj; const text = JSON.stringify(obj);
    const p = CHAIN.then(() => PG.query('INSERT INTO garage_kv (k, v, t) VALUES ($1, $2, now()) ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v, t = now()', [name, text]));
    CHAIN = p.catch(e => log('db write error', name, e.message));
    return p;
  }
  const p = file(name), tmp = p + '.tmp-' + process.pid;
  const fd = fs.openSync(tmp, 'w', 0o600);
  try { fs.writeSync(fd, JSON.stringify(obj)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(tmp, p);
  return Promise.resolve();
}
function initialState() {
  const s = F.emptyState();
  s.carDetails = JSON.parse(JSON.stringify(F.DEMO_DETAILS));
  s.places = F.normPlaces(JSON.parse(JSON.stringify(F.DEMO_PLACES)));
  return F.upgrade(s);
}
let DB = null;
function loadState() {
  DB = readJSON('state.json', null);
  if (!DB) { DB = { v: 1, state: initialState() }; writeJSON('state.json', DB); log('created new empty journal'); }
  DB.state = F.upgrade(DB.state);
}

/* ───── пользователи и PIN ───── */
function userList() {
  return DB.state.drivers.map(d => ({ id: d.id, name: d.name, mgr: false, len: 4 }))
    .concat(F.MANAGERS.map(m => ({ id: m.id, name: m.name, mgr: true, len: 6 })));
}
const findUser = id => userList().find(u => u.id === id) || null;
let PINS = {};
function hashPin(pin, salt) { return crypto.scryptSync(String(pin), salt, 32, { N: 16384, r: 8, p: 1 }).toString('hex'); }
function setPin(id, pin) {
  const u = findUser(id); if (!u) throw new Error('Пользователь не найден.');
  pin = String(pin || '');
  if (!new RegExp('^\\d{' + u.len + '}$').test(pin)) throw new Error(u.mgr ? 'PIN руководителя — 6 цифр.' : 'PIN водителя — 4 цифры.');
  if (/^(\d)\1+$/.test(pin) || '0123456789'.includes(pin) || '9876543210'.includes(pin)) throw new Error('Слишком простой PIN. Не используйте одинаковые цифры или 1234.');
  const salt = crypto.randomBytes(16).toString('hex');
  PINS[id] = { salt, hash: hashPin(pin, salt), len: u.len, at: new Date().toISOString() };
  writeJSON('users.json', PINS);
  for (const [k, s] of Object.entries(SESSIONS)) if (s.id === id) delete SESSIONS[k];
  saveSessions();
}
async function setPassword(id, password) {
  const u = findUser(id); if (!u) throw new Error('Пользователь не найден.');
  if (id === 'anton') throw new Error('Антон входит по PIN.');
  if (typeof password !== 'string' || !password.length) throw new Error('Введите пароль.');
  const salt = crypto.randomBytes(16).toString('hex');
  PINS[id] = { salt, hash: hashPin(password, salt), len: u.len, password: true, at: new Date().toISOString() };
  for (const [k, s] of Object.entries(SESSIONS)) if (s.id === id) delete SESSIONS[k];
  clearTimeout(sessTimer);
  await writeJSON('users.json', PINS);
  await writeJSON('sessions.json', SESSIONS);
}
function randomPin(len) {
  for (;;) { let p = ''; for (let i = 0; i < len; i++) p += crypto.randomInt(0, 10); if (!/^(\d)\1+$/.test(p) && !'0123456789'.includes(p) && !'9876543210'.includes(p)) return p; }
}
function ensurePins(force) {
  const issued = [];
  for (const u of userList()) if (force || !PINS[u.id]) { const pin = randomPin(u.len); setPin(u.id, pin); issued.push([u, pin]); }
  if (issued.length) {
    const lines = issued.map(([u, p]) => (u.name + ' (' + u.id + ')').padEnd(28) + p);
    if (!PG) fs.writeFileSync(file('initial-pins.txt'), 'Выданные PIN-коды (' + new Date().toISOString() + ')\n' + lines.join('\n') + '\n', { mode: 0o600 });
    console.log('\n=== Выданы PIN-коды' + (PG ? '' : ' (сохранены в ' + file('initial-pins.txt') + ')') + ' ===\n' + lines.join('\n') + '\n');
  }
}

/* ───── сессии и защита входа ───── */
let SESSIONS = {};
let sessTimer = null;
function saveSessions() { clearTimeout(sessTimer); sessTimer = setTimeout(() => writeJSON('sessions.json', SESSIONS), 300); }
const tokenHash = t => crypto.createHash('sha256').update(t).digest('hex');
function newSession(id) {
  const tok = crypto.randomBytes(32).toString('base64url');
  SESSIONS[tokenHash(tok)] = { id, exp: Date.now() + SESSION_DAYS * 864e5, at: Date.now() };
  saveSessions(); return tok;
}
function cookies(req) { const o = {}; String(req.headers.cookie || '').split(';').forEach(p => { const i = p.indexOf('='); if (i > 0) o[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); }); return o; }
function sessionOf(req, res) {
  const t = cookies(req).gsid; if (!t) return null;
  const k = tokenHash(t), s = SESSIONS[k]; if (!s) return null;
  if (s.exp < Date.now()) { delete SESSIONS[k]; saveSessions(); return null; }
  const u = findUser(s.id); if (!u) return null;
  s.exp = Date.now() + SESSION_DAYS * 864e5; saveSessions();
  res.setHeader('Set-Cookie', cookie(t, SESSION_DAYS * 86400));
  return { key: k, user: u };
}
function cookie(tok, maxAge) {
  return 'gsid=' + tok + '; Path=/; HttpOnly; SameSite=' + SAMESITE + '; Max-Age=' + maxAge + (COOKIE_SECURE || SAMESITE === 'None' ? '; Secure' : '');
}
const FAILS = new Map();
function limited(key, max) { const r = FAILS.get(key); return r && r.until > Date.now() && r.n >= max; }
function fail(key, max) {
  const now = Date.now(); let r = FAILS.get(key);
  if (!r || r.until < now) r = { n: 0, until: now + 15 * 60e3 };
  r.n++; FAILS.set(key, r); return r.n >= max;
}
setInterval(() => { const now = Date.now(); for (const [k, r] of FAILS) if (r.until < now) FAILS.delete(k); for (const [k, s] of Object.entries(SESSIONS)) if (s.exp < now) delete SESSIONS[k]; }, 10 * 60e3).unref();
function ipOf(req) { if (TRUST_PROXY && req.headers['x-forwarded-for']) return String(req.headers['x-forwarded-for']).split(',')[0].trim(); return req.socket.remoteAddress || '?'; }

/* ───── операции (проверяет ядро) ───── */
const OPS = {
  transact: { mgr: false, run: (s, u, [cmd]) => { cmd = Object.assign({}, cmd || {}); delete cmd.id; cmd.actorId = u.id; return F.transact(s, cmd, new Date().toISOString()); } },
  addServiceRecord: { mgr: true, run: (s, u, [rec]) => { rec = Object.assign({}, rec || {}); delete rec.id; rec.actorId = u.id; return F.addServiceRecord(s, rec, Date.now()); } },
  deleteServiceRecord: { mgr: true, run: (s, u, [id]) => F.deleteServiceRecord(s, String(id)) },
  setIntervals: { mgr: true, run: (s, u, [m]) => F.setIntervals(s, m || {}) },
  setSettings: { mgr: true, run: (s, u, [v]) => F.setSettings(s, v || {}) },
  setCarDetails: { mgr: true, run: (s, u, [id, v]) => F.setCarDetails(s, String(id), v || {}) },
  setPlace: { mgr: true, run: (s, u, [id, v]) => F.setPlace(s, String(id), v == null ? null : v) },
  renameDriver: { mgr: true, run: (s, u, [id, name]) => F.renameDriver(s, String(id), name) },
  restore: { mgr: true, run: (s, u, [st]) => { const n = F.upgrade(st); if (!n || !Array.isArray(n.events)) throw new Error('Некорректная копия.'); n.isDemo = false; return n; } }
};
function applyOp(user, op, args) {
  const def = OPS[op]; if (!def) { const e = new Error('Неизвестное действие.'); e.code = 400; throw e; }
  if (def.mgr && !user.mgr) { const e = new Error('Это действие доступно только руководству.'); e.code = 403; throw e; }
  const next = def.run(DB.state, user, Array.isArray(args) ? args : []);
  if (op === 'restore') backup('before-restore', DB).catch(e => log('backup error', e.message));
  DB = { v: DB.v + 1, state: next };
  const saved = writeJSON('state.json', DB);
  const audit = JSON.stringify({ t: new Date().toISOString(), user: user.id, op, kind: op === 'transact' && args && args[0] ? args[0].kind : undefined, car: op === 'transact' && args && args[0] ? args[0].carId : undefined });
  if (PG) console.log('audit', audit); else fs.appendFile(file('audit.log'), audit + '\n', () => {});
  return { db: DB, saved };
}

/* ───── резервные копии ───── */
async function backup(tag, snap) {
  if (PG) {
    const key = 'backup:state-' + new Date().toISOString().slice(0, 10) + (tag ? '-' + tag + '-' + Date.now() : ''), text = JSON.stringify(snap || DB);
    await CHAIN;
    await PG.query('INSERT INTO garage_kv (k, v) VALUES ($1, $2) ON CONFLICT (k) DO NOTHING', [key, text]);
    const r = await PG.query("SELECT k FROM garage_kv WHERE k LIKE 'backup:%' ORDER BY k");
    const extra = r.rows.length - BACKUP_KEEP;
    for (let i = 0; i < extra; i++) await PG.query('DELETE FROM garage_kv WHERE k = $1', [r.rows[i].k]);
    return;
  }
  const d = new Date(), stamp = d.toISOString().slice(0, 10) + (tag ? '-' + tag + '-' + d.toISOString().slice(11, 19).replace(/:/g, '') : '');
  const p = path.join(DATA, 'backups', 'state-' + stamp + '.json');
  if (!tag && fs.existsSync(p)) return;
  fs.copyFileSync(file('state.json'), p);
  const all = fs.readdirSync(path.join(DATA, 'backups')).filter(f => /^state-.*\.json$/.test(f)).sort();
  while (all.length > BACKUP_KEEP) fs.unlinkSync(path.join(DATA, 'backups', all.shift()));
}

/* ───── страница и статика ───── */
const PUB = path.join(ROOT, 'public');
const ALLOW_FRAME = process.env.ALLOW_FRAME === '1';          /* только для превью в редакторе Replit */
const SAMESITE = /^(Strict|Lax|None)$/.test(process.env.COOKIE_SAMESITE || '') ? process.env.COOKIE_SAMESITE : 'Strict';
const CSP = ["default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com", "font-src https://fonts.gstatic.com",
  "img-src 'self' data: blob:", "connect-src 'self'", "manifest-src 'self'", ALLOW_FRAME ? '' : "frame-ancestors 'none'", "base-uri 'none'", "form-action 'self'", "object-src 'none'"].filter(Boolean).join('; ');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
function staticFile(p) {
  if (p === '/' || p === '/index.html') return path.join(PUB, 'index.html');
  if (p === '/core.js') return path.join(ROOT, 'core.js');
  if (!/^\/[a-z0-9][a-z0-9._-]*$/i.test(p)) return null;
  const f = path.join(PUB, p.slice(1));
  return TYPES[path.extname(f)] && fs.existsSync(f) ? f : null;
}
function serveStatic(req, res, f) {
  const st = fs.statSync(f), etag = '"' + st.size.toString(36) + '-' + Math.floor(st.mtimeMs).toString(36) + '"';
  const h = { 'Content-Type': TYPES[path.extname(f)], 'Cache-Control': 'no-cache', ETag: etag };
  if (f.endsWith('.html')) h['Content-Security-Policy'] = CSP;
  if (req.headers['if-none-match'] === etag) return send(res, 304, '', h);
  return send(res, 200, fs.readFileSync(f), h);
}

/* ───── HTTP ───── */
function send(res, code, body, headers) {
  const h = Object.assign({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Cross-Origin-Opener-Policy': 'same-origin',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=(self)' }, ALLOW_FRAME ? {} : { 'X-Frame-Options': 'DENY' }, headers || {});
  if (typeof body === 'object' && !Buffer.isBuffer(body)) { body = JSON.stringify(body); h['Content-Type'] = 'application/json; charset=utf-8'; h['Cache-Control'] = 'no-store'; }
  res.writeHead(code, h); res.end(body);
}
function readBody(req) {
  return new Promise((ok, bad) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > MAX_BODY) { bad(Object.assign(new Error('Слишком большой запрос (фото?).'), { code: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { ok(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch (e) { bad(Object.assign(new Error('Некорректный запрос.'), { code: 400 })); } });
    req.on('error', bad);
  });
}
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x'), p = url.pathname;
  try {
    if (req.method === 'GET' || req.method === 'HEAD') { const f = staticFile(p); if (f) return serveStatic(req, res, f); }
    if (p === '/healthz') return send(res, 200, { ok: true, v: DB.v });
    if (!p.startsWith('/api/')) return send(res, 404, { error: 'Не найдено' });
    if (req.headers['x-garage'] !== '1') return send(res, 403, { error: 'Запрос отклонён.' });
    const ip = ipOf(req);

    if (req.method === 'GET' && p === '/api/users') return send(res, 200, { users: userList() });
    if (req.method === 'POST' && p === '/api/login') {
      const b = await readBody(req), u = findUser(String(b.id || ''));
      const invalid = u && u.id === 'anton' ? 'Неверный PIN.' : 'Неверный пароль.';
      if (limited('ip:' + ip, 30)) return send(res, 429, { error: 'Слишком много попыток. Подождите 15 минут.' });
      if (!u || !PINS[u.id]) { fail('ip:' + ip, 30); return send(res, 401, { error: invalid }); }
      if (limited('u:' + u.id, 5)) return send(res, 429, { error: 'Слишком много попыток. Подождите 15 минут.' });
      const rec = PINS[u.id], secret = u.id === 'anton' ? String(b.pin || '') : typeof b.password === 'string' ? b.password : !rec.password ? String(b.pin || '') : '';
      const got = Buffer.from(hashPin(secret, rec.salt), 'hex'), want = Buffer.from(rec.hash, 'hex');
      if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) {
        fail('ip:' + ip, 30); const locked = fail('u:' + u.id, 5);
        log('login fail', u.id, ip);
        return send(res, locked ? 429 : 401, { error: locked ? 'Слишком много попыток. Подождите 15 минут.' : invalid });
      }
      FAILS.delete('u:' + u.id);
      log('login ok', u.id, ip);
      return send(res, 200, { user: u }, { 'Set-Cookie': cookie(newSession(u.id), SESSION_DAYS * 86400) });
    }
    const ses = sessionOf(req, res);
    if (!ses && req.method === 'GET' && p === '/api/me') return send(res, 200, { user: null });
    if (!ses) return send(res, 401, { error: 'Войдите заново.' }, { 'Set-Cookie': cookie('', 0) });
    const me = ses.user;
    if (req.method === 'POST' && p === '/api/logout') { delete SESSIONS[ses.key]; saveSessions(); return send(res, 200, { ok: true }, { 'Set-Cookie': cookie('', 0) }); }
    if (req.method === 'GET' && p === '/api/me') return send(res, 200, { user: me });
    if (req.method === 'GET' && p === '/api/state') {
      if (url.searchParams.get('v') === String(DB.v)) return send(res, 200, { v: DB.v, same: true });
      return send(res, 200, { v: DB.v, state: DB.state });
    }
    if (req.method === 'POST' && p === '/api/op') {
      const b = await readBody(req);
      let r;
      try { r = applyOp(me, String(b.op || ''), b.args); }
      catch (e) { return send(res, e.code || 422, { error: e.message || 'Не удалось сохранить.' }); }
      try { await r.saved; } catch (e) { log('save failed', e.message); return send(res, 503, { error: 'Не удалось сохранить на сервере. Попробуйте ещё раз.' }); }
      try { return send(res, 200, { v: r.db.v, state: r.db.state }); }
      catch (e) { return send(res, e.code || 422, { error: e.message || 'Не удалось сохранить.' }); }
    }
    if (req.method === 'POST' && p === '/api/pin') {
      const b = await readBody(req), id = String(b.id || '');
      if (!me.mgr) return send(res, 403, { error: 'PIN меняет руководство.' });
      try { setPin(id, b.pin); log('pin set', id, 'by', me.id); return send(res, 200, { ok: true }); }
      catch (e) { return send(res, 422, { error: e.message }); }
    }
    if (req.method === 'POST' && p === '/api/password') {
      const b = await readBody(req), id = String(b.id || '');
      if (!me.mgr) return send(res, 403, { error: 'Пароль меняет руководство.' });
      try {
        await setPassword(id, b.password);
        log('password set', id, 'by', me.id);
        return send(res, 200, { ok: true }, id === me.id ? { 'Set-Cookie': cookie('', 0) } : {});
      } catch (e) { return send(res, 422, { error: e.message }); }
    }
    if (req.method === 'GET' && p === '/api/backup') {
      if (!me.mgr) return send(res, 403, { error: 'Только для руководства.' });
      return send(res, 200, JSON.stringify(DB.state, null, 2), { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': 'attachment; filename="garage-' + new Date().toISOString().slice(0, 10) + '.json"', 'Cache-Control': 'no-store' });
    }
    return send(res, 404, { error: 'Не найдено' });
  } catch (e) {
    log('error', p, e && e.stack || e);
    if (!res.headersSent) send(res, e.code || 500, { error: e.code ? e.message : 'Ошибка сервера.' });
  }
});

/* ───── запуск ───── */
async function main() {
  await storeInit();
  loadState();
  PINS = readJSON('users.json', {});
  SESSIONS = readJSON('sessions.json', {});
  const cmd = process.argv[2];
  if (cmd === 'users') { for (const u of userList()) console.log(u.id.padEnd(8), (u.mgr ? 'руководство' : 'водитель').padEnd(12), u.name, PINS[u.id] ? '' : '(PIN не задан)'); return done(0); }
  if (cmd === 'set-pin') { try { setPin(process.argv[3], process.argv[4]); await writeJSON('sessions.json', SESSIONS); console.log('PIN сохранён для', process.argv[3]); return done(0); } catch (e) { console.error(e.message); return done(1); } }
  if (cmd === 'reset-pins') { ensurePins(true); await writeJSON('sessions.json', SESSIONS); return done(0); }
  ensurePins(false);
  if (process.env.ADMIN_PIN) {
    const a = PINS.anton;
    if (!a || hashPin(process.env.ADMIN_PIN, a.salt) !== a.hash) { try { setPin('anton', process.env.ADMIN_PIN); log('ADMIN_PIN применён для anton'); } catch (e) { log('ADMIN_PIN не принят:', e.message); } }
  }
  await backup().catch(e => log('backup error', e.message));
  setInterval(() => { backup().catch(e => log('backup error', e.message)); }, 60 * 60e3).unref();
  server.headersTimeout = 20e3; server.requestTimeout = 30e3;
  server.listen(PORT, HOST, () => log('Гараж запущен на ' + HOST + ':' + PORT + ', хранилище: ' + (PG ? 'PostgreSQL' : DATA)));
}
async function done(code) { try { await CHAIN; if (PG) await PG.end(); } catch (e) {} process.exit(code); }
const stop = async () => { try { await writeJSON('sessions.json', SESSIONS); await CHAIN; } catch (e) {} process.exit(0); };
process.on('SIGTERM', stop); process.on('SIGINT', stop);
main().catch(e => { console.error('Не удалось запустить:', e.message); process.exit(1); });
