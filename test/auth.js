'use strict';
/* Проверки сдвига времени и реальных функций интерфейса без доступа к рабочей базе. */
const fs = require('fs'), path = require('path'), vm = require('vm');

module.exports = ok => {
  console.log('6. Продление сессий и формы входа');
  const root = path.join(__dirname, '..');
  const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  const days = vm.runInNewContext(server.match(/const SESSION_DAYS = (.+);/)[1], { process: { env: {} } });
  ok(days === 365, 'SESSION_DAYS по умолчанию — 365');
  let now = Date.now(), saved = 0, header = '';
  const sess = { id: 'd1', exp: now + 1000 };
  const ctx = {
    SESSION_DAYS: days, SESSIONS: { token: sess }, Date: { now: () => now },
    cookies: () => ({ gsid: 'token' }), tokenHash: t => t,
    findUser: id => ({ id }), saveSessions: () => saved++,
    SAMESITE: 'Strict', COOKIE_SECURE: true
  };
  vm.createContext(ctx);
  vm.runInContext(server.slice(server.indexOf('function sessionOf('), server.indexOf('const FAILS =')), ctx);
  const res = { setHeader: (key, value) => { if (key === 'Set-Cookie') header = value; } };
  ctx.sessionOf({}, res);
  ok(sess.exp === now + days * 864e5 && header.includes('Max-Age=' + days * 86400) && header.includes('Secure'), 'старой действующей сессии продлены серверный срок и защищённая cookie');
  now += 30 * 864e5; header = '';
  ctx.sessionOf({}, res);
  ok(saved === 2 && sess.exp === now + days * 864e5 && header.startsWith('gsid=token;'), 'повторный заход снова даёт 365 дней и ту же cookie');
  now = sess.exp + 1; header = '';
  ok(ctx.sessionOf({}, res) === null && !ctx.SESSIONS.token && !header, 'истёкшая сессия не восстанавливается');

  const source = fs.readFileSync(path.join(root, 'public/ui.js'), 'utf8');
  const users = ['d1', 'd2', 'd3', 'd4', 'manager', 'darya', 'anton'].map(id => ({ id, name: id, mgr: !id.startsWith('d') || id === 'darya', len: id.startsWith('d') && id !== 'darya' ? 4 : 6 }));
  const app = { innerHTML: '' };
  let sheet = '';
  const ui = {
    document: { body: { classList: { add() {} } } }, USERS: users,
    LANG: 'ru', loginPick: null, loginPin: '', loginErr: '', loginBusy: false,
    $: () => app, T: s => s, esc: s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]),
    dn: s => s, ic: () => '', lgAvatar: () => '', role: 'manager', isMgr: () => true,
    head: () => '', nameOf: id => id, openSheet: html => { sheet = html; }, setTimeout() {}
  };
  vm.createContext(ui);
  for (const [start, end] of [['function renderLogin(', 'async function loginSubmit('], ['function accountSheet(', 'function pinSheet('], ['function passwordSheet(', 'function odoFixSheet(']]) {
    vm.runInContext(source.slice(source.indexOf(start), source.indexOf(end)), ui);
  }
  for (const u of users.filter(u => u.id !== 'anton')) {
    ui.loginPick = u.id; ui.renderLogin();
    ok(app.innerHTML.includes('type="password" autocomplete="current-password"') && app.innerHTML.includes('type="hidden" name="username" autocomplete="username" value="' + u.id + '"') && app.innerHTML.includes('Войти') && !app.innerHTML.includes('lg-pad'), u.id + ': поле пароля, скрытый username и кнопка входа без цифровой клавиатуры');
    ui.passwordSheet(u.id);
    ok((sheet.match(/type="password"/g) || []).length === 1 && !/maxlength|minlength|pattern=|hint/.test(sheet), u.id + ': назначение одним полем без требований и подсказок');
  }
  ui.loginPick = 'anton'; ui.renderLogin();
  ok(app.innerHTML.includes('Введите PIN-код') && app.innerHTML.includes('lg-pad') && !app.innerHTML.includes('login-password'), 'экран Антона остался с PIN и цифровой клавиатурой');
  ui.accountSheet();
  ok((sheet.match(/data-act="password-set"/g) || []).length === 6 && (sheet.match(/data-act="pin-set"/g) || []).length === 1 && sheet.includes('data-act="pin-set" data-user="anton"'), 'руководство видит назначение шести паролей и PIN Антона');
};
