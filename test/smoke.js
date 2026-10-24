'use strict';
/*
 * npm test — быстрая проверка перед каждой публикацией (≈5 с).
 * Поднимает сервер на временной папке (НЕ трогает настоящую базу) и прогоняет главный сценарий.
 */
const { spawn, spawnSync } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
let fails = 0;
const ok = (cond, msg) => { if (cond) console.log('  ✓ ' + msg); else { fails++; console.log('  ✗ ' + msg); } };

(async () => {
  console.log('1. Синтаксис');
  for (const f of ['server.js', 'core.js', 'public/ui.js', 'public/i18n.js', 'public/map.js', 'public/photos.js', 'public/env.js']) {
    const r = spawnSync(process.execPath, ['--check', path.join(ROOT, f)], { encoding: 'utf8' });
    ok(r.status === 0, f + (r.status ? ' — ' + r.stderr.split('\n').slice(0, 4).join(' ') : ''));
  }

  console.log('2. Турецкий перевод (каждый T(\'…\') есть в словаре)');
  const i18n = fs.readFileSync(path.join(ROOT, 'public/i18n.js'), 'utf8');
  const TRD = JSON.parse(i18n.match(/var TRD=(\{[\s\S]*?\n\});/)[1]);
  const keys = new Set();
  for (const f of ['public/ui.js', 'core.js']) for (const m of fs.readFileSync(path.join(ROOT, f), 'utf8').matchAll(/(?:T|tpl)\('((?:[^'\\\n]|\\.)*)'/g)) keys.add(m[1]);
  const missing = [...keys].filter(k => !(k in TRD));
  ok(!missing.length, missing.length ? 'нет перевода: ' + missing.slice(0, 8).map(k => JSON.stringify(k)).join(', ') : keys.size + ' строк переведено');

  console.log('3. Ядро');
  const ctx = { console, Intl, Date, JSON, Math, Number, String, Set, Map, Object, Array, Error, T: s => s, tpl: (s, v) => s.replace(/\{(\w+)\}/g, (_, k) => v[k]) };
  ctx.globalThis = ctx; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'core.js'), 'utf8'), ctx);
  const F = ctx.FleetCore;
  try { const s = F.demoState(); ok(F.project(s).cars.length === 4, 'демо-журнал собирается, 4 машины'); } catch (e) { ok(false, 'ядро: ' + e.message); }

  console.log('4. Сервер (временная папка, без DATABASE_URL)');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'garage-test-'));
  const port = 18000 + Math.floor(Math.random() * 1000);
  const env = Object.assign({}, process.env, { DATA_DIR: dir, PORT: String(port), HOST: '127.0.0.1', COOKIE_SECURE: '0', TRUST_PROXY: '0', ADMIN_PIN: '582614', DATABASE_URL: '', REPLIT_DEPLOYMENT: '' });
  const srv = spawn(process.execPath, [path.join(ROOT, 'server.js')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; srv.stdout.on('data', d => out += d); srv.stderr.on('data', d => out += d);
  const B = 'http://127.0.0.1:' + port;
  for (let i = 0; i < 50 && !/запущен/.test(out); i++) await new Promise(r => setTimeout(r, 100));
  ok(/запущен/.test(out), 'сервер стартовал');
  const jar = {};
  const call = async (who, p, body, hdr) => {
    const h = Object.assign({ 'X-Garage': '1' }, body ? { 'Content-Type': 'application/json' } : {}, jar[who] ? { Cookie: jar[who] } : {}, hdr || {});
    const r = await fetch(B + p, { method: body ? 'POST' : 'GET', headers: h, body: body ? JSON.stringify(body) : undefined });
    const sc = r.headers.get('set-cookie'); if (sc && /gsid=[^;]+/.test(sc)) jar[who] = sc.match(/gsid=[^;]*/)[0];
    let j = null; try { j = await r.json(); } catch (e) {}
    return { status: r.status, j };
  };
  try {
    const page = await fetch(B + '/'); const html = await page.text();
    ok(page.status === 200 && /src="\/ui\.js"/.test(html), 'главная страница');
    for (const s of ['/env.js', '/i18n.js', '/core.js', '/map.js', '/photos.js', '/ui.js', '/app.css', '/manifest.webmanifest']) { const r = await fetch(B + s); ok(r.status === 200, 'файл ' + s); }
    ok((await fetch(B + '/../server.js')).status === 404 && (await fetch(B + '/%2e%2e/server.js')).status === 404, 'нельзя скачать server.js');
    ok((await call('x', '/api/users', null, { 'X-Garage': '' })).status === 403, 'без заголовка X-Garage — отказ');
    ok((await call('a', '/api/login', { id: 'anton', pin: '582614' })).status === 200, 'вход Антон (ADMIN_PIN)');
    ok((await call('a', '/api/pin', { id: 'd1', pin: '4826' })).status === 200, 'Антон задаёт PIN водителю');
    ok((await call('d', '/api/login', { id: 'd1', pin: '4826' })).status === 200, 'вход водителя');
    ok((await call('d', '/api/op', { op: 'setCarDetails', args: ['bmw', { model: 'X' }] })).status === 403, 'водитель не меняет данные машины');
    let r = await call('a', '/api/op', { op: 'transact', args: [{ kind: 'init', carId: 'bmw', odo: 1000, location: 'vadi', keyKind: 'security' }] });
    ok(r.status === 200, 'руководство вносит машину');
    r = await call('d', '/api/op', { op: 'transact', args: [{ kind: 'checkout', carId: 'bmw', odo: 1000, actorId: 'd3' }] });
    ok(r.status === 200 && r.j.state.events.slice(-1)[0].actorId === 'd1', 'водитель взял машину, подменить автора нельзя');
    r = await call('d', '/api/op', { op: 'transact', args: [{ kind: 'park', carId: 'bmw', odo: 1042, location: 'teras', keyKind: 'security' }] });
    ok(r.status === 200, 'водитель поставил машину');
    r = await call('a', '/api/op', { op: 'transact', args: [{ kind: 'odo_fix', carId: 'bmw', odo: 1040, note: 'тест' }] });
    ok(r.status === 200 && F.project(r.j.state).cars.find(c => c.id === 'bmw').odo === 1040, 'руководство исправило пробег вручную');
    ok((await call('d', '/api/op', { op: 'transact', args: [{ kind: 'odo_fix', carId: 'bmw', odo: 5, note: 'x' }] })).status === 422, 'водитель не может исправить пробег');
    ok((await call('d', '/api/state?v=' + r.j.v)).j.same === true, 'опрос без изменений — пустой ответ');
  } catch (e) { ok(false, 'сценарий: ' + e.message); }
  srv.kill('SIGTERM'); await new Promise(r => setTimeout(r, 300));
  const st = JSON.parse(fs.readFileSync(path.join(dir, 'state.json'), 'utf8'));
  ok(st.v >= 5, 'журнал сохранён на диск (v=' + st.v + ')');
  fs.rmSync(dir, { recursive: true, force: true });

  console.log(fails ? '\n✗ ОШИБОК: ' + fails + ' — не публиковать' : '\n✓ Всё в порядке, можно публиковать');
  process.exit(fails ? 1 : 0);
})();
