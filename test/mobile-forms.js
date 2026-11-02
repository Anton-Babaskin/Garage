'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');

module.exports = async (ok) => {
  console.log('Мобильные формы, клавиатура и подтверждённые действия');
  const source = fs.readFileSync(path.join(__dirname, '..', 'public/ui.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '..', 'public/index.html'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '..', 'public/app.css'), 'utf8');
  const section = (start, end) => {
    const a = source.indexOf(start), b = source.indexOf(end, a + start.length);
    if (a < 0 || b < 0) throw new Error('Не найден проверяемый обработчик: ' + start);
    return source.slice(a, b);
  };
  ok(html.includes('interactive-widget=resizes-content') && !/maximum-scale|user-scalable\s*=\s*no/.test(html), 'viewport подстраивается под клавиатуру и не запрещает масштабирование');
  ok(css.includes('overflow-x:clip') && css.includes('overscroll-behavior:contain') && css.includes('env(safe-area-inset-bottom'), 'нет горизонтального сдвига, учтены прокрутка шторки и safe-area');
  ok(css.includes('.x:focus-visible') && css.includes('prefers-reduced-motion') && css.includes('width:96px;height:96px'), 'фокус доступен клавиатуре, подтверждение учитывает уменьшение анимации');
  const odo = {}, note = {}, attrs = obj => ({ setAttribute: (key, value) => { obj[key] = value; } });
  const keyboard = vm.createContext({});
  vm.runInContext(section('function applyKeyboardHints(', 'function updateSheetViewport('), keyboard);
  keyboard.applyKeyboardHints({ querySelectorAll: selector => selector.startsWith('input[name="odo"]') ? [attrs(odo)] : [attrs(note)] });
  ok(odo.inputmode === 'numeric' && odo.pattern === '[0-9]*' && odo.enterkeyhint === 'done', 'пробег использует цифровую клавиатуру и Done');
  ok(note.enterkeyhint === 'done' && note.autocapitalize === 'sentences', 'адрес и комментарий получают подсказки клавиатуре');

  const styles = {};
  const viewport = vm.createContext({ dlg: { open: true, style: { setProperty: (k, v) => { styles[k] = v; } } }, window: { visualViewport: { height: 420, offsetTop: 50 } } });
  vm.runInContext(section('function updateSheetViewport(', 'if(window.visualViewport)'), viewport);
  viewport.updateSheetViewport();
  ok(styles['--vvh'] === '420px' && styles['--vvtop'] === '50px', 'шторка получает высоту и смещение видимой области с клавиатурой');
  viewport.dlg.open = false; viewport.window.visualViewport.height = 800; viewport.updateSheetViewport();
  ok(styles['--vvh'] === '420px', 'закрытая шторка не обновляется при событиях viewport');

  let keydown, blurred = 0, prevented = 0;
  const keyContext = vm.createContext({ document: { addEventListener: (name, handler) => { if (name === 'keydown') keydown = handler; } } });
  vm.runInContext(section("document.addEventListener('keydown'", "document.addEventListener('input'"), keyContext);
  for (const type of ['text', 'password', 'number']) keydown({ key: 'Enter', target: { tagName: 'INPUT', type, blur: () => { blurred++; } }, preventDefault: () => { prevented++; } });
  keydown({ key: 'Enter', target: { tagName: 'TEXTAREA' }, preventDefault: () => { prevented++; } });
  keydown({ key: 'Enter', isComposing: true, target: { tagName: 'INPUT' }, preventDefault: () => { prevented++; } });
  ok(blurred === 3 && prevented === 3, 'Enter скрывает клавиатуру в однострочных полях; textarea и составной ввод не затронуты');

  let renderedText = {}, timerJobs = [], reduced = false;
  const classes = new Set(), confirm = { hidden: true, classList: { add: v => classes.add(v), remove: v => classes.delete(v) }, querySelector: () => renderedText };
  const overlay = vm.createContext({
    T: s => s, dn: s => s, ic: () => '<svg></svg>', carOf: () => ({ name: 'BMW', location: 'teras', spot: '' }),
    F: { locationName: () => 'Терас' }, tpl: (s, values) => s.replace(/\{(\w+)\}/g, (_, key) => values[key]),
    $: () => confirm, window: { matchMedia: () => ({ matches: reduced }) },
    setTimeout: (fn, ms) => { timerJobs.push({ fn, ms }); return timerJobs.length; }, clearTimeout: () => {}
  });
  vm.runInContext(section('let confirmTimer;', 'function completeAction('), overlay);
  overlay.showActionConfirm({ kind: 'park', carId: 'bmw' });
  ok(!confirm.hidden && renderedText.textContent === 'BMW поставлена · Терас' && timerJobs[0].ms === 1200, 'крупное подтверждение содержит машину и паркинг и показывается примерно 1,2 секунды');
  timerJobs.shift().fn(); timerJobs.shift().fn();
  ok(confirm.hidden && !classes.has('is-closing'), 'подтверждение плавно закрывается без оставшегося слоя');
  reduced = true; timerJobs = []; renderedText = {};
  overlay.showActionConfirm({ kind: 'wash' }); timerJobs.shift().fn();
  ok(confirm.hidden && timerJobs.length === 0 && renderedText.textContent === 'Мойка записана', 'при reduced-motion подтверждение скрывается без анимации');
  ok(overlay.confirmMessage({ kind: 'checkout' }) === 'BMW у вас' && overlay.confirmMessage({ kind: 'handover_accept' }) === 'BMW у вас', 'выезд и принятие показывают понятное подтверждение');
  let onTap, cleared = 0;
  overlay.document = { addEventListener: (name, handler) => { if (name === 'click') onTap = handler; } };
  overlay.clearTimeout = () => { cleared++; };
  vm.runInContext(section("document.addEventListener('click',ev=>{", "  const full=ev.target.closest&&ev.target.closest('.park-photo-full');") + '});', overlay);
  confirm.hidden = false; classes.add('is-closing');
  onTap({ target: { closest: selector => selector === '#actionConfirm' ? confirm : null } });
  ok(confirm.hidden && !classes.has('is-closing') && cleared === 1, 'тап по подтверждению закрывает его сразу и отменяет таймер');

  const outcomes = [], payloads = [], errors = [];
  const queue = vm.createContext({
    SRV_PENDING: [], SRV_BUSY: false, SV: 0, state: {}, dlg: { open: true }, serverResetBusy: false,
    F: { upgrade: state => state }, $: () => null, T: s => s,
    completeAction: outcome => outcomes.push(outcome), render: () => {}, toast: message => errors.push(message),
    srvPull: async () => false, api: async (url, body) => { payloads.push(body); return { v: 2, state: {} }; }
  });
  vm.runInContext(section("const CONFIRM_KINDS=", 'async function srvPull('), queue);
  for (const kind of ['checkout', 'park', 'handover_request', 'handover_accept', 'wash']) {
    const before = outcomes.length;
    queue.srvPush('transact', [{ kind, carId: 'bmw' }]);
    ok(outcomes.length === before, kind + ': нет ложного успеха до ответа сервера');
    await new Promise(resolve => setImmediate(resolve));
    ok(outcomes.length === before + 1 && outcomes.at(-1).kind === kind, kind + ': подтверждение появляется после успешного ответа');
  }
  ok(payloads.every(body => Object.keys(body).sort().join(',') === 'args,op'), 'данные подтверждения не меняют API-запрос и журнал событий');
  const noticeOrder = [];
  queue.completeAction = outcome => { outcomes.push(outcome); noticeOrder.push('close'); };
  queue.toast = message => { errors.push(message); noticeOrder.push('warning'); };
  queue.api = async () => ({ v: 3, state: {}, photoWarning: 'Тестовое предупреждение фото' });
  queue.srvPush('transact', [{ kind: 'park', carId: 'bmw' }]);
  await new Promise(resolve => setImmediate(resolve));
  ok(noticeOrder.join(',') === 'close,warning', 'предупреждение о фото показывается после закрытия шторки и не теряется внутри неё');
  const beforeFailure = outcomes.length;
  queue.api = async () => { const error = new Error('Тестовый отказ'); error.status = 422; throw error; };
  queue.srvPush('transact', [{ kind: 'park', carId: 'bmw' }]);
  await new Promise(resolve => setImmediate(resolve));
  ok(outcomes.length === beforeFailure && errors.includes('Тестовый отказ') && !queue.SRV_BUSY, 'при отказе сервера нет галочки успеха, ошибка показана и отправка разблокирована');
};
