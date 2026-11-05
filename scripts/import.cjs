#!/usr/bin/env node
'use strict';
/*
 * Импорт полной выгрузки «Скачать полную копию» (garage-export-*.json) в хранилище нового сервера.
 *
 *   node scripts/import.cjs garage-export-2026-11-05.json            — в пустое хранилище
 *   node scripts/import.cjs garage-export-2026-11-05.json --force    — перезаписать существующие данные
 *
 * Хранилище выбирается как у server.js: DATABASE_URL → PostgreSQL (таблица garage_kv), иначе файлы в DATA_DIR.
 * Сервер на время импорта ОСТАНОВИТЬ: он держит данные в памяти и перезапишет их.
 */
const fs = require('fs'), path = require('path');

const args = process.argv.slice(2), force = args.includes('--force'), src = args.find(a => !a.startsWith('--'));
if (!src) { console.error('Укажите файл: node scripts/import.cjs garage-export-ГГГГ-ММ-ДД.json [--force]'); process.exit(2); }
const dump = JSON.parse(fs.readFileSync(src, 'utf8'));
if (!dump || dump.format !== 'garage-export' || !dump.kv || typeof dump.kv !== 'object') { console.error('Это не файл «Скачать полную копию».'); process.exit(2); }
const kv = dump.kv, keys = Object.keys(kv);
if (!kv['state.json'] || !kv['users.json']) { console.error('В выгрузке нет state.json или users.json — импорт отменён.'); process.exit(2); }
const SAFE = /^[A-Za-z0-9:._-]+$/;
for (const k of keys) if (!SAFE.test(k) || k.includes('..')) { console.error('Недопустимый ключ в выгрузке: ' + k); process.exit(2); }

async function toPg() {
  const pg = new (require('pg').Pool)(Object.assign({ connectionString: process.env.DATABASE_URL, max: 1 }, process.env.PGSSL_NOVERIFY === '1' ? { ssl: { rejectUnauthorized: false } } : {}));
  const c = await pg.connect();
  try {
    await c.query('CREATE TABLE IF NOT EXISTS garage_kv (k text PRIMARY KEY, v text NOT NULL, t timestamptz NOT NULL DEFAULT now())');
    const has = (await c.query("SELECT 1 FROM garage_kv WHERE k = 'state.json'")).rowCount > 0;
    if (has && !force) throw new Error('В базе уже есть данные. Добавьте --force, чтобы перезаписать.');
    await c.query('BEGIN');
    if (force) await c.query("DELETE FROM garage_kv WHERE k LIKE 'photo:%'");
    for (const k of keys) await c.query('INSERT INTO garage_kv (k, v, t) VALUES ($1, $2, now()) ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v, t = now()', [k, JSON.stringify(kv[k])]);
    await c.query('COMMIT');
  } catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; }
  finally { c.release(); await pg.end(); }
}

function write(p, obj) {
  const tmp = p + '.tmp-' + process.pid, fd = fs.openSync(tmp, 'w', 0o600);
  try { fs.writeSync(fd, JSON.stringify(obj)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(tmp, p);
}
function toFiles() {
  const DATA = path.resolve(process.env.DATA_DIR || path.join(__dirname, '..', 'data'));
  fs.mkdirSync(path.join(DATA, 'backups'), { recursive: true, mode: 0o700 });
  if (fs.existsSync(path.join(DATA, 'state.json')) && !force) throw new Error('В ' + DATA + ' уже есть данные. Добавьте --force, чтобы перезаписать.');
  if (force) for (const n of fs.readdirSync(DATA)) if (n.startsWith('photo:')) fs.unlinkSync(path.join(DATA, n));
  for (const k of keys) {
    const m = /^backup:(state-.+)$/.exec(k);
    write(m ? path.join(DATA, 'backups', m[1] + '.json') : path.join(DATA, k), kv[k]);
  }
  return DATA;
}

(async () => {
  const where = process.env.DATABASE_URL ? (await toPg(), 'PostgreSQL') : toFiles();
  const st = kv['state.json'], users = Object.keys(kv['users.json'] || {}).length, photos = keys.filter(k => k.startsWith('photo:')).length;
  console.log('✓ Импорт выполнен → ' + where);
  console.log('  выгрузка от ' + dump.exportedAt + ', версия данных v=' + (st && st.v) + ', событий: ' + ((st && st.state && st.state.events || []).length));
  console.log('  пользователей: ' + users + ', сессий: ' + Object.keys(kv['sessions.json'] || {}).length + ', фото: ' + photos + ', копий: ' + keys.filter(k => k.startsWith('backup:')).length);
})().catch(e => { console.error('✗ ' + e.message); process.exit(1); });
