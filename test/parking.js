'use strict';
/* Все данные этого набора создаются только в временной папке smoke-теста. */
const fs = require('fs'), path = require('path'), vm = require('vm'), crypto = require('crypto');
const PHOTO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aH1sAAAAASUVORK5CYII=';
exports.core = (ok, F) => {
  console.log('Защита пробега, совместимость старых событий и car_reset');
  let s = F.emptyState();
  const act = c => (s = F.transact(s, { carId: 'bmw', actorId: 'd1', ...c }));
  const rejects = c => { try { F.transact(s, { carId: 'bmw', actorId: 'd1', ...c }); return ''; } catch (e) { return e.message; } };
  for (const odo of [-1, 1.5, 'NaN']) ok(!!rejects({ kind: 'checkout', odo }), 'checkout отклоняет не-число ' + odo);
  for (const odo of [0, 127484538383, 31902398129301]) ok(!rejects({ kind: 'checkout', odo }), 'checkout принимает любое число ' + odo);
  act({ kind: 'checkout', odo: 127484 });
  ok(F.project(s).cars[0].odo === 127484, 'первое реальное показание не сравнивается с несуществующим пробегом');
  for (const odo of [-1, 1.5]) ok(!!rejects({ kind: 'park', odo, location: 'vadi', keyKind: 'security' }), 'park отклоняет не-число ' + odo);
  for (const odo of [0, 100, 127484538383]) ok(!rejects({ kind: 'park', odo, location: 'vadi', keyKind: 'security' }), 'park принимает любое число ' + odo);
  ok(!rejects({ kind: 'park', odo: 132484, location: 'vadi', keyKind: 'security' }), 'скачок park +5000 принимается');
  act({ kind: 'park', odo: 127500, location: 'vadi', keyKind: 'security', photo: PHOTO });
  ok(!s.events.at(-1).photo, 'фото места не попадает в новое событие park');
  ok(!rejects({ kind: 'checkout', odo: 132500 }), 'скачок checkout +5000 принимается');
  act({ kind: 'checkout', odo: 127510 });
  act({ kind: 'park', odo: 127540, location: 'teras', keyKind: 'office' });
  act({ kind: 'checkout', carId: 'audi', actorId: 'd3', odo: 85000 });
  act({ kind: 'park', carId: 'audi', actorId: 'd3', odo: 85025, location: 'teras', keyKind: 'office' });
  ok(F.stats(s, 7).cars[0].total > 0, 'до сброса статистика содержит поездки и пробег без записи');
  const old = JSON.stringify(s.events);
  ok(!!rejects({ kind: 'car_reset' }), 'водитель не может сбросить машину');
  act({ kind: 'car_reset', actorId: 'manager' });
  const car = F.project(s).cars[0], st = F.stats(s, 7).cars[0];
  ok(car.status === 'unconfigured' && car.odo === null && car.currentDriverId === null && car.location === null && !car.trip && !car.pendingTransfer && car.keys.kind === 'unknown', 'car_reset очищает только текущее состояние машины');
  ok(JSON.stringify(s.events.slice(0, -1)) === old, 'сброс одной машины оставляет старый журнал байт-в-байт');
  ok(st.total === 0 && st.unlogged === 0 && st.logged === 0 && st.trips === 0 && !F.attention(s).some(x => x.kind === 'gap'), 'после car_reset пробег за 7 дней и без записи равны нулю');
  ok(F.stats(s, 7).cars[1].total === 25 && F.project(s).cars[1].odo === 85025, 'сброс одной машины не меняет другую машину и её статистику');
  act({ kind: 'init', actorId: 'darya', odo: 500, location: 'vadi' });
  act({ kind: 'checkout', odo: 510 });
  act({ kind: 'handover_request', odo: 510, toId: 'd2' });
  act({ kind: 'car_reset', actorId: 'anton' });
  ok(!F.project(s).cars[0].pendingTransfer && !F.project(s).cars[0].currentDriverId, 'можно сбросить машину в поездке с ожидающей передачей');
  act({ kind: 'checkout', odo: 0 });
  act({ kind: 'park', odo: 3000, location: 'vadi', keyKind: 'security' });
  ok(F.stats(s, 7).cars[0].total === 3000 && F.stats(s, 7).cars[0].trips === 1, 'граница +3000 разрешена, статистика считает только поездки после последнего сброса');
  act({ kind: 'odo_fix', actorId: 'anton', odo: 9000000, note: 'Тест исключения руководства' });
  ok(F.project(s).cars[0].odo === 9000000, 'odo_fix руководства не получает нового ограничения');
  const source = fs.readFileSync(path.join(__dirname, '..', 'public/ui.js'), 'utf8');
  const ui = { P: F.project(s), NOW: Date.now(), DAY: 864e5, dayKey: t => new Date(t).toISOString().slice(0, 10) };
  ui.carOf = id => ui.P.cars.find(c => c.id === id);
  vm.createContext(ui); vm.runInContext(source.slice(source.indexOf('function carDaily('), source.indexOf('function bossFoot(')), ui);
  ok(ui.carDaily('bmw', 7).reduce((n, d) => n + d.km, 0) === 3000, 'главная страница на ПК тоже исключает поездки до последнего car_reset');
  const legacy = F.emptyState();
  legacy.events = [
    { id: 'old-take', kind: 'checkout', carId: 'bmw', actorId: 'd1', actorName: 'Эркин', at: '2026-10-01T10:00:00Z', odo: 0 },
    { id: 'old-park', kind: 'park', carId: 'bmw', actorId: 'd1', actorName: 'Эркин', at: '2026-10-01T11:00:00Z', odo: 127484538383, location: 'vadi', keyKind: 'security', photo: PHOTO }
  ];
  ok(F.project(F.upgrade(legacy)).cars[0].odo === 127484538383 && legacy.events[1].photo === PHOTO, 'старые большие показания и старые фото в журнале проигрываются без новых проверок');
  legacy.events.push({ id: 'old-next-take', kind: 'checkout', carId: 'bmw', actorId: 'd1', at: '2026-10-01T12:00:00Z', odo: 127484538383 });
  const oldJournal = JSON.stringify(legacy.events);
  const parkedLegacy = F.transact(legacy, { kind: 'park', carId: 'bmw', actorId: 'd1', odo: '127484538383', location: 'teras', keyKind: 'security' });
  ok(F.project(parkedLegacy).cars[0].status === 'parked' && F.project(parkedLegacy).cars[0].odo === 127484538383, 'старый пробег вне диапазона не мешает парковке, если число не меняли');
  ok(JSON.stringify(legacy.events) === oldJournal && JSON.stringify(parkedLegacy.events.slice(0, -1)) === oldJournal, 'исключение для парковки не исправляет старые данные и только дополняет журнал');
  for (const [state, cmd] of [
    [legacy, { kind: 'park', odo: 127484538383, actorId: 'd2', location: 'teras', keyKind: 'security' }],
    [legacy, { kind: 'park', odo: 127484538383, actorId: 'd1', location: 'invalid', keyKind: 'security' }],
    [legacy, { kind: 'park', odo: 5, actorId: 'd1', location: 'invalid', keyKind: '' }]
  ]) {
    let rejected = false;
    try { F.transact(state, { carId: 'bmw', ...cmd }); } catch (e) { rejected = true; }
    ok(rejected, 'без лимитов пробега по-прежнему нельзя: чужая парковка, неверное место: ' + cmd.kind + '/' + cmd.actorId);
  }
};

exports.api = async ({ ok, F, call, B, dir, jar, accessCookie }) => {
  console.log('Фото места и безопасные сбросы через API');
  const op = (who, cmd) => call(who, '/api/op', { op: 'transact', args: [{ carId: 'bmw', ...cmd }] });
  const take = odo => op('new-d1', { kind: 'checkout', odo });
  const park = (odo, photo) => op('new-d1', { kind: 'park', odo, location: 'vadi', keyKind: 'security', photo });
  const photoPath = path.join(dir, 'photo:bmw');
  for (const cookie of ['', accessCookie]) {
    const r = await fetch(B + '/api/photo/bmw', { headers: { 'X-Garage': '1', Cookie: cookie } });
    ok([401, 404].includes(r.status), 'фото недоступно без сессии, даже с cookie доступа к сайту');
  }
  ok((await call('new-d1', '/api/op', { op: 'transact', args: [{ kind: 'car_reset', carId: 'bmw' }] })).status === 422, 'API не разрешает водителю car_reset');
  ok((await take(127484538383)).status === 200, 'API принимает любой пробег при checkout');
  let r = await park(1050, PHOTO);
  ok(r.status === 200 && F.project(r.j.state).cars[0].hasPhoto && !r.j.state.events.at(-1).photo && !JSON.stringify(r.j.state).includes(PHOTO), 'park сохраняет фото отдельно; ответ состояния содержит только hasPhoto');
  const stored = JSON.parse(fs.readFileSync(photoPath, 'utf8'));
  ok(stored.photo === PHOTO && stored.actorId === 'd1' && stored.location === 'vadi' && stored.at && stored.eventId, 'у фото сохранены автор, время, паркинг и идентификатор постановки');
  let get = await fetch(B + '/api/photo/bmw', { headers: { Cookie: jar.a, 'X-Garage': '1' } });
  const etag = get.headers.get('etag');
  ok(get.status === 200 && (await get.json()).photo === PHOTO && get.headers.get('cache-control') === 'no-cache' && etag, 'авторизованное GET фото: содержимое, ETag и no-cache');
  get = await fetch(B + '/api/photo/bmw', { headers: { Cookie: jar.a, 'X-Garage': '1', 'If-None-Match': etag } });
  ok(get.status === 304, 'ETag даёт 304 только после проверки сессии');
  ok((await call('a', '/api/photo/../../server.js')).status !== 200, 'ID фото не позволяет читать произвольные файлы');
  const snap = await call('a', '/api/state');
  ok(snap.j.state.carDetails.bmw.hasPhoto && !JSON.stringify(snap.j).includes(PHOTO), 'GET /api/state не передаёт фото места');
  const backup = await fetch(B + '/api/backup', { headers: { Cookie: jar.a, 'X-Garage': '1' } });
  ok(!(await backup.text()).includes(PHOTO), 'обычная резервная копия не содержит отдельное фото места');
  await take(1050);
  ok(!fs.existsSync(photoPath) && (await call('a', '/api/photo/bmw')).status === 404, 'checkout физически удаляет фото места');
  r = await park(1060, PHOTO.replace('iVBOR', 'jVBOR'));
  ok(r.status === 200 && JSON.parse(fs.readFileSync(photoPath, 'utf8')).photo !== PHOTO, 'новая парковка заменяет единственное фото машины');
  await take(1060); r = await park(1070);
  ok(r.status === 200 && !F.project(r.j.state).cars[0].hasPhoto && !fs.existsSync(photoPath), 'парковка без фото не оставляет предыдущее');
  await take(1070); r = await park(1080, '<script>invalid</script>');
  ok(r.status === 200 && !!r.j.photoWarning && !F.project(r.j.state).cars[0].hasPhoto, 'невалидное фото отклонено, но сама парковка сохранена с предупреждением');
  await take(1080);
  fs.mkdirSync(photoPath); // Сбой записи только во временной папке теста.
  r = await park(1090, PHOTO);
  ok(r.status === 200 && r.j.photoWarning && F.project(r.j.state).cars[0].status === 'parked', 'ошибка хранилища фото не отменяет парковку');
  fs.rmdirSync(photoPath);
  await take(1090); await park(1100, PHOTO);
  const beforeOne = (await call('a', '/api/state')).j.state;
  r = await op('new-manager', { kind: 'car_reset' });
  ok(r.status === 200 && F.project(r.j.state).cars[0].status === 'unconfigured' && !fs.existsSync(photoPath), 'руководитель сбрасывает машину и удаляет фото');
  ok(JSON.stringify(r.j.state.events.slice(0, -1)) === JSON.stringify(beforeOne.events) && F.stats(r.j.state, 7).cars[0].total === 0, 'API car_reset сохраняет журнал и обнуляет статистику');
  await take(0);
  r = await op('new-darya', { kind: 'car_reset' });
  ok(r.status === 200, 'Дарья может сбросить машину в поездке');
  await take(0); await park(15, PHOTO);
  const usersBefore = fs.readFileSync(path.join(dir, 'users.json'), 'utf8');
  const before = (await call('a', '/api/state')).j;
  for (const who of ['new-d1', 'new-manager', 'new-darya']) ok((await call(who, '/api/reset', { confirmation: 'СБРОС' })).status === 403, 'общий сброс запрещён для ' + who);
  ok((await call('a', '/api/reset', { confirmation: 'сброс' })).status === 422, 'без точного слова подтверждения сброс не выполняется');
  ok((await call('a', '/api/state')).j.v === before.v, 'отклонённые сбросы не меняют состояние и его версию');
  r = await call('a', '/api/reset', { confirmation: 'СБРОС' });
  ok(r.status === 200 && r.j.v > before.v && r.j.state.events.length === 0 && F.project(r.j.state).cars.every(c => c.status === 'unconfigured'), 'Антон начинает пустой журнал, все четыре машины в Нет данных');
  const backups = fs.readdirSync(dir).filter(n => n.startsWith('backup:before-reset-'));
  const snapBefore = JSON.parse(fs.readFileSync(path.join(dir, backups[0]), 'utf8'));
  ok(backups.length === 1 && JSON.stringify(snapBefore.state.events) === JSON.stringify(before.state.events) && !JSON.stringify(snapBefore).includes(PHOTO), 'до общего сброса создана полная копия журнала без фото места');
  ok(fs.readFileSync(path.join(dir, 'users.json'), 'utf8') === usersBefore && !fs.existsSync(photoPath), 'общий сброс удаляет фото, пароли и PIN остаются без изменений');
  const cleanDetails = d => JSON.stringify(Object.fromEntries(Object.entries(d).map(([k, v]) => [k, Object.fromEntries(Object.entries(v).filter(([n]) => n !== 'hasPhoto'))])));
  ok(cleanDetails(r.j.state.carDetails) === cleanDetails(before.state.carDetails) && JSON.stringify(r.j.state.settings) === JSON.stringify(before.state.settings) && JSON.stringify(r.j.state.places) === JSON.stringify(before.state.places) && JSON.stringify(r.j.state.drivers) === JSON.stringify(before.state.drivers), 'модель, номер, фото машины, цвет, настройки, паркинги и имена сохраняются');
  ok((await call('new-d1', '/api/me')).j.user.id === 'd1' && (await call('a', '/api/me')).j.user.id === 'anton', 'общий сброс сохраняет сессии водителя и Антона');
  const poll = await call('new-d1', '/api/state?v=' + before.v);
  ok(!poll.j.same && poll.j.state.events.length === 0, 'другой телефон получает чистое состояние через обычный опрос');
  r = await call('a', '/api/reset', { confirmation: 'SIFIRLA' });
  ok(r.status === 200 && fs.readdirSync(dir).filter(n => n.startsWith('backup:before-reset-')).length === 2, 'турецкое подтверждение тоже работает, копии не перезаписываются');
  const legacy = r.j.state;
  legacy.events = [{ id: 'legacy-large-take', kind: 'checkout', carId: 'bmw', actorId: 'd1', at: '2026-10-01T12:00:00Z', odo: 127484538383 }];
  const restored = await call('a', '/api/op', { op: 'restore', args: [legacy] });
  ok(restored.status === 200, 'API: старый журнал с большим пробегом загружен только в изолированном тесте');
  r = await op('new-d1', { kind: 'park', odo: '127484538383', location: 'teras', keyKind: 'security' });
  ok(r.status === 200 && F.project(r.j.state).cars[0].status === 'parked' && F.project(r.j.state).cars[0].odo === 127484538383 && JSON.stringify(r.j.state.events.slice(0, -1)) === JSON.stringify(legacy.events), 'API: парковка с неизменённым старым пробегом проходит без перезаписи истории');
};

exports.storage = async (ok, F) => {
  console.log('Атомарность PostgreSQL-сброса (имитация сбоев, без настоящей базы)');
  const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const fn = src.slice(src.indexOf('async function resetAfterTests('), src.indexOf('/* ───── резервные копии'));
  for (const failure of ['backup', 'delete', 'none', 'file-backup']) {
    const statements = [];
    const state = F.emptyState();
    const db = { v: 20, state };
    const ctx = {
      F, DB: db, CHAIN: Promise.resolve(), CACHE: { 'photo:bmw': { photo: PHOTO } }, crypto, T: s => s, log: () => {},
      PG: failure === 'file-backup' ? null : {
        connect: async () => ({
          query: async (sql, args) => {
            statements.push(sql);
            if ((failure === 'backup' && args && String(args[0]).startsWith('backup:before-reset-')) || (failure === 'delete' && sql.startsWith('DELETE'))) throw new Error('Synthetic failure');
          },
          release: () => statements.push('RELEASE')
        })
      },
      writeJSON: async () => { statements.push('FILE BACKUP'); throw new Error('Synthetic failure'); }
    };
    vm.createContext(ctx); vm.runInContext(fn, ctx);
    let error = null;
    try { await ctx.resetAfterTests({ id: 'anton' }, 'СБРОС'); } catch (e) { error = e; }
    if (failure === 'none') {
      ok(!error && statements[0] === 'BEGIN' && statements[1].includes('INSERT INTO') && statements[2].includes('INSERT INTO') && statements[3].includes("LIKE 'photo:%'") && statements[4] === 'COMMIT' && ctx.DB.v === 21 && !ctx.CACHE['photo:bmw'], 'backup, состояние и удаление фото фиксируются одной транзакцией PostgreSQL');
    } else {
      ok(error && ctx.DB === db && !!ctx.CACHE['photo:bmw'] && !statements.includes('COMMIT') && (failure === 'file-backup' || statements.includes('ROLLBACK')), failure + ': при ошибке сброс не зафиксирован, память и фото не изменены');
      if (failure === 'backup') ok(statements.length === 4 && !statements.some(s => s.includes('DELETE')), 'ошибка обязательной копии прерывает сброс до изменения состояния и фото');
    }
  }
};
