(function(root){
'use strict';
/* Ядро учёта: логика из версии ChatGPT (событийный журнал + проверки), дополнено цветами машин, сигналами по пробегу без записи и статистикой. */
const CARS=[{id:'bmw',name:'BMW',index:'01',color:'#6B737C'},{id:'audi',name:'Audi',index:'02',color:'#15161A'},{id:'fiat',name:'Fiat',index:'03',color:'#556270'},{id:'skoda',name:'Škoda',index:'04',color:'#34373C'}];
const TEAM=[T('Эркин'),T('Озгюр'),T('Мурат'),T('Водитель 4')];
const LOCATIONS=[{id:'vadi',name:T('Вади'),tone:'vadi',sign:T('В')},{id:'teras',name:T('Терас'),tone:'teras',sign:T('Т')},{id:'chamly',name:T('Чамлы'),tone:'camli',sign:T('Ч')},{id:'service',name:T('Сервис'),tone:'service',sign:''},{id:'other',name:T('Другое'),tone:'other',sign:'?'}];
const PARKINGS=['vadi','teras','chamly'];
/* Виды моек: добавить новый — строка здесь + перевод в i18n.js */
const WASH_TYPES=[{id:'wash',name:T('Мойка')},{id:'interior',name:T('Химчистка')},{id:'full',name:T('Мойка + химчистка')},{id:'other',name:T('Другое')}];
function washName(id){const t=WASH_TYPES.find(x=>x.id===id);return t?t.name:T('Мойка');}
const MANAGERS=[{id:'manager',name:T('Руководитель')},{id:'darya',name:T('Дарья')},{id:'anton',name:T('Антон')}];
function isManager(id){return MANAGERS.some(m=>m.id===id);}
function managerName(id){const m=MANAGERS.find(x=>x.id===id);return m?m.name:'';}
/* Точки паркингов на карте Стамбула */
const GEO_BOX={latMin:40.78,latMax:41.62,lngMin:27.96,lngMax:29.96};
const DEMO_PLACES={vadi:{lat:41.1106,lng:28.9878,link:'https://www.google.com/maps/search/?api=1&query=Vadistanbul%2C+Ayaza%C4%9Fa+Mah.+Azerbaycan+Cad.%2C+Sar%C4%B1yer%2C+%C4%B0stanbul',demo:true},teras:{lat:41.1091,lng:28.9851,link:'https://maps.app.goo.gl/SE1EbSz4eBmB41pXA',demo:true},chamly:{lat:null,lng:null,link:'https://maps.app.goo.gl/C1fD4Prh7gTAbnNY8'}};
function inGeoBox(lat,lng){return Number.isFinite(lat)&&Number.isFinite(lng)&&lat>=GEO_BOX.latMin&&lat<=GEO_BOX.latMax&&lng>=GEO_BOX.lngMin&&lng<=GEO_BOX.lngMax;}
function cleanLink(s){s=String(s||'').trim();return /^https:\/\/[^\s"'<>]{4,600}$/.test(s)?s:'';}
function normPlaces(p){
  const out={};if(!p||typeof p!=='object')return out;
  PARKINGS.forEach(id=>{const v=p[id];if(!v||typeof v!=='object')return;const lat=Number(v.lat),lng=Number(v.lng),link=cleanLink(v.link);
    const has=inGeoBox(lat,lng);if(!has&&!link)return;
    out[id]={lat:has?Math.round(lat*1e6)/1e6:null,lng:has?Math.round(lng*1e6)/1e6:null,link};if(v.demo)out[id].demo=true;});
  return out;
}
/* Координаты из ссылки Google Maps или текста: «41.1106, 28.9878», …/@41.11,28.98,17z, !3d41.1!4d28.9, ?q=41.1,28.9, 41°06'38"N 28°59'16"E */
function parseGeo(text){
  let s=String(text||'').trim();if(!s)return null;
  try{s=decodeURIComponent(s);}catch(e){}
  const num='(-?\\d{1,3}\\.\\d+)';
  const tries=[new RegExp('!3d'+num+'!4d'+num),new RegExp('[?&](?:q|query|ll|destination|center|daddr)=(?:loc:)?'+num+'\\s*,\\s*'+num),new RegExp('@'+num+','+num),new RegExp('(?:^|[^\\d.])'+'(-?\\d{1,2}\\.\\d{3,})\\s*[,; ]\\s*(-?\\d{1,3}\\.\\d{3,})')];
  for(const re of tries){const m=s.match(re);if(m){const lat=parseFloat(m[1]),lng=parseFloat(m[2]);if(inGeoBox(lat,lng))return {lat,lng};}}
  const dms=s.match(/(\d{1,2})°\s*(\d{1,2})['′]\s*([\d.]+)["″]?\s*([NS])[\s,]+(\d{1,3})°\s*(\d{1,2})['′]\s*([\d.]+)["″]?\s*([EW])/i);
  if(dms){const v=(d,m,x,h)=>(Number(d)+Number(m)/60+Number(x)/3600)*(/[SW]/i.test(h)?-1:1);const lat=v(dms[1],dms[2],dms[3],dms[4]),lng=v(dms[5],dms[6],dms[7],dms[8]);if(inGeoBox(lat,lng))return {lat,lng};}
  return null;
}
function setPlace(state,id,value){
  if(PARKINGS.indexOf(id)<0)fail(T('Паркинг не найден.'));
  const next=upgrade(state);next.places=normPlaces(next.places);
  if(value==null){delete next.places[id];return next;}
  const lat=value.lat==null||value.lat===''?NaN:Number(value.lat),lng=value.lng==null||value.lng===''?NaN:Number(value.lng),raw=String(value.link||'').trim(),link=cleanLink(raw);
  if(raw&&!link)fail(T('Ссылка должна начинаться с https://'));
  const has=Number.isFinite(lat)||Number.isFinite(lng);
  if(has&&!inGeoBox(lat,lng))fail(T('Точка вне Стамбула. Проверьте координаты.'));
  if(!has&&!link)fail(T('Укажите точку на карте, координаты или ссылку Google Maps.'));
  next.places[id]={lat:has?Math.round(lat*1e6)/1e6:null,lng:has?Math.round(lng*1e6)/1e6:null,link};
  return next;
}
const ISSUE_TYPES=[{id:'fuel',name:T('Нужна заправка'),sev:'info',icon:'fuel'},{id:'damage',name:T('Повреждение'),sev:'crit',icon:'alert'},{id:'service',name:T('Нужен сервис'),sev:'warn',icon:'wrench'},{id:'other',name:T('Другое замечание'),sev:'warn',icon:'flag'}];
const SERVICE_TYPES=[
  {id:'maint',name:T('Плановое ТО'),icon:'wrench',km:15000,months:12,needOdo:true},
  {id:'tires',name:T('Смена шин'),icon:'tire',km:0,months:6,needOdo:false},
  {id:'brakes',name:T('Тормозные колодки'),icon:'disc',km:30000,months:0,needOdo:true},
  {id:'muayene',name:T('Техосмотр TÜVTÜRK'),icon:'badge',km:0,months:24,needOdo:false},
  {id:'trafik',name:'Trafik sigortası',icon:'shield',km:0,months:12,needOdo:false},
  {id:'kasko',name:T('Каско'),icon:'shield',km:0,months:12,needOdo:false},
  {id:'other',name:T('Другое'),icon:'flag',km:0,months:0,needOdo:false}
];
function serviceType(id){return SERVICE_TYPES.find(t=>t.id===id)||null;}
function normService(s){s=s&&typeof s==='object'?s:{};return {records:Array.isArray(s.records)?s.records:[],intervals:s.intervals&&typeof s.intervals==='object'?s.intervals:{}};}
function intervalOf(state,type){const t=serviceType(type),o=(normService(state.service).intervals[type])||{};return {km:Number.isInteger(o.km)?o.km:t.km,months:Number.isInteger(o.months)?o.months:t.months};}
function addMonths(dateStr,m){const [y,mo,d]=dateStr.split('-').map(Number);const dt=new Date(Date.UTC(y,mo-1+m,d));return dt.toISOString().slice(0,10);}
function todayStr(now){const p=localParts(now==null?Date.now():now);return p.year+'-'+p.month+'-'+p.day;}
function daysBetween(a,b){return Math.round((Date.parse(b+'T00:00:00Z')-Date.parse(a+'T00:00:00Z'))/864e5);}
function serviceStatus(state,now){
  const p=project(state),svc=normService(state.service),today=todayStr(now);
  return p.cars.map(car=>{
    const items=SERVICE_TYPES.filter(t=>t.id!=='other').map(t=>{
      const recs=svc.records.filter(r=>r.carId===car.id&&r.type===t.id).sort((a,b)=>a.date<b.date?1:a.date>b.date?-1:0);
      const last=recs[0]||null,iv=intervalOf(state,t.id);
      if(!last)return {type:t,last:null,status:'unknown',iv};
      const dueKm=(iv.km&&last.odo!=null)?last.odo+iv.km:null,dueDate=iv.months?addMonths(last.date,iv.months):null;
      const kmLeft=dueKm!=null&&car.odo!=null?dueKm-car.odo:null,daysLeft=dueDate?daysBetween(today,dueDate):null;
      const fracs=[];if(kmLeft!=null)fracs.push(1-kmLeft/iv.km);if(daysLeft!=null)fracs.push(1-daysLeft/(daysBetween(last.date,dueDate)||1));
      const used=fracs.length?Math.max(...fracs):0;
      let status='ok';
      if((kmLeft!=null&&kmLeft<0)||(daysLeft!=null&&daysLeft<0))status='overdue';
      else if((kmLeft!=null&&kmLeft<=1500)||(daysLeft!=null&&daysLeft<=30))status='soon';
      return {type:t,last,status,iv,dueKm,dueDate,kmLeft,daysLeft,used:Math.max(0,Math.min(1.2,used))};
    });
    return {car,items};
  });
}
function addServiceRecord(state,rec,now){
  const t=serviceType(rec.type);if(!t)fail(T('Выберите вид работ.'));
  if(!CARS.some(c=>c.id===rec.carId))fail(T('Выберите машину.'));
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(rec.date||''))||!Number.isFinite(Date.parse(rec.date+'T00:00:00Z')))fail(T('Укажите дату.'));
  if(rec.date>addMonths(todayStr(now),0)&&daysBetween(todayStr(now),rec.date)>1)fail(T('Дата не может быть в будущем.'));
  let odo=null;if(rec.odo!=null&&String(rec.odo).trim()!=='')odo=parseOdo(rec.odo);else if(t.needOdo)fail(T('Введите пробег на момент работ.'));
  let cost=null;if(rec.cost!=null&&String(rec.cost).trim()!==''){const c=String(rec.cost).replace(/[\s.,₺]/g,'');if(!/^\d+$/.test(c))fail(T('Стоимость — только цифры.'));cost=Number(c);}
  if(t.id==='other'&&!String(rec.note||'').trim())fail(T('Опишите, что сделали.'));
  const next=upgrade(state);next.service=normService(next.service);
  const d=driver(state,rec.actorId);
  next.service.records.push({id:rec.id||('s-'+Date.now()+'-'+Math.random().toString(36).slice(2,8)),carId:rec.carId,type:t.id,date:rec.date,odo,cost,place:String(rec.place||'').trim().slice(0,80),note:String(rec.note||'').trim().slice(0,250),by:rec.actorId,byName:d?d.name:(managerName(rec.actorId)||T('Руководитель')),at:new Date(now==null?Date.now():now).toISOString()});
  return next;
}
function deleteServiceRecord(state,id){const next=upgrade(state);next.service=normService(next.service);next.service.records=next.service.records.filter(r=>r.id!==id);return next;}
function setIntervals(state,map){
  const next=upgrade(state);next.service=normService(next.service);
  Object.keys(map).forEach(k=>{if(!serviceType(k))return;const v=map[k],km=Number(v.km),mo=Number(v.months);
    if(!Number.isInteger(km)||km<0||km>200000||!Number.isInteger(mo)||mo<0||mo>60)fail(T('Проверьте интервалы: км от 0 до 200 000, месяцы от 0 до 60.'));
    next.service.intervals[k]={km,months:mo};});
  return next;
}
function serviceCosts(state,days,now){
  const end=now==null?Date.now():Number(new Date(now)),from=todayStr(end-days*864e5);
  const recs=normService(state.service).records.filter(r=>r.date>=from&&r.cost!=null);
  return CARS.map(c=>({carId:c.id,cost:recs.filter(r=>r.carId===c.id).reduce((a,r)=>a+r.cost,0),count:recs.filter(r=>r.carId===c.id).length}));
}
const DEFAULT_SETTINGS={shiftEnd:'20:00',transferMinutes:15,tripHours:12};
const ODO_EVENTS=new Set(['init','checkout','park','handover','handover_request','handover_accept']);
const HEX=/^#[0-9a-fA-F]{6}$/;
function fail(message){throw new Error(message);}
function parseOdo(value){const text=String(value==null?'':value).trim().replace(/\s/g,'');if(!/^\d+$/.test(text))fail(T('Введите пробег целым числом, например 127484.'));const number=Number(text);if(!Number.isSafeInteger(number)||number<0)fail(T('Укажите корректный пробег.'));return number;}
function driver(state,id){return state.drivers.find(d=>d.id===id);}
function locationName(id){return (LOCATIONS.find(l=>l.id===id)||{}).name||T('Не указано');}
function location(id){return LOCATIONS.find(l=>l.id===id)||null;}
function issueName(id){return (ISSUE_TYPES.find(l=>l.id===id)||{}).name||T('Замечание');}
function issueType(id){return ISSUE_TYPES.find(l=>l.id===id)||ISSUE_TYPES[3];}
function emptyState(){return {version:1,isDemo:false,settings:{...DEFAULT_SETTINGS},carDetails:{},drivers:[1,2,3,4].map(n=>({id:'d'+n,name:TEAM[n-1]})),events:[],service:{records:[],intervals:{}},places:{},seed:5};}
function upgrade(state){const next=JSON.parse(JSON.stringify(state));next.settings={...DEFAULT_SETTINGS,...next.settings};next.carDetails=next.carDetails||{};next.service=normService(next.service);next.places=normPlaces(next.places);project(next);return next;}
function validateLocation(event){if(!LOCATIONS.some(l=>l.id===event.location))fail(T('Выберите место парковки.'));if(event.location==='other'&&!String(event.spot||'').trim())fail(T('Укажите адрес или место парковки.'));}
function validatePhoto(photo){if(photo!=null&&(!/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(photo)||photo.length>350000))fail(T('Фото должно быть изображением до 250 КБ после обработки.'));}
function keyState(state,event,allowUnknown){
  const kind=event.keyKind||'unknown';
  if(!['driver','security','office','unknown'].includes(kind)||(!allowUnknown&&kind==='unknown'))fail(T('Укажите, где оставили ключи.'));
  let id=null,name=null;
  if(kind==='driver'){
    id=event.keyDriverId||(driver(state,event.actorId)?event.actorId:null);
    const d=driver(state,id);if(!d)fail(T('Укажите водителя, у которого ключи.'));name=event.keyDriverName||d.name;
    if(!isManager(event.actorId)&&id!==event.actorId)fail(T('Можно отметить ключи у себя, на охране или в офисе.'));
  }
  return {kind,driverId:id,driverName:name,note:String(event.keyNote||'').trim(),at:event.at};
}
function heldKeys(event,id,name){return {kind:'driver',driverId:id,driverName:name,note:'',at:event.at};}
function keyLabel(keys,state){if(!keys||keys.kind==='unknown')return T('Не отмечено');if(keys.kind==='driver')return T('У водителя: ')+((state&&driver(state,keys.driverId)||{}).name||keys.driverName);return keys.kind==='security'?T('На охране'):T('В офисе');}
function settingsOf(state){
  const s={...DEFAULT_SETTINGS,...state.settings};
  s.tripHours=Number(s.tripHours);if(!Number.isInteger(s.tripHours)||s.tripHours<1||s.tripHours>72)s.tripHours=12;
  if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(s.shiftEnd)||!Number.isInteger(s.transferMinutes)||s.transferMinutes<1||s.transferMinutes>240)fail(T('Проверьте время конца смены и интервал напоминания.'));
  return s;
}
function project(state){
  if(!state||state.version!==1||!Array.isArray(state.drivers)||state.drivers.length!==4||!Array.isArray(state.events))fail(T('Не удалось прочитать данные.'));
  if(new Set(state.drivers.map(d=>d.id)).size!==4||state.drivers.some(d=>!/^d[1-4]$/.test(d.id)||typeof d.name!=='string'||!d.name.trim()))fail(T('Некорректный список водителей.'));
  settingsOf(state);
  const cars=CARS.map(meta=>{const det=(state.carDetails&&state.carDetails[meta.id])||{};return {...meta,model:String(det.model||''),plate:String(det.plate||''),photo:String(det.photo||''),color:HEX.test(det.color||'')?det.color:meta.color,status:'unconfigured',odo:null,location:null,spot:'',currentDriverId:null,lastPark:null,trip:null,lastTrip:null,updatedAt:null,pendingTransfer:null,keys:{kind:'unknown'},issues:[],lastOdoAt:null};});
  const trips=[],audit=[],seen=new Set(),issues=new Map();
  function busy(id,except){return cars.some(c=>c.id!==except&&(c.currentDriverId===id||(c.pendingTransfer&&c.pendingTransfer.toId===id)));}
  for(const event of state.events){
    if(!event.id||seen.has(event.id))fail(T('В журнале повторяется запись.'));seen.add(event.id);
    if(!Number.isFinite(Date.parse(event.at)))fail(T('Некорректное время события.'));
    const car=cars.find(c=>c.id===event.carId);if(!car)fail(T('Неизвестная машина.'));
    const d=driver(state,event.actorId),record={...event,distance:null};
    if(!isManager(event.actorId)&&!d)fail(T('Сначала выберите водителя.'));
    validatePhoto(event.photo);
    if(event.kind==='wash'){
      if(car.status==='unconfigured')fail(T('Сначала внесите начальные данные машины.'));
      if(!WASH_TYPES.some(t=>t.id===event.washType))fail(T('Выберите, что сделали.'));
      if(!/^\d{4}-\d{2}-\d{2}$/.test(String(event.washDate||''))||!Number.isFinite(Date.parse(event.washDate+'T00:00:00Z')))fail(T('Укажите дату.'));
      if(event.washDate>todayStr(Date.parse(event.at)+864e5))fail(T('Дата не может быть в будущем.'));
      if(event.washType==='other'&&!String(event.note||'').trim())fail(T('Опишите, что сделали.'));
      car.lastWash={at:event.at,date:event.washDate,type:event.washType,by:event.actorName};
    }else if(event.kind==='issue_report'){
      if(car.status==='unconfigured')fail(T('Сначала внесите начальные данные машины.'));
      if(!ISSUE_TYPES.some(t=>t.id===event.issueType))fail(T('Выберите тип замечания.'));
      if(event.issueType!=='fuel'&&!String(event.note||'').trim())fail(T('Кратко опишите замечание.'));
      const issue={id:event.id,carId:car.id,type:event.issueType,text:event.note||issueName(event.issueType),at:event.at,authorId:event.actorId,authorName:event.actorName,photo:event.photo||null,status:'open'};
      car.issues.push(issue);issues.set(issue.id,issue);
    }else if(event.kind==='issue_resolve'){
      const issue=issues.get(event.issueId);if(!issue||issue.carId!==car.id||issue.status!=='open')fail(T('Замечание уже закрыто или не найдено.'));
      if(!String(event.note||'').trim())fail(T('Укажите, что сделано.'));
      Object.assign(issue,{status:'resolved',resolvedAt:event.at,resolvedById:event.actorId,resolvedByName:event.actorName,resolution:event.note});
      record.issueType=issue.type;record.issueText=issue.text;
    }else if(event.kind==='keys'){
      if(car.status==='unconfigured')fail(T('Сначала внесите начальные данные машины.'));
      if(car.pendingTransfer)fail(T('Сначала завершите или отмените передачу машины.'));
      if(car.status==='driving'&&car.currentDriverId!==event.actorId)fail(T('Ключи в поездке отмечает текущий водитель.'));
      car.keys=keyState(state,event,false);
    }else if(event.kind==='handover_cancel'||event.kind==='handover_decline'){
      const pending=car.pendingTransfer;
      if(!pending||event.requestId!==pending.id)fail(T('Эта передача уже завершена или отменена.'));
      if(event.actorId!==(event.kind==='handover_cancel'?pending.fromId:pending.toId))fail(T('Действие недоступно этому водителю.'));
      record.fromId=pending.fromId;record.toId=pending.toId;record.fromName=pending.fromName;record.toName=pending.toName;car.pendingTransfer=null;
    }else if(event.kind==='odo_fix'){
      if(!isManager(event.actorId))fail(T('Пробег исправляет руководство.'));
      if(car.status==='unconfigured')fail(T('Сначала внесите начальные данные машины.'));
      if(car.status==='driving'||car.pendingTransfer)fail(T('Пробег можно исправить, когда машина стоит на паркинге.'));
      const odo=parseOdo(event.odo);if(odo===car.odo)fail(T('Пробег не изменился.'));
      if(!String(event.note||'').trim())fail(T('Укажите причину исправления.'));
      record.prevOdo=car.odo;car.odo=odo;car.lastOdoAt=event.at;
    }else if(ODO_EVENTS.has(event.kind)){
      const odo=parseOdo(event.odo);
      if(car.odo!==null&&odo<car.odo)fail(T('Пробег не может быть меньше последней записи: ')+car.odo+T(' км.'));
      if(event.kind==='init'){
        if(!isManager(event.actorId))fail(T('Начальные данные вводит руководитель.'));
        if(car.status!=='unconfigured')fail(T('Начальные данные этой машины уже внесены.'));
        validateLocation(event);
        if(event.parkedById&&!driver(state,event.parkedById))fail(T('Неизвестный водитель.'));
        car.status='parked';car.location=event.location;car.spot=event.spot;
        car.lastPark={at:event.at,driverId:event.parkedById||null,driverName:event.parkedByName||null,initial:true};
        car.keys=keyState(state,event,true);
      }else{
        if(!d)fail(T('Сначала выберите водителя.'));
        if(event.kind==='checkout'){
          if(car.status!=='parked'&&car.status!=='unconfigured')fail(T('Машина уже в поездке.'));
          if(busy(d.id,car.id))fail(T('За вами уже числится другая машина или ожидается передача. Сначала завершите действие.'));
          record.odoGap=car.odo==null?0:odo-car.odo;record.fromLocation=car.location;record.fromSpot=car.spot;
          car.trip={id:event.id,carId:car.id,startAt:event.at,startOdo:odo,fromLocation:car.location,fromSpot:car.spot,segments:[],segment:{driverId:d.id,driverName:event.actorName,startAt:event.at,startOdo:odo}};
          car.status='driving';car.currentDriverId=d.id;car.location=null;car.spot='';car.keys=heldKeys(event,d.id,event.actorName);
        }else if(event.kind==='handover_accept'){
          const pending=car.pendingTransfer;
          if(!pending||pending.id!==event.requestId)fail(T('Эта передача уже завершена или отменена.'));
          if(pending.toId!==d.id)fail(T('Принять машину может только выбранный получатель.'));
          if(busy(d.id,car.id))fail(T('У вас уже есть другая машина или ожидаемая передача.'));
          const segment={...car.trip.segment,endAt:event.at,endOdo:odo,distance:odo-car.trip.segment.startOdo};
          car.trip.segments.push(segment);record.distance=segment.distance;record.fromId=pending.fromId;record.fromName=pending.fromName;record.toName=event.actorName;
          car.trip.segment={driverId:d.id,driverName:event.actorName,startAt:event.at,startOdo:odo};car.currentDriverId=d.id;car.keys=heldKeys(event,d.id,event.actorName);car.pendingTransfer=null;
        }else{
          if(car.status!=='driving')fail(T('Машина сейчас не в поездке.'));
          if(car.currentDriverId!==d.id)fail(T('Действие доступно только водителю, за которым числится машина.'));
          if(car.pendingTransfer)fail(T('Ожидается принятие машины. Сначала завершите или отмените передачу.'));
          if(event.kind==='handover_request'){
            const target=driver(state,event.toId);if(!target||target.id===d.id)fail(T('Выберите другого водителя.'));
            if(busy(target.id,car.id))fail(T('У этого водителя уже есть машина или ожидаемая передача.'));
            car.pendingTransfer={id:event.id,at:event.at,fromId:d.id,fromName:event.actorName,toId:target.id,toName:event.toName,odo,note:event.note||''};
          }else{
            const segment={...car.trip.segment,endAt:event.at,endOdo:odo,distance:odo-car.trip.segment.startOdo};
            record.distance=segment.distance;
            if(event.kind==='handover'){
              // Совместимость с передачами из первой версии ChatGPT.
              const target=driver(state,event.toId);if(!target||target.id===d.id)fail(T('Выберите другого водителя.'));
              if(busy(target.id,car.id))fail(T('У этого водителя уже есть машина в поездке.'));
              car.trip.segments.push(segment);car.trip.segment={driverId:target.id,driverName:event.toName,startAt:event.at,startOdo:odo};car.currentDriverId=target.id;car.keys=heldKeys(event,target.id,event.toName);
            }else{
              validateLocation(event);car.trip.segments.push(segment);
              const completed={...car.trip,endAt:event.at,endOdo:odo,toLocation:event.location,spot:event.spot,distance:odo-car.trip.startOdo,parkedById:d.id,parkedByName:event.actorName};delete completed.segment;
              trips.push(completed);car.lastTrip=completed;car.trip=null;car.status='parked';car.currentDriverId=null;car.location=event.location;car.spot=event.spot;
              car.lastPark={at:event.at,driverId:d.id,driverName:event.actorName,initial:false};car.keys=keyState(state,event,true);
            }
          }
        }
      }
      car.odo=odo;car.lastOdoAt=event.at;
    }else fail(T('Неизвестное действие.'));
    car.updatedAt=event.at;audit.push(record);
  }
  return {cars,trips,audit};
}
function transact(state,command,now){
  project(state);const d=driver(state,command.actorId),target=driver(state,command.toId),keyDriver=driver(state,command.keyDriverId||command.actorId);
  const event={id:command.id||('e-'+Date.now()+'-'+Math.random().toString(36).slice(2,10)),at:now||new Date().toISOString(),kind:command.kind,carId:command.carId,actorId:command.actorId,actorName:d?d.name:(managerName(command.actorId)||T('Руководитель')),odo:(ODO_EVENTS.has(command.kind)||command.kind==='odo_fix')?parseOdo(command.odo):null,location:command.location||null,spot:String(command.spot||'').trim().slice(0,160),note:String(command.note||'').trim().slice(0,250)};
  if(command.toId){event.toId=command.toId;event.toName=target?target.name:'';}
  if(command.requestId)event.requestId=command.requestId;
  if(command.parkedById){const parked=driver(state,command.parkedById);event.parkedById=command.parkedById;event.parkedByName=parked?parked.name:'';}
  if(command.keyKind){event.keyKind=command.keyKind;event.keyDriverId=keyDriver?keyDriver.id:null;event.keyDriverName=keyDriver?keyDriver.name:null;event.keyNote=String(command.keyNote||'').trim().slice(0,100);}
  if(command.issueType)event.issueType=command.issueType;
  if(command.washType)event.washType=String(command.washType);
  if(command.washDate)event.washDate=String(command.washDate).slice(0,10);
  if(command.issueId)event.issueId=command.issueId;
  if(command.photo){validatePhoto(command.photo);event.photo=command.photo;}
  if(command.kind==='park'&&(!command.keyKind||command.keyKind==='unknown'))fail(T('Укажите, где оставили ключи.'));
  const next=upgrade(state);next.events.push(event);project(next);return next;
}
function renameDriver(state,id,name){
  const next=upgrade(state),d=driver(next,id);if(!d)fail(T('Водитель не найден.'));name=String(name||'').trim();if(!name||name.length>40)fail(T('Укажите имя длиной от 1 до 40 символов.'));
  if(next.drivers.some(x=>x.id!==id&&x.name.toLocaleLowerCase('ru')===name.toLocaleLowerCase('ru')))fail(T('Такое имя уже есть. Добавьте фамилию или инициал.'));
  d.name=name;return next;
}
function setSettings(state,value){const next=upgrade(state);next.settings={shiftEnd:value.shiftEnd||'20:00',transferMinutes:Number(value.transferMinutes),tripHours:Number(value.tripHours||12)};if(!Number.isInteger(next.settings.tripHours)||next.settings.tripHours<1||next.settings.tripHours>72)fail(T('Укажите от 1 до 72 часов.'));settingsOf(next);return next;}
function setCarDetails(state,id,value){
  if(!CARS.some(c=>c.id===id))fail(T('Машина не найдена.'));
  const next=upgrade(state),color=String(value.color||'');
  if(color&&!HEX.test(color))fail(T('Выберите цвет из списка.'));
  const photo=value.photo?String(value.photo):'';validatePhoto(photo||null);
  next.carDetails[id]={model:String(value.model||'').trim().slice(0,60),plate:String(value.plate||'').trim().toUpperCase().slice(0,24),color:color,photo:photo};
  return next;
}
function localParts(date){const parts=new Intl.DateTimeFormat('en-GB',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZone:'Europe/Istanbul'}).formatToParts(new Date(date));return Object.fromEntries(parts.filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));}
function shortStamp(date){const p=localParts(date);return p.day+'.'+p.month+', '+p.hour+':'+p.minute;}
const SEV_ORDER={crit:0,warn:1,info:2};
function attention(state,now){
  const p=project(state),settings=settingsOf(state),date=now==null?Date.now():Number(new Date(now)),parts=localParts(date),today=parts.year+parts.month+parts.day,clock=parts.hour+':'+parts.minute,result=[];
  for(const car of p.cars){
    if(car.pendingTransfer){const pending=car.pendingTransfer,minutes=Math.max(0,Math.floor((date-Date.parse(pending.at))/60000)),overdue=minutes>=settings.transferMinutes;result.push({kind:'transfer',sev:overdue?'warn':'info',icon:'swap',carId:car.id,title:T('Передача ')+car.name+T(' ждёт принятия'),text:pending.fromName+' → '+pending.toName+' · '+minutes+T(' мин'),overdue,actorIds:[pending.fromId,pending.toId],at:pending.at});}
    if(car.status==='driving'){const hrs=Math.floor((date-Date.parse(car.trip.startAt))/36e5);if(hrs>=settings.tripHours)result.push({kind:'shift',sev:'warn',icon:'clock',carId:car.id,title:car.name+T(': поездка не закрыта'),text:T('В пути ')+hrs+T(' ч')+' · '+((driver(state,car.currentDriverId)||{}).name||''),overdue:true,actorIds:[car.currentDriverId],at:car.trip.startAt});}
    for(const issue of car.issues.filter(i=>i.status==='open')){const t=issueType(issue.type);result.push({kind:'issue',sev:t.sev,icon:t.icon,carId:car.id,issueId:issue.id,title:car.name+': '+t.name.toLowerCase(),text:issue.text+' · '+issue.authorName,overdue:false,actorIds:[car.currentDriverId,car.lastPark&&car.lastPark.driverId,car.pendingTransfer&&car.pendingTransfer.toId].filter(Boolean),at:issue.at});}
    if(car.status==='unconfigured')result.push({kind:'setup',sev:'info',icon:'pin',carId:car.id,title:car.name+T(': нужны начальные данные'),text:T('Укажите расположение и пробег.'),overdue:false,actorIds:[],at:''});
    if(car.status==='parked'&&car.keys&&car.keys.kind==='driver')result.push({kind:'keys',sev:'info',icon:'key',carId:car.id,title:T('Ключи от ')+car.name+T(' у водителя'),text:(driver(state,car.keys.driverId)||{}).name+T(' · машина: ')+locationName(car.location)+(car.spot?', '+car.spot:''),overdue:false,actorIds:[car.keys.driverId],at:car.keys.at||''});
  }
  for(const e of p.audit){
    if(e.kind!=='checkout'||!(e.odoGap>0)||date-Date.parse(e.at)>7*864e5)continue;
    const car=p.cars.find(c=>c.id===e.carId);
    result.push({kind:'gap',sev:'warn',icon:'alert',carId:e.carId,title:car.name+': +'+e.odoGap+T(' км без записи'),text:T('Пробег вырос между записями. Выехал ')+e.actorName+', '+shortStamp(e.at),overdue:false,actorIds:[],at:e.at});
  }
  result.sort((a,b)=>(SEV_ORDER[a.sev]-SEV_ORDER[b.sev])||(String(b.at)>String(a.at)?1:String(b.at)<String(a.at)?-1:0));
  return result;
}
function stats(state,days,now){
  const p=project(state),end=now==null?Date.now():Number(new Date(now)),start=end-days*864e5;
  const segs=[];
  p.trips.forEach(t=>t.segments.forEach(s=>segs.push({carId:t.carId,driverId:s.driverId,distance:s.distance,endAt:s.endAt})));
  p.cars.forEach(c=>{if(c.trip)c.trip.segments.forEach(s=>segs.push({carId:c.id,driverId:s.driverId,distance:s.distance,endAt:s.endAt}));});
  const inPeriod=t=>{const x=Date.parse(t);return x>=start&&x<=end;};
  const periodSegs=segs.filter(s=>inPeriod(s.endAt));
  const gaps=p.audit.filter(e=>e.kind==='checkout'&&e.odoGap>0&&inPeriod(e.at));
  const sum=a=>a.reduce((x,y)=>x+y,0);
  const cars=p.cars.map(c=>{const sg=periodSegs.filter(s=>s.carId===c.id),gp=gaps.filter(g=>g.carId===c.id),logged=sum(sg.map(s=>s.distance)),unlogged=sum(gp.map(g=>g.odoGap));return {car:c,logged,unlogged,total:logged+unlogged,trips:p.trips.filter(t=>t.carId===c.id&&inPeriod(t.endAt)).length};});
  const drivers=state.drivers.map(d=>{const sg=periodSegs.filter(s=>s.driverId===d.id);return {driver:d,km:sum(sg.map(s=>s.distance)),trips:sg.length};});
  const key=t=>{const x=localParts(t);return x.year+'-'+x.month+'-'+x.day;};
  const daily=[];for(let i=days-1;i>=0;i--){const t=end-i*864e5;daily.push({key:key(t),ts:t,km:0});}
  const idx={};daily.forEach((d,i)=>{idx[d.key]=i;});
  periodSegs.forEach(s=>{const k=key(Date.parse(s.endAt));if(k in idx)daily[idx[k]].km+=s.distance;});
  return {cars,drivers,daily,logged:sum(cars.map(c=>c.logged)),unlogged:sum(cars.map(c=>c.unlogged)),trips:sum(cars.map(c=>c.trips))};
}
const DEMO_DETAILS={bmw:{model:'iX',plate:'34 ML 5050',color:''},audi:{model:'A6',plate:'34 HRZ 549',color:''},fiat:{model:'Egea',plate:'34 GRA 342',color:''},skoda:{model:'Superb L&K',plate:'34 MDH 491',color:''}};
function driverStats(state,did,days,now){
  const p=project(state),end=now==null?Date.now():Number(new Date(now)),start=end-days*864e5;
  const segs=[];
  p.trips.forEach(t=>t.segments.forEach(s=>segs.push({carId:t.carId,driverId:s.driverId,distance:s.distance,startAt:s.startAt,endAt:s.endAt})));
  p.cars.forEach(c=>{if(c.trip)c.trip.segments.forEach(s=>segs.push({carId:c.id,driverId:s.driverId,distance:s.distance,startAt:s.startAt,endAt:s.endAt}));});
  const mine=segs.filter(s=>s.driverId===did&&Date.parse(s.endAt)>=start&&Date.parse(s.endAt)<=end);
  const byCar=p.cars.map(c=>{const l=mine.filter(s=>s.carId===c.id);return {car:c,km:l.reduce((a,s)=>a+s.distance,0),trips:l.length};});
  const timeMs=mine.reduce((a,s)=>a+(Date.parse(s.endAt)-Date.parse(s.startAt)),0);
  const audit=p.audit.filter(e=>Date.parse(e.at)>=start&&Date.parse(e.at)<=end);
  return {
    km:mine.reduce((a,s)=>a+s.distance,0),trips:mine.length,timeMs,byCar,
    parks:audit.filter(e=>e.kind==='park'&&e.actorId===did).length,
    handoversOut:audit.filter(e=>e.kind==='handover_accept'&&e.fromId===did).length,
    handoversIn:audit.filter(e=>e.kind==='handover_accept'&&e.actorId===did).length,
    issues:audit.filter(e=>e.kind==='issue_report'&&e.actorId===did).length,
    gaps:audit.filter(e=>e.kind==='checkout'&&e.actorId===did&&e.odoGap>0).map(e=>({carId:e.carId,km:e.odoGap,at:e.at}))
  };
}
function rng(seed){return function(){seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function shuffle(a,R){a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(R()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function demoState(now){
  const base=now==null?Date.now():Number(new Date(now)),DAY=864e5,H=36e5,M=6e4,R=rng(20261018);
  let s=emptyState();s.isDemo=true;s.carDetails=JSON.parse(JSON.stringify(DEMO_DETAILS));s.places=JSON.parse(JSON.stringify(DEMO_PLACES));let seq=0;
  const run=(t,cmd)=>{try{s=transact(s,{id:'sample-'+(++seq),...cmd},new Date(t).toISOString());return true;}catch(e){return false;}};
  const SPOTS={vadi:[T('−1 этаж, место 12'),T('−2 этаж, место 18'),T('у въезда')],teras:[T('−1 этаж, место 7'),T('крыша, место 3'),T('у лифта')],chamly:[T('двор, место 2'),T('у шлагбаума'),T('двор, место 5')]};
  const spot=l=>SPOTS[l][Math.floor(R()*SPOTS[l].length)];
  const odo={};
  const t0=base-8*DAY-13*H;
  [['bmw',184112,'teras'],['audi',91874,'vadi'],['fiat',61430,'chamly'],['skoda',133790,'vadi']].forEach(([id,km,loc],i)=>{run(t0+i*4*M,{kind:'init',carId:id,actorId:'manager',odo:km,location:loc,spot:spot(loc),keyKind:'security'});odo[id]=km;});
  let gapDone=false,hoDone=false,damageId=null,damageDay=0,resolved=false;
  for(let d=7;d>=1;d--){
    const dayBase=base-d*DAY-11*H,slots=2+(R()<.5?1:0);
    for(let sl=0;sl<slots;sl++){
      const tStart=dayBase+sl*204*M+Math.floor(R()*30)*M,n=R()<.45?2:1;
      const cars=shuffle(CARS.map(c=>c.id),R).slice(0,n),drv=shuffle(['d1','d2','d3','d4'],R),plan=[];
      cars.forEach((cid,i)=>{
        const did=drv[i];let km=odo[cid];
        if(!gapDone&&d<=4&&cid==='skoda'){km+=42;gapDone=true;}
        const ts=tStart+i*17*M,dist=14+Math.floor(R()*66),len=(50+Math.floor(R()*70))*M;
        plan.push({t:ts,cmd:{kind:'checkout',carId:cid,actorId:did,odo:km}});
        let parkBy=did,endTs=ts+len;
        if(!hoDone&&d<=5&&cid==='bmw'&&drv[n]){
          const to=drv[n],half=Math.floor(dist/2),hts=ts+Math.floor(len*.45);
          plan.push({t:hts,cmd:{kind:'handover_request',carId:cid,actorId:did,toId:to,odo:km+half,note:T('Передача у офиса')}});
          plan.push({t:hts+4*M,cmd:{kind:'handover_accept',carId:cid,actorId:to,odo:km+half},accept:true});
          parkBy=to;endTs=hts+4*M+Math.floor(len*.6);hoDone=true;
        }
        const loc=PARKINGS[Math.floor(R()*3)];
        plan.push({t:endTs,cmd:{kind:'park',carId:cid,actorId:parkBy,odo:km+dist,location:loc,spot:spot(loc),keyKind:R()<.86?'security':'office'},park:cid});
        odo[cid]=km+dist;
      });
      plan.sort((a,b)=>a.t-b.t).forEach(x=>{
        if(x.accept){const c=project(s).cars.find(c=>c.id===x.cmd.carId);if(c.pendingTransfer)x.cmd.requestId=c.pendingTransfer.id;}
        const ok=run(x.t,x.cmd);
        if(ok&&x.park==='audi'&&!damageId&&d<=5){if(run(x.t+3*M,{kind:'issue_report',carId:'audi',actorId:x.cmd.actorId,issueType:'damage',note:T('Царапина на заднем бампере')})){damageId='sample-'+seq;damageDay=d;}}
      });
    }
    if(damageId&&!resolved&&d<damageDay&&d<=3){run(dayBase+10*H,{kind:'issue_resolve',carId:'audi',actorId:'manager',issueId:damageId,note:T('Заполировали в сервисе')});resolved=true;}
  }
  run(base-7*H,{kind:'checkout',carId:'fiat',actorId:'d3',odo:odo.fiat});
  run(base-6*H-10*M,{kind:'park',carId:'fiat',actorId:'d3',odo:odo.fiat+31,location:'chamly',spot:T('двор, место 2'),keyKind:'security'});
  run(base-6*H-8*M,{kind:'issue_report',carId:'fiat',actorId:'d3',issueType:'fuel',note:T('Заправить перед следующей поездкой')});
  run(base-5*H-20*M,{kind:'checkout',carId:'skoda',actorId:'d4',odo:odo.skoda});
  run(base-3*H-5*M,{kind:'park',carId:'skoda',actorId:'d4',odo:odo.skoda+47,location:'vadi',spot:T('−2 этаж, место 18'),keyKind:'driver'});
  run(base-2*H-12*M,{kind:'checkout',carId:'audi',actorId:'d2',odo:odo.audi,note:T('Встреча в аэропорту')});
  run(base-98*M,{kind:'checkout',carId:'bmw',actorId:'d1',odo:odo.bmw});
  run(base-6*M,{kind:'handover_request',carId:'bmw',actorId:'d1',toId:'d3',odo:odo.bmw+23,note:T('Передам у офиса')});
  const ago=(days)=>todayStr(base-days*864e5);let sq=0;
  const sv=(carId,type,days,odoV,cost,place,note,by)=>{try{s=addServiceRecord(s,{id:'svc-'+(++sq),carId,type,date:ago(days),odo:odoV,cost,place,note,actorId:by||'manager'},base);}catch(e){}};
  const cur=project(s).cars.reduce((m,c)=>{m[c.id]=c.odo;return m;},{});
  sv('bmw','maint',300,cur.bmw-12400,14500,'Borusan Otomotiv',T('Плановое ТО, проверка батареи'),'manager');
  sv('bmw','tires',168,cur.bmw-6100,2400,'Borusan Otomotiv',T('Летние шины'),'d1');
  sv('bmw','brakes',300,cur.bmw-12400,9800,'Borusan Otomotiv','','manager');
  sv('bmw','muayene',60,null,2450,'TÜVTÜRK Kağıthane','','d1');
  sv('bmw','trafik',240,null,11800,'Anadolu Sigorta','','manager');
  sv('bmw','kasko',240,null,96000,'Anadolu Sigorta','','manager');
  sv('audi','maint',330,cur.audi-14114,12900,'Doğuş Oto',T('Масло, фильтры'),'manager');
  sv('audi','tires',20,cur.audi-450,2200,'Doğuş Oto',T('Зимние шины'),'d2');
  sv('audi','brakes',400,cur.audi-21000,7600,'Doğuş Oto','','manager');
  sv('audi','muayene',200,null,2450,'TÜVTÜRK Kağıthane','','d2');
  sv('audi','trafik',350,null,9900,'Axa Sigorta','','manager');
  sv('audi','kasko',350,null,58000,'Axa Sigorta','','manager');
  sv('fiat','maint',140,cur.fiat-3400,6800,'Sezgin Oto',T('Масло, фильтры, свечи'),'d3');
  sv('fiat','tires',40,cur.fiat-700,1900,'Sezgin Oto','','d3');
  sv('fiat','brakes',260,cur.fiat-9800,4200,'Sezgin Oto','','manager');
  sv('fiat','muayene',745,null,2100,'TÜVTÜRK Kağıthane','','manager');
  sv('fiat','trafik',100,null,7400,'Allianz','','manager');
  sv('fiat','kasko',100,null,24000,'Allianz','','manager');
  sv('skoda','maint',70,cur.skoda-2200,9400,'Doğuş Oto',T('Первое ТО'),'manager');
  sv('skoda','tires',35,cur.skoda-900,2300,'Doğuş Oto','','d4');
  sv('skoda','muayene',90,null,2450,'TÜVTÜRK Kağıthane','','manager');
  sv('skoda','trafik',30,null,10600,'Axa Sigorta','','manager');
  sv('skoda','kasko',30,null,61000,'Axa Sigorta','','manager');
  return s;
}
root.FleetCore={WASH_TYPES,washName,DEMO_PLACES,MANAGERS,isManager,managerName,GEO_BOX,parseGeo,setPlace,normPlaces,inGeoBox,DEMO_DETAILS,TEAM,driverStats,SERVICE_TYPES,serviceType,serviceStatus,addServiceRecord,deleteServiceRecord,setIntervals,intervalOf,serviceCosts,todayStr,normService,CARS,LOCATIONS,PARKINGS,ISSUE_TYPES,emptyState,upgrade,demoState,project,transact,renameDriver,parseOdo,driver,location,locationName,issueName,issueType,keyLabel,setSettings,setCarDetails,settingsOf,attention,stats,localParts};
})(typeof window!=='undefined'?window:globalThis);
