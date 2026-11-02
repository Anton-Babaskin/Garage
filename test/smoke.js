'use strict';
/*
 * npm test — быстрая проверка перед каждой публикацией (≈5 с).
 * Поднимает сервер на временной папке (НЕ трогает настоящую базу) и прогоняет главный сценарий.
 */
const { spawn, spawnSync } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os'), vm = require('vm');
const crypto = require('crypto');
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
  for (const f of ['public/ui.js', 'core.js', 'server.js']) for (const m of fs.readFileSync(path.join(ROOT, f), 'utf8').matchAll(/(?:T|tpl)\('((?:[^'\\\n]|\\.)*)'/g)) keys.add(m[1]);
  const missing = [...keys].filter(k => !(k in TRD));
  ok(!missing.length, missing.length ? 'нет перевода: ' + missing.slice(0, 8).map(k => JSON.stringify(k)).join(', ') : keys.size + ' строк переведено');

  console.log('3. Ядро');
  const ctx = { console, Intl, Date, JSON, Math, Number, String, Set, Map, Object, Array, Error, T: s => s, tpl: (s, v) => s.replace(/\{(\w+)\}/g, (_, k) => v[k]) };
  ctx.globalThis = ctx; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'core.js'), 'utf8'), ctx);
  const F = ctx.FleetCore;
  try { const s = F.demoState(); ok(F.project(s).cars.length === 4, 'демо-журнал собирается, 4 машины'); } catch (e) { ok(false, 'ядро: ' + e.message); }
  try { require('./first-trip.js')(ok, F); } catch (e) { ok(false, 'первый выезд: ' + e.message); }
  try { require('./parking.js').core(ok, F); } catch (e) { ok(false, 'паркинг и сброс: ' + e.message); }
  try { await require('./parking.js').storage(ok, F); } catch (e) { ok(false, 'резервная копия до сброса: ' + e.message); }

  console.log('4. Сервер (временная папка, без DATABASE_URL)');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'garage-test-'));
  const port = 18000 + Math.floor(Math.random() * 1000);
  const siteKey = crypto.randomBytes(6).toString('hex');
  const env = Object.assign({}, process.env, { DATA_DIR: dir, PORT: String(port), HOST: '127.0.0.1', COOKIE_SECURE: '0', COOKIE_SAMESITE: 'Strict', TRUST_PROXY: '0', ADMIN_PIN: '582614', SITE_KEY: siteKey, DATABASE_URL: '', REPLIT_DEPLOYMENT: '' });
  let out = '', srv;
  const start = async () => {
    let started = false;
    srv = spawn(process.execPath, [path.join(ROOT, 'server.js')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    srv.stdout.on('data', d => { out += d; if (/запущен/.test(d)) started = true; });
    srv.stderr.on('data', d => out += d);
    for (let i = 0; i < 50 && !started; i++) await new Promise(r => setTimeout(r, 100));
    ok(started, 'сервер стартовал');
  };
  const stop = () => new Promise(resolve => { srv.once('exit', resolve); srv.kill('SIGTERM'); });
  const B = 'http://127.0.0.1:' + port;
  await start();
  let accessCookie = '';
  const jar = {};
  const pageFetch = p => fetch(B + p, { headers: { Cookie: accessCookie } });
  const call = async (who, p, body, hdr) => {
    const h = Object.assign({ 'X-Garage': '1', Cookie: [accessCookie, jar[who]].filter(Boolean).join('; ') }, body ? { 'Content-Type': 'application/json' } : {}, hdr || {});
    const r = await fetch(B + p, { method: body ? 'POST' : 'GET', headers: h, body: body ? JSON.stringify(body) : undefined });
    const sc = r.headers.get('set-cookie'); if (sc && /gsid=[^;]+/.test(sc)) jar[who] = sc.match(/gsid=[^;]*/)[0];
    let j = null; try { j = await r.json(); } catch (e) {}
    return { status: r.status, j, cookie: sc || '', robots: r.headers.get('x-robots-tag') };
  };
  try {
    console.log('4а. Закрытый доступ, вход без списка людей и запрет индексации');
    const noindex = r => r.headers.get('x-robots-tag') === 'noindex, nofollow';
    for (const p of ['/', '/index.html', '/ui.js', '/app.css', '/i18n.js', '/core.js', '/env.js', '/photos.js', '/map.js', '/favicon.png', '/apple-touch-icon.png', '/icon-192.png', '/icon-512.png', '/manifest.webmanifest', '/api/users', '/api/me', '/api/state', '/api/backup', '/api/site-link', '/api/missing', '/missing', '/?k=wrong']) {
      const r = await fetch(B + p);
      ok(r.status === 404 && r.headers.get('content-type') === 'text/plain; charset=utf-8' && await r.text() === 'Not Found' && noindex(r), 'без доступа — одинаковый текстовый 404: ' + p);
    }
    for (const cookie of ['gk=wrong', 'gk=%', 'gsid=expired', 'gsid=%']) {
      const r = await fetch(B + '/', { headers: { Cookie: cookie } });
      ok(r.status === 404 && await r.text() === 'Not Found', 'неверная или повреждённая cookie не даёт доступа');
    }
    const blockedPost = await fetch(B + '/api/login', { method: 'POST', body: '{broken' });
    ok(blockedPost.status === 404 && await blockedPost.text() === 'Not Found', 'без доступа POST API тоже скрыт, тело запроса не обрабатывается');
    const hiddenHead = await fetch(B + '/ui.js', { method: 'HEAD' });
    ok(hiddenHead.status === 404 && noindex(hiddenHead) && await hiddenHead.text() === '', 'HEAD не раскрывает статику');
    const health = await fetch(B + '/healthz');
    ok(health.status === 200 && (await health.json()).ok === true && noindex(health), '/healthz доступен без ключа как прежде');
    const robots = await fetch(B + '/robots.txt');
    ok(robots.status === 200 && await robots.text() === 'User-agent: *\nDisallow: /' && noindex(robots), '/robots.txt закрывает весь сайт от индексации');
    const entry = await fetch(B + '/?k=' + siteKey, { redirect: 'manual' });
    const gk = entry.headers.get('set-cookie') || '';
    accessCookie = (gk.match(/gk=[^;]+/) || [''])[0];
    const tag = crypto.createHmac('sha256', siteKey).update('gk').digest('hex');
    ok(entry.status === 302 && entry.headers.get('location') === '/' && noindex(entry) && entry.headers.get('cache-control') === 'no-store', 'верный ключ даёт 302 без ключа в адресе');
    ok(accessCookie === 'gk=' + tag && !gk.includes(siteKey) && ['HttpOnly', 'Secure', 'SameSite=Lax', 'Max-Age=31536000', 'Path=/'].every(s => gk.includes(s)), 'gk — HMAC-SHA256, защищённая cookie на 365 дней, не сам ключ');
    const redirect = await fetch(B + '/ui.js?a=1&k=' + siteKey + '&b=2', { redirect: 'manual' });
    ok(redirect.headers.get('location') === '/ui.js?a=1&b=2', 'redirect сохраняет путь и остальные параметры');
    const page = await pageFetch('/'); const html = await page.text();
    ok(page.status === 200 && /src="\/ui\.js"/.test(html) && page.headers.get('cache-control') === 'no-store', 'главная страница доступна с gk, без кэширования');
    ok(html.includes('<title>Вход</title>') && html.includes('<meta name="robots" content="noindex,nofollow">') && noindex(page), 'безликий заголовок и meta robots на странице');
    ok(html.includes('<link rel="manifest" href="/manifest.webmanifest" crossorigin="use-credentials">'), 'браузер загружает закрытый manifest вместе с cookie доступа');
    for (const s of ['/env.js', '/i18n.js', '/core.js', '/map.js', '/photos.js', '/ui.js', '/app.css', '/manifest.webmanifest']) { const r = await pageFetch(s); ok(r.status === 200 && noindex(r), 'разрешённый файл ' + s); }
    const manifest = await pageFetch('/manifest.webmanifest');
    const home = await manifest.json();
    ok(home.start_url === '/?k=' + siteKey && home.display === 'standalone' && home.icons.length === 2 && manifest.headers.get('cache-control') === 'no-store', 'закрытый динамический manifest: ссылка для отдельного cookie-хранилища iPhone');
    ok((await pageFetch('/../server.js')).status === 404 && (await pageFetch('/%2e%2e/server.js')).status === 404, 'нельзя скачать server.js');
    ok((await call('x', '/api/users')).status === 401 && (await call('x', '/api/me')).j.user === null, 'gk не раскрывает список людей, /api/me до входа без имени');
    ok((await call('x', '/api/users', null, { 'X-Garage': '' })).status === 403, 'без заголовка X-Garage — отказ');
    const unknown = await call('x', '/api/login', { username: 'nobody', password: 'wrong' });
    const wrong = await call('x', '/api/login', { username: 'ANTON', password: 'wrong' });
    ok(unknown.status === 401 && wrong.status === 401 && JSON.stringify(unknown.j) === JSON.stringify(wrong.j) && wrong.j.error === 'Неверный логин или пароль' && wrong.robots === 'noindex, nofollow', 'неверный пароль и неизвестный логин дают одинаковую ошибку');
    ok((await call('a', '/api/login', { id: 'anton', pin: '582614' })).status === 200, 'вход Антон (ADMIN_PIN)');
    ok((await call('a', '/api/users')).j.users.length === 7, 'список людей только после входа');
    const sessionPage = await fetch(B + '/', { headers: { Cookie: jar.a } });
    ok(sessionPage.status === 200 && (sessionPage.headers.get('set-cookie') || '').includes('Max-Age=31536000'), 'действующая gsid без gk и ключа открывает сайт и продлевается');
    ok((await call('a', '/api/site-link')).j.path === '/?k=' + siteKey, 'руководство получает готовую ссылку без записи ключа в файлы');
    ok((await call('a', '/api/pin', { id: 'd1', pin: '4826' })).status === 200, 'Антон задаёт PIN водителю');
    ok((await call('d', '/api/login', { id: 'd1', pin: '4826' })).status === 200, 'вход водителя');
    ok((await call('d', '/api/site-link')).status === 403, 'водителю API копирования ссылки руководства недоступен');
    ok((await call('d', '/api/op', { op: 'setCarDetails', args: ['bmw', { model: 'X' }] })).status === 403, 'водитель не меняет данные машины');
    const firstOp = cmd => call('d', '/api/op', { op: 'transact', args: [Object.assign({ carId: 'fiat' }, cmd)] });
    ok((await firstOp({ kind: 'init', odo: 0, location: 'vadi', keyKind: 'security' })).status === 422, 'права на ручное внесение начальных данных остаются у руководства');
    let first = await firstOp({ kind: 'checkout', odo: 0 });
    ok(first.status === 200 && F.project(first.j.state).cars.find(c => c.id === 'fiat').trip.startOdo === 0, 'API: водитель взял новую машину без участия руководства');
    ok((await firstOp({ kind: 'checkout', carId: 'audi', odo: 0 })).status === 422, 'API: занятому водителю нельзя взять вторую новую машину');
    for (const args of [
      { kind: 'park', location: 'vadi', keyKind: 'security' },
      { kind: 'park', odo: 1200, keyKind: 'security' },
      { kind: 'park', odo: 1200, location: 'vadi' }
    ]) ok((await firstOp(args)).status === 422, 'API: при первой парковке обязательны пробег, место и ключи');
    first = await firstOp({ kind: 'park', odo: 1200, location: 'vadi', keyKind: 'security' });
    ok(first.status === 200 && F.project(first.j.state).cars.find(c => c.id === 'fiat').odo === 1200, 'API: первая парковка сохранила фактическое показание');
    first = await firstOp({ kind: 'checkout', odo: 1200 });
    ok(first.status === 200 && F.project(first.j.state).cars.find(c => c.id === 'fiat').trip.startOdo === 1200, 'API: следующая поездка использует последнее показание');
    ok((await firstOp({ kind: 'park', odo: 1199, location: 'teras', keyKind: 'office' })).status === 422, 'API: уменьшение пробега по-прежнему запрещено');
    ok((await firstOp({ kind: 'park', odo: 1225, location: 'teras', keyKind: 'office' })).status === 200, 'API: следующая поездка завершается штатно');
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
    const defaultOdo = F.project(r.j.state).cars.find(c => c.id === 'bmw').odo;
    const autoCheckout = await call('d', '/api/op', { op: 'transact', args: [{ kind: 'checkout', carId: 'bmw', odo: String(defaultOdo) }] });
    const autoPark = await call('d', '/api/op', { op: 'transact', args: [{ kind: 'park', carId: 'bmw', odo: String(defaultOdo), location: 'vadi', keyKind: 'security' }] });
    ok(autoCheckout.status === 200 && autoPark.status === 200 && F.project(autoPark.j.state).cars.find(c => c.id === 'bmw').odo === defaultOdo, 'API: checkout и park с подставленным пробегом проходят без изменения числа');
    r = autoPark;
    console.log('5. Пароли и совместимость PIN (только временные тестовые данные)');
    const year = 365 * 86400;
    const renewed = await call('d', '/api/me');
    ok(renewed.cookie.includes('Max-Age=' + year) && renewed.cookie.includes('HttpOnly') && renewed.cookie.includes('SameSite=Strict'), 'сессия и cookie на 365 дней, защита cookie сохранена');
    ok((await call('d', '/api/state?v=' + r.j.v)).cookie.includes('Max-Age=' + year), 'cookie обновляется и при опросе без изменений');
    const recordsBefore = JSON.parse(fs.readFileSync(path.join(dir, 'users.json'), 'utf8'));
    const antonBefore = JSON.stringify(recordsBefore.anton);
    const passwords = [
      String(crypto.randomInt(0, 10)),
      ' '.repeat(1),
      String.fromCodePoint(0x15f, 0x438, 0x4e2d, 0x1f511),
      String.fromCharCode(97 + crypto.randomInt(0, 26)).repeat(4),
      ' ' + crypto.randomBytes(140).toString('hex') + ' ',
      crypto.randomBytes(24).toString('base64url')
    ];
    const ids = ['d1', 'd2', 'd3', 'd4', 'manager', 'darya'];
    ok((await call('d', '/api/password', { id: 'd2', password: passwords[0] })).status === 403, 'водитель не задаёт пароли');
    ok((await call('a', '/api/password', { id: 'd2', password: '' })).status === 422, 'пустой пароль отклоняется');
    ok((await call('a', '/api/password', { id: 'd2', password: 0 })).status === 422, 'пароль должен быть текстом');
    ok((await call('a', '/api/password', { id: 'anton', password: passwords[0] })).status === 422, 'пароль Антону не назначается');
    ok((await call('a', '/api/password', { id: 'missing', password: passwords[0] })).status === 422, 'несуществующему человеку пароль не назначается');
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i], oldPin = id === 'd1' ? '4826' : out.match(new RegExp('\\(' + id + '\\)\\s+(\\d+)'))[1];
      ok((await call('old-' + id, '/api/login', { id, password: oldPin })).status === 200, id + ': старый PIN подходит в поле пароля до назначения');
      ok((await call('second-' + id, '/api/login', { id, pin: oldPin })).status === 200, id + ': старый клиент входит по PIN до назначения');
      ok((await call('a', '/api/password', { id, password: passwords[i] })).status === 200, id + ': любой непустой пароль сохраняется');
      const oldOne = await call('old-' + id, '/api/me'), oldTwo = await call('second-' + id, '/api/state');
      ok(!oldOne.j.user && oldTwo.status === 401, id + ': новый пароль завершает все прежние сессии');
      ok((await call('old-' + id, '/api/login', { id, password: oldPin })).status === 401, id + ': прежний PIN больше не подходит');
      ok((await call('new-' + id, '/api/login', { id, password: passwords[i] })).status === 200, id + ': вход по новому паролю');
      ok((await call('old-' + id, '/api/login', { id, pin: oldPin })).status === 401, id + ': прежний PIN не подходит через старый API');
      if (id === 'd1') ok((await call('d', '/api/me')).j.user === null, 'исходная сессия водителя тоже завершена');
      if (id === 'd1') ok((await fetch(B + '/', { headers: { Cookie: jar.d } })).status === 404, 'отозванная gsid без gk не открывает даже главную страницу');
    }
    for (const [i, username] of ['ERKIN', 'OzGuR', 'murat', 'DRIVER4', 'manager', 'DARYA'].entries()) {
      const r = await call('alias-' + i, '/api/login', { username, password: passwords[i] });
      ok(r.status === 200 && r.j.user.id === ids[i], 'вход латинским логином без учёта регистра: ' + username);
    }
    ok((await call('alias-anton', '/api/login', { username: 'AnToN', password: '582614' })).j.user.id === 'anton', 'Антон вводит ADMIN_PIN в общее поле пароля');
    const stored = JSON.parse(fs.readFileSync(path.join(dir, 'users.json'), 'utf8'));
    ok(ids.every((id, i) => stored[id].password === true && stored[id].hash === crypto.scryptSync(passwords[i], stored[id].salt, 32, { N: 16384, r: 8, p: 1 }).toString('hex') && Object.keys(stored[id]).sort().join(',') === 'at,hash,len,password,salt'), 'хранятся только scrypt-хэши, соль и служебные поля');
    ok(JSON.stringify(stored.anton) === antonBefore && (await call('anton-again', '/api/login', { id: 'anton', pin: '582614' })).status === 200, 'PIN Антона и ADMIN_PIN не изменены');
    ok((await call('new-manager', '/api/password', { id: 'd2', password: passwords[5] })).status === 200, 'Руководитель задаёт пароль');
    ok((await call('new-darya', '/api/password', { id: 'd3', password: passwords[5] })).status === 200, 'Дарья задаёт пароль');
    ok(!out.includes(passwords[4]) && !out.includes(passwords[5]), 'пароли не попадают в логи');
    const selfReset = await call('new-manager', '/api/password', { id: 'manager', password: passwords[5] });
    ok(selfReset.status === 200 && selfReset.cookie.includes('Max-Age=0') && !(await call('new-manager', '/api/me')).j.user, 'смена своего пароля завершает текущий вход и очищает cookie');
    ok((await call('new-manager', '/api/login', { id: 'manager', password: passwords[5] })).status === 200, 'Руководитель входит после смены своего пароля');
    const loggedOut = await call('new-d4', '/api/logout', {});
    ok(loggedOut.cookie.includes('Max-Age=0') && !(await call('new-d4', '/api/me')).j.user, 'выход завершает сессию и очищает cookie');
    for (let i = 0; i < 5; i++) r = await call('bad', '/api/login', { id: 'd4', password: crypto.randomBytes(24).toString('hex') });
    ok(r.status === 429 && (await call('bad', '/api/login', { id: 'd4', password: passwords[3] })).status === 429, 'существующая блокировка после 5 ошибок сохранена');
    for (let i = 0; i < 5; i++) r = await call('bad-unknown', '/api/login', { username: 'missing-account', password: 'wrong' });
    ok(r.status === 429 && r.j.error === 'Неверный логин или пароль', 'неизвестный логин не выдаёт себя текстом ошибки или другой блокировкой');
    const restoreLogin = await call('a', '/api/login', { id: 'anton', pin: '582614' });
    ok(restoreLogin.status === 200, 'блокировка одного человека не мешает входу Антона');
    await require('./parking.js').api({ ok, F, call, B, dir, jar, accessCookie });
    console.log('5а. Смена SITE_KEY (перезапуск только тестового сервера)');
    await stop();
    const rotated = crypto.randomBytes(6).toString('hex');
    env.SITE_KEY = rotated;
    await start();
    const oldLink = await fetch(B + '/?k=' + siteKey, { redirect: 'manual' });
    const oldCookie = await fetch(B + '/', { headers: { Cookie: accessCookie } });
    ok(oldLink.status === 404 && oldCookie.status === 404, 'смена SITE_KEY отключает старую ссылку и gk');
    const oldSession = await fetch(B + '/api/me', { headers: { Cookie: jar.a, 'X-Garage': '1' } });
    ok(oldSession.status === 200 && (await oldSession.json()).user.id === 'anton', 'смена SITE_KEY не завершает существующий вход');
    const newEntry = await fetch(B + '/?k=' + rotated, { redirect: 'manual', headers: { Cookie: jar.a } });
    const both = newEntry.headers.getSetCookie();
    ok(newEntry.status === 302 && both.some(s => s.startsWith('gk=')) && both.some(s => s.startsWith('gsid=')), 'выдача gk не теряет продлённую cookie gsid');
    const newManifest = await fetch(B + '/manifest.webmanifest', { headers: { Cookie: jar.a } });
    ok((await newManifest.json()).start_url === '/?k=' + rotated, 'manifest сразу использует новый ключ, без устаревшего кэша');
    await stop();
    env.SITE_KEY = '';
    await start();
    ok((await fetch(B + '/')).status === 404 && (await fetch(B + '/', { headers: { Cookie: 'gk=' } })).status === 404 && (await fetch(B + '/?k=', { redirect: 'manual' })).status === 404, 'при отсутствии SITE_KEY пустые ключ и cookie не открывают сайт');
    ok((await fetch(B + '/', { headers: { Cookie: jar.a } })).status === 200 && (await fetch(B + '/healthz')).status === 200, 'без SITE_KEY действующая сессия и healthz по-прежнему доступны');
    const textFiles = fs.readdirSync(dir).filter(n => fs.statSync(path.join(dir, n)).isFile());
    ok(!out.includes(siteKey) && !out.includes(rotated) && textFiles.every(n => { const t = fs.readFileSync(path.join(dir, n), 'utf8'); return !t.includes(siteKey) && !t.includes(rotated); }), 'ключ доступа не попал в логи или файлы данных');
  } catch (e) { ok(false, 'сценарий: ' + e.message); }
  await stop();
  const st = JSON.parse(fs.readFileSync(path.join(dir, 'state.json'), 'utf8'));
  ok(st.v >= 5, 'журнал сохранён на диск (v=' + st.v + ')');
  fs.rmSync(dir, { recursive: true, force: true });
  require('./auth.js')(ok);

  console.log(fails ? '\n✗ ОШИБОК: ' + fails + ' — не публиковать' : '\n✓ Всё в порядке, можно публиковать');
  process.exit(fails ? 1 : 0);
})();
