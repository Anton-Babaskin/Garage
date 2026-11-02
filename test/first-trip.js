'use strict';
/* Первый выезд и реальные функции интерфейса; только изолированные данные. */
const fs = require('fs'), path = require('path'), vm = require('vm');

module.exports = (ok, F) => {
  console.log('Первый выезд без начальных данных');
  let state = F.emptyState();
  const original = JSON.stringify(state);
  const act = cmd => { state = F.transact(state, cmd); return F.project(state); };
  const rejects = cmd => { try { F.transact(state, cmd); return false; } catch (_) { return true; } };
  const car = (p, id = 'bmw') => p.cars.find(c => c.id === id);
  let p = act({ kind: 'checkout', carId: 'bmw', actorId: 'd1', odo: 0 });
  ok(car(p).status === 'driving' && car(p).odo === 0 && car(p).trip.startOdo === 0 && car(p).keys.driverId === 'd1', 'водитель начинает первую поездку с 0 и получает ключи');
  ok(p.audit[0].odoGap === 0 && p.cars.filter(c => c.status === 'unconfigured').length === 3, 'первый выезд не создаёт ложный пробег без записи и не меняет другие машины');
  ok(rejects({ kind: 'checkout', carId: 'audi', actorId: 'd1', odo: 0 }), 'нельзя одновременно взять вторую, ещё не настроенную машину');
  ok(rejects({ kind: 'checkout', carId: 'bmw', actorId: 'd2', odo: 0 }), 'другой водитель не может взять занятую машину');
  ok(rejects({ kind: 'checkout', carId: 'audi', actorId: 'anton', odo: 0 }), 'руководство не становится водителем');
  const take = JSON.stringify(state.events);
  p = act({ kind: 'park', carId: 'bmw', actorId: 'd1', odo: 1200, location: 'vadi', keyKind: 'security' });
  ok(car(p).status === 'parked' && car(p).odo === 1200 && car(p).location === 'vadi' && car(p).keys.kind === 'security', 'первая парковка сохраняет фактический пробег, место и ключи');
  ok(JSON.stringify(state.events.slice(0, 1)) === take, 'первая запись не переписывается при парковке');
  p = act({ kind: 'checkout', carId: 'bmw', actorId: 'd2', odo: 1200 });
  ok(car(p).trip.startOdo === 1200 && p.audit[2].odoGap === 0, 'следующий водитель начинает с последнего показания');
  ok(rejects({ kind: 'park', carId: 'bmw', actorId: 'd2', odo: 1199, location: 'teras', keyKind: 'office' }), 'пробег по-прежнему нельзя уменьшить');
  p = act({ kind: 'park', carId: 'bmw', actorId: 'd2', odo: 1225, location: 'teras', keyKind: 'office' });
  ok(p.trips[1].distance === 25, 'следующая поездка считает расстояние обычным образом');
  p = act({ kind: 'checkout', carId: 'audi', actorId: 'd3', odo: 85000 });
  ok(car(p, 'audi').trip.startOdo === 85000 && p.audit.at(-1).odoGap === 0, 'при первом выезде можно сразу указать текущий пробег без ложного сигнала');
  ok(JSON.stringify(F.emptyState()) === original && F.project(F.upgrade(state)).cars.find(c => c.id === 'bmw').odo === 1225, 'пустой журнал не меняется, новый журнал повторно проигрывается');

  const source = fs.readFileSync(path.join(__dirname, '..', 'public/ui.js'), 'utf8');
  let sheet = '';
  const ui = {
    F, state: F.emptyState(), role: 'd1', NOW: Date.now(), T: s => s, esc: String, fmt: String,
    isMgr: F.isManager, nameOf: id => id, ic: () => '', carSVG: () => '', openIssues: () => [],
    keysText: () => '', placeHTML: () => '', noteField: () => '', head: () => '', formEnd: () => '', statusDot: () => '',
    openSheet: html => { sheet = html; }, toast: () => { throw new Error('Неожиданная блокировка'); }
  };
  ui.P = F.project(ui.state);
  ui.carOf = id => ui.P.cars.find(c => c.id === id);
  ui.occupied = (id, except) => ui.P.cars.find(c => c.id !== except && (c.currentDriverId === id || c.pendingTransfer && c.pendingTransfer.toId === id));
  vm.createContext(ui);
  for (const [start, end] of [['function carActions(', 'function carCard('], ['function viewMine(', 'function matchesEvent('], ['function kmField(', 'function locationField('], ['function actionSheet(', 'function simpleSheet(']]) {
    vm.runInContext(source.slice(source.indexOf(start), source.indexOf(end)), ui);
  }
  const list = ui.viewMine(), buttons = list.match(/<button[^>]*data-act="checkout"[^>]*>/g) || [];
  ok(buttons.length === 4 && buttons.every(b => !b.includes('disabled')), 'на экране водителя все четыре новые машины доступны для взятия');
  ok(ui.carActions(ui.carOf('bmw')).includes('data-act="checkout"'), 'в карточке новой машины тоже доступно «Взять машину»');
  ui.actionSheet('checkout', 'bmw');
  ok(sheet.includes('Последний пробег: <b>0 км</b>') && /id="f-odo"[^>]*value="0"/.test(sheet) && sheet.includes('data-kind="checkout"') && !sheet.includes('от руководителя'), 'форма первого выезда подставляет 0 без требования руководства');
  ui.state = state; ui.P = F.project(state);
  ui.actionSheet('checkout', 'bmw');
  ok(/id="f-odo"[^>]*value="1225"/.test(sheet), 'следующий выезд подставляет реальное последнее показание, не 0');
  ui.role = 'd3';
  ok(!ui.carActions(ui.carOf('skoda')).includes('data-act="checkout"'), 'карточка не предлагает занять вторую новую машину');
};
