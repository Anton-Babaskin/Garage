(function(){
'use strict';
const F=window.FleetCore;
const APP_VERSION=34;
/* фото ваших машин: вырезаны из присланных снимков */
const CAR_PHOTOS=window.CAR_PHOTOS||{};
const KEY='garage-team-v2',LEGACY='garage-team-demo-v1',ROLE_KEY='garage-team-role-v1';
const TZ='Europe/Istanbul',DAY=864e5,H=36e5,M=6e4;
const $=s=>document.querySelector(s);
const esc=v=>String(v==null?'':dn(v)).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const nf=new Intl.NumberFormat(LOC);
const fmt=v=>v==null?'—':nf.format(v);
const tFmt=new Intl.DateTimeFormat(LOC,{timeZone:TZ,hour:'2-digit',minute:'2-digit'});
const dShort=new Intl.DateTimeFormat(LOC,{timeZone:TZ,day:'numeric',month:'short'});
const dLong=new Intl.DateTimeFormat(LOC,{timeZone:TZ,weekday:'long',day:'numeric',month:'long'});
const dDayW=new Intl.DateTimeFormat(LOC,{timeZone:TZ,weekday:'short'});
const dNum=new Intl.DateTimeFormat(LOC,{timeZone:TZ,day:'numeric'});
const kFmt=new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'});
const fullFmt=new Intl.DateTimeFormat(LOC,{timeZone:TZ,day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
const ts=iso=>typeof iso==='number'?iso:Date.parse(iso);
const dayKey=t=>kFmt.format(ts(t));
const cap=s=>s.charAt(0).toUpperCase()+s.slice(1);
function when(t){t=ts(t);const k=dayKey(t);if(k===dayKey(NOW))return T('сегодня в ')+tFmt.format(t);if(k===dayKey(NOW-DAY))return T('вчера в ')+tFmt.format(t);return dShort.format(t)+T(' в ')+tFmt.format(t);}
function ago(t){t=ts(t);const m=Math.round((NOW-t)/M);if(m<1)return T('только что');if(m<60)return m+T(' мин назад');const h=Math.floor(m/60);if(h<24)return h+T(' ч назад');return when(t);}
function dur(ms){const m=Math.max(1,Math.round(ms/M));if(m<60)return m+T(' мин');const h=Math.floor(m/60),mm=m%60;if(h<24)return mm?h+T(' ч ')+mm+T(' мин'):h+T(' ч');const d=Math.floor(h/24);return d+T(' д ')+(h%24)+T(' ч');}
function plural(n,a,b,c){const m10=n%10,m100=n%100;return n+' '+((m10===1&&m100!==11)?a:(m10>=2&&m10<=4&&(m100<10||m100>=20))?b:c);}
const mq=window.matchMedia?window.matchMedia('(max-width: 759px)'):null;
let narrow=mq?mq.matches:false;
const framed=(()=>{try{return window.top!==window;}catch(e){return true;}})();

/* ───────── theme: светлая по умолчанию, тёмная только по кнопке ───────── */
let theme='light';try{theme=localStorage.getItem('garage-theme')==='dark'?'dark':'light';}catch(e){}
function applyTheme(){document.documentElement.setAttribute('data-app-theme',theme);const m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute('content',theme==='dark'?'#181A1D':'#FFFFFF');}
applyTheme();

/* ───────── state ───────── */
let state,storageOK=true,storageError='';
const SRV=!!window.GARAGE_SERVER;
if(SRV){state=F.emptyState();}else try{
  let raw=localStorage.getItem(KEY);
  if(!raw)raw=localStorage.getItem(LEGACY);
  state=raw?F.upgrade(JSON.parse(raw)):F.demoState();
  localStorage.setItem(KEY,JSON.stringify(state));
}catch(e){
  try{state=F.demoState();}catch(e2){state=F.emptyState();}
  storageOK=false;storageError=T('Сохранение в браузере недоступно. Изменения действуют до закрытия страницы. Сохраните копию данных перед выходом.');
}
try{
  if(state.isDemo&&(state.seed||0)<5){state=F.demoState();localStorage.setItem(KEY,JSON.stringify(state));}
  if((state.seed||0)<2){
    if(state.isDemo){state=F.demoState();}
    else{
      const next=JSON.parse(JSON.stringify(state));
      next.drivers.forEach((d,i)=>{if(/^Водитель\s*\d$/.test(d.name)&&F.TEAM[i])d.name=F.TEAM[i];});
      const OLD=['34 AVP 184','34 BKR 091','34 FTN 614','34 SKD 133'];
      Object.keys(F.DEMO_DETAILS).forEach(k=>{const d=next.carDetails[k]||{};if(!d.plate||OLD.indexOf(d.plate)>=0)next.carDetails[k]=Object.assign({},F.DEMO_DETAILS[k],{color:d.color||''});else if(!d.model)d.model=F.DEMO_DETAILS[k].model;});
      next.seed=2;state=F.upgrade(next);
    }
    localStorage.setItem(KEY,JSON.stringify(state));
  }
}catch(e){}
try{if(localStorage.getItem('garage-regen')==='1'){localStorage.removeItem('garage-regen');if(state.isDemo){state=F.demoState();localStorage.setItem(KEY,JSON.stringify(state));}}}catch(e){}
const isMgr=id=>F.isManager(id);
const mqWide=window.matchMedia?window.matchMedia('(min-width: 1100px)'):null;
let wide=mqWide?mqWide.matches:false,lastView=null;
let role='manager';try{role=localStorage.getItem(ROLE_KEY)||'manager';}catch(e){}
const VIEWS=['mine','cars','wash','park','journal','stats','service','team'];
let view=null;
(function readHash(){
  const h=(location.hash||'').replace('#','');
  const m=h.match(/^(?:driver=)?(d[1-4])$/);if(m)role=m[1];
  if(F.isManager(h))role=h;
  if(VIEWS.indexOf(h)>=0)view=h;
})();
if(!isMgr(role)&&!F.driver(state,role))role='manager';
if(!view)view=isMgr(role)?'cars':'mine';
const ui={svcCar:'',filter:'all',journalMode:'events',filterCar:'all',filterDriver:'all',statsDays:7,flash:null};
let P=null,NOW=Date.now();
let photoData=null,photoBusy=false,photoSeq=0;
let parkedPhotoSeq=0,parkPhotoData=null,serverResetBusy=false;

function persist(next){
  if(storageOK&&!SRV){try{localStorage.setItem(KEY,JSON.stringify(next));}catch(e){throw new Error(T('Не хватает памяти браузера для сохранения. Уберите прикреплённое фото и повторите. Журнал не изменён.'));}}
  state=next;render();
}
function setRole(id){
  role=id;view=isMgr(role)?'cars':'mine';ui.filter='all';
  try{localStorage.setItem(ROLE_KEY,role);}catch(e){}
  render();window.scrollTo(0,0);
}

/* ───────── atoms ───────── */
const ICON={
  key:'<circle cx="7.5" cy="15.5" r="4.5"/><path d="M10.7 12.3 20 3M16 7l3 3M13.5 9.5l2 2"/>',
  fuel:'<path d="M4 21V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v16M3 21h13M4 10h11"/><path d="M15 8h2a2 2 0 0 1 2 2v7a1.5 1.5 0 0 0 3 0V9l-3-3"/>',
  alert:'<path d="M12 3 2 20h20L12 3z"/><path d="M12 10v4M12 17h.01"/>',
  wrench:'<path d="M14.7 6.3a4 4 0 0 0-5.4 5.2L3 17.8V21h3.2l6.3-6.3a4 4 0 0 0 5.2-5.4l-2.5 2.5-2.6-.6-.6-2.6z"/>',
  flag:'<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  arrow:'<path d="M5 12h14M13 6l6 6-6 6"/>',
  swap:'<path d="M4 8h14l-3-3M20 16H6l3 3"/>',
  park:'<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M9 17V7h4a3 3 0 0 1 0 6H9"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  check:'<path d="M4 12.5l5 5L20 6.5"/>',
  x:'<path d="M6 6l12 12M18 6 6 18"/>',
  download:'<path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/>',
  upload:'<path d="M12 15V3m-5 5 5-5 5 5M4 17v4h16v-4"/>',
  grid:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  list:'<path d="M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
  chart:'<path d="M3 3v18h18"/><path d="M8 16v-4M13 16V8M18 16v-7"/>',
  users:'<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-4-6"/>',
  user:'<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  pin:'<path d="M12 21s7-6.1 7-12a7 7 0 0 0-14 0c0 5.9 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/>',
  chev:'<path d="M6 9l6 6 6-6"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  camera:'<path d="M3 8h4l2-3h6l2 3h4v12H3z"/><circle cx="12" cy="13" r="3.5"/>',
  image:'<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>',
  edit:'<path d="m15 4 5 5L9 20H4v-5z"/>',
  bell:'<path d="M5 17h14l-1.5-3V10a5.5 5.5 0 0 0-11 0v4zM10 20.5h4"/>',
  link:'<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon:'<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  tire:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M12 3v5M12 16v5M3 12h5M16 12h5"/>',
  disc:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2"/><path d="M7 6.5A7 7 0 0 1 17 6.5"/>',
  badge:'<path d="M12 3l2.6 1.9 3.2-.2.9 3.1 2.6 1.9-1.2 3 1.2 3-2.6 1.9-.9 3.1-3.2-.2L12 21l-2.6-1.9-3.2.2-.9-3.1L2.7 14.3l1.2-3-1.2-3 2.6-1.9.9-3.1 3.2.2z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
  shield:'<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
  trash:'<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  sliders:'<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  globe:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/>',
  map:'<path d="M9 4 3 6.5V20l6-2.5 6 2.5 6-2.5V4l-6 2.5z"/><path d="M9 4v13.5M15 6.5V20"/>',
  minus:'<path d="M5 12h14"/>',
  fit:'<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  target:'<circle cx="12" cy="12" r="7"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/><circle cx="12" cy="12" r="1.5"/>',
  ext:'<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  share:'<path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>',
  table:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M9 4v16"/>',
  menu:'<path d="M4 7h16M4 12h16M4 17h16"/>',
  drop:'<path d="M12 3.5s6 6.4 6 10.6a6 6 0 0 1-12 0c0-4.2 6-10.6 6-10.6z"/>',
  copy:'<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>'
};
const ic=(n,c)=>'<svg class="ic'+(c?' '+c:'')+'" viewBox="0 0 24 24" aria-hidden="true">'+(ICON[n]||'')+'</svg>';


/* силуэты моделей в профиль: перед справа, земля внизу */
const PROFILES={
  bmw:{ /* BMW iX — высокий кроссовер, плоская крыша, короткий капот */
    body:'M10 57C9 49 11 41 16 36C20 27 28 18 40 15C62 11 108 11 128 13C138 14 146 19 154 27L161 34L180 38C188 40 193 45 194 52L194 58C194 61 192 63 189 63L176 63A17 17 0 0 0 142 63L64 63A17 17 0 0 0 30 63L14 63C11 63 10 61 10 57Z',
    glass:'M26 36C30 28 36 21 44 19C64 16 106 16 124 18C133 19 140 23 146 29L152 36Z',
    pillars:[66,108],py:[17,36],wheels:[[159,63,15],[47,63,15]],ground:78,
    head:'M181 40L192 43L192 46L180 44Z',tail:'M11 38L20 37L20 41L11 42Z',
    extra:'<path d="M188 41L194 44L194 54L189 54Z" fill="#0E0F11"/>',trim:false,handles:[86,126],hy:40},
  audi:{ /* Audi A6 — длинный низкий седан */
    body:'M10 60C8 54 9 47 14 45L40 42C52 40 58 30 70 25C80 21 100 20 118 21C132 22 142 30 152 38L176 43C186 45 192 49 193 55L193 60C193 63 191 64 188 64L170 64A15 15 0 0 0 140 64L66 64A15 15 0 0 0 36 64L14 64C11 64 10 62 10 60Z',
    glass:'M70 42L76 32C82 27 92 25 112 25C124 25 134 30 144 41Z',
    pillars:[108],py:[25,42],wheels:[[155,64,13],[51,64,13]],ground:78,
    head:'M180 45C186 45 190 47 192 49L190 51L179 49Z',tail:'M11 46L22 44L22 48L11 50Z',extra:'',trim:true,handles:[92,126],hy:46},
  fiat:{ /* Fiat Egea — компактный седан */
    body:'M24 60C22 54 23 47 28 45L48 43C58 40 64 30 76 24C86 20 104 20 116 21C128 22 136 30 146 38L166 43C175 45 180 49 181 55L181 60C181 63 179 64 176 64L163 64A13 13 0 0 0 137 64L75 64A13 13 0 0 0 49 64L28 64C25 64 24 62 24 60Z',
    glass:'M78 42L83 32C88 26 98 24 112 24C122 24 130 30 140 41Z',
    pillars:[110],py:[24,42],wheels:[[150,64,11.5],[62,64,11.5]],ground:78,
    head:'M168 45C173 45 177 47 179 49L177 51L167 49Z',tail:'M25 46L34 44L34 48L25 50Z',extra:'',trim:false,handles:[96,126],hy:46},
  skoda:{ /* Škoda Superb — лифтбек с покатой крышей */
    body:'M8 59C7 53 8 47 13 45L30 42C44 38 56 28 74 23C86 20 104 20 120 21C134 22 144 30 154 38L178 43C188 45 193 49 194 55L194 60C194 63 192 64 189 64L172 64A15 15 0 0 0 142 64L64 64A15 15 0 0 0 34 64L13 64C10 64 8 62 8 59Z',
    glass:'M42 41C54 35 64 28 78 25C92 23 106 23 120 24C131 25 139 31 148 40Z',
    pillars:[78,112],py:[24,41],wheels:[[157,64,13],[49,64,13]],ground:78,
    head:'M182 45C187 45 191 47 193 49L191 51L181 49Z',tail:'M9 46L26 44L26 48L9 50Z',extra:'',trim:true,handles:[96,130],hy:46}
};
function profileSVG(P,col,edge,cls){
  const wheel=w=>'<circle cx="'+w[0]+'" cy="'+w[1]+'" r="'+w[2]+'" fill="#17181B"/><circle cx="'+w[0]+'" cy="'+w[1]+'" r="'+(w[2]*.58).toFixed(1)+'" fill="#B9BEC5"/><circle cx="'+w[0]+'" cy="'+w[1]+'" r="'+(w[2]*.22).toFixed(1)+'" fill="#5B6068"/>';
  const pil=P.pillars.map(x=>'<path d="M'+x+' '+P.py[0]+'L'+x+' '+P.py[1]+'" stroke="'+col+'" stroke-width="3.5"/>').join('');
  const hd=P.handles.map(x=>'<rect x="'+x+'" y="'+P.hy+'" width="9" height="2" rx="1" fill="#000" fill-opacity=".28"/>').join('');
  return '<svg class="car profile'+(cls?' '+cls:'')+'" viewBox="0 0 200 84" aria-hidden="true">'+
    '<ellipse cx="102" cy="'+(P.ground+1)+'" rx="92" ry="3.2" fill="#000" fill-opacity=".16"/>'+
    '<path d="'+P.body+'" fill="'+col+'" stroke="'+edge+'" stroke-width="1.4"/>'+
    '<path d="M20 51L186 51" stroke="#fff" stroke-opacity=".16"/><path d="M20 52.2L186 52.2" stroke="#000" stroke-opacity=".12"/>'+
    '<path d="'+P.glass+'" fill="var(--glass)"'+(P.trim?' stroke="#C9CDD2" stroke-width="1.3"':'')+'/>'+
    '<path d="'+P.glass+'" fill="#fff" fill-opacity=".08" transform="translate(0 0)" clip-path="none"/>'+pil+hd+
    '<path d="'+P.head+'" fill="var(--headlight)"/><path d="'+P.tail+'" fill="var(--taillight)"/>'+P.extra+
    P.wheels.map(wheel).join('')+'</svg>';
}
function carSVG(color,o){
  o=o||{};
  const edge=o.surface?'var(--car-edge-surface)':'var(--car-edge)';
  const col=/^#[0-9a-fA-F]{6}$/.test(color||'')?color:'#6E7279';
  if(o.id){const c=P&&P.cars?P.cars.find(x=>x.id===o.id):null,src=(c&&c.photo)||CAR_PHOTOS[o.id];
    if(src)return '<img class="car profile photo'+(o.cls?' '+o.cls:'')+'" src="'+esc(src)+'" alt="" decoding="async">';
    if(PROFILES[o.id])return profileSVG(PROFILES[o.id],col,edge,o.cls);}
  const g='<path d="M7 36h5v8H7zM48 36h5v8h-5z" fill="'+col+'" stroke="'+edge+'" stroke-width="1"/>'+
    '<path d="M12 15C12 7 20 3 30 3s18 4 18 12l3 20v58c0 11-9 16-21 16S9 104 9 93V35z" fill="'+col+'" stroke="'+edge+'" stroke-width="1.6"/>'+
    '<path d="M15.5 10.5h6v3h-6zM38.5 10.5h6v3h-6z" fill="var(--headlight)"/>'+
    '<path d="M15 33c7-4 23-4 30 0l-3 14c-7-2-17-2-24 0z" fill="var(--glass)"/>'+
    '<rect x="17.5" y="49" width="25" height="30" rx="4" fill="#ffffff" fill-opacity=".1" stroke="#000000" stroke-opacity=".14"/>'+
    '<path d="M18 82c7 2 17 2 24 0l2 11c-8 3-20 3-28 0z" fill="var(--glass)"/>'+
    '<path d="M13 99h7v3h-7zM40 99h7v3h-7z" fill="var(--taillight)"/>';
  if(o.side)return '<svg class="car side'+(o.cls?' '+o.cls:'')+'" viewBox="0 0 112 60" aria-hidden="true"><g transform="translate(112 0) rotate(90)">'+g+'</g></svg>';
  return '<svg class="car'+(o.cls?' '+o.cls:'')+'" viewBox="0 0 60 112" aria-hidden="true">'+g+'</svg>';
}
function sign(loc,cls){
  const c=cls?' '+cls:'';
  if(loc==='road')return '<span class="sign road'+c+'" aria-hidden="true">'+ic('arrow')+'</span>';
  const l=F.location(loc);
  if(!l)return '<span class="sign z-other'+c+'" aria-hidden="true">?</span>';
  if(l.id==='service')return '<span class="sign z-service'+c+'" aria-hidden="true">'+ic('wrench')+'</span>';
  return '<span class="sign z-'+l.tone+c+'" aria-hidden="true">'+esc(l.sign)+'</span>';
}
function placeHTML(loc,spot){
  return '<span class="place">'+sign(loc,'sm')+'<span>'+esc(F.locationName(loc)+(spot?', '+spot:''))+'</span></span>';
}
function driverIndex(id){return state.drivers.findIndex(d=>d.id===id);}
function avatar(id,cls){
  const c=cls?' '+cls:'';
  if(isMgr(id))return '<span class="av boss'+c+'" aria-hidden="true">'+esc(nameOf(id).charAt(0))+'</span>';
  const i=driverIndex(id),d=F.driver(state,id);
  const name=d?dn(d.name):'?';
  const w=name.trim().split(/\s+/);
  const txt=/^(Водитель|Sürücü)\s*\d+$/i.test(name)?name.replace(/\D/g,''):(w[0].charAt(0)+(w[1]?w[1].charAt(0):'')).toUpperCase();
  return '<span class="av'+c+'" style="--av:var(--av'+((i<0?0:i)%4+1)+')" aria-hidden="true">'+esc(txt)+'</span>';
}
function nameOf(id){return isMgr(id)?(F.managerName(id)||T('Руководитель')):((F.driver(state,id)||{}).name||'—');}
function odoHTML(km,cls){
  if(km==null)return T('<span class="odo-none">пробег не записан</span>');
  const s=String(km),digits=s.length<6?'0'.repeat(6-s.length)+s:s;let lead=true,out='';
  for(let i=0;i<digits.length;i++){const ch=digits[i];if(ch!=='0')lead=false;let cl=(lead&&i<digits.length-1)?'lead':'';if(i===digits.length-1)cl='last';out+='<b class="'+cl+'">'+ch+'</b>';}
  return '<span class="odo'+(cls?' '+cls:'')+'" aria-label="'+fmt(km)+T(' км">')+out+T('<span class="u">км</span></span>');
}
function plateHTML(p){return p?T('<span class="plate" aria-label="Номер ')+esc(p)+'"><span class="plate-tr">TR</span><span class="plate-n">'+esc(p)+'</span></span>':'';}
function statusPill(c){
  if(c.pendingTransfer)return T('<span class="pill pending status-pill status-pending">Передача</span>');
  if(c.status==='driving')return T('<span class="pill trip status-pill status-driving">В поездке</span>');
  if(c.status==='parked')return c.location==='service'?T('<span class="pill service status-pill status-parked">В сервисе</span>'):T('<span class="pill parked status-pill status-parked">Припаркована</span>');
  return T('<span class="pill unknown status-pill status-none">Нет данных</span>');
}
function statusDot(status){return '<i class="status-dot status-'+(status==='driving'?'driving':status==='parked'?'parked':status==='pending'?'pending':'none')+'" aria-hidden="true"></i>';}
function openIssues(c){return c.issues.filter(i=>i.status==='open');}
function issueChips(c,clickable){
  const list=openIssues(c);if(!list.length)return '';
  return '<div class="issues">'+list.map(i=>{const t=F.issueType(i.type);
    const inner=ic(t.icon)+'<span>'+esc(t.name)+'</span>';
    return clickable?'<button class="ichip '+t.sev+'" data-act="issues" data-car="'+c.id+'">'+inner+'</button>':'<span class="ichip '+t.sev+'">'+inner+'</span>';
  }).join('')+'</div>';
}
function keysText(c){
  const k=c.keys;if(!k||k.kind==='unknown')return T('Не отмечено');
  if(k.kind==='driver')return T('У водителя: ')+nameOf(k.driverId);
  return k.kind==='security'?T('На охране'):T('В офисе');
}
function carOf(id){return P.cars.find(c=>c.id===id);}
function occupied(id,except){return P.cars.find(c=>c.id!==except&&(c.currentDriverId===id||(c.pendingTransfer&&c.pendingTransfer.toId===id)));}
function flashCls(id){return (ui.flash&&ui.flash.car===id&&Date.now()-ui.flash.t<2200)?' flash':'';}
function canKeys(c){return c.status!=='unconfigured'&&!c.pendingTransfer&&(c.status==='parked'||c.currentDriverId===role);}

/* ───────── shell ───────── */
function tabs(){
  if(!isMgr(role))return [{id:'mine',label:T('Мой экран'),icon:'user'},{id:'cars',label:T('Машины'),icon:'grid'},{id:'wash',label:T('Мойки'),icon:'drop'}];
  return [{id:'cars',label:T('Машины'),icon:'grid'},{id:'journal',label:T('Журнал'),icon:'list'},{id:'stats',label:T('Пробег'),icon:'chart'},{id:'team',label:T('Водители'),icon:'users'},{id:'more',act:'more',label:T('Ещё'),icon:'menu'}];
}
function tabAttr(t){const cur=t.act?MORE_VIEWS.indexOf(view)>=0:view===t.id;return (t.act?'data-act="'+t.act+'"':'data-view="'+t.id+'"')+(cur?' aria-current="page"':'');}
function renderTop(){
  $('#top').innerHTML='<div class="wrap top-in">'+
    '<div class="brand"><span class="brand-mark" aria-hidden="true">P</span><span class="brand-txt"><span class="brand-name">'+T('Гараж')+' ' +(isMgr(role)?T('<span class="ver">v')+APP_VERSION+T('</span>'):'')+'</span><span class="brand-sub" data-clock>'+T('Стамбул · ')+tFmt.format(NOW)+'</span></span></div>'+
    T('<nav class="nav" aria-label="Разделы">')+tabs().map(t=>'<button class="navbtn" '+tabAttr(t)+'>'+ic(t.icon)+t.label+'</button>').join('')+'</nav>'+
    '<div class="top-end"><button class="lang-btn" data-act="lang" aria-label="Русский / Türkçe" title="Русский / Türkçe">'+ic('globe')+'<span>'+(LANG==='tr'?'TR':'RU')+'</span></button><button class="theme-btn" data-act="theme" aria-label="'+(theme==='dark'?T('Светлая тема'):T('Тёмная тема'))+'">'+ic(theme==='dark'?'sun':'moon')+'</button><button class="demo-chip" data-act="about">'+ic('info')+'<span>'+(state.isDemo?T('Пример'):T('Прототип'))+'<span class="lbl-long">'+(state.isDemo?T(' данных'):'')+'</span></span></button>'+
    T('<button class="role-btn" data-act="role" aria-label="Кто вы: ')+esc(nameOf(role))+T('. Сменить">')+avatar(role)+'<span class="nm">'+esc(nameOf(role))+'</span>'+ic('chev')+'</button></div></div>';
}
function renderTabs(){
  $('#tabbar').setAttribute('aria-label',LANG==='tr'?'Bölümler':'Разделы');
  $('#tabbar').innerHTML='<div class="wrap tabbar-in">'+tabs().map(t=>'<button class="tab" '+tabAttr(t)+'><span class="tab-ic">'+ic(t.icon)+'</span>'+t.label+'</button>').join('')+'</div>';
}
function ph(eyebrow,title,sub,right){
  return '<div class="ph"><div><p class="eyebrow">'+esc(eyebrow)+'</p><h1>'+esc(title)+'</h1>'+(sub?'<p class="ph-sub">'+esc(sub)+'</p>':'')+'</div>'+(right||'')+'</div>';
}
function todayLabel(){return cap(dLong.format(NOW));}

/* ───────── attention & activity ───────── */
function serviceAlerts(){
  const out=[];
  F.serviceStatus(state,NOW).forEach(x=>x.items.forEach(i=>{
    if(i.status!=='overdue'&&i.status!=='soon')return;
    out.push({kind:'service',sev:i.status==='overdue'?'crit':'warn',icon:i.type.icon,carId:x.car.id,stype:i.type.id,title:x.car.name+': '+i.type.name+' · '+(i.status==='overdue'?T('просрочено'):T('скоро')),text:dueText(i),actorIds:[],at:''});
  }));
  return out;
}
function attentionItems(personal){
  const base=F.attention(state,NOW).filter(a=>(isMgr(role)||a.kind!=='setup')&&(!personal||a.actorIds.indexOf(role)>=0));
  if(personal)return base;
  const all=base.concat(serviceAlerts()),ord={crit:0,warn:1,info:2};
  return all.sort((a,b)=>ord[a.sev]-ord[b.sev]);
}
function alertItem(a){
  const act=a.kind==='issue'?'issues':a.kind==='setup'?'init':a.kind==='service'?'svc-add':'car';
  return '<button class="alert '+a.sev+'" data-act="'+act+'" data-car="'+a.carId+'"'+(a.stype?' data-type="'+a.stype+'"':'')+'><span class="alert-ic">'+ic(a.icon)+'</span><span><span class="alert-t">'+esc(a.title)+'</span><span class="alert-s">'+esc(a.text)+'</span></span></button>';
}
function alertsHead(title,n){return '<div class="sh"><h2>'+esc(title)+'</h2><span class="count'+(n?'':' zero')+'">'+n+'</span></div>';}
function alertsHTML(items,title,emptyText){
  if(!items.length)return emptyText?alertsHead(title,0)+'<div class="allgood">'+ic('check')+T('<div><b>Всё спокойно</b>')+esc(emptyText)+'</div></div>':'';
  return alertsHead(title,items.length)+'<div class="alerts">'+items.map(alertItem).join('')+'</div>';
}
function alertsCompact(items){
  if(!items.length)return '';
  const top=items.slice(0,2),rest=items.slice(2);
  return alertsHead(T('Требует внимания'),items.length)+'<div class="alerts">'+top.map(alertItem).join('')+'</div>'+
    (rest.length?'<details class="more-alerts"><summary>'+ic('chev')+T('Ещё ')+plural(rest.length,T('сигнал'),T('сигнала'),T('сигналов'))+'</summary><div class="alerts">'+rest.map(alertItem).join('')+'</div></details>':'');
}
function keysWord(e){
  const k=e.keyKind;let s=k==='driver'?T('у ')+(e.keyDriverName||''):k==='security'?T('на охране'):k==='office'?T('в офисе'):T('не отмечено');
  if(e.keyNote)s+=' ('+e.keyNote+')';
  return s;
}
function entryHTML(e,withDate){
  const car=carOf(e.carId),cn=esc(car?car.name:'—'),by='<b>'+esc(e.actorName)+'</b>';
  let icon='info',cls=e.kind,title='',sub=[],chip='';
  const kmChip=e.distance!=null?'<span class="ent-km">+'+fmt(e.distance)+T(' км</span>'):'';
  const V={by:by,car:'<b>'+cn+'</b>',to:'<b>'+esc(e.toName||'')+'</b>',from:esc(e.fromName||'')};
  switch(e.kind){
    case 'init':icon='pin';title=tpl('Учёт начат · {car}',V);sub.push(placeHTML(e.location,e.spot));if(e.parkedByName)sub.push(T('поставил ')+esc(e.parkedByName));if(e.keyKind&&e.keyKind!=='unknown')sub.push(T('ключи ')+esc(keysWord(e)));break;
    case 'checkout':icon='key';title=tpl('{by} взял {car}',V);if(e.fromLocation)sub.push(T('с ')+placeHTML(e.fromLocation,e.fromSpot));if(e.odoGap>0)chip='<span class="ent-km gap">+'+fmt(e.odoGap)+' '+T('км без записи')+'</span>';break;
    case 'handover_request':icon='swap';title=tpl('{by} передаёт {car} → {to}',V);sub.push(T('ждёт подтверждения'));break;
    case 'handover_accept':icon='check';title=tpl('{by} принял {car} от {from}',V);chip=kmChip;break;
    case 'handover':icon='swap';title=tpl('{by} передал {car} → {to}',V);chip=kmChip;break;
    case 'handover_cancel':icon='x';title=tpl('{by} отменил передачу {car}',V);break;
    case 'handover_decline':icon='x';title=tpl('{by} отклонил передачу {car}',V);break;
    case 'park':icon='park';title=tpl('{by} поставил {car}',V);sub.push(placeHTML(e.location,e.spot));sub.push(T('ключи ')+esc(keysWord(e)));chip=kmChip;break;
    case 'car_reset':icon='trash';cls='resolve';title=tpl('{by} сбросил машину · {car}',V);break;
    case 'issue_report':{const t=F.issueType(e.issueType);icon=t.icon;cls='issue';title=tpl('{by}: замечание · {car}',V);sub.push('<span class="ent-flag">'+esc(t.name)+'</span>');break;}
    case 'issue_resolve':icon='check';cls='resolve';title=tpl('{by} закрыл замечание · {car}',V);sub.push(esc(F.issueName(e.issueType)));break;
    case 'odo_fix':icon='edit';cls='keys';title=tpl('{by} исправил пробег · {car}',V);sub.push(T('было')+' '+fmt(e.prevOdo)+' '+T('км')+' → '+T('стало')+' <b class="ent-odo">'+fmt(e.odo)+' '+T('км')+'</b>');break;
    case 'wash':icon='drop';cls='keys';title=tpl('{by}: {what} · {car}',Object.assign({},V,{what:esc(F.washName(e.washType)).toLowerCase()}));if(e.washDate&&e.washDate!==dayKey(e.at))sub.push(esc(fmtDate(e.washDate)));break;
    case 'keys':icon='key';cls='keys';title=tpl('{by} отметил ключи · {car}',V);sub.push(esc(keysWord(e)));break;
  }
  if(e.odo!=null&&e.kind!=='odo_fix')sub.push('<b class="ent-odo">'+fmt(e.odo)+T(' км')+'</b>');
  if(e.note)sub.push('<span class="ent-note">«'+esc(e.note)+'»</span>');
  if(e.photo)sub.push('<button class="linkbtn sm" data-act="photo" data-event="'+esc(e.id)+'">'+ic('camera')+T('Фото</button>'));
  const dk=dayKey(e.at),dl=withDate&&dk!==dayKey(NOW)?'<small>'+(dk===dayKey(NOW-DAY)?T('вчера'):esc(dShort.format(ts(e.at))))+'</small>':'';
  return '<div class="ent"><span class="ent-t">'+tFmt.format(ts(e.at))+dl+'</span><span class="ent-ic '+cls+'">'+ic(icon)+'</span><div class="ent-main"><div class="ent-title">'+title+'</div>'+(sub.length?'<div class="ent-sub">'+sub.join('<span class="dot">·</span>')+'</div>':'')+'</div>'+chip+'</div>';
}
function recentHTML(){
  const rows=P.audit.slice(-5).reverse();
  return T('<section><div class="sh"><h2>Последние действия</h2><button class="linkbtn" data-view="journal">Весь журнал ')+ic('arrow')+'</button></div>'+
    (rows.length?'<div class="panel tight">'+rows.map(e=>entryHTML(e,true)).join('')+'</div>':T('<div class="empty">Первые действия появятся после начала учёта</div>'))+'</section>';
}

/* ───────── car card ───────── */
function carActions(c){
  const pend=c.pendingTransfer;
  if(pend){
    if(role===pend.toId)return '<button class="btn btn-ghost" data-act="handover_decline" data-car="'+c.id+T('">Отклонить</button><button class="btn btn-primary" data-act="handover_accept" data-car="')+c.id+'">'+ic('check')+T('Принять</button>');
    if(role===pend.fromId)return '<button class="btn" data-act="handover_cancel" data-car="'+c.id+T('">Отменить передачу</button>');
    return T('<span class="foot-note">Ждём, пока ')+esc(pend.toName)+T(' примет машину</span>');
  }
  if(isMgr(role))return c.status==='unconfigured'?'<button class="btn btn-primary" data-act="init" data-car="'+c.id+'">'+ic('plus')+T('Внести данные</button>'):'<button class="btn" data-act="history" data-car="'+c.id+'">'+ic('list')+T('История</button>');
  if(c.status==='driving'){
    if(c.currentDriverId!==role)return T('<span class="foot-note">За рулём: <b>')+esc(nameOf(c.currentDriverId))+'</b></span>';
    return '<button class="btn" data-act="handover_request" data-car="'+c.id+'">'+ic('swap')+T('Передать</button><button class="btn btn-primary" data-act="park" data-car="')+c.id+'">'+ic('park')+T('Поставить</button>');
  }
  return '<button class="btn btn-primary" data-act="checkout" data-car="'+c.id+'">'+ic('key')+T('Взять машину</button>');
}
function carCard(c){
  const driving=c.status==='driving',none=c.status==='unconfigured',pend=c.pendingTransfer;
  let place;
  if(none)place=sign('none','lg')+T('<div><div class="lbl-s">Начальные данные</div><div class="place-big">Начать учёт</div><div class="place-sub">Внесите место и текущий пробег</div></div>');
  else if(driving)place=sign('road','lg')+T('<div><div class="lbl-s">Ответственный сейчас</div><div class="place-big">')+esc(nameOf(c.currentDriverId))+'</div><div class="place-sub" data-since="'+ts(c.trip.startAt)+T('">с ')+tFmt.format(ts(c.trip.startAt))+' · '+dur(NOW-ts(c.trip.startAt))+T(' в пути</div></div>');
  else place=sign(c.location,'lg')+T('<div><div class="lbl-s">Где стоит</div><div class="place-big">')+esc(F.locationName(c.location))+'</div><div class="place-sub">'+esc(c.spot||T('Место не уточнено'))+'</div></div>';
  const lastDriver=c.lastTrip&&c.lastTrip.segments.length?c.lastTrip.segments[c.lastTrip.segments.length-1].driverName:null;
  const who=c.lastPark&&c.lastPark.driverName?esc(c.lastPark.driverName):T('Не отмечено');
  let h='<article class="car-card'+flashCls(c.id)+'" id="car-'+c.id+'">'+
    '<button class="cc-head" data-act="car" data-car="'+c.id+'" aria-label="'+esc(c.name)+T(': подробнее">')+carSVG(c.color,{id:c.id,side:true,surface:true})+
      '<span class="cc-id"><span class="cc-name">'+esc(c.name)+'</span><span class="cc-model">'+esc(c.model||T('Модель не указана'))+'</span></span>'+statusPill(c)+'</button>'+
    '<div class="cc-body">'+
      '<div class="cc-place">'+place+'</div>'+
      (pend?'<div class="note info">'+ic('swap')+T('<span>Ждём принятия: <b>')+esc(pend.toName)+T('</b>. До принятия отвечает ')+esc(pend.fromName)+'</span></div>':'')+
      '<div class="cc-grid"><div class="cc-cell"><div class="lbl-s">'+(driving?T('Последнее показание'):T('Пробег'))+'</div><div class="cc-odo">'+odoHTML(c.odo)+'</div><div class="time">'+(c.lastOdoAt?esc(when(c.lastOdoAt)):'')+'</div></div>'+
      T('<div class="cc-cell"><div class="lbl-s">Поставил последним</div><div class="val">')+who+'</div><div class="time">'+(c.lastPark?esc(when(c.lastPark.at)):'')+'</div>'+(lastDriver&&lastDriver!==who?T('<div class="time">Последний водитель: ')+esc(lastDriver)+'</div>':'')+'</div></div>'+
      (none?'':'<div class="cc-keys">'+ic('key')+T('<span class="faint">Ключи</span><b class="')+(c.keys&&c.keys.kind==='driver'?'keys-driver':'')+'">'+esc(keysText(c))+'</b>'+(c.keys&&c.keys.note?'<span class="faint">· '+esc(c.keys.note)+'</span>':'')+(canKeys(c)?'<button class="linkbtn sm" data-act="keys" data-car="'+c.id+T('">Изменить</button>'):'')+'</div>')+
      issueChips(c,true)+
      (c.plate?'<div>'+plateHTML(c.plate)+'</div>':'')+
    '</div>'+
    '<div class="cc-foot">'+carActions(c)+'</div>'+
    '<div class="cc-tools">'+(none?'':'<button class="linkbtn sm" data-act="issue_report" data-car="'+c.id+'">'+ic('plus')+T('Замечание</button><button class="linkbtn sm" data-act="issues" data-car="')+c.id+T('">Замечания (')+c.issues.length+')</button>')+
      (isMgr(role)?'<button class="linkbtn sm" data-act="details" data-car="'+c.id+'" style="margin-left:auto">'+ic('edit')+T('Изменить</button>'):'<button class="linkbtn sm" data-act="history" data-car="'+c.id+T('">История</button>'))+'</div>'+
  '</article>';
  return h;
}

function keysShort(c){
  const k=c.keys;if(!k||k.kind==='unknown')return T('ключи: ?');
  if(k.kind==='driver')return T('у ')+nameOf(k.driverId);
  return k.kind==='security'?T('на охране'):T('в офисе');
}
function carTile(c){
  const driving=c.status==='driving',none=c.status==='unconfigured',pend=c.pendingTransfer;
  let where;
  if(none)where=T('<span class="faint">Нет начальных данных</span>');
  else if(driving)where=sign('road','sm')+'<span>'+esc(nameOf(c.currentDriverId))+' · '+dur(NOW-ts(c.trip.startAt))+'</span>';
  else where=placeHTML(c.location,c.spot);
  let act=carActions(c);
  if(isMgr(role)&&!none)act='';
  return '<article class="tile'+flashCls(c.id)+'" id="car-'+c.id+'">'+
    '<button class="tile-main" data-act="car" data-car="'+c.id+'" aria-label="'+esc(c.name)+T(': подробнее">')+carSVG(c.color,{id:c.id,side:true,surface:true})+
      '<span class="tile-info"><span class="tile-top"><span class="tile-name">'+esc(c.name)+(c.model?' <span class="faint">'+esc(c.model)+'</span>':'')+'</span>'+statusPill(c)+'</span>'+
      '<span class="tile-where">'+where+'</span>'+
      '<span class="tile-meta">'+(c.plate?plateHTML(c.plate):'')+'<span class="mono">'+(c.odo!=null?fmt(c.odo)+T(' км'):T('пробег —'))+'</span>'+(none?'':'<span>'+ic('key')+esc(keysShort(c))+'</span>')+'</span></span>'+
      '<span class="tile-chev">'+ic('chev')+'</span></button>'+
    (pend?'<div class="tile-note">'+ic('swap')+'<span>'+esc(pend.fromName)+' → <b>'+esc(pend.toName)+T('</b>, ждёт принятия</span></div>'):'')+
    (openIssues(c).length?'<div class="tile-issues">'+issueChips(c,true)+'</div>':'')+
    (act?'<div class="tile-act">'+act+'</div>':'')+
  '</article>';
}

/* ───────── views ───────── */
function bossWhere(c){
  if(c.status==='unconfigured')return statusDot('none')+T('Нет данных');
  if(c.status==='driving')return statusDot(c.pendingTransfer?'pending':'driving')+'<b>'+T('В поездке')+'</b> · '+dur(NOW-ts(c.trip.startAt));
  return statusDot('parked')+'<b>'+esc(F.locationName(c.location))+'</b>'+(c.spot?', '+esc(c.spot):'');
}
function bossKeys(c){
  if(c.status==='unconfigured')return '—';
  if(c.status==='driving')return '<b class="keys-driver">'+T('У водителя')+'</b>';
  const k=c.keys;if(!k||k.kind==='unknown')return T('Не отмечено');
  if(k.kind==='driver')return '<b class="b-alert keys-driver">'+T('У водителя: ')+esc(nameOf(k.driverId))+'</b>';
  return k.kind==='security'?T('На охране'):T('В офисе');
}
function bossRow(c){
  const issues=openIssues(c).length,pend=c.pendingTransfer;
  const flag=pend?'<span class="b-flag">'+T('Передача')+': '+esc(pend.fromName)+' → '+esc(pend.toName)+'</span>':
    issues?'<span class="b-flag">'+plural(issues,T('замечание'),T('замечания'),T('замечаний'))+'</span>':'';
  const kv=(k,v)=>'<span class="b-kv"><span class="b-k">'+k+'</span><span class="b-v">'+v+'</span></span>';
  return '<button class="b-row'+flashCls(c.id)+'" id="car-'+c.id+'" data-act="car" data-car="'+c.id+'">'+
    '<span class="b-top"><span class="b-photo">'+carSVG(c.color,{id:c.id,side:true,surface:true})+'</span>'+
      '<span class="b-id"><span class="b-name">'+esc(c.name)+(c.model?' <span class="b-model">'+esc(c.model)+'</span>':'')+'</span>'+(c.plate?'<span class="b-plate">'+plateHTML(c.plate)+'</span>':'')+'</span>'+
      '<span class="b-chev">'+ic('chev')+'</span></span>'+
    '<span class="b-main">'+
      (c.status==='driving'?kv(T('Водитель'),'<b>'+esc(nameOf(c.currentDriverId))+'</b>'):'')+
      kv(T('Где'),bossWhere(c))+kv(T('Ключи'),bossKeys(c))+kv(T('Пробег'),c.odo!=null?'<b>'+fmt(c.odo)+'</b> '+T('км'):'—')+
      flag+(bossFoot(c)?'<span class="b-foot">'+bossFoot(c)+'</span>':'')+
    '</span></button>';
}
function bossChecks(){
  const items=attentionItems(false);
  if(!items.length)return '<div class="b-ok">'+ic('check')+T('Всё в порядке')+'</div>';
  const show=ui.allChecks?items:items.slice(0,3);
  return '<section class="b-checks"><div class="b-h2">'+T('Нужно проверить')+' <span class="b-count">'+items.length+'</span></div>'+
    show.map(a=>{const act=a.kind==='issue'?'issues':a.kind==='setup'?'init':a.kind==='service'?'svc-add':'car';
      return '<button class="b-check'+(a.sev==='crit'?' crit':'')+'" data-act="'+act+'" data-car="'+a.carId+'"'+(a.stype?' data-type="'+a.stype+'"':'')+'><span class="b-dot"></span><span><span class="b-check-t">'+esc(a.title)+'</span><span class="b-check-s">'+esc(a.text)+'</span></span></button>';}).join('')+
    (items.length>3?'<button class="b-more" data-act="all-checks">'+(ui.allChecks?T('Свернуть'):T('Показать все')+' ('+items.length+')')+'</button>':'')+
  '</section>';
}
function viewCars(){
  if(wide&&isMgr(role))return viewDash();
  const parked=P.cars.filter(c=>c.status==='parked').length,driving=P.cars.filter(c=>c.status==='driving').length;
  return '<div class="b-wrap"><div class="b-head"><h1 class="b-title">'+T('Машины')+'</h1><p class="b-sub">'+esc(todayLabel())+' · '+parked+' '+T('на месте')+' · '+driving+' '+T('в поездке')+'</p></div>'+
    '<div class="b-list">'+P.cars.map(bossRow).join('')+'</div><div id="checks" class="b-bottom">'+bossChecks()+'</div></div>';
}

function viewMine(){
  /* Экран водителя: одна задача на экране, крупный текст, минимум значков */
  const me=role,actives=P.cars.filter(c=>c.currentDriverId===me),incomings=P.cars.filter(c=>c.pendingTransfer&&c.pendingTransfer.toId===me);
  let out='';
  const head=(title,sub)=>'<div class="d-head"><div class="d-hello">'+esc(nameOf(me))+'</div><h1 class="d-title">'+title+'</h1>'+(sub?'<p class="d-sub">'+sub+'</p>':'')+'</div>';
  incomings.forEach(c=>{
    const p=c.pendingTransfer;
    out+=head(T('Вам передают машину'),esc(p.fromName)+' · '+esc(ago(p.at)))+
      '<div class="d-card">'+'<div class="d-photo">'+carSVG(c.color,{id:c.id,surface:true})+'</div>'+
        '<div class="d-car">'+esc(c.name)+(c.model?' '+esc(c.model):'')+'</div>'+statusPill(c)+(c.plate?'<div class="d-plate">'+plateHTML(c.plate)+'</div>':'')+
        '<div class="d-line">'+T('Пробег при передаче')+': <b>'+fmt(p.odo)+' '+T('км')+'</b></div>'+
        '<button class="btn btn-go btn-xl btn-block" data-act="handover_accept" data-car="'+c.id+'">'+T('Принять машину')+'</button>'+
        '<button class="btn btn-quiet btn-block" data-act="handover_decline" data-car="'+c.id+'">'+T('Отклонить')+'</button>'+
      '</div>';
  });
  if(actives.length)out+=head(actives.length>1?T('Машины у вас')+' · '+actives.length:T('Машина у вас'),'');
  actives.forEach(c=>{
    const seg=c.trip.segment,long=attentionItems(true).some(a=>a.kind==='shift'&&a.carId===c.id);
    const from=c.trip.fromLocation?F.locationName(c.trip.fromLocation):'';
    out+='<div class="d-card'+flashCls(c.id)+'">'+
        '<div class="d-photo">'+carSVG(c.color,{id:c.id,surface:true})+'</div>'+
        '<div class="d-car">'+esc(c.name)+(c.model?' '+esc(c.model):'')+'</div>'+statusPill(c)+(c.plate?'<div class="d-plate">'+plateHTML(c.plate)+'</div>':'')+
        '<div class="d-line">'+T('Взяли в')+' '+tFmt.format(ts(seg.startAt))+(from?' · '+esc(from):'')+'</div>'+
        '<div class="d-line">'+T('Пробег при получении')+': <b>'+fmt(seg.startOdo)+' '+T('км')+'</b></div>'+(long?'<div class="d-warn">'+T('Поездка идёт больше')+' '+F.settingsOf(state).tripHours+' '+T('ч')+'. '+T('Не забудьте отметить, где поставили машину.')+'</div>':'')+
        
        (c.pendingTransfer
          ?'<div class="d-wait">'+T('Ждём, пока')+' <b>'+esc(c.pendingTransfer.toName)+'</b> '+T('примет машину')+'</div><button class="btn btn-quiet btn-block" data-act="handover_cancel" data-car="'+c.id+'">'+T('Отменить передачу')+'</button>'
          :'<button class="btn btn-go btn-xl btn-block" data-act="park" data-car="'+c.id+'">'+T('Поставить на паркинг')+'</button>'+
           '<div class="d-two"><button class="btn btn-lg" data-act="handover_request" data-car="'+c.id+'">'+T('Передать')+'</button><button class="btn btn-lg" data-act="issue_report" data-car="'+c.id+'">'+T('Проблема')+'</button></div>')+
      '</div>';
  });
  {
    out+=(actives.length||incomings.length?'<h2 class="d-more">'+T('Взять ещё машину')+'</h2>':head(T('Какую машину берёте?'),T('Нажмите на машину')))+'<div class="d-list">'+P.cars.filter(c=>c.currentDriverId!==me).map(c=>{
      const can=c.status==='parked'||c.status==='unconfigured';
      let where;
      if(c.status==='driving')where=statusDot(c.pendingTransfer?'pending':'driving')+T('Занята')+': '+esc(nameOf(c.currentDriverId));
      else if(c.status==='parked')where=statusDot('parked')+esc(F.locationName(c.location)+(c.spot?', '+c.spot:''));
      else where=statusDot('none')+T('Первый выезд');
      return '<button class="d-row" data-act="checkout" data-car="'+c.id+'"'+(can?'':' disabled')+'>'+carSVG(c.color,{id:c.id,side:true,surface:true})+
        '<span class="d-row-main"><span class="d-row-name">'+esc(c.name)+'</span><span class="d-row-where">'+where+'</span></span>'+
        (can?'<span class="d-row-go">'+T('Взять')+'</span>':'')+'</button>';
    }).join('')+'</div>';
  }
  out+='<button class="btn btn-lg btn-block d-wash" data-act="wash">'+ic('drop')+T('Записать мойку')+'</button>';
  out+='<button class="d-link" data-act="mylog">'+T('Мои записи')+'</button>';
  return '<div class="d-wrap">'+out+'</div>';
}

function matchesEvent(e){return (ui.filterCar==='all'||ui.filterCar===e.carId)&&(ui.filterDriver==='all'||e.actorId===ui.filterDriver||e.toId===ui.filterDriver||e.fromId===ui.filterDriver||e.parkedById===ui.filterDriver);}
function viewJournal(){
  const opts=(val,items)=>items.map(i=>'<option value="'+esc(i[0])+'"'+(val===i[0]?' selected':'')+'>'+esc(i[1])+'</option>').join('');
  const head=ph(T('История без перезаписи'),T('Журнал'),T('Поездки, передачи, ключи и замечания. Время стамбульское.'),
    T('<div class="filters"><select class="sel" id="flt-car" aria-label="Машина">')+opts(ui.filterCar,[['all',T('Все машины')]].concat(P.cars.map(c=>[c.id,c.name])))+'</select>'+
    T('<select class="sel" id="flt-drv" aria-label="Водитель">')+opts(ui.filterDriver,[['all',T('Все водители')]].concat(state.drivers.map(d=>[d.id,d.name])).concat(F.MANAGERS.map(m=>[m.id,m.name])))+'</select>'+
    '</div>');
  const tbl='<button class="tv-open" data-act="table">'+ic('table')+'<span><b>'+T('Открыть таблицей')+'</b><small>'+T('Как в Excel · выгрузка в Google Таблицы и CSV')+'</small></span>'+ic('chev','more-chev')+'</button>';
  const seg=tbl+T('<div class="seg" role="group" aria-label="Вид журнала"><button data-act="jmode" data-mode="events" aria-pressed="')+(ui.journalMode==='events')+T('">Все действия</button><button data-act="jmode" data-mode="trips" aria-pressed="')+(ui.journalMode==='trips')+T('">Завершённые поездки</button></div>');
  if(ui.journalMode==='trips'){
    const trips=P.trips.filter(t=>(ui.filterCar==='all'||t.carId===ui.filterCar)&&(ui.filterDriver==='all'||t.segments.some(s=>s.driverId===ui.filterDriver))).reverse();
    if(!trips.length)return head+seg+T('<div class="empty" style="margin-top:16px"><b>Завершённых поездок пока нет</b>Поездка появится здесь после отметки о парковке</div>');
    return head+seg+'<div class="trips">'+trips.slice(0,150).map(tripHTML).join('')+'</div>';
  }
  const list=P.audit.filter(matchesEvent).reverse();
  if(!list.length)return head+seg+T('<div class="empty" style="margin-top:16px"><b>Записей нет</b>')+(P.audit.length?T('Выберите другую машину или водителя'):T('Первая запись появится, когда руководитель внесёт начальные данные'))+'</div>';
  const groups=[];let cur=null;
  list.slice(0,ui.logLimit||30).forEach(e=>{const k=dayKey(e.at);if(!cur||cur.k!==k){cur={k,t:ts(e.at),items:[]};groups.push(cur);}cur.items.push(e);});
  return head+seg+'<p class="faint" style="margin:14px 0 0">'+plural(list.length,T('запись'),T('записи'),T('записей'))+'</p>'+groups.map(g=>{
    const lbl=g.k===dayKey(NOW)?T('Сегодня'):g.k===dayKey(NOW-DAY)?T('Вчера'):cap(dLong.format(g.t));
    return '<section class="day"><div class="day-h"><span>'+esc(lbl)+'</span><span>'+plural(g.items.length,T('запись'),T('записи'),T('записей'))+'</span></div>'+g.items.map(entryHTML).join('')+'</section>';
  }).join('')+(list.length>(ui.logLimit||30)?'<button class="btn btn-block" data-act="log-more" style="margin-top:16px">'+T('Показать ещё')+'</button>':'')+T('<p class="faint" style="margin-top:14px;font-size:13px">«+ км» на записи: сколько проехал водитель за свою поездку, до передачи или парковки.</p>');
}
function tripHTML(t){
  const car=carOf(t.carId),len=ts(t.endAt)-ts(t.startAt);
  return '<article class="trip-card"><div class="trip-h">'+carSVG(car.color,{id:car.id,side:true,surface:true})+'<div class="trip-id"><b>'+esc(car.name)+'</b><span class="faint">'+esc(dShort.format(ts(t.startAt)))+', '+tFmt.format(ts(t.startAt))+' → '+tFmt.format(ts(t.endAt))+' · '+dur(len)+'</span></div><span class="trip-km">'+fmt(t.distance)+T('<small>км</small></span></div>')+
    '<div class="trip-route">'+placeHTML(t.fromLocation,t.fromSpot||'')+'<span class="faint">'+ic('arrow')+'</span>'+placeHTML(t.toLocation,t.spot)+'</div>'+
    '<div class="segs">'+t.segments.map(s=>'<div class="seg-row">'+avatar(s.driverId)+'<div class="seg-main"><b>'+esc(s.driverName)+'</b><span class="faint">'+tFmt.format(ts(s.startAt))+' → '+tFmt.format(ts(s.endAt))+T(' · одометр ')+fmt(s.startOdo)+' → '+fmt(s.endOdo)+'</span></div><span class="ent-km">'+fmt(s.distance)+T(' км</span></div>')).join('')+'</div>'+
    T('<div class="trip-foot faint">Поставил: ')+esc(t.parkedByName)+'</div></article>';
}

function niceMax(v){if(v<=0)return 10;const p=Math.pow(10,Math.floor(Math.log10(v))),m=v/p;return (m<=1?1:m<=2?2:m<=5?5:10)*p;}
function viewStats(){
  const days=ui.statsDays,st=F.stats(state,days,NOW);
  const maxCar=Math.max(1,...st.cars.map(c=>c.total)),maxDrv=Math.max(1,...st.drivers.map(d=>d.km));
  const head=ph(T('За последние ')+plural(days,T('день'),T('дня'),T('дней')),T('Пробег'),T('Километры по записям водителей и пробег без записи.'),
    T('<div class="seg" role="group" aria-label="Период"><button data-act="days" data-days="7" aria-pressed="')+(days===7)+T('">7 дней</button><button data-act="days" data-days="30" aria-pressed="')+(days===30)+T('">30 дней</button></div>'));
  const kpis='<div class="kpis">'+
    '<div class="kpi"><div class="kpi-v">'+fmt(st.logged)+T('<small>км</small></div><div class="kpi-l">по записям водителей</div></div>')+
    '<div class="kpi"><div class="kpi-v">'+st.trips+T('</div><div class="kpi-l">завершённых поездок</div></div>')+
    '<div class="kpi'+(st.unlogged?' warn':'')+'"><div class="kpi-v">'+fmt(st.unlogged)+T('<small>км</small></div><div class="kpi-l">без записи</div></div></div>');
  const carBars=st.cars.map(c=>'<div class="bar-row"><span class="bar-name"><i class="bar-dot" style="background:'+esc(c.car.color)+'"></i><span>'+esc(c.car.name)+'</span></span>'+
    '<span class="bar-track" title="'+esc(c.car.name)+': '+fmt(c.logged)+T(' км по записям, ')+fmt(c.unlogged)+T(' км без записи"><span class="bar-fill" style="width:')+(c.logged/maxCar*100).toFixed(2)+'%"></span><span class="bar-gap" style="width:'+(c.unlogged/maxCar*100).toFixed(2)+'%"></span></span>'+
    '<span class="bar-val">'+fmt(c.total)+'<small>'+plural(c.trips,T('поездка'),T('поездки'),T('поездок'))+'</small></span></div>').join('');
  const drvBars=st.drivers.map(d=>'<div class="bar-row clickable" role="button" tabindex="0" data-act="driver" data-driver="'+d.driver.id+'"><span class="bar-name">'+avatar(d.driver.id)+'<span>'+esc(d.driver.name)+'</span></span>'+
    '<span class="bar-track"><span class="bar-fill" style="width:'+(d.km/maxDrv*100).toFixed(2)+'%"></span></span>'+
    '<span class="bar-val">'+fmt(d.km)+'<small>'+plural(d.trips,T('поездка'),T('поездки'),T('поездок'))+'</small></span></div>').join('');
  const mx=niceMax(Math.max(10,...st.daily.map(d=>d.km))),n=st.daily.length;
  const grid=[0,mx/2,mx].map((t,i)=>'<div class="gl'+(i===0?' base':'')+'" style="bottom:'+(t/mx*100)+'%"><span>'+fmt(t)+'</span></div>').join('');
  const bars=st.daily.map((d,i)=>'<div class="cb'+(i===n-1?' today':'')+'" title="'+esc(dShort.format(d.ts))+': '+fmt(d.km)+T(' км"><div class="cb-bar" style="height:')+(d.km/mx*100).toFixed(2)+'%"></div></div>').join('');
  const xl=st.daily.map((d,i)=>{const show=n<=7||i%5===(n-1)%5;const t=n<=7?dDayW.format(d.ts)+' '+dNum.format(d.ts):dNum.format(d.ts);return '<span>'+(show?esc(i===n-1?T('сегодня'):t):'')+'</span>';}).join('');
  return head+'<div class="stack" style="gap:16px">'+kpis+'<div class="grid2">'+
    T('<section class="panel"><h3><span>По машинам</span><span class="faint">км</span></h3><div class="bars">')+carBars+T('</div><div class="legend"><span><i style="background:var(--ink)"></i>по записям</span><span><i class="hatch"></i>без записи: при выезде на одометре больше, чем при прошлой записи</span></div></section>')+
    T('<section class="panel"><h3><span>По водителям</span><span class="faint">км</span></h3><div class="bars">')+drvBars+'</div></section>'+
    T('<section class="panel wide"><h3><span>По дням</span><span class="faint">км по записям</span></h3><div class="chart" style="--n:')+n+'"><div class="chart-plot">'+grid+'<div class="chart-bars">'+bars+'</div></div><div class="chart-x">'+xl+'</div></div></section>'+
  '</div></div>';
}

function fmtDate(d){if(!d)return '—';const t=Date.parse(d+'T12:00:00Z');return new Intl.DateTimeFormat(LOC,{timeZone:'UTC',day:'numeric',month:'short',year:'numeric'}).format(t);}
function dueText(i){
  if(i.status==='unknown')return T('Нет записей — внесите последнее обслуживание');
  const parts=[];
  if(i.kmLeft!=null)parts.push(i.kmLeft<0?T('просрочено на ')+fmt(-i.kmLeft)+T(' км'):T('через ')+fmt(i.kmLeft)+T(' км'));
  if(i.daysLeft!=null)parts.push(i.daysLeft<0?T('просрочено на ')+plural(-i.daysLeft,T('день'),T('дня'),T('дней')):i.daysLeft===0?T('сегодня'):T('до ')+fmtDate(i.dueDate)+(i.daysLeft<=60?' ('+plural(i.daysLeft,T('день'),T('дня'),T('дней'))+')':''));
  return parts.join(T(' или '));
}
const SVC_ORDER={overdue:0,soon:1,ok:2,unknown:3};
function viewService(){
  const st=F.serviceStatus(state,NOW);
  const all=[].concat(...st.map(x=>x.items));
  const n=s=>all.filter(i=>i.status===s).length;
  const chips=T('<div class="svc-sum"><span class="svc-chip crit"><i></i>Просрочено <b>')+n('overdue')+T('</b></span><span class="svc-chip warn"><i></i>Скоро <b>')+n('soon')+T('</b></span><span class="svc-chip ok"><i></i>В порядке <b>')+n('ok')+'</b></span>'+(n('unknown')?T('<span class="svc-chip unknown"><i></i>Нет данных <b>')+n('unknown')+'</b></span>':'')+'</div>';
  const cards=st.map(x=>{
    const c=x.car,rows=x.items.slice().sort((a,b)=>SVC_ORDER[a.status]-SVC_ORDER[b.status]).map(i=>{
      const pct=i.status==='unknown'?0:Math.round(Math.min(1,i.used)*100);
      return '<button class="svc-row '+i.status+'" data-act="svc-add" data-car="'+c.id+'" data-type="'+i.type.id+'"><span class="svc-ic">'+ic(i.type.icon)+'</span><span class="svc-main"><span class="svc-name">'+esc(i.type.name)+'</span><span class="svc-due">'+esc(dueText(i))+'</span>'+(i.status==='unknown'?'':'<span class="svc-bar"><span style="width:'+pct+'%"></span></span>')+'</span><span class="svc-st">'+({overdue:T('Просрочено'),soon:T('Скоро'),ok:'OK',unknown:'—'}[i.status])+'</span></button>';
    }).join('');
    const worst=x.items.some(i=>i.status==='overdue')?'crit':x.items.some(i=>i.status==='soon')?'warn':'ok';
    return '<article class="svc-card"><div class="svc-head">'+carSVG(c.color,{id:c.id,side:true,surface:true})+'<div class="svc-id"><b>'+esc(c.name)+(c.model?' <span class="faint">'+esc(c.model)+'</span>':'')+'</b><span>'+(c.plate?plateHTML(c.plate):'')+'<span class="mono faint">'+(c.odo!=null?fmt(c.odo)+T(' км'):'')+'</span></span></div><span class="svc-dot '+worst+'"></span></div>'+
      '<div class="svc-rows">'+rows+'</div><div class="svc-foot"><button class="btn btn-sm" data-act="svc-add" data-car="'+c.id+'">'+ic('plus')+T('Запись о работах</button><button class="linkbtn sm" data-act="svc-hist" data-car="')+c.id+T('">История</button></div></article>');
  }).join('');
  const costs=F.serviceCosts(state,365,NOW),maxC=Math.max(1,...costs.map(c=>c.cost)),total=costs.reduce((a,c)=>a+c.cost,0);
  const costBars=costs.map(x=>{const c=carOf(x.carId);return '<div class="bar-row"><span class="bar-name"><i class="bar-dot" style="background:'+esc(c.color)+'"></i><span>'+esc(c.name)+'</span></span><span class="bar-track"><span class="bar-fill" style="width:'+(x.cost/maxC*100).toFixed(1)+'%"></span></span><span class="bar-val">'+fmt(x.cost)+' ₺<small>'+plural(x.count,T('запись'),T('записи'),T('записей'))+'</small></span></div>';}).join('');
  const recs=F.normService(state.service).records.filter(r=>!ui.svcCar||r.carId===ui.svcCar).slice().sort((a,b)=>a.date<b.date?1:a.date>b.date?-1:0);
  const lim=ui.svcAll?60:8,hist=recs.slice(0,lim).map(svcEntry).join('')+(recs.length>lim?T('<button class="btn btn-sm btn-block" data-act="svc-more" style="margin-top:12px">Показать все (')+recs.length+')</button>':'');
  const carOpts=T('<select class="sel" id="svc-car" aria-label="Машина"><option value="">Все машины</option>')+P.cars.map(c=>'<option value="'+c.id+'"'+(ui.svcCar===c.id?' selected':'')+'>'+esc(c.name)+'</option>').join('')+'</select>';
  return ph(T('Техобслуживание и документы'),T('ТО'),T('Сроки по пробегу и датам. Нажмите на строку, чтобы внести работы.'),
      '<div class="svc-actions"><button class="btn btn-sm btn-primary" data-act="svc-add">'+ic('plus')+T('Запись</button>')+(isMgr(role)?'<button class="btn btn-sm" data-act="svc-int">'+ic('sliders')+T('Интервалы</button>'):'')+'</div>')+
    chips+'<div class="svc-grid">'+cards+'</div>'+
    T('<div class="grid2" style="margin-top:20px"><section class="panel"><h3><span>Расходы за 12 месяцев</span><span>')+fmt(total)+' ₺</span></h3><div class="bars">'+costBars+'</div></section>'+
    T('<section class="panel"><h3><span>История обслуживания</span></h3><div style="margin:-6px 0 8px">')+carOpts+'</div>'+(hist||T('<div class="empty">Записей пока нет</div>'))+'</section></div>';
}
function svcEntry(r){
  const t=F.serviceType(r.type)||{name:r.type,icon:'flag'},c=carOf(r.carId);
  const sub=[];if(r.odo!=null)sub.push(fmt(r.odo)+T(' км'));if(r.place)sub.push(esc(r.place));if(r.byName)sub.push(esc(r.byName));if(r.note)sub.push('<span class="ent-note">«'+esc(r.note)+'»</span>');
  return '<div class="ent"><span class="ent-t svc-date">'+esc(fmtDate(r.date))+'</span><span class="ent-ic resolve">'+ic(t.icon)+'</span><div class="ent-main"><div class="ent-title"><b>'+esc(c?c.name:'')+'</b> · '+esc(t.name)+'</div><div class="ent-sub">'+sub.join('<span class="dot">·</span>')+'</div></div>'+(r.cost!=null?'<span class="ent-km">'+fmt(r.cost)+' ₺</span>':'')+'</div>';
}
function ivText(type){const t=F.serviceType(type);if(!t||t.id==='other')return T('Разовая запись, без срока');const iv=F.intervalOf(state,type),p=[];if(iv.km)p.push(T('каждые ')+fmt(iv.km)+T(' км'));if(iv.months)p.push(T('каждые ')+plural(iv.months,T('месяц'),T('месяца'),T('месяцев')));return T('Следующий срок: ')+p.join(T(' или '));}
function svcSheet(carId,type){
  const today=F.todayStr(NOW),c=carId?carOf(carId):null;
  const cars=T('<fieldset class="field"><legend class="lbl">Машина</legend><div class="opts ppl svc-cars">')+P.cars.map(x=>'<label class="opt"><input type="radio" name="carId" value="'+x.id+'"'+(x.id===carId?' checked':'')+'><span class="opt-face">'+carSVG(x.color,{id:x.id,side:true,surface:true})+'<span>'+esc(x.name)+'<span class="sub">'+esc(x.plate||'')+'</span></span></span></label>').join('')+'</div></fieldset>';
  const types=T('<fieldset class="field"><legend class="lbl">Что сделали</legend><div class="opts chips">')+F.SERVICE_TYPES.map(t=>'<label class="opt"><input type="radio" name="type" value="'+t.id+'"'+(t.id===type?' checked':'')+'><span class="opt-face">'+ic(t.icon)+esc(t.name)+'</span></label>').join('')+'</div><div class="hint" id="svc-iv">'+(type?ivText(type):T('Выберите вид работ'))+'</div></fieldset>';
  const body=cars+types+
    T('<div class="two"><div class="field"><label class="lbl" for="f-date">Дата</label><input class="inp" type="date" id="f-date" name="date" value="')+today+'" max="'+today+'"></div>'+
    T('<div class="field"><label class="lbl" for="f-cost">Стоимость, ₺<span class="opt-note">необязательно</span></label><input class="inp" id="f-cost" name="cost" inputmode="numeric" pattern="[0-9 ]*" placeholder="0"></div></div>')+
    T('<div class="field"><label class="lbl" for="f-svcodo">Пробег на момент работ<span class="opt-note" id="f-svcodo-note">')+(type&&!F.serviceType(type).needOdo?T('необязательно'):T('км'))+'</span></label><input class="inp mono" id="f-svcodo" name="odo" inputmode="numeric" pattern="[0-9 ]*" value="'+(c&&c.odo!=null?c.odo:'')+'" placeholder="'+(c&&c.odo!=null?fmt(c.odo):'000 000')+'"></div>'+
    T('<div class="field"><label class="lbl" for="f-place">Где делали<span class="opt-note">необязательно</span></label><input class="inp" id="f-place" name="place" maxlength="80" placeholder="Например: Doğuş Oto, TÜVTÜRK Kağıthane"></div>')+
    T('<div class="field"><label class="lbl" for="f-note">Комментарий<span class="opt-note">необязательно</span></label><textarea class="inp" id="f-note" name="note" rows="2" maxlength="250" placeholder="Что заменили, что посоветовали"></textarea></div>');
  openSheet(head(T('Запись о работах'),c?esc(c.name)+(c.plate?' · '+esc(c.plate):''):T('ТО, шины, страховка, техосмотр'))+'<form id="f" data-form="service" novalidate class="stack" style="gap:18px">'+body+formEnd(T('Сохранить запись'),'check')+'</form>');
}
function svcHistSheet(carId){
  const c=carOf(carId),recs=F.normService(state.service).records.filter(r=>r.carId===carId).sort((a,b)=>a.date<b.date?1:-1);
  openSheet(head(T('История ТО'),esc(c.name)+(c.plate?' · '+esc(c.plate):''))+'<div class="car-hero">'+carSVG(c.color,{id:c.id,surface:true})+'</div>'+(recs.length?recs.map(r=>'<div class="svc-hist-row">'+svcEntry(r)+(isMgr(role)?'<button class="linkbtn sm danger" data-act="svc-del" data-id="'+esc(r.id)+'" data-car="'+carId+'">'+ic('trash')+T('Удалить</button>'):'')+'</div>').join(''):T('<div class="empty">Записей пока нет</div>'))+
    T('<div class="sheet-actions"><button class="btn btn-ghost" data-act="close">Закрыть</button><button class="btn btn-primary btn-lg" data-act="svc-add" data-car="')+carId+'">'+ic('plus')+T('Запись</button></div>'));
}
function intervalsSheet(){
  const rows=F.SERVICE_TYPES.filter(t=>t.id!=='other').map(t=>{const iv=F.intervalOf(state,t.id);return '<div class="iv-row"><span class="iv-name">'+ic(t.icon)+esc(t.name)+'</span><label class="iv-f"><input class="inp sm mono" name="km_'+t.id+'" inputmode="numeric" value="'+iv.km+T('" aria-label="км"><span>км</span></label><label class="iv-f"><input class="inp sm mono" name="mo_')+t.id+'" inputmode="numeric" value="'+iv.months+T('" aria-label="мес"><span>мес</span></label></div>');}).join('');
  openSheet(head(T('Интервалы обслуживания'),T('0 — не учитывать. Срок считается от последней записи'))+'<form id="f" data-form="intervals" novalidate class="stack" style="gap:12px">'+rows+T('<div class="form-err" id="f-err" role="alert" hidden></div><div class="sheet-actions"><button class="btn btn-ghost" type="button" data-act="close">Отмена</button><button class="btn btn-primary btn-lg" type="submit">Сохранить</button></div></form>'));
}

function viewTeam(){
  const s=F.settingsOf(state),boss=isMgr(role);
  const drivers=state.drivers.map(d=>{
    const a=P.cars.find(c=>c.currentDriverId===d.id),inc=P.cars.find(c=>c.pendingTransfer&&c.pendingTransfer.toId===d.id);
    const status=a?T('<span class="pill trip">За рулём: ')+esc(a.name)+'</span>':inc?T('<span class="pill pending">Принимает: ')+esc(inc.name)+'</span>':T('<span class="pill unknown">Без машины</span>');
    const s7=F.driverStats(state,d.id,7,NOW);
    return '<div class="team-card" role="button" tabindex="0" data-act="driver" data-driver="'+d.id+'" aria-label="'+esc(d.name)+T(': подробнее">')+avatar(d.id,'lg')+'<div class="team-main"><b>'+esc(d.name)+' <span class="tile-chev" style="display:inline-grid;vertical-align:middle">'+ic('chev')+'</span></b>'+status+'<span class="faint" style="font-size:13px">'+fmt(s7.km)+T(' км · ')+plural(s7.trips,T('поездка'),T('поездки'),T('поездок'))+T(' за 7 дней</span>')+'<div class="team-actions"><button class="linkbtn sm" data-act="personal" data-driver="'+d.id+'">'+ic('user')+T('Открыть экран</button>')+
      (boss?'<button class="linkbtn sm" data-act="rename" data-driver="'+d.id+'">'+ic('edit')+T('Имя</button>')+(framed?'':'<button class="linkbtn sm" data-act="personal-link" data-driver="'+d.id+'">'+ic('link')+T('Ссылка</button>')):'')+'</div></div></div>';
  }).join('');
  const cars=P.cars.map(c=>'<div class="car-row">'+carSVG(c.color,{id:c.id,side:true,surface:true})+'<div class="car-row-main"><b>'+esc(c.name)+'</b><span class="faint">'+esc(c.model||T('Модель не указана'))+'</span>'+(c.plate?plateHTML(c.plate):'')+'</div>'+(boss?'<button class="btn btn-sm" data-act="details" data-car="'+c.id+'">'+ic('edit')+T('Изменить</button>'):'')+'</div>').join('');
  return ph(T('Четыре водителя'),T('Водители'),T('Личные экраны, машины и правила учёта.'))+
    '<div class="stack" style="gap:16px;max-width:980px"><button class="btn btn-sm" data-act="about" style="justify-self:start">'+ic('info')+T('Как это работает')+'</button>'+
    '<div class="team-grid">'+drivers+'</div>'+
    T('<section class="panel"><h3><span>Машины</span><span class="faint">модель, номер, цвет</span></h3><div class="car-rows">')+cars+'</div></section>'+
    '<div class="grid2">'+
      T('<section class="panel"><h3><span>Напоминания</span></h3><div class="prose"><p>Водители работают без графика. Если поездка идёт дольше <b>')+s.tripHours+T(' ч</b>, она попадает в «Нужно проверить» с именем водителя. Передача, которую не приняли за <b>')+s.transferMinutes+T(' мин</b>, выделяется отдельно. Долгая стоянка без незавершённых действий тревогу не вызывает.</p></div>')+(boss?'<button class="btn btn-sm" data-act="settings" style="margin-top:14px">'+ic('bell')+T('Настроить</button>'):'')+'</section>'+
      T('<section class="panel"><h3><span>Порядок работы</span></h3><ol class="steps"><li><span><b>Взял</b>Перед выездом водитель берёт машину на себя и сверяет пробег.</span></li><li><span><b>Передал</b>Машина переходит к коллеге только после его подтверждения.</span></li><li><span><b>Поставил</b>Паркинг, место, пробег и где ключи.</span></li></ol></section>')+
    '</div>'+
    (boss?T('<section class="panel"><h3><span>Данные</span></h3><p class="muted" style="margin:0 0 14px">')+(state.isDemo?T('Сейчас загружен пример: неделя условных поездок.'):T('Сейчас вы ведёте свой журнал.'))+T(' Записи хранятся в этом браузере. Копия сохраняет журнал, фото и настройки.</p>')+
      '<div class="btn-row"><button class="btn btn-sm" data-act="export">'+ic('download')+T('Журнал CSV</button><button class="btn btn-sm" data-act="backup">')+ic('download')+T('Сохранить копию</button><button class="btn btn-sm" data-act="restore">')+ic('upload')+T('Восстановить копию</button><button class="btn btn-sm" data-act="reset-demo">Загрузить пример</button><button class="btn btn-sm btn-danger" data-act="reset-empty">Пустой учёт</button></div></section>'):'')+
    '</div>';
}

/* ───────── v14: карта паркингов ───────── */
const MV={};          /* вид каждой карты: {x,y,w,h,auto} в единицах ISTMAP */
let mapPick=null,mapDrag=null,mapMoved=false;
const WATER=[{n:T('Босфор'),lat:41.086,lng:29.057},{n:T('Золотой Рог'),lat:41.036,lng:28.948},{n:T('Мраморное море'),lat:40.94,lng:28.99},{n:T('Чёрное море'),lat:41.29,lng:29.12}];
function geoXY(lat,lng){const M=window.ISTMAP;return [(lng-M.lon0)*M.kx,(M.lat0-lat)*M.ky];}
function xyGeo(x,y){const M=window.ISTMAP;return {lat:M.lat0-y/M.ky,lng:M.lon0+x/M.kx};}
function placeOf(id){const p=(state.places||{})[id];return p&&p.lat!=null?p:null;}
function placeLink(id){const p=(state.places||{})[id];if(!p)return '';if(p.link)return p.link;return p.lat!=null?'https://www.google.com/maps/search/?api=1&query='+p.lat+','+p.lng:'';}
function parkGroups(){return F.PARKINGS.map(id=>({id,name:F.locationName(id),cars:P.cars.filter(c=>c.status==='parked'&&c.location===id),place:placeOf(id)}));}
function mapHTML(key){
  if(!window.ISTMAP)return '';
  const M=window.ISTMAP,pick=mapPick&&key==='park',drv=P.cars.filter(c=>c.status==='driving');
  return '<div class="map'+(pick?' picking':'')+'" data-map="'+key+'">'+
    '<svg class="map-svg" preserveAspectRatio="none" viewBox="0 0 '+M.w+' '+M.h+'" aria-hidden="true"><rect class="map-sea" x="-9000" y="-9000" width="'+(M.w+18000)+'" height="'+(M.h+18000)+'"/><path class="map-land" d="'+M.land+'"/><path class="map-bd" d="'+M.d.map(d=>d.p).join('')+'"/><g class="map-lbl"></g></svg>'+
    '<div class="map-pins"></div>'+
    '<div class="map-ctl"><button type="button" data-act="map-zoom" data-map="'+key+'" data-z="1" aria-label="'+T('Приблизить')+'">'+ic('plus')+'</button><button type="button" data-act="map-zoom" data-map="'+key+'" data-z="-1" aria-label="'+T('Отдалить')+'">'+ic('minus')+'</button><button type="button" data-act="map-fit" data-map="'+key+'" aria-label="'+T('Показать все паркинги')+'">'+ic('fit')+'</button></div>'+
    (pick?'<div class="map-pick">'+ic('target')+'<span>'+tpl('Нажмите на карту там, где паркинг «{p}»',{p:esc(F.locationName(mapPick))})+'</span><button type="button" class="btn btn-sm" data-act="pick-cancel">'+T('Отмена')+'</button></div>':'')+
    (drv.length&&!pick?'<div class="map-road"><span class="live-dot"></span><span><b>'+T('В поездке')+':</b> '+drv.map(c=>esc(c.name)+' · '+esc(nameOf(c.currentDriverId))).join(', ')+'</span></div>':'')+
  '</div>';
}
function fitView(W,H){
  const pts=F.PARKINGS.map(placeOf).filter(Boolean).map(p=>geoXY(p.lat,p.lng));
  let x1,y1,x2,y2;
  if(pts.length){x1=Math.min(...pts.map(p=>p[0]));x2=Math.max(...pts.map(p=>p[0]));y1=Math.min(...pts.map(p=>p[1]));y2=Math.max(...pts.map(p=>p[1]));}
  else{[x1,y1]=geoXY(41.12,28.90);[x2,y2]=geoXY(41.00,29.10);}
  const mL=Math.min(90,W*.18),mR=Math.min(90,W*.18),mT=Math.min(110,H*.3),mB=Math.min(wide?80:50,H*.2);
  const s=Math.max((x2-x1)/Math.max(40,W-mL-mR),(y2-y1)/Math.max(40,H-mT-mB),Math.max(150,W*.45)/W);
  const cx=(x1+x2)/2,cy=(y1+y2)/2,w=W*s,h=H*s;
  return {x:cx-(W/2+(mL-mR)/2)*s,y:cy-(H/2+(mT-mB)/2)*s,w,h,auto:true};
}
function mountMaps(){
  document.querySelectorAll('.map[data-map]').forEach(el=>{
    const key=el.dataset.map,W=el.clientWidth,H=el.clientHeight;if(!W||!H)return;
    let v=MV[key];
    if(!v||v.auto)v=MV[key]=fitView(W,H);
    else{const cx=v.x+v.w/2,cy=v.y+v.h/2;v.h=v.w*H/W;v.x=cx-v.w/2;v.y=cy-v.h/2;}
    drawMap(el,v);
  });
}
function drawMap(el,v){
  const M=window.ISTMAP,W=el.clientWidth,H=el.clientHeight;if(!W||!H)return;
  const svg=el.querySelector('svg');svg.setAttribute('viewBox',v.x.toFixed(1)+' '+v.y.toFixed(1)+' '+v.w.toFixed(1)+' '+v.h.toFixed(1));
  const upp=v.w/W,pxkm=W/(v.w*0.02),fs=(12*upp).toFixed(1),inView=(x,y)=>x>v.x&&x<v.x+v.w&&y>v.y&&y<v.y+v.h;
  let lbl='';
  M.d.forEach(d=>{if(!inView(d.c[0],d.c[1])||Math.sqrt(d.a)*pxkm<95)return;lbl+='<text x="'+d.c[0]+'" y="'+d.c[1]+'" font-size="'+fs+'">'+esc(d.n)+'</text>';});
  WATER.forEach(w=>{const [x,y]=geoXY(w.lat,w.lng);if(inView(x,y))lbl+='<text class="w" x="'+x.toFixed(0)+'" y="'+y.toFixed(0)+'" font-size="'+(12.5*upp).toFixed(1)+'">'+esc(w.n)+'</text>';});
  const g=svg.querySelector('.map-lbl');g.setAttribute('stroke-width',(3.2*upp).toFixed(2));g.innerHTML=lbl;
  const pos=parkGroups().filter(x=>x.place).map(x=>{const [px,py]=geoXY(x.place.lat,x.place.lng);return {g:x,px:(px-v.x)/upp,py:(py-v.y)/upp};}).sort((a,b)=>a.py-b.py);
  const placed=pos.map(p=>({x:p.px-15,y:p.py-15,w:30,h:30}));
  const ov=r=>placed.reduce((a,q)=>a+Math.max(0,Math.min(r.x+r.w,q.x+q.w)-Math.max(r.x,q.x))*Math.max(0,Math.min(r.y+r.h,q.y+q.h)-Math.max(r.y,q.y)),0);
  const out=r=>(Math.max(0,-r.y)+Math.max(0,r.y+r.h-H)+Math.max(0,-r.x)+Math.max(0,r.x+r.w-W))*r.h;
  pos.forEach(p=>{const cars=p.g.cars,cw=Math.max(p.g.name.length*8.8,cars.length?cars.reduce((a,c)=>a+c.name.length*7.6+16,0)+(cars.length-1)*4:44)+22,ch=56;
    const up={x:p.px-cw/2,y:p.py-22-ch,w:cw,h:ch},dn={x:p.px-cw/2,y:p.py+22,w:cw,h:ch};
    p.down=ov(dn)+out(dn)*.6+1<ov(up)+out(up)*.6;placed.push(p.down?dn:up);});
  el.querySelector('.map-pins').innerHTML=pos.filter(p=>p.px>-60&&p.px<W+60&&p.py>-60&&p.py<H+90).map((p,i)=>{const x=p.g,n=x.cars.length;
    return '<button type="button" class="pin'+(p.down?' down':'')+(n?'':' empty')+(mapPick===x.id?' editing':'')+'" data-act="pin" data-place="'+x.id+'" style="left:'+p.px.toFixed(1)+'px;top:'+p.py.toFixed(1)+'px;--i:'+i+'" aria-label="'+esc(x.name)+': '+(n?esc(x.cars.map(c=>c.name).join(', ')):T('пусто'))+'">'+
      '<span class="pin-card"><b>'+esc(x.name)+'</b><span class="pin-cars">'+(n?x.cars.map(c=>'<i>'+esc(c.name)+'</i>').join(''):'<i class="none">'+T('пусто')+'</i>')+'</span></span><span class="pin-dot">'+(n||'')+'</span></button>';}).join('');
}
function zoomMap(key,f,cx,cy){
  const el=document.querySelector('.map[data-map="'+key+'"]'),v=MV[key];if(!el||!v)return;
  const M=window.ISTMAP,nw=Math.min(M.w*1.1,Math.max(70,v.w*f)),k=nw/v.w;
  if(cx==null){cx=v.x+v.w/2;cy=v.y+v.h/2;}
  v.x=cx-(cx-v.x)*k;v.y=cy-(cy-v.y)*k;v.w=nw;v.h=v.h*k;v.auto=false;drawMap(el,v);
}
function mapPoint(el,clientX,clientY){const r=el.getBoundingClientRect(),v=MV[el.dataset.map];return [v.x+(clientX-r.left)*v.w/r.width,v.y+(clientY-r.top)*v.h/r.height];}
function pickAt(el,clientX,clientY){
  const id=mapPick,[x,y]=mapPoint(el,clientX,clientY),g=xyGeo(x,y),cur=(state.places||{})[id]||{};
  mapPick=null;persist(F.setPlace(state,id,{lat:g.lat,lng:g.lng,link:cur.link||''}));
  toast(tpl('Точка паркинга «{p}» сохранена',{p:F.locationName(id)}));
}
function showPlace(id){
  const go=()=>{const s=document.getElementById('ps-'+id);if(!s)return;s.scrollIntoView({behavior:'smooth',block:'center'});s.classList.remove('flash');void s.offsetWidth;s.classList.add('flash');};
  if(view!=='park'){goView('park');setTimeout(go,60);}else go();
}

/* ───────── v14: страница «Паркинг» ───────── */
function psKeys(c){const k=c.keys;if(!k||k.kind==='unknown')return T('не отмечено');if(k.kind==='driver')return '<b class="b-alert">'+tpl('у водителя {n}',{n:esc(nameOf(k.driverId))})+'</b>';return k.kind==='security'?T('на охране'):T('в офисе');}
function psCar(c){
  return '<button class="ps-car" data-act="car" data-car="'+c.id+'"><span class="ps-photo">'+carSVG(c.color,{id:c.id,side:true,surface:true})+'</span>'+
    '<span class="ps-main"><span class="ps-name">'+esc(c.name)+(c.model?' <span>'+esc(c.model)+'</span>':'')+'</span>'+
    '<span class="ps-meta">'+(c.spot?esc(c.spot):esc(F.locationName(c.location)))+'</span><span class="ps-meta">'+T('Ключи')+': '+psKeys(c)+'</span></span>'+
    (c.plate?'<span class="ps-plate">'+plateHTML(c.plate)+'</span>':'')+'</button>';
}
function parkSection(g){
  const link=placeLink(g.id),n=g.cars.length,boss=isMgr(role);
  return '<section class="ps" id="ps-'+g.id+'"><div class="ps-head"><span class="ps-n'+(n?'':' zero')+'">'+n+'</span><span class="ps-t"><b>'+esc(g.name)+'</b><small>'+(n?plural(n,T('машина'),T('машины'),T('машин')):T('Сейчас пусто'))+'</small></span>'+
      (boss?'<button class="linkbtn sm" data-act="place" data-place="'+g.id+'">'+ic('edit')+T('Изменить точку')+'</button>':'')+'</div>'+
    (n?'<div class="ps-cars">'+g.cars.map(psCar).join('')+'</div>':'')+
    (link?'<a class="ps-go" href="'+esc(link)+'" target="_blank" rel="noopener noreferrer">'+ic('map')+'<span>'+T('Открыть в Google Maps')+'</span>'+ic('ext')+'</a>':
      boss?'<button class="ps-go ghost" data-act="place" data-place="'+g.id+'">'+ic('target')+'<span>'+T('Указать точку на карте')+'</span></button>':'')+
  '</section>';
}
function viewPark(){
  const groups=parkGroups(),drv=P.cars.filter(c=>c.status==='driving'),other=P.cars.filter(c=>c.status==='parked'&&F.PARKINGS.indexOf(c.location)<0);
  const places=state.places||{},demo=F.PARKINGS.some(id=>places[id]&&places[id].demo),missing=F.PARKINGS.filter(id=>!placeOf(id));
  const parked=P.cars.filter(c=>c.status==='parked').length;
  const note=isMgr(role)&&(demo||missing.length)?'<div class="park-note">'+ic('info')+'<span>'+(demo?T('Точки на карте примерные. Нажмите «Изменить точку» у паркинга и укажите точное место.')+' ':'')+(missing.length?T('Нет точки на карте')+': '+missing.map(id=>esc(F.locationName(id))).join(', ')+'.':'')+'</span></div>':'';
  const road=drv.length?'<section class="ps road"><div class="ps-head"><span class="ps-n live">'+drv.length+'</span><span class="ps-t"><b>'+T('В поездке')+'</b><small>'+T('Место во время поездки не отслеживается')+'</small></span></div><div class="ps-cars">'+
    drv.map(c=>'<button class="ps-car" data-act="car" data-car="'+c.id+'"><span class="ps-photo">'+carSVG(c.color,{id:c.id,side:true,surface:true})+'</span><span class="ps-main"><span class="ps-name">'+esc(c.name)+(c.model?' <span>'+esc(c.model)+'</span>':'')+'</span><span class="ps-meta"><b>'+esc(nameOf(c.currentDriverId))+'</b> · '+dur(NOW-ts(c.trip.startAt))+'</span>'+(c.trip.fromLocation?'<span class="ps-meta">'+T('Взял с')+': '+esc(F.locationName(c.trip.fromLocation))+'</span>':'')+'</span>'+(c.plate?'<span class="ps-plate">'+plateHTML(c.plate)+'</span>':'')+'</button>').join('')+'</div></section>':'';
  const oth=other.length?'<section class="ps"><div class="ps-head"><span class="ps-n">'+other.length+'</span><span class="ps-t"><b>'+T('Сервис и другие места')+'</b></span></div><div class="ps-cars">'+other.map(psCar).join('')+'</div></section>':'';
  return '<div class="park b-wrap'+(wide?' wide':'')+'"><div class="b-head"><h1 class="b-title">'+T('Паркинг')+'</h1><p class="b-sub">'+parked+' '+T('на месте')+' · '+drv.length+' '+T('в поездке')+'</p></div>'+
    '<div class="park-grid"><div class="park-map">'+mapHTML('park')+note+'</div><div class="park-list">'+groups.map(parkSection).join('')+road+oth+'</div></div></div>';
}
function placeSheet(id){
  const p=(state.places||{})[id]||{},name=F.locationName(id),has=p.lat!=null||!!p.link;
  const val=p.demo?'':(p.link||(p.lat!=null?p.lat+', '+p.lng:''));
  openSheet(head(esc(name),T('Точка на карте и ссылка для навигации'))+
    '<form id="f" data-form="place" data-place="'+id+'" novalidate class="stack" style="gap:18px">'+
    '<button type="button" class="btn btn-lg" data-act="pick-start" data-place="'+id+'">'+ic('target')+T('Указать на карте')+'</button>'+
    '<div class="field"><label class="lbl" for="f-geo">'+T('Или вставьте координаты / ссылку Google Maps')+'</label><input class="inp" id="f-geo" name="geo" value="'+esc(val)+'" placeholder="41.1106, 28.9878" autocomplete="off" spellcheck="false">'+
      '<div class="hint">'+T('В Google Maps нажмите и удерживайте место парковки — появятся координаты. Скопируйте и вставьте сюда. Ссылка «Поделиться» тоже подойдёт: по ней откроется навигация.')+'</div></div>'+
    (p.demo?'<p class="hint" style="margin:0">'+T('Сейчас на карте примерная точка из демо.')+'</p>':'')+
    '<div class="form-err" id="f-err" role="alert" hidden></div><div class="sheet-actions">'+
      (has?'<button class="btn btn-ghost" type="button" data-act="place-clear" data-place="'+id+'">'+T('Убрать точку')+'</button>':'<button class="btn btn-ghost" type="button" data-act="close">'+T('Отмена')+'</button>')+
      '<button class="btn btn-primary btn-lg" type="submit">'+T('Сохранить')+'</button></div></form>');
}

/* ───────── v14: главный экран (телефон и ПК) ───────── */
function carDaily(carId,days){
  const arr=[],idx={};for(let i=days-1;i>=0;i--){const k=dayKey(NOW-i*DAY);idx[k]=arr.length;arr.push({key:k,km:0});}
  const add=s=>{const k=dayKey(s.endAt);if(k in idx)arr[idx[k]].km+=s.distance;};
  const c=carOf(carId);
  P.trips.forEach(t=>{if(t.carId===carId&&c&&t.auditIndex>c.resetIndex)t.segments.forEach(add);});
  if(c&&c.trip)c.trip.segments.forEach(add);
  return arr;
}
function bossFoot(c){
  if(c.status==='parked'&&c.lastPark)return (c.lastPark.initial?T('Учёт начат'):T('Поставил')+' '+esc(c.lastPark.driverName||'—'))+', '+esc(when(c.lastPark.at));
  if(c.status==='driving'&&c.trip)return '<span class="status-text-driving">'+statusDot(c.pendingTransfer?'pending':'driving')+(c.trip.fromLocation?tpl('Выехал {t} · с {p}',{t:esc(when(c.trip.startAt)),p:esc(F.locationName(c.trip.fromLocation))}):tpl('Выехал {t}',{t:esc(when(c.trip.startAt))}))+'</span>';
  return '';
}
function greet(){const h=Number(new Intl.DateTimeFormat('en-GB',{timeZone:TZ,hour:'2-digit',hour12:false}).format(NOW))%24;return h<5?T('Доброй ночи'):h<12?T('Доброе утро'):h<18?T('Добрый день'):T('Добрый вечер');}
function dashCard(c,i){
  const drv=c.status==='driving',n=openIssues(c).length,pend=c.pendingTransfer;
  const chip=pend?'<span class="dc-chip status-chip-pending">'+statusDot('pending')+T('Передача')+'</span>':c.status==='unconfigured'?'<span class="dc-chip status-chip-none">'+statusDot('none')+T('Нет данных')+'</span>':drv?'<span class="dc-chip live status-chip-driving">'+statusDot('driving')+T('В поездке')+'</span>':'<span class="dc-chip status-chip-parked">'+statusDot('parked')+esc(F.locationName(c.location))+'</span>';
  const daily=carDaily(c.id,7),tot=daily.reduce((a,d)=>a+d.km,0),mx=Math.max(1,...daily.map(d=>d.km));
  const kv=(k,v)=>'<span class="b-kv"><span class="b-k">'+k+'</span><span class="b-v">'+v+'</span></span>';
  const flag=pend?'<span class="b-flag">'+T('Передача')+': '+esc(pend.fromName)+' → '+esc(pend.toName)+'</span>':n?'<span class="b-flag">'+plural(n,T('замечание'),T('замечания'),T('замечаний'))+'</span>':'';
  return '<button class="dc'+flashCls(c.id)+'" id="car-'+c.id+'" data-act="car" data-car="'+c.id+'" style="--i:'+i+'">'+
    '<span class="dc-hero">'+chip+'<span class="dc-photo">'+carSVG(c.color,{id:c.id,side:true,surface:true})+'</span></span>'+
    '<span class="dc-body"><span class="dc-id"><span class="dc-name">'+esc(c.name)+(c.model?' <span>'+esc(c.model)+'</span>':'')+'</span>'+(c.plate?'<span class="b-plate">'+plateHTML(c.plate)+'</span>':'')+'</span>'+
      '<span class="b-main">'+(drv?kv(T('Водитель'),'<b>'+esc(nameOf(c.currentDriverId))+'</b>'):'')+kv(T('Где'),bossWhere(c))+kv(T('Ключи'),bossKeys(c))+kv(T('Пробег'),c.odo!=null?'<b>'+fmt(c.odo)+'</b> '+T('км'):'—')+'</span>'+flag+
      '<span class="dc-foot"><span class="spark" aria-hidden="true">'+daily.map((d,j)=>'<i class="'+(j===daily.length-1?'today':'')+(d.km?'':' zero')+'" style="height:'+Math.max(6,Math.round(d.km/mx*100))+'%"></i>').join('')+'</span><span class="dc-week"><b>'+fmt(tot)+'</b> '+T('км за 7 дней')+'</span></span>'+
    '</span></button>';
}
function viewDash(){
  const parked=P.cars.filter(c=>c.status==='parked'),drv=P.cars.filter(c=>c.status==='driving'),items=attentionItems(false),crit=items.filter(a=>a.sev==='crit').length;
  const st=F.stats(state,7,NOW),byPark=F.PARKINGS.map(id=>{const k=parked.filter(c=>c.location===id).length;return k?esc(F.locationName(id))+' '+k:'';}).filter(Boolean).join(' · ');
  const me=role==='manager'?'':', '+esc(nameOf(role));
  const kpi=(i,act,val,label,sub,cls)=>'<button class="kpi-c'+(cls?' '+cls:'')+'" '+act+' style="--i:'+i+'"><span class="kpi-c-v" data-count="'+val+'">'+fmt(val)+'</span><span class="kpi-c-l">'+label+'</span><span class="kpi-c-s">'+(sub||'&nbsp;')+'</span></button>';
  const feed=P.audit.slice(-6).reverse();
  return '<div class="dash"><div class="dash-head"><div><p class="dash-date">'+esc(todayLabel())+'</p><h1 class="b-title">'+greet()+me+'</h1></div>'+
      '<div class="dash-acts"><button class="btn btn-sm" data-view="journal">'+ic('list')+T('Журнал')+'</button><button class="btn btn-sm" data-act="table">'+ic('table')+T('Журнал таблицей')+'</button></div></div>'+
    '<div class="kpi4">'+
      kpi(0,'data-view="park"',parked.length,T('на месте'),byPark)+
      kpi(1,'data-view="park"',drv.length,T('в поездке'),drv.map(c=>esc(nameOf(c.currentDriverId))).join(', '),drv.length?'live':'')+
      kpi(2,'data-view="stats"',st.logged+st.unlogged,T('км за 7 дней'),plural(st.trips,T('поездка'),T('поездки'),T('поездок')))+
      kpi(3,'data-act="goto-checks"',items.length,T('нужно проверить'),crit?plural(crit,T('срочное'),T('срочных'),T('срочных')):T('срочных нет'),crit?'crit':'')+
    '</div>'+
    '<div class="dash-grid"><div class="dash-cars">'+P.cars.map(dashCard).join('')+'</div>'+
      '<aside class="dash-side">'+
        '<section class="dash-card" style="--i:4"><div class="dash-h"><h2>'+T('Где машины')+'</h2><button class="linkbtn" data-view="park">'+T('Открыть карту')+' '+ic('arrow')+'</button></div>'+mapHTML('dash')+'</section>'+
        '<div id="checks" style="--i:5" class="dash-card flat">'+bossChecks()+'</div>'+
        '<section class="dash-card" style="--i:6"><div class="dash-h"><h2>'+T('Последние действия')+'</h2><button class="linkbtn" data-view="journal">'+T('Весь журнал')+' '+ic('arrow')+'</button></div><div class="dash-feed">'+(feed.length?feed.map(e=>entryHTML(e,true)).join(''):'<p class="muted">'+T('Пока пусто')+'</p>')+'</div></section>'+
      '</aside></div></div>';
}
function countUp(){
  if(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  const els=[...document.querySelectorAll('[data-count]')];if(!els.length)return;
  const t0=performance.now(),D=750;
  const step=t=>{const k=Math.min(1,(t-t0)/D),e=1-Math.pow(1-k,3);els.forEach(el=>{el.textContent=fmt(Math.round(Number(el.dataset.count)*e));});if(k<1)requestAnimationFrame(step);};
  requestAnimationFrame(step);
}

/* ───────── v20: серверная версия — вход по PIN, личные кабинеты, синхронизация ───────── */
let ME=null,SV=0,USERS=[],SRV_PENDING=[],SRV_BUSY=false,loginName='',loginErr='',loginBusy=false;
async function api(path,body){
  let r;
  try{r=await fetch(path,{method:body?'POST':'GET',headers:Object.assign({'X-Garage':'1'},body?{'Content-Type':'application/json'}:{}),body:body?JSON.stringify(body):undefined,credentials:'same-origin',cache:'no-store'});}
  catch(e){const err=new Error(T('Нет связи с сервером. Проверьте интернет.'));err.status=0;throw err;}
  let j=null;try{j=await r.json();}catch(e){}
  if(!r.ok){
    let message=(j&&j.error)||T('Ошибка сервера. Попробуйте ещё раз.');
    const odo=message.match(/^Проверьте пробег: было (\d+) км\. Если всё верно, попросите руководство исправить пробег$/);
    if(odo)message=tpl('Проверьте пробег: было {n} км. Если всё верно, попросите руководство исправить пробег',{n:fmt(Number(odo[1]))});
    const err=new Error(message);err.status=r.status;err.data=j;throw err;
  }
  return j;
}
/* все изменения проходят через сервер; локально считаем сразу, чтобы экран отвечал мгновенно */
if(SRV){
  ['transact','addServiceRecord','deleteServiceRecord','setIntervals','setSettings','setCarDetails','setPlace','renameDriver'].forEach(op=>{
    const orig=F[op];F[op]=function(s){const args=Array.prototype.slice.call(arguments,1);const next=orig.apply(F,arguments);srvPush(op,args);return next;};
  });
}
const CONFIRM_KINDS=['checkout','park','handover_request','handover_accept','wash'];
function srvPush(op,args){
  const cmd=op==='transact'&&args[0],kind=cmd&&CONFIRM_KINDS.indexOf(cmd.kind)>=0?cmd.kind:'';
  SRV_PENDING.push({op,args:JSON.parse(JSON.stringify(args.map(a=>a===undefined?null:a))),outcome:kind?{kind,carId:cmd.carId}:null});
  srvFlush();
}
async function srvFlush(){
  if(SRV_BUSY)return;SRV_BUSY=true;let failed=false;
  while(SRV_PENDING.length){
    const it=SRV_PENDING[0];
    try{const j=await api('/api/op',{op:it.op,args:it.args});SV=j.v;if(SRV_PENDING.length===1)state=F.upgrade(j.state);SRV_PENDING.shift();if(it.outcome)completeAction(it.outcome);if(j.photoWarning)toast(T(j.photoWarning),true);}
    catch(e){SRV_PENDING=[];failed=true;if(e.status===401){location.reload();return;}toast(T(e.message),true);try{await srvPull(true);}catch(e2){}}
  }
  SRV_BUSY=false;
  {const rb=$('#f-submit'),ri=$('#f-reset-word');if(rb&&ri)rb.disabled=serverResetBusy||ri.value!==T('СБРОС')||SRV_PENDING.length>0||SRV_BUSY;else if(rb&&failed)rb.disabled=false;}
  if(!dlg.open||failed)render();
}
async function srvPull(force){
  const j=await api('/api/state'+(force?'':'?v='+SV));
  if(j.same||j.v<SV)return false;SV=j.v;state=F.upgrade(j.state);return true;
}
function srvTyping(){const a=document.activeElement;return a&&/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName);}
let srvPollStarted=false;
function srvStartPoll(){
  if(srvPollStarted)return;srvPollStarted=true;
  const tick=async()=>{if(document.hidden||SRV_PENDING.length||SRV_BUSY||serverResetBusy||!ME)return;try{if(await srvPull()&&!dlg.open&&!srvTyping())render();}catch(e){if(e.status===401)location.reload();}};
  setInterval(tick,15000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)tick();});
  window.addEventListener('focus',tick);
}
async function srvBoot(){
  document.body.classList.add('srv');
  document.body.classList.add('login');
  $('#app').innerHTML='<div class="lg-wait">'+T('Загрузка…')+'</div>';
  try{
    const m=await api('/api/me');if(!m.user){const e=new Error('');e.status=401;throw e;}ME=m.user;role=ME.id;view=isMgr(role)?'cars':'mine';
    await srvPull(true);srvStartPoll();document.body.classList.remove('login');render();
  }catch(e){
    if(e.status===401){ME=null;USERS=[];renderLogin();}
    else{$('#app').innerHTML='<div class="lg-wait"><b>'+esc(e.message)+'</b><button class="btn btn-lg" data-act="srv-retry">'+T('Повторить')+'</button></div>';}
  }
}
function lgAvatar(u){const n=dn(u.name).trim(),w=n.split(/\s+/),t=/\d$/.test(n)?n.replace(/\D/g,''):(w[0].charAt(0)+(w[1]?w[1].charAt(0):'')).toUpperCase();return '<span class="lg-av'+(u.mgr?' mgr':'')+'">'+esc(t)+'</span>';}
function renderLogin(){
  document.body.classList.add('login');
  document.title=T('Вход');
  const lang='<button class="lg-lang" data-act="lang" aria-label="Русский / Türkçe">'+(LANG==='tr'?'TR':'RU')+'</button>';
  $('#app').innerHTML='<div class="lg"><div class="lg-top">'+lang+'</div>'+
    '<form id="login-form" class="stack" style="gap:18px" method="post" novalidate>'+
    '<div class="field"><label class="lbl" for="login-username">'+T('Логин')+'</label><input class="inp" id="login-username" name="username" type="text" autocomplete="username" autocapitalize="off" autocorrect="off" spellcheck="false" value="'+esc(loginName)+'" required></div>'+
    '<div class="field"><label class="lbl" for="login-password">'+T('Пароль')+'</label><input class="inp" id="login-password" name="password" type="password" autocomplete="current-password" required></div>'+
    '<div class="lg-err" role="alert">'+esc(loginErr)+'</div><button class="btn btn-primary btn-lg btn-block" id="login-submit" type="submit"'+(loginBusy?' disabled':'')+'>'+T('Войти')+'</button></form></div>';
}
async function loginSubmit(username,password){
  if(loginBusy)return;loginName=username;
  if(!username.trim()||!password){loginErr=T('Неверный логин или пароль');renderLogin();return;}
  loginBusy=true;const b=$('#login-submit');if(b)b.disabled=true;
  try{await api('/api/login',{username,password});loginErr='';loginBusy=false;await srvBoot();}
  catch(e){loginBusy=false;loginErr=T(e.message);renderLogin();}
}
function accountSheet(){
  const mgr=isMgr(role);
  const users=mgr?USERS.length?USERS:[]:[];
  const rows=users.map(u=>'<div class="acc-row">'+lgAvatar(u)+'<span class="acc-n">'+esc(dn(u.name))+(u.id===role?' <span class="faint">· '+T('вы')+'</span>':'')+'</span><button class="btn btn-sm" data-act="'+(u.id==='anton'?'pin-set':'password-set')+'" data-user="'+esc(u.id)+'">'+(u.id==='anton'?T('Новый PIN'):T('Задать пароль'))+'</button></div>').join('');
  openSheet(head(esc(nameOf(role)),mgr?T('Руководство'):T('Водитель'))+
    (mgr?'<div class="stack" style="gap:6px"><div class="lbl">'+T('Пароли и PIN-коды')+'</div><div class="acc-list">'+rows+'</div></div>':'')+
    (mgr?'<button class="btn btn-block" data-act="site-link">'+ic('link')+T('Ссылка доступа')+'</button>':'')+
    '<div class="sheet-actions"><button class="btn btn-ghost" data-act="close">'+T('Закрыть')+'</button><button class="btn btn-danger btn-lg" data-act="logout">'+ic('x')+T('Выйти')+'</button></div>');
  if(mgr&&!USERS.length)api('/api/users').then(j=>{USERS=j.users;if(dlg.open)accountSheet();}).catch(()=>{});
}
async function siteLinkSheet(){
  if(!isMgr(role))return;
  const j=await api('/api/site-link'),link=new URL(j.path,location.origin).href;
  openSheet(head(T('Ссылка доступа'))+'<div class="field"><label class="lbl" for="f-link">'+T('Ссылка доступа')+'</label><input class="inp" id="f-link" value="'+esc(link)+'" readonly></div>'+
    '<div class="sheet-actions"><button class="btn btn-ghost" data-act="close">'+T('Готово')+'</button><button class="btn btn-primary btn-lg" data-act="copy-link">'+ic('copy')+T('Скопировать')+'</button></div>');
}
function pinSheet(id){
  const u=USERS.find(x=>x.id===id)||{name:id,len:4,mgr:false};
  openSheet(head(T('Новый PIN'),esc(dn(u.name)))+'<form id="f" data-form="pin" data-user="'+esc(id)+'" novalidate class="stack" style="gap:18px">'+
    '<div class="field"><label class="lbl" for="f-pin">'+T('PIN-код')+' ('+(u.mgr?T('6 цифр'):T('4 цифры'))+')</label><input class="inp km-input" id="f-pin" name="pin" type="password" inputmode="numeric" pattern="[0-9]*" autocomplete="new-password" maxlength="8"></div>'+
    '<div class="form-err" id="f-err" role="alert" hidden></div><div class="sheet-actions"><button class="btn btn-ghost" type="button" data-act="account">'+T('Отмена')+'</button><button class="btn btn-primary btn-lg" type="submit">'+T('Сохранить')+'</button></div></form>');
  setTimeout(()=>{const i=$('#f-pin');if(i)i.focus();},60);
}
function passwordSheet(id){
  const u=USERS.find(x=>x.id===id);if(!u||id==='anton')return;
  openSheet(head(T('Задать пароль'),esc(dn(u.name)))+'<form id="f" data-form="password" data-user="'+esc(id)+'" novalidate class="stack" style="gap:18px">'+
    '<input type="hidden" name="username" autocomplete="username" value="'+esc(id)+'">'+
    '<div class="field"><label class="lbl" for="f-password">'+T('Пароль')+'</label><input class="inp" id="f-password" name="password" type="password" autocomplete="new-password" required></div>'+
    '<div class="form-err" id="f-err" role="alert" hidden></div><div class="sheet-actions"><button class="btn btn-ghost" type="button" data-act="account">'+T('Отмена')+'</button><button class="btn btn-primary btn-lg" type="submit">'+T('Сохранить')+'</button></div></form>');
  setTimeout(()=>{const i=$('#f-password');if(i)i.focus();},60);
}

function odoFixSheet(id){
  const c=carOf(id);
  openSheet(head(T('Исправить пробег'),esc(c.name)+(c.plate?' · '+esc(c.plate):''))+'<form id="f" data-form="odofix" data-car="'+id+'" novalidate class="stack" style="gap:18px">'+
    '<div class="field"><label class="lbl" for="f-odo">'+T('Новый пробег, км')+'</label><input class="inp km-input" id="f-odo" name="odo" inputmode="numeric" pattern="[0-9]*" autocomplete="off" value="'+(c.odo==null?'':c.odo)+'"><div class="hint">'+T('Сейчас в системе')+': <b>'+fmt(c.odo)+' '+T('км')+'</b>. '+T('Можно меньше или больше — исправление останется в журнале.')+'</div></div>'+
    '<div class="field"><label class="lbl" for="f-note">'+T('Причина')+'</label><input class="inp" id="f-note" name="note" maxlength="200" placeholder="'+T('Например: водитель ошибся цифрой')+'"></div>'+
    '<div class="form-err" id="f-err" role="alert" hidden></div><div class="sheet-actions"><button class="btn btn-ghost" type="button" data-act="close">'+T('Отмена')+'</button><button class="btn btn-primary btn-lg" type="submit" id="f-submit">'+T('Сохранить')+'</button></div></form>');
}
/* ───────── v22: мойки ───────── */
function washDay(e){return e.washDate||dayKey(e.at);}
function washAgo(e){const n=Math.round((Date.parse(dayKey(NOW)+'T00:00:00Z')-Date.parse(washDay(e)+'T00:00:00Z'))/DAY);return n<=0?T('сегодня'):n===1?T('вчера'):plural(n,T('день'),T('дня'),T('дней'))+' '+T('назад');}
function viewWash(){
  const list=P.audit.filter(e=>e.kind==='wash').slice().sort((x,y)=>washDay(y).localeCompare(washDay(x))||ts(y.at)-ts(x.at)),month=dayKey(NOW).slice(0,7);
  const cars=P.cars.map(c=>{
    const w=list.find(e=>e.carId===c.id),n=list.filter(e=>e.carId===c.id&&washDay(e).slice(0,7)===month).length,off=c.status==='unconfigured';
    return '<button class="w-car"'+(off?' disabled':' data-act="wash" data-car="'+c.id+'"')+'><span class="w-photo">'+carSVG(c.color,{id:c.id,side:true,surface:true})+'</span>'+
      '<span class="w-main"><span class="w-name">'+esc(c.name)+(c.model?' <span>'+esc(c.model)+'</span>':'')+'</span>'+
      '<span class="w-last">'+(w?'<b>'+esc(F.washName(w.washType))+'</b> · '+esc(washAgo(w)):T('Ещё не мыли'))+'</span>'+
      '<span class="w-month">'+T('В этом месяце')+': <b>'+n+'</b></span></span>'+(off?'':'<span class="w-add">'+ic('plus')+'</span>')+'</button>';
  }).join('');
  const rows=list.slice(0,60).map(e=>'<div class="w-row"><span class="w-date">'+esc(fmtDate(washDay(e)))+'</span><span class="w-what"><b>'+esc((carOf(e.carId)||{}).name||'')+'</b> · '+esc(F.washName(e.washType))+
    '<small>'+esc(e.actorName)+(e.note?' · «'+esc(e.note)+'»':'')+'</small></span></div>').join('');
  return '<div class="b-wrap"><div class="b-head"><h1 class="b-title">'+T('Мойки')+'</h1></div>'+
    '<button class="btn btn-go btn-xl btn-block" data-act="wash">'+ic('drop')+T('Записать мойку')+'</button>'+
    '<div class="w-cars">'+cars+'</div>'+
    '<section class="w-hist"><div class="b-h2">'+T('История')+'</div>'+(rows||'<p class="muted" style="margin:6px 0 0">'+T('Пока нет записей')+'</p>')+'</section></div>';
}
function washSheet(carId){
  const cars=P.cars.filter(c=>c.status!=='unconfigured'),mine=P.cars.find(c=>c.currentDriverId===role);
  if(!cars.length){toast(T('Сначала руководство вносит машины'),true);return;}
  carId=carId||(mine&&mine.id)||(cars.length===1?cars[0].id:'');
  const today=dayKey(NOW),radio=(name,val,label,on)=>'<label class="w-chip"><input type="radio" name="'+name+'" value="'+val+'"'+(on?' checked':'')+'><span>'+label+'</span></label>';
  openSheet(head(T('Мойка'),T('Отметьте, что сделали'))+'<form id="f" data-form="wash" novalidate class="stack" style="gap:18px">'+
    '<fieldset class="field"><legend class="lbl">'+T('Машина')+'</legend><div class="w-pick">'+cars.map(c=>'<label class="w-opt"><input type="radio" name="carId" value="'+c.id+'"'+(c.id===carId?' checked':'')+'><span>'+carSVG(c.color,{id:c.id,side:true,surface:true})+'<b>'+esc(c.name)+'</b></span></label>').join('')+'</div></fieldset>'+
    '<fieldset class="field"><legend class="lbl">'+T('Что сделали')+'</legend><div class="w-chips">'+F.WASH_TYPES.map((t,i)=>radio('washType',t.id,esc(t.name),i===0)).join('')+'</div></fieldset>'+
    '<fieldset class="field w-when"><legend class="lbl">'+T('Когда')+'</legend><div class="w-chips">'+radio('when','today',T('Сегодня'),true)+radio('when','yesterday',T('Вчера'),false)+radio('when','other',T('Другая дата'),false)+'</div>'+
      '<input class="inp w-date-inp" type="date" name="washDate" max="'+today+'" value="'+today+'" aria-label="'+T('Дата')+'"></fieldset>'+
    '<div class="field"><label class="lbl" for="f-note">'+T('Комментарий')+' <span class="opt-note">'+T('необязательно')+'</span></label><input class="inp" id="f-note" name="note" maxlength="200" placeholder="'+T('Например: салон, багажник, где мыли')+'"></div>'+
    '<div class="form-err" id="f-err" role="alert" hidden></div><div class="sheet-actions"><button class="btn btn-ghost" type="button" data-act="close">'+T('Отмена')+'</button><button class="btn btn-go btn-lg" type="submit" id="f-submit">'+ic('check')+T('Записать')+'</button></div></form>');
}

function render(){
  if(SRV&&!ME)return;
  document.title=T('Гараж');
  NOW=Date.now();
  P=F.project(state);
  if(view==='mine'&&isMgr(role))view='cars';
  if(!isMgr(role)&&['stats','service','team','park'].indexOf(view)>=0)view='mine';
  if(view!=='park')mapPick=null;
  document.body.classList.toggle('drv',!isMgr(role));
  document.body.classList.add('calm');
  document.body.classList.toggle('wide',wide);
  renderTop();renderTabs();
  $('#storageWarning').innerHTML=storageError?'<div class="note warn" style="margin-bottom:16px">'+ic('alert')+'<span>'+esc(storageError)+'</span></div>':'';
  const app=$('#app');
  app.innerHTML=view==='mine'?viewMine():view==='park'?viewPark():view==='wash'?viewWash():view==='journal'?viewJournal():view==='stats'?viewStats():view==='service'?viewService():view==='team'?viewTeam():viewCars();
  const entering=view!==lastView;lastView=view;
  app.classList.remove('enter');
  if(entering){void app.offsetWidth;app.classList.add('enter');clearTimeout(render.t);render.t=setTimeout(()=>app.classList.remove('enter'),1500);}
  mountMaps();
  if(entering&&wide)countUp();
}

/* ───────── sheets ───────── */
const dlg=$('#sheet');
function closeParkPhoto(){
  const full=dlg.querySelector('.park-photo-full');if(full)full.remove();
  document.documentElement.classList.remove('park-photo-open');
}
function head(title,sub){
  return '<div class="grab" aria-hidden="true"></div><div class="sheet-head"><div><h2 id="sheet-title">'+title+'</h2>'+(sub?'<p>'+sub+'</p>':'')+T('</div><button class="x" type="button" data-act="close" aria-label="Закрыть">')+ic('x')+'</button></div>';
}
function openSheet(html){dlg.classList.remove('full');
  closeParkPhoto();
  photoSeq++;photoData=null;photoBusy=false;parkedPhotoSeq++;parkPhotoData=null;
  $('#sheetBody').innerHTML=html;
  applyKeyboardHints($('#sheetBody'));
  if(!dlg.open){try{dlg.showModal();}catch(e){dlg.setAttribute('open','');}}
  document.documentElement.classList.add('sheet-open');
  updateSheetViewport();
  dlg.scrollTop=0;
}
function closeSheet(){dlg.classList.remove('full');closeParkPhoto();photoSeq++;photoData=null;photoBusy=false;parkedPhotoSeq++;parkPhotoData=null;dlg.style.transform='';document.documentElement.classList.remove('sheet-open');if(dlg.open){try{dlg.close();}catch(e){dlg.removeAttribute('open');}}}
function applyKeyboardHints(root){
  if(!root)return;
  root.querySelectorAll('input[name="odo"],#f-odo,#f-svcodo').forEach(el=>{el.setAttribute('inputmode','numeric');el.setAttribute('pattern','[0-9]*');el.setAttribute('enterkeyhint','done');});
  root.querySelectorAll('input[name="spot"],input[name="place"],input[name="note"],textarea[name="note"],#f-spot,#f-place,#f-note').forEach(el=>{el.setAttribute('enterkeyhint','done');el.setAttribute('autocapitalize','sentences');});
}
function updateSheetViewport(){
  if(!dlg||!dlg.open)return;
  const vv=window.visualViewport;
  if(vv){dlg.style.setProperty('--vvh',Math.max(120,vv.height)+'px');dlg.style.setProperty('--vvtop',Math.max(0,vv.offsetTop)+'px');}
}
if(window.visualViewport){
  window.visualViewport.addEventListener('resize',updateSheetViewport);
  window.visualViewport.addEventListener('scroll',updateSheetViewport);
}
dlg.addEventListener('close',()=>document.documentElement.classList.remove('sheet-open'));
function formEnd(label,icon){
  return '<div class="form-err" id="f-err" role="alert" hidden></div><p class="form-note">'+ic('clock')+T('Автор и время запишутся автоматически</p>')+
    T('<div class="sheet-actions"><button class="btn btn-ghost" type="button" data-act="close">Отмена</button><button class="btn btn-primary btn-lg" type="submit" id="f-submit">')+(icon?ic(icon):'')+label+'</button></div>';
}
function kmField(prev,prefill,kind){
  const unchangedPark=kind==='park'&&prev!=null&&Number(prefill)===prev;
  const hint=kind==='checkout'?T('Совпадает с одометром — просто подтвердите. Отличается — нажмите и исправьте'):unchangedPark?T('Пробег не изменился. Проверьте одометр'):prev==null?T('Текущий общий пробег с приборной панели'):kind==='handover_accept'?T('Сверьте с приборкой. Если цифра другая, исправьте'):T('Не меньше ')+fmt(prev)+T(' км');
  const maxLength='';
  return T('<div class="field"><label class="lbl" for="f-odo">Пробег с одометра')+(prev!=null?T('<span class="opt-note">последний: ')+fmt(prev)+'</span>':'')+'</label>'+
    '<div class="km-wrap"><input id="f-odo" name="odo" class="inp km-input" inputmode="numeric"'+maxLength+' pattern="[0-9]*" autocomplete="off" enterkeyhint="done" value="'+(prefill!=null?prefill:'')+'" placeholder="'+(prev!=null?fmt(prev):'000 000')+'" data-prev="'+(prev!=null?prev:'')+'" data-kind="'+kind+T('" aria-describedby="f-odo-hint"><span class="u">км</span></div>')+
    '<div class="hint'+(unchangedPark?' warn':'')+'" id="f-odo-hint">'+hint+'</div></div>';
}
function locationField(){
  return T('<fieldset class="field"><legend class="lbl">Где оставили машину</legend><div class="opts z">')+F.LOCATIONS.map(l=>'<label class="opt z-'+l.tone+'"><input type="radio" name="location" value="'+l.id+'"><span class="opt-face">'+sign(l.id)+'<span>'+esc(l.name)+'</span></span></label>').join('')+'</div></fieldset>'+
    T('<div class="field"><label class="lbl" for="f-spot"><span id="f-spot-lbl">Этаж, место или адрес</span><span class="opt-note" id="f-spot-req">необязательно</span></label><input id="f-spot" name="spot" class="inp" maxlength="160" autocomplete="off" placeholder="Например: −2 этаж, место 18"></div>');
}
function keysField(allowUnknown,selected){
  const boss=isMgr(role);
  const ch=[['security',T('На охране')],['office',T('В офисе')],['driver',boss?T('У водителя'):T('У меня')]];if(allowUnknown)ch.push(['unknown',T('Пока неизвестно')]);
  return T('<fieldset class="field"><legend class="lbl">Где ключи</legend><div class="opts chips">')+ch.map(([id,l])=>'<label class="opt"><input type="radio" name="keyKind" value="'+id+'"'+(selected===id?' checked':'')+'><span class="opt-face">'+ic('key')+esc(l)+'</span></label>').join('')+'</div></fieldset>'+
    (boss?'<div class="field" id="f-keydrv"'+(selected==='driver'?'':' hidden')+T('><label class="lbl" for="f-keydriver">У какого водителя</label><select class="inp" id="f-keydriver" name="keyDriverId"><option value="">Выберите водителя</option>')+state.drivers.map(d=>'<option value="'+d.id+'">'+esc(d.name)+'</option>').join('')+'</select></div>':'')+
    (boss?'':'')+(boss?T('<div class="field"><label class="lbl" for="f-keynote">Уточнение по ключам<span class="opt-note">необязательно</span></label><input id="f-keynote" name="keyNote" class="inp" maxlength="100" placeholder="Например: стойка охраны у въезда"></div>'):'');
}
function noteField(ph,open){
  return '<details class="more"'+(open?' open':'')+'><summary>'+ic('plus')+T('Комментарий</summary><div class="field"><label class="lbl" for="f-note">Комментарий<span class="opt-note">необязательно</span></label><textarea id="f-note" name="note" class="inp" rows="2" maxlength="250" placeholder="')+esc(ph)+'"></textarea></div></details>';
}
function photoField(label){
  return '<details class="more"><summary>'+ic('camera')+esc(label)+T('<span class="opt-note">необязательно</span></summary><input type="file" id="f-photo" accept="image/*" capture="environment" class="file-inp"><div class="hint">Фото сохраняется вместе с записью в журнале.</div><div id="f-photo-prev" class="photo-prev"></div></details>');
}
/* Android часто открывает только галерею — даём две кнопки: камера и галерея. На iPhone одна кнопка (система сама предлагает «Снять фото»). */
const IS_ANDROID=typeof navigator!=='undefined'&&/Android/i.test(navigator.userAgent||'');
function parkPhotoField(){
  const pick=IS_ANDROID
    ?'<div class="park-photo-two"><label class="btn park-photo-pick">'+ic('camera')+T('Сфотографировать')+'<input type="file" id="f-photo-cam" accept="image/*" capture="environment" aria-label="'+T('Сфотографировать')+'"></label>'+
      '<label class="btn park-photo-pick">'+ic('image')+T('Из галереи')+'<input type="file" id="f-photo" accept="image/*" aria-label="'+T('Из галереи')+'"></label></div>'
    :'<label class="btn park-photo-pick">'+ic('camera')+T('Фото места')+'<input type="file" id="f-photo" accept="image/*" aria-label="'+T('Фото места')+'"></label>';
  return '<div class="field park-photo-field">'+pick+
    '<span class="opt-note">'+T('необязательно')+'</span>'+
    '<div id="f-photo-prev" class="photo-prev" aria-live="polite"></div></div>';
}

function actionSheet(kind,id){
  const c=carOf(id);if(!c)return;
  const firstCheckout=kind==='checkout'&&c.status==='unconfigured';
  if(isMgr(role)&&kind!=='init'){toast(T('Для действий с машиной выберите водителя: кнопка справа вверху'),true);return;}
  const L={checkout:[T('Взять ')+c.name,T('Подтвердить выезд'),'key'],park:[T('Поставить ')+c.name,T('Подтвердить парковку'),'park'],handover_request:[T('Передать ')+c.name,T('Предложить передачу'),'swap'],handover_accept:[T('Принять ')+c.name,T('Подтвердить получение'),'check'],init:[T('Где стоит ')+c.name+'?',T('Сохранить данные'),'check']}[kind];
  let ctx=T('<div>Последнее показание: <b>')+(c.odo==null?T('не указано'):fmt(c.odo)+T(' км'))+'</b></div>';
  if(kind==='checkout')ctx+='<div>'+placeHTML(c.location,c.spot)+T(' · ключи: <b>')+esc(keysText(c).toLowerCase())+'</b></div>';
  if(kind==='handover_accept')ctx+=T('<div>Передаёт: <b>')+esc(c.pendingTransfer.fromName)+'</b>'+(c.pendingTransfer.note?' · «'+esc(c.pendingTransfer.note)+'»':'')+'</div>';
  if(kind==='handover_request')ctx+=T('<div>До принятия машина числится за вами</div>');
  if(kind==='park')ctx+=T('<div>В поездке с ')+tFmt.format(ts(c.trip.segment.startAt))+T(', получили на <b>')+fmt(c.trip.segment.startOdo)+T(' км</b></div>');
  if(kind==='init')ctx=T('<div>Начальная запись: с неё начнётся учёт этой машины</div>');
  if(!isMgr(role)&&kind!=='init')ctx=kind==='handover_accept'?'<div>'+T('Передаёт')+': <b>'+esc(c.pendingTransfer.fromName)+'</b></div>':'<div>'+T('Последний пробег')+': <b>'+(firstCheckout?'0 '+T('км'):c.odo==null?'—':fmt(c.odo)+' '+T('км'))+'</b></div>';
  let body=kind==='checkout'?'':'<div class="ctx">'+ctx+'</div>';
  if(kind==='handover_request'){
    body+=T('<fieldset class="field"><legend class="lbl">Кому передаёте</legend><div class="opts ppl">')+state.drivers.filter(d=>d.id!==role).map(d=>{const b=occupied(d.id,id);return '<label class="opt"><input type="radio" name="toId" value="'+d.id+'"><span class="opt-face">'+avatar(d.id)+'<span>'+esc(d.name)+'<span class="sub">'+(b?T('сейчас у него: ')+esc(b.name):T('свободен'))+'</span></span></span></label>';}).join('')+T('</div><div class="hint">Получатель подтвердит приём на своём экране.</div></fieldset>');
  }
  body+=kmField(c.odo,firstCheckout?0:(kind==='checkout'||kind==='park'||kind==='handover_accept')?c.odo:null,kind);
  if(kind==='park'||kind==='init'){
    body+=locationField()+keysField(kind==='init',kind==='init'?'unknown':(isMgr(role)?null:'security'));
    if(kind==='init')body+=T('<div class="field"><label class="lbl" for="f-parkedby">Кто поставил машину</label><select class="inp" id="f-parkedby" name="parkedById"><option value="">Пока неизвестно</option>')+state.drivers.map(d=>'<option value="'+d.id+'">'+esc(d.name)+'</option>').join('')+'</select></div>';
  }
  if(kind==='checkout'&&openIssues(c).length)body+='<div class="note warn">'+ic('alert')+T('<span>Открытые замечания: ')+esc(openIssues(c).map(i=>F.issueName(i.type)).join(', '))+T('. Проверьте перед выездом.</span></div>');
  body+=noteField(kind==='checkout'?T('Цель поездки'):T('Важное уточнение'));
  if(kind==='park')body+=parkPhotoField();
  else if(kind!=='init'&&isMgr(role))body+=photoField(T('Фото одометра'));
  openSheet(head(esc(L[0]),esc(kind==='init'?T('Начальные данные'):nameOf(role)))+'<form id="f" data-form="action" data-kind="'+kind+'" data-car="'+id+'" novalidate class="stack" style="gap:18px">'+body+formEnd(L[1],L[2])+'</form>');
}
function simpleSheet(kind,id){
  const c=carOf(id),p=c&&c.pendingTransfer;if(!p)return;
  const decline=kind==='handover_decline';
  openSheet(head(decline?T('Отклонить передачу?'):T('Отменить передачу?'),esc(c.name))+'<form id="f" data-form="simple" data-kind="'+kind+'" data-car="'+id+'" data-request="'+esc(p.id)+'" novalidate class="stack" style="gap:18px">'+
    T('<div class="ctx">Ответственным останется <b>')+esc(p.fromName)+T('</b>. Ключи и пробег не изменятся.</div>')+
    T('<div class="field"><label class="lbl" for="f-note">Причина<span class="opt-note">необязательно</span></label><input id="f-note" name="note" class="inp" maxlength="250" placeholder="Коротко"></div>')+
    formEnd(decline?T('Отклонить'):T('Отменить передачу'))+'</form>');
}
function keysSheet(id){
  const c=carOf(id);
  openSheet(head(T('Где ключи · ')+esc(c.name),T('Сейчас: ')+esc(keysText(c)))+'<form id="f" data-form="keys" data-car="'+id+'" novalidate class="stack" style="gap:18px">'+keysField(false,null)+formEnd(T('Сохранить'),'key')+'</form>');
}
function issueSheet(id){
  const c=carOf(id);
  openSheet(head(T('Замечание · ')+esc(c.name),T('Останется на карточке машины, пока его не закроют'))+'<form id="f" data-form="issue" data-car="'+id+'" novalidate class="stack" style="gap:18px">'+
    T('<fieldset class="field"><legend class="lbl">Что нужно отметить</legend><div class="opts chips">')+F.ISSUE_TYPES.map(t=>'<label class="opt"><input type="radio" name="issueType" value="'+t.id+'"><span class="opt-face">'+ic(t.icon)+esc(t.name)+'</span></label>').join('')+'</div></fieldset>'+
    T('<div class="field"><label class="lbl" for="f-note">Что случилось<span class="opt-note" id="f-note-req">для заправки можно пропустить</span></label><textarea id="f-note" name="note" class="inp" rows="2" maxlength="250" placeholder="Например: царапина на заднем бампере"></textarea></div>')+
    photoField(T('Фото замечания'))+formEnd(T('Добавить замечание'),'flag')+'</form>');
}
function issuesSheet(id){
  const c=carOf(id),items=c.issues.slice().sort((a,b)=>(a.status==='resolved')-(b.status==='resolved')||ts(b.at)-ts(a.at));
  const list=items.length?items.map(i=>{const t=F.issueType(i.type),open=i.status==='open';
    return '<article class="issue-rec'+(open?'':' done')+'"><div class="issue-rec-h"><span class="ichip '+(open?t.sev:'')+'">'+ic(t.icon)+'<span>'+esc(t.name)+'</span></span><span class="pill '+(open?'pending':'parked')+'">'+(open?T('Открыто'):T('Закрыто'))+'</span></div>'+
      '<p>'+esc(i.text)+'</p><div class="faint" style="font-size:13px">'+esc(i.authorName)+' · '+esc(when(i.at))+'</div>'+
      (open?'':'<div class="note ok">'+ic('check')+'<span>'+esc(i.resolution)+' <span class="faint">· '+esc(i.resolvedByName)+', '+esc(when(i.resolvedAt))+'</span></span></div>')+
      '<div class="btn-row">'+(i.photo?'<button class="btn btn-sm" data-act="photo" data-event="'+esc(i.id)+'">'+ic('camera')+T('Фото</button>'):'')+(open?'<button class="btn btn-sm btn-primary" data-act="issue-resolve" data-car="'+id+'" data-issue="'+esc(i.id)+'">'+ic('check')+T('Отметить решение</button>'):'')+'</div></article>';}).join(''):T('<div class="empty">Замечаний пока нет</div>');
  openSheet(head(T('Замечания · ')+esc(c.name),openIssues(c).length?plural(openIssues(c).length,T('открытое'),T('открытых'),T('открытых')):T('Открытых нет'))+'<div class="stack" style="gap:10px">'+list+'</div>'+
    T('<div class="sheet-actions"><button class="btn btn-ghost" data-act="close">Закрыть</button><button class="btn btn-primary btn-lg" data-act="issue_report" data-car="')+id+'">'+ic('plus')+T('Добавить</button></div>'));
}
function resolveSheet(id,issueId){
  const c=carOf(id),i=c.issues.find(x=>x.id===issueId);if(!i)return;
  openSheet(head(T('Закрыть замечание'),esc(c.name)+' · '+esc(F.issueName(i.type)))+'<form id="f" data-form="resolve" data-car="'+id+'" data-issue="'+esc(issueId)+'" novalidate class="stack" style="gap:18px"><div class="ctx">'+esc(i.text)+'</div>'+
    T('<div class="field"><label class="lbl" for="f-note">Что сделано</label><textarea id="f-note" name="note" class="inp" rows="2" maxlength="250" placeholder="Например: заправил, заменили деталь"></textarea></div>')+formEnd(T('Закрыть замечание'),'check')+'</form>');
}
function photoSheet(eventId){
  const e=state.events.find(x=>x.id===eventId);if(!e||!e.photo)return;
  openSheet(head(T('Фото к записи'),esc(e.actorName)+' · '+esc(when(e.at)))+'<img class="evidence" src="'+esc(e.photo)+T('" alt="Фото, прикреплённое к записи">'));
}
async function loadParkPhoto(id,seq){
  try{
    const data=await api('/api/photo/'+encodeURIComponent(id));
    if(seq!==parkedPhotoSeq||!dlg.open||!document.getElementById('park-photo-block'))return;
    parkPhotoData=data.photo;
    const block=document.getElementById('park-photo-block');
    const place=F.locationName(data.location),meta=[place,data.actorName,when(data.at)].filter(Boolean).map(esc).join(' · ');
    block.innerHTML='<h3>'+T('Где стоит')+'</h3><button class="park-photo-thumb" type="button" data-act="park-photo-full" data-car="'+esc(id)+'" aria-label="'+T('Фото места, открыть на весь экран')+'"><img src="'+esc(data.photo)+'" alt="'+T('Фото места')+'" loading="lazy"></button><div class="park-photo-meta">'+meta+'</div>';
  }catch(err){
    if(seq!==parkedPhotoSeq||!dlg.open)return;
    const block=document.getElementById('park-photo-block');
    if(block)block.innerHTML='<div class="hint">'+T('Не удалось загрузить фото места.')+'</div>';
  }
}
function carSheet(id){
  const c=carOf(id);if(!c)return;let rows='';
  if(c.status==='parked'){
    rows+=T('<dt>Где</dt><dd>')+placeHTML(c.location,c.spot)+T('</dd><dt>Ключи</dt><dd>')+'<span class="'+(c.keys&&c.keys.kind==='driver'?'keys-driver':'')+'">'+esc(keysText(c))+'</span>'+(c.keys&&c.keys.note?' · '+esc(c.keys.note):'')+'</dd>';
    if(c.lastPark)rows+=T('<dt>Поставил</dt><dd>')+esc(c.lastPark.driverName||T('не указано'))+', '+esc(when(c.lastPark.at))+'</dd>';
  }else if(c.status==='driving'){
    const seg=c.trip.segment;
    rows+=T('<dt>За рулём</dt><dd>')+esc(nameOf(c.currentDriverId))+T(', с ')+tFmt.format(ts(seg.startAt))+' ('+dur(NOW-ts(seg.startAt))+')</dd>';
    if(c.pendingTransfer)rows+=T('<dt>Передача</dt><dd>→ ')+esc(c.pendingTransfer.toName)+', '+esc(ago(c.pendingTransfer.at))+'</dd>';
    if(c.trip.fromLocation)rows+=T('<dt>Взял с</dt><dd>')+placeHTML(c.trip.fromLocation,c.trip.fromSpot||'')+'</dd>';
  }else rows+=T('<dt>Где</dt><dd class="muted">Нет начальных данных</dd>');
  const st=F.stats(state,7,NOW).cars.find(x=>x.car.id===id);
  {const sv=F.serviceStatus(state,NOW).find(x=>x.car.id===id).items.filter(i=>i.status!=='unknown').sort((a,b)=>b.used-a.used)[0];if(sv)rows+=T('<dt>Ближайшее ТО</dt><dd><button class="linkbtn sm" data-act="svc-hist" data-car="')+id+'" style="padding:0;white-space:normal;text-align:left"><span class="svc-dot '+({overdue:'crit',soon:'warn',ok:'ok'}[sv.status])+'" style="display:inline-block"></span>'+esc(sv.type.name)+': '+esc(dueText(sv))+'</button></dd>';}
  rows+=T('<dt>За 7 дней</dt><dd>')+fmt(st.total)+T(' км')+(st.unlogged?' <span class="ent-flag">('+fmt(st.unlogged)+T(' без записи)</span>'):'')+'</dd>';
  const issues=openIssues(c).map(i=>{const t=F.issueType(i.type);return '<div class="alert '+t.sev+' static"><span class="alert-ic">'+ic(t.icon)+'</span><span><span class="alert-t">'+esc(t.name)+'</span><span class="alert-s">'+esc(i.text)+' · '+esc(i.authorName)+', '+esc(ago(i.at))+'</span></span><button class="btn btn-sm" data-act="issue-resolve" data-car="'+id+'" data-issue="'+esc(i.id)+'">'+ic('check')+T('Решено</button></div>');}).join('');
  const acts=carActions(c).replace(/class="btn /g,'class="btn btn-lg ').replace(/class="btn"/g,'class="btn btn-lg"');
  const tools=[];
  if(c.status!=='unconfigured'){tools.push('<button class="btn btn-sm" data-act="issue_report" data-car="'+id+'">'+ic('plus')+T('Замечание</button>'));if(canKeys(c))tools.push('<button class="btn btn-sm" data-act="keys" data-car="'+id+'">'+ic('key')+T('Ключи</button>'));}
  if(isMgr(role)&&c.status==='parked'&&placeOf(c.location))tools.push('<button class="btn btn-sm" data-act="show-place" data-place="'+c.location+'">'+ic('map')+T('На карте')+'</button>');
  if(c.status!=='unconfigured')tools.push('<button class="btn btn-sm" data-act="wash" data-car="'+id+'">'+ic('drop')+T('Мойка')+'</button>');
  if(isMgr(role)&&c.status==='parked'&&!c.pendingTransfer)tools.push('<button class="btn btn-sm" data-act="odofix" data-car="'+id+'">'+ic('edit')+T('Исправить пробег')+'</button>');
  if(isMgr(role))tools.push('<button class="btn btn-sm" data-act="details" data-car="'+id+'">'+ic('edit')+T('Модель и номер</button>'));
  const hist=P.audit.filter(e=>e.carId===id).slice(-6).reverse();
  openSheet(head(esc(c.name)+(c.model?' <span class="faint">'+esc(c.model)+'</span>':''),statusPill(c))+
    '<div class="car-hero">'+carSVG(c.color,{id:c.id,surface:true})+(c.plate?plateHTML(c.plate):'')+'</div>'+
    (c.status==='parked'&&c.hasPhoto?'<section class="park-photo-block" id="park-photo-block" aria-label="'+T('Где стоит')+'"><div class="photo-skeleton" aria-hidden="true"></div><div class="hint">'+T('Загрузка фото…')+'</div></section>':'')+
    '<div class="stack" style="gap:12px"><div class="b-odo">'+(c.odo!=null?fmt(c.odo)+' <span>'+T('км')+'</span>':'—')+'</div><dl class="kv">'+rows+'</dl></div>'+
    (issues?T('<div class="stack" style="gap:8px"><div class="sh" style="margin:0"><h2>Открытые замечания</h2></div>')+issues+'</div>':'')+
    (isMgr(role)&&c.status!=='unconfigured'?'':'<div class="sheet-acts">'+acts+'</div>')+(tools.length?'<div class="b-tools">'+tools.join('')+'</div>':'')+
    (hist.length?T('<div><div class="sh" style="margin:0 0 4px"><h2>Последние записи</h2><button class="linkbtn" data-act="history" data-car="')+id+T('">Весь журнал ')+ic('arrow')+'</button></div>'+hist.map(e=>entryHTML(e,true)).join('')+'</div>':'')+
    (isMgr(role)?'<button class="btn btn-lg btn-danger btn-block" data-act="car-reset" data-car="'+id+'">'+ic('trash')+T('Сбросить машину')+'</button>':''));
  parkPhotoData=null;
  if(c.status==='parked'&&c.hasPhoto)loadParkPhoto(id,++parkedPhotoSeq);
}
function carResetSheet(id){
  const c=carOf(id);if(!c||!isMgr(role))return;
  openSheet(head(T('Сбросить машину?'),esc(c.name))+
    T('<div class="ctx">Машина вернётся в “Нет данных”: пробег, водитель, ключи, паркинг обнулятся. Журнал сохранится.</div>')+
    T('<div class="sheet-actions"><button class="btn btn-ghost" data-act="car-reset-cancel" data-car="')+id+
    T('">Отмена</button><button class="btn btn-danger-fill btn-lg" data-act="car-reset-confirm" data-car="')+id+
    T('">Да, сбросить</button></div>'));
}
function driverSheet(did){
  const d=F.driver(state,did);if(!d)return;
  const a=P.cars.find(c=>c.currentDriverId===did),inc=P.cars.find(c=>c.pendingTransfer&&c.pendingTransfer.toId===did);
  const s7=F.driverStats(state,did,7,NOW),s30=F.driverStats(state,did,30,NOW);
  const status=a?T('<span class="pill trip">За рулём: ')+esc(a.name)+'</span>':inc?T('<span class="pill pending">Принимает: ')+esc(inc.name)+'</span>':T('<span class="pill unknown">Без машины</span>');
  let now='';
  if(a){const seg=a.trip.segment;now='<button class="drv-now" data-act="car" data-car="'+a.id+'">'+carSVG(a.color,{id:a.id,side:true,surface:true})+'<span class="tile-info"><span class="tile-name">'+esc(a.name)+(a.model?' <span class="faint">'+esc(a.model)+'</span>':'')+'</span><span class="tile-meta"><span>'+ic('clock')+T('с ')+tFmt.format(ts(seg.startAt))+' · '+dur(NOW-ts(seg.startAt))+'</span>'+(a.trip.fromLocation?'<span>'+ic('pin')+esc(F.locationName(a.trip.fromLocation))+'</span>':'')+'</span>'+(a.pendingTransfer?'<span class="tile-meta"><span>'+ic('swap')+T('передаёт: ')+esc(a.pendingTransfer.toName)+'</span></span>':'')+'</span></button>';}
  const keys=P.cars.filter(c=>c.status==='parked'&&c.keys&&c.keys.kind==='driver'&&c.keys.driverId===did);
  const lastPark=P.audit.slice().reverse().find(e=>e.kind==='park'&&e.actorId===did);
  const maxCar=Math.max(1,...s30.byCar.map(x=>x.km));
  const cars=s30.byCar.filter(x=>x.trips).sort((x,y)=>y.km-x.km).map(x=>'<div class="bar-row"><span class="bar-name"><i class="bar-dot" style="background:'+esc(x.car.color)+'"></i><span>'+esc(x.car.name)+'</span></span><span class="bar-track"><span class="bar-fill" style="width:'+(x.km/maxCar*100).toFixed(1)+'%"></span></span><span class="bar-val">'+fmt(x.km)+'<small>'+plural(x.trips,T('поездка'),T('поездки'),T('поездок'))+'</small></span></div>').join('');
  const notes=[];
  keys.forEach(c=>notes.push('<div class="note info">'+ic('key')+T('<span>У него ключи от <b>')+esc(c.name)+T('</b>. Машина стоит: ')+esc(F.locationName(c.location)+(c.spot?', '+c.spot:''))+'</span></div>'));
  if(a&&attentionItems(false).some(x=>x.kind==='shift'&&x.carId===a.id))notes.push('<div class="note warn">'+ic('clock')+T('<span>Поездка на ')+esc(a.name)+T(' давно не закрыта</span></div>'));
  if(s7.gaps.length)notes.push('<div class="note warn">'+ic('alert')+T('<span>При его выездах за 7 дней пробег был больше записанного: ')+s7.gaps.map(g=>esc((carOf(g.carId)||{}).name)+' +'+fmt(g.km)+T(' км')).join(', ')+T('. Расхождение могло возникнуть до него, стоит уточнить.</span></div>'));
  const hist=P.audit.filter(e=>e.actorId===did||e.toId===did||e.fromId===did).slice(-8).reverse();
  openSheet(head(T('Водитель'),status)+
    '<div class="drv-hero">'+avatar(did,'xl')+'<div class="drv-hero-txt"><b>'+esc(d.name)+'</b><span class="faint">'+(lastPark?T('Последняя парковка: ')+esc(lastPark.carId?(carOf(lastPark.carId)||{}).name:'')+', '+esc(F.locationName(lastPark.location))+', '+esc(when(lastPark.at)):T('Парковок пока не было'))+'</span></div></div>'+
    now+notes.join('')+
    '<div class="kpis"><div class="kpi"><div class="kpi-v">'+fmt(s7.km)+T('<small>км</small></div><div class="kpi-l">за 7 дней</div></div><div class="kpi"><div class="kpi-v">')+s7.trips+'</div><div class="kpi-l">'+plural(s7.trips,T('поездка'),T('поездки'),T('поездок')).replace(/^\d+ /,'')+T(' за 7 дней</div></div><div class="kpi"><div class="kpi-v">')+fmt(s30.km)+T('<small>км</small></div><div class="kpi-l">за 30 дней</div></div></div>')+
    T('<dl class="kv"><dt>В пути за 7 дней</dt><dd>')+(s7.timeMs?dur(s7.timeMs):'—')+T('</dd><dt>Поставил машин</dt><dd>')+s7.parks+T(' за 7 дней</dd><dt>Передачи</dt><dd>отдал ')+s7.handoversOut+T(', принял ')+s7.handoversIn+T('</dd><dt>Замечаний отметил</dt><dd>')+s7.issues+'</dd></dl>'+
    (cars?T('<div><div class="sh" style="margin:0 0 10px"><h2>На каких машинах · 30 дней</h2></div><div class="bars">')+cars+'</div></div>':'')+
    '<div class="btn-row"><button class="btn btn-sm" data-act="drvlog" data-driver="'+did+'">'+ic('list')+T('Весь журнал</button><button class="btn btn-sm" data-act="personal" data-driver="')+did+'">'+ic('user')+T('Открыть его экран</button>')+(isMgr(role)?'<button class="btn btn-sm" data-act="rename" data-driver="'+did+'">'+ic('edit')+T('Имя</button>'):'')+'</div>'+
    (hist.length?T('<div><div class="sh" style="margin:0 0 4px"><h2>Последние записи</h2></div>')+hist.map(e=>entryHTML(e,true)).join('')+'</div>':''));
}
function roleSheet(){
  const item=(id,sub)=>{const cur=id===role;return '<button class="pick-row role-row'+(cur?' current':'')+'" data-act="setrole" data-role="'+id+'">'+avatar(id,'lg')+'<span class="pick-main"><span class="pick-name">'+esc(nameOf(id))+'</span><span class="pick-where">'+esc(sub)+'</span></span>'+(cur?T('<span class="pill parked">Вы</span>'):'')+'</button>';};
  const list=F.MANAGERS.map(m=>item(m.id,T('Обзор всех машин, журнал, пробег и настройки'))).join('')+state.drivers.map(d=>{const a=P.cars.find(c=>c.currentDriverId===d.id),inc=P.cars.find(c=>c.pendingTransfer&&c.pendingTransfer.toId===d.id);return item(d.id,a?T('За рулём: ')+a.name:inc?T('Принимает: ')+inc.name:T('Без машины'));}).join('');
  openSheet(head(T('Кто вы?'),T('В рабочей версии каждый входит под своим PIN. Здесь выбор для показа ролей'))+'<div class="pick">'+list+'</div>');
}
function aboutSheet(){
  openSheet(head(T('Как это работает'),T('Версия ')+APP_VERSION+' · '+(state.isDemo?T('загружен пример с условными поездками'):T('вы ведёте свой журнал')))+
    T('<ol class="steps"><li><span><b>Взял</b>Водитель берёт машину и сверяет пробег. Если на одометре больше, чем при прошлой записи, руководитель увидит «км без записи».</span></li><li><span><b>Передал</b>Машина переходит к коллеге после того, как он нажмёт «Принять».</span></li><li><span><b>Поставил</b>Паркинг, место, пробег и где ключи. Замечания остаются на карточке, пока их не закроют.</span></li></ol>')+
    (state.isDemo?T('<div class="ctx"><b>Попробуйте в примере</b><div>Выберите «')+esc(nameOf('d3'))+T('» и примите BMW, которую передаёт ')+esc(nameOf('d1'))+T('. Затем поставьте её и отметьте ключи.</div></div>'):'')+
    T('<div class="prose"><p><b>Это прототип.</b> Записи хранятся в этом браузере, телефоны водителей пока не видят друг друга.</p><p>Для работы команды ставим на сервер: общая база, вход по PIN для каждого водителя и уведомления в Telegram. Интерфейс остаётся этим.</p></div>')+
    T('<div class="sheet-actions"><span></span><button class="btn btn-primary btn-lg" data-act="close">Понятно</button></div>'));
}
function settingsSheet(){
  const s=F.settingsOf(state);
  openSheet(head(T('Напоминания'),T('Время Стамбула'))+'<form id="f" data-form="settings" novalidate class="stack" style="gap:18px">'+
    '<input type="hidden" name="shiftEnd" value="'+esc(s.shiftEnd)+'">'+'<div class="field"><label class="lbl" for="f-th">'+T('Напоминать о незакрытой поездке через, ч')+'</label><input class="inp" id="f-th" name="tripHours" type="number" min="1" max="72" inputmode="numeric" value="'+s.tripHours+'"><div class="hint">'+T('Боссу видно в «Нужно проверить», водителю — на его экране.')+'</div></div>'+
    T('<div class="field"><label class="lbl" for="f-tm">Выделять передачу, которую не приняли, через, мин</label><input class="inp" id="f-tm" name="transferMinutes" type="number" min="1" max="240" inputmode="numeric" value="')+s.transferMinutes+'"></div>'+
    T('<div class="form-err" id="f-err" role="alert" hidden></div><div class="sheet-actions"><button class="btn btn-ghost" type="button" data-act="close">Отмена</button><button class="btn btn-primary btn-lg" type="submit">Сохранить</button></div></form>'));
}
const SWATCHES=['#6B737C','#556270','#34373C','#15161A','#1F2B47','#2C5BB8','#5B6470','#A9B0B8','#F2F1EC','#B3262D','#2F7A55','#C9A227','#7A4A2E'];
function detailsSheet(id){
  const c=carOf(id),pal=SWATCHES.indexOf(c.color)>=0?SWATCHES:[c.color].concat(SWATCHES);
  openSheet(head(T('Модель и номер'),esc(c.name))+'<form id="f" data-form="details" data-car="'+id+'" novalidate class="stack" style="gap:18px">'+
    T('<div class="field"><label class="lbl" for="f-model">Модель</label><input class="inp" id="f-model" name="model" maxlength="60" value="')+esc(c.model)+T('" placeholder="Например: 520i, A6, Egea, Octavia"></div>')+
    T('<div class="field"><label class="lbl" for="f-plate">Госномер<span class="opt-note">необязательно</span></label><input class="inp" id="f-plate" name="plate" maxlength="24" value="')+esc(c.plate)+'" placeholder="34 ABC 123" style="text-transform:uppercase"></div>'+
    T('<div class="field"><span class="lbl">Фото машины</span><div class="photo-edit">')+carSVG(c.color,{id:c.id,surface:true})+'<div class="stack" style="gap:8px"><label class="btn btn-sm" for="f-photo">'+ic('camera')+T('Загрузить своё</label><input type="file" id="f-photo" accept="image/*" hidden>')+(c.photo?T('<label class="chk"><input type="checkbox" name="photoReset" value="1"> Вернуть стандартное</label>'):'')+T('</div></div><div id="f-photo-prev" class="photo-prev"></div><div class="hint">Лучше снимок сбоку или спереди на однотонном фоне.</div></div>')+
    T('<fieldset class="field"><legend class="lbl">Цвет на схемах</legend><div class="swatches">')+pal.map((col,i)=>'<label class="swatch-opt"><input type="radio" name="color" value="'+col+'"'+(col===c.color?' checked':'')+'><span class="swatch" style="background:'+col+'" title="'+col+'"></span></label>').join('')+'</div></fieldset>'+
    T('<div class="form-err" id="f-err" role="alert" hidden></div><div class="sheet-actions"><button class="btn btn-ghost" type="button" data-act="close">Отмена</button><button class="btn btn-primary btn-lg" type="submit">Сохранить</button></div></form>'));
}
function renameSheet(did){
  const d=F.driver(state,did);
  openSheet(head(T('Имя водителя'),T('В прежних записях останется прежнее имя'))+'<form id="f" data-form="rename" data-driver="'+did+T('" novalidate class="stack" style="gap:18px"><div class="field"><label class="lbl" for="f-name">Имя и фамилия</label><input class="inp" id="f-name" name="name" maxlength="40" value="')+esc(d.name)+'"></div>'+
    T('<div class="form-err" id="f-err" role="alert" hidden></div><div class="sheet-actions"><button class="btn btn-ghost" type="button" data-act="close">Отмена</button><button class="btn btn-primary btn-lg" type="submit">Сохранить</button></div></form>'));
}
function linkSheet(did){
  const link=location.href.split('#')[0]+'#'+did;
  openSheet(head(T('Личная ссылка'),esc(nameOf(did)))+T('<div class="field"><label class="lbl" for="f-link">Открывает экран этого водителя</label><input class="inp" id="f-link" value="')+esc(link)+T('" readonly></div><p class="muted" style="margin:0">Ссылка запоминает выбор водителя и не проверяет личность. На другом телефоне нужен доступ к той же размещённой версии.</p>')+
    T('<div class="sheet-actions"><button class="btn btn-ghost" data-act="close">Готово</button><button class="btn btn-primary btn-lg" data-act="copy-link">')+ic('copy')+T('Скопировать</button></div>'));
}
function resetSheet(demo){
  openSheet(head(demo?T('Загрузить пример?'):T('Начать пустой учёт?'),T('Текущий журнал будет заменён'))+T('<p class="muted" style="margin:0">Сохраните копию, если хотите оставить текущие записи и фото. ')+(demo?T('Загрузится неделя условных поездок, передачи и замечания.'):T('После очистки внесите пробег, расположение и ключи каждой машины.'))+'</p>'+
    '<button class="btn btn-sm" data-act="backup" style="justify-self:start">'+ic('download')+T('Сохранить копию</button>')+
    T('<div class="sheet-actions"><button class="btn btn-ghost" data-act="close">Отмена</button><button class="btn btn-danger-fill btn-lg" data-act="confirm-reset" data-mode="')+(demo?'demo':'empty')+T('">Заменить данные</button></div>'));
}
let pendingRestore=null;
function restoreSheet(restored){
  pendingRestore=restored;
  openSheet(head(T('Восстановить копию?'),T('Текущий журнал будет заменён'))+T('<div class="ctx">В копии <b>')+restored.events.length+T('</b> записей. Фото и настройки восстановятся вместе с журналом.</div>')+
    T('<div class="sheet-actions"><button class="btn btn-ghost" data-act="close">Отмена</button><button class="btn btn-primary btn-lg" data-act="confirm-restore">Восстановить</button></div>'));
}
/* ───────── files ───────── */
function todayFile(){return dayKey(Date.now());}
/* ───────── v16: экспорт — файл, «Отправить», «Скопировать» ───────── */
let dlNS=null;
const dlReady=(window.claude&&typeof window.claude.use==='function')?Promise.resolve().then(()=>window.claude.use('downloads')).then(ns=>{dlNS=ns;return ns;},()=>null):Promise.resolve(null);
const inHost=!!(window.claude&&typeof window.claude.use==='function');
function canShareFiles(){try{return !!(navigator.canShare&&navigator.share&&navigator.canShare({files:[new File(['x'],'x.csv',{type:'text/csv'})]}));}catch(e){return false;}}
async function shareFile(name,text,mime){
  try{const f=new File([text],name,{type:mime});if(navigator.canShare&&navigator.share&&navigator.canShare({files:[f]})){await navigator.share({files:[f],title:name});return 'ok';}}
  catch(e){if(e&&e.name==='AbortError')return 'cancel';}
  return 'no';
}
async function copyText(t){
  if(copySync(t))return true;
  try{if(navigator.clipboard&&navigator.clipboard.writeText){await navigator.clipboard.writeText(t);return true;}}catch(e){}
  const host=dlg.open?dlg:document.body,ta=document.createElement('textarea');
  ta.value=t;ta.setAttribute('readonly','');ta.style.cssText='position:fixed;top:0;left:0;width:1px;height:1px;opacity:0';host.appendChild(ta);
  ta.focus();ta.select();try{ta.setSelectionRange(0,t.length);}catch(e){}
  let ok=false;try{ok=document.execCommand('copy');}catch(e){}ta.remove();return ok;
}
/* Сохранить файл: Claude → «Поделиться» (iPhone) → обычная загрузка. Возвращает true, если файл ушёл. */
async function saveFile(name,text,mime){
  const dl=dlNS||await Promise.race([dlReady,new Promise(r=>setTimeout(()=>r(null),1500))]);
  if(dl){
    try{await dl.save({filename:name,data:new Blob([text],{type:mime})});toast(T('Файл сохранён: ')+name);return true;}
    catch(e){const code=e&&e.code;if(code==='declined')return true;if(code==='rate_limited'){toast(T('Окно сохранения уже открыто'),true);return true;}}
  }
  const sh=await shareFile(name,text,mime);if(sh!=='no')return true;
  if(!inHost){try{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type:mime}));a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},1500);toast(T('Файл скачан: ')+name);return true;}catch(e){}}
  return false;
}
async function offerFile(name,text,mime){if(!(await saveFile(name,text,mime)))textSheet(name,text);}
function textSheet(title,text){
  openSheet(head(esc(title),T('Сохранить файл здесь не получилось. Скопируйте текст и вставьте, куда нужно'))+
    '<button class="btn btn-primary btn-lg btn-block" data-act="copy-text">'+ic('copy')+T('Скопировать')+'</button>'+
    '<textarea class="inp mono" id="f-text" rows="8" readonly style="font-size:12px">'+esc(text)+'</textarea>');
}
let EXP=null;
function exportRows(){
  const rows=[[T('Дата'),T('Время'),T('Машина'),T('Действие'),T('Кто'),T('Кому'),T('От кого'),T('Паркинг'),T('Место'),T('Одометр, км'),T('Проехал, км'),T('Без записи, км'),T('Ключи'),T('Замечание'),T('Комментарий')]];
  const names={init:T('Учёт начат'),checkout:T('Взял машину'),handover_request:T('Предложил передачу'),handover_accept:T('Принял машину'),handover:T('Передал машину'),handover_cancel:T('Отменил передачу'),handover_decline:T('Отклонил передачу'),park:T('Поставил'),car_reset:T('Сбросил машину'),issue_report:T('Замечание'),issue_resolve:T('Закрыл замечание'),keys:T('Отметил ключи'),odo_fix:T('Исправил пробег')};
  const dF=new Intl.DateTimeFormat(LOC,{timeZone:TZ,day:'2-digit',month:'2-digit',year:'numeric'});
  P.audit.filter(matchesEvent).slice().reverse().forEach(e=>{const t=ts(e.at),k=e.keyKind?keysWord({keyKind:e.keyKind,keyDriverName:e.keyDriverName,keyNote:e.keyNote}):'';
    rows.push([dF.format(t),tFmt.format(t),(carOf(e.carId)||{}).name||'',(e.kind==='wash'?F.washName(e.washType):(names[e.kind]||e.kind)),dn(e.actorName||''),dn(e.toName||''),dn(e.fromName||''),e.location?F.locationName(e.location):'',e.spot||'',e.odo==null?'':e.odo,e.distance==null?'':e.distance,e.odoGap>0?e.odoGap:'',dn(k),e.issueType?F.issueName(e.issueType):'',e.note||'']);});
  return rows;
}
function exportCSV(){
  const rows=exportRows();
  const cell=v=>{let t=String(v==null?'':v);if(typeof v==='string'&&/^[=+\-@\t\r]/.test(t))t="'"+t;return '"'+t.replace(/"/g,'""')+'"';};
  const tsv=rows.map(r=>r.map(v=>{let t=String(v==null?'':v).replace(/[\t\r\n]+/g,' ');if(/^[=+\-@]/.test(t))t="'"+t;return t;}).join('\t')).join('\n');
  const flt=[ui.filterCar!=='all'?(carOf(ui.filterCar)||{}).name:'',ui.filterDriver!=='all'?nameOf(ui.filterDriver):''].filter(Boolean).join(' · ');
  EXP={name:T('Гараж_журнал_')+todayFile()+'.csv',csv:'﻿'+rows.map(r=>r.map(cell).join(';')).join('\r\n'),tsv,n:rows.length-1,flt};
  exportSheet();
}
function exportSheet(){
  const share=canShareFiles();
  openSheet(head(T('Экспорт журнала'),esc(plural(EXP.n,T('запись'),T('записи'),T('записей')))+(EXP.flt?' · '+esc(EXP.flt):' · '+T('все машины и водители')))+
    '<div class="exp">'+
      '<button class="exp-opt main" data-act="exp-save"><span class="exp-ic">'+ic('download')+'</span><span><b>'+T('Скачать файл для Excel')+'</b><small>'+T('Таблица CSV, открывается в Excel и Google Таблицах')+'</small></span></button>'+
      (share?'<button class="exp-opt" data-act="exp-share"><span class="exp-ic">'+ic('share')+'</span><span><b>'+T('Отправить файлом')+'</b><small>'+T('WhatsApp, Telegram, почта или «Файлы» на iPhone')+'</small></span></button>':'')+
      '<button class="exp-opt" data-act="exp-copy"><span class="exp-ic">'+ic('copy')+'</span><span><b>'+T('Скопировать таблицу')+'</b><small>'+T('Вставьте в Google Таблицы или Excel — колонки разложатся сами')+'</small></span></button>'+
    '</div><div class="form-err" id="f-err" role="alert" hidden></div>'+
    '<p class="hint" style="margin:0">'+T('Чтобы выгрузить одну машину или одного водителя, выберите фильтр в журнале перед экспортом.')+'</p>');
}
function expErr(msg){const el=$('#f-err');if(el){el.textContent=msg;el.hidden=false;}else toast(msg,true);}

/* ───────── v17: меню «Ещё» и журнал таблицей ───────── */
const MORE_VIEWS=['park','service','wash'];
function moreSheet(){
  const it=(act,extra,icon,title,sub,cur)=>'<button class="more-it'+(cur?' cur':'')+'" data-act="'+act+'"'+extra+'><span class="more-ic">'+ic(icon)+'</span><span class="more-t"><b>'+title+'</b>'+(sub?'<small>'+sub+'</small>':'')+'</span>'+ic('chev','more-chev')+'</button>';
  openSheet(head(T('Ещё'))+'<div class="more">'+
    it('go',' data-to="park"','map',T('Паркинг'),T('Где стоят машины, на карте'),view==='park')+
    it('go',' data-to="service"','wrench',T('ТО'),T('Техобслуживание, страховки, техосмотр'),view==='service')+
    it('go',' data-to="wash"','drop',T('Мойки'),T('Когда мыли машины, химчистка'),view==='wash')+
    it('table','','table',T('Журнал таблицей'),T('Все записи одной таблицей, выгрузка в Google Таблицы'))+
    (SRV&&role==='anton'?it('server-reset','','trash',T('Начать с чистого листа'),T('Сбросить журнал, сохранив пользователей и настройки')):'')+
    '<div class="more-sep"></div>'+
    it('lang','','globe',LANG==='tr'?'Русский':'Türkçe',T('Сменить язык'))+
    (wide?it('theme','','moon',theme==='dark'?T('Светлая тема'):T('Тёмная тема'),''):'')+
    (SRV?it('account','','user',esc(nameOf(role)),T('Пароли, PIN и выход')):it('role','','user',esc(nameOf(role)),T('Сменить пользователя')))+
  '</div>');
}
function serverResetSheet(){
  if(!SRV||role!=='anton')return;
  const word=T('СБРОС');
  openSheet(head(T('Сбросить все данные?'),T('Только для завершения тестов'))+
    T('<div class="ctx">Сервер сначала сохранит резервную копию. Все машины станут «Нет данных»; пользователи, пароли, настройки и точки паркингов останутся.</div>')+
    '<form id="f" data-form="server-reset" novalidate class="stack" style="gap:16px">'+
    '<div class="field"><label class="lbl" for="f-reset-word">'+T('Для подтверждения введите')+' <b>'+word+'</b></label><input class="inp" id="f-reset-word" name="confirmation" autocomplete="off" autocapitalize="characters" spellcheck="false"></div>'+
    T('<div class="form-err" id="f-err" role="alert" hidden></div><div class="sheet-actions"><button class="btn btn-ghost" type="button" data-act="close">Отмена</button><button class="btn btn-danger-fill btn-lg" id="f-submit" type="submit" disabled>Сбросить всё</button></div></form>'));
}
function buildExp(rows){
  const cell=v=>{let t=String(v==null?'':v);if(typeof v==='string'&&/^[=+\-@\t\r]/.test(t))t="'"+t;return '"'+t.replace(/"/g,'""')+'"';};
  const tsv=rows.map(r=>r.map(v=>{let t=String(v==null?'':v).replace(/[\t\r\n]+/g,' ');if(/^[=+\-@]/.test(t))t="'"+t;return t;}).join('\t')).join('\n');
  const flt=[ui.filterCar!=='all'?(carOf(ui.filterCar)||{}).name:'',ui.filterDriver!=='all'?nameOf(ui.filterDriver):''].filter(Boolean).join(' · ');
  return {name:T('Гараж_журнал_')+todayFile()+'.csv',csv:'﻿'+rows.map(r=>r.map(cell).join(';')).join('\r\n'),tsv,n:rows.length-1,flt,rows};
}
function copySync(t){
  const host=dlg.open?dlg:document.body,ta=document.createElement('textarea');
  ta.value=t;ta.setAttribute('readonly','');ta.style.cssText='position:fixed;top:0;left:0;width:1px;height:1px;opacity:0';host.appendChild(ta);
  ta.focus();ta.select();try{ta.setSelectionRange(0,t.length);}catch(e){}
  let ok=false;try{ok=document.execCommand('copy');}catch(e){}ta.remove();return ok;
}
function tableSheet(){
  EXP=buildExp(exportRows());
  const rows=EXP.rows,hd=rows[0];
  const th='<th class="tv-when">'+esc(T('Когда'))+'</th>'+hd.slice(2).map(h=>'<th>'+esc(h)+'</th>').join('');
  const tb=rows.slice(1).map(r=>'<tr><td class="tv-when"><b>'+esc(r[0])+'</b> '+esc(r[1])+'</td>'+r.slice(2).map(v=>'<td'+(typeof v==='number'?' class="num"':'')+'>'+(typeof v==='number'?fmt(v):esc(v))+'</td>').join('')+'</tr>').join('');
  openSheet('<div class="tv-top"><div><h2 id="sheet-title">'+T('Журнал таблицей')+'</h2><p>'+esc(plural(EXP.n,T('запись'),T('записи'),T('записей')))+' · '+(EXP.flt?esc(EXP.flt):T('все машины и водители'))+'</p></div><button class="x" type="button" data-act="close" aria-label="'+T('Закрыть')+'">'+ic('x')+'</button></div>'+
    '<div class="tv-acts"><a class="tv-btn g" href="https://sheets.new" target="_blank" rel="noopener noreferrer" data-act="tv-gsheet">'+ic('table')+'<span>'+T('Открыть в Google Таблицах')+'</span></a>'+
      '<button class="tv-btn" data-act="exp-save">'+ic('download')+'<span>'+T('Скачать CSV')+'</span></button>'+
      '<button class="tv-btn" data-act="exp-copy">'+ic('copy')+'<span>'+T('Скопировать')+'</span></button></div>'+
    '<div class="form-err" id="f-err" role="alert" hidden></div><div class="tv-ok" id="tv-ok" role="status" hidden></div>'+
    (EXP.n?'<div class="tv-wrap"><table class="tv"><thead><tr>'+th+'</tr></thead><tbody>'+tb+'</tbody></table></div>':'<div class="empty">'+T('Записей нет')+'</div>'));
  dlg.classList.add('full');
}
function tvOk(msg){const el=$('#tv-ok');if(el){el.textContent=msg;el.hidden=false;}else toast(msg);}

async function compressPhoto(file){
  if(!file||!file.type.startsWith('image/'))throw new Error(T('Выберите фотографию.'));
  const data=await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=()=>rej(new Error(T('Не удалось прочитать фото.')));r.readAsDataURL(file);});
  const img=await new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=()=>rej(new Error(T('Не удалось открыть фото. Попробуйте JPEG или PNG.')));i.src=data;});
  const scale=Math.min(1,1200/Math.max(img.width,img.height)),cv=document.createElement('canvas');cv.width=Math.max(1,Math.round(img.width*scale));cv.height=Math.max(1,Math.round(img.height*scale));
  const g=cv.getContext('2d');g.fillStyle='#ffffff';g.fillRect(0,0,cv.width,cv.height);g.drawImage(img,0,0,cv.width,cv.height);
  let q=.82,out=cv.toDataURL('image/jpeg',q);while(out.length>260000&&q>.35){q-=.1;out=cv.toDataURL('image/jpeg',q);}
  if(out.length>350000)throw new Error(T('Фото слишком большое. Выберите изображение попроще.'));
  return out;
}

/* ───────── actions ───────── */
let toastTimer;
function toast(msg,err){{const tEl=$('#toast'),host=dlg.open?dlg:document.body;if(tEl&&tEl.parentNode!==host)host.appendChild(tEl);}
  const t=$('#toast');t.className='toast'+(err?' err':'');t.innerHTML=ic(err?'alert':'check')+'<span></span>';t.querySelector('span').textContent=dn(msg);
  void t.offsetWidth;t.classList.add('on');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('on'),3200);
}
function reportError(err){const el=$('#f-err');if(dlg.open&&el){el.textContent=dn(err.message);el.hidden=false;el.scrollIntoView({block:'nearest'});}else toast(err.message,true);}
let confirmTimer;
function confirmMessage(outcome){
  if(outcome.kind==='wash')return T('Мойка записана');
  const c=carOf(outcome.carId);if(!c)return T('Записано');
  if(outcome.kind==='checkout'||outcome.kind==='handover_accept')return tpl('{car} у вас',{car:dn(c.name)});
  if(outcome.kind==='park'){
    const place=F.locationName(c.location)+(c.spot?', '+c.spot:'');
    return tpl('{car} поставлена · {place}',{car:dn(c.name),place:dn(place)});
  }
  if(outcome.kind==='handover_request')return T('Запрос отправлен на экран получателя');
  return T('Записано');
}
function showActionConfirm(outcome){
  const el=$('#actionConfirm');if(!el)return;
  el.innerHTML='<span class="confirm-mark">'+ic('check')+'</span><span class="confirm-text"></span>';
  el.querySelector('.confirm-text').textContent=confirmMessage(outcome);
  el.classList.remove('is-closing');el.hidden=false;clearTimeout(confirmTimer);
  confirmTimer=setTimeout(()=>{
    if(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches){el.hidden=true;return;}
    el.classList.add('is-closing');setTimeout(()=>{el.hidden=true;el.classList.remove('is-closing');},170);
  },1200);
}
function completeAction(outcome){
  closeSheet();render();showActionConfirm(outcome);
}
const DONE={wash:T('Мойка записана'),odo_fix:T('Пробег исправлен'),park:T('Парковка и ключи записаны'),car_reset:T('Машина сброшена'),handover_request:T('Запрос отправлен на экран получателя'),handover_accept:T('Получение подтверждено. Машина и ключи за вами'),checkout:T('Выезд записан. Машина за вами'),issue_report:T('Замечание добавлено на карточку'),issue_resolve:T('Замечание закрыто, история сохранена'),keys:T('Место ключей сохранено'),init:T('Начальные данные сохранены'),handover_cancel:T('Передача отменена'),handover_decline:T('Передача отклонена')};
function runCommand(cmd){
  persist(F.transact(state,cmd));
  ui.flash={car:cmd.carId,t:Date.now()};
  if(CONFIRM_KINDS.indexOf(cmd.kind)>=0){
    if(SRV){const submit=$('#f-submit');if(submit)submit.disabled=true;return;}
    completeAction({kind:cmd.kind,carId:cmd.carId});return;
  }
  closeSheet();render();toast(DONE[cmd.kind]||T('Записано'));
}
function goView(v,opts){view=v;if(opts)Object.assign(ui,opts);render();window.scrollTo(0,0);}

document.addEventListener('click',ev=>{
  if(ev.target.closest&&ev.target.closest('#actionConfirm')){const confirm=$('#actionConfirm');confirm.hidden=true;confirm.classList.remove('is-closing');clearTimeout(confirmTimer);return;}
  const full=ev.target.closest&&ev.target.closest('.park-photo-full');
  if(full){closeParkPhoto();return;}
  if(serverResetBusy){ev.preventDefault();return;}
  const b=ev.target.closest('[data-act],[data-view]');
  if(!b){if(ev.target===dlg)closeSheet();return;}
  if(b.dataset.view&&!b.dataset.act){goView(b.dataset.view,{filterCar:'all',filterDriver:'all'});return;}
  const a=b.dataset.act,id=b.dataset.car;
  try{
    switch(a){
      case 'car':carSheet(id);break;
      case 'park-photo-full':
        if(parkPhotoData&&dlg.open){
          document.documentElement.classList.add('park-photo-open');
          dlg.insertAdjacentHTML('beforeend','<div class="park-photo-full" role="dialog" aria-label="'+T('Фото места')+'"><button type="button" class="park-photo-close" aria-label="'+T('Закрыть')+'">'+ic('x')+'</button><img src="'+esc(parkPhotoData)+'" alt="'+T('Фото места')+'"></div>');
          dlg.querySelector('.park-photo-close').focus({preventScroll:true});
        }
        break;
      case 'car-reset':if(isMgr(role))carResetSheet(id);break;
      case 'car-reset-cancel':carSheet(id);break;
      case 'car-reset-confirm':if(isMgr(role))runCommand({kind:'car_reset',carId:id,actorId:role});break;
      case 'photo-remove':photoSeq++;photoData=null;photoBusy=false;{const prev=$('#f-photo-prev');['#f-photo','#f-photo-cam'].forEach(q=>{const inp=$(q);if(inp)inp.value='';});if(prev)prev.innerHTML='';}break;
      case 'wash':closeSheet();washSheet(id);break;
      case 'odofix':if(isMgr(role))odoFixSheet(id);break;
      case 'place':if(isMgr(role))placeSheet(b.dataset.place);break;
      case 'pick-start':if(isMgr(role)){mapPick=b.dataset.place;closeSheet();if(MV.park)MV.park.auto=true;view='park';render();const m=document.querySelector('.map[data-map="park"]');if(m)m.scrollIntoView({block:'center',behavior:'smooth'});}break;
      case 'pick-cancel':mapPick=null;render();break;
      case 'place-clear':if(isMgr(role)){persist(F.setPlace(state,b.dataset.place,null));closeSheet();toast(T('Точка убрана'));}break;
      case 'pin':if(!mapMoved&&!mapPick)showPlace(b.dataset.place);break;
      case 'show-place':closeSheet();showPlace(b.dataset.place);break;
      case 'map-zoom':zoomMap(b.dataset.map,Number(b.dataset.z)>0?1/1.6:1.6);break;
      case 'map-fit':MV[b.dataset.map]=null;mountMaps();break;
      case 'goto-checks':{const c=document.getElementById('checks');if(c)c.scrollIntoView({behavior:'smooth',block:'start'});break;}
      case 'filter':ui.filter=b.dataset.filter;render();break;
      case 'jmode':ui.journalMode=b.dataset.mode;render();break;
      case 'days':ui.statsDays=+b.dataset.days;render();break;
      case 'history':closeSheet();goView('journal',{journalMode:'events',filterCar:id,filterDriver:'all'});break;
      case 'mylog':goView('journal',{journalMode:'events',filterCar:'all',filterDriver:role});break;
      case 'init':case 'checkout':case 'park':case 'handover_request':case 'handover_accept':actionSheet(a,id);break;
      case 'handover_cancel':case 'handover_decline':simpleSheet(a,id);break;
      case 'keys':keysSheet(id);break;
      case 'issue_report':issueSheet(id);break;
      case 'issues':issuesSheet(id);break;
      case 'issue-resolve':resolveSheet(id,b.dataset.issue);break;
      case 'photo':photoSheet(b.dataset.event);break;
      case 'close':closeSheet();break;
      case 'log-more':ui.logLimit=(ui.logLimit||30)+60;render();break;
      case 'all-checks':ui.allChecks=!ui.allChecks;render();break;
      case 'lang':closeSheet();{const nl=LANG==='tr'?'ru':'tr';try{localStorage.setItem('garage-lang',nl);if(state.isDemo)localStorage.setItem('garage-regen','1');}catch(e){}location.reload();break;}
      case 'theme':closeSheet();theme=theme==='dark'?'light':'dark';try{localStorage.setItem('garage-theme',theme);}catch(e){}applyTheme();renderTop();break;
      case 'role':closeSheet();if(SRV)accountSheet();else roleSheet();break;
      case 'account':accountSheet();break;
      case 'site-link':siteLinkSheet().catch(reportError);break;
      case 'pin-set':pinSheet(b.dataset.user);break;
      case 'password-set':passwordSheet(b.dataset.user);break;
      case 'logout':api('/api/logout',{}).catch(()=>{}).then(()=>location.reload());break;
      case 'srv-retry':srvBoot();break;
      case 'setrole':closeSheet();setRole(b.dataset.role);toast(T('Вы: ')+nameOf(role));break;
      case 'personal':closeSheet();setRole(b.dataset.driver);break;
      case 'driver':driverSheet(b.dataset.driver);break;
      case 'svc-add':svcSheet(id||null,b.dataset.type||null);break;
      case 'svc-hist':svcHistSheet(id);break;
      case 'svc-more':ui.svcAll=true;render();break;
      case 'svc-int':if(isMgr(role))intervalsSheet();break;
      case 'svc-del':if(isMgr(role)){persist(F.deleteServiceRecord(state,b.dataset.id));svcHistSheet(id);toast(T('Запись удалена'));}break;
      case 'drvlog':closeSheet();goView('journal',{journalMode:'events',filterCar:'all',filterDriver:b.dataset.driver});break;
      case 'personal-link':linkSheet(b.dataset.driver);break;
      case 'copy-link':{const inp=$('#f-link');try{navigator.clipboard.writeText(inp.value).then(()=>toast(T('Ссылка скопирована')),()=>{inp.focus();inp.select();});}catch(e){inp.focus();inp.select();}break;}
      case 'about':aboutSheet();break;
      case 'server-reset':if(role==='anton')serverResetSheet();break;
      case 'settings':if(isMgr(role))settingsSheet();break;
      case 'details':if(isMgr(role))detailsSheet(id);break;
      case 'rename':if(isMgr(role))renameSheet(b.dataset.driver);break;
      case 'export':case 'table':closeSheet();tableSheet();break;
      case 'more':moreSheet();break;
      case 'go':closeSheet();goView(b.dataset.to);break;
      case 'tv-gsheet':if(EXP){const ok=copySync(EXP.tsv);if(!ok&&navigator.clipboard)navigator.clipboard.writeText(EXP.tsv).catch(()=>{});tvOk(T('Таблица скопирована. В Google Таблицах нажмите на ячейку A1 и выберите «Вставить»'));}break;
      case 'exp-save':if(EXP){saveFile(EXP.name,EXP.csv,'text/csv;charset=utf-8').then(ok=>{if(ok){if(!$('#tv-ok'))closeSheet();}else expErr(T('Этот браузер не даёт скачать файл. Нажмите «Открыть в Google Таблицах» или «Скопировать».'));});}break;
      case 'exp-share':if(EXP){shareFile(EXP.name,EXP.csv,'text/csv').then(r=>{if(r==='ok')closeSheet();else if(r==='no')expErr(T('Отправка файлом здесь недоступна. Нажмите «Скопировать таблицу».'));});}break;
      case 'exp-copy':if(EXP){copyText(EXP.tsv).then(ok=>{if(ok){if($('#tv-ok'))tvOk(T('Таблица скопирована — вставьте в Google Таблицы или Excel'));else{closeSheet();toast(T('Таблица скопирована — вставьте в Google Таблицы или Excel'));}}else textSheet(EXP.name,EXP.tsv);});}break;
      case 'copy-text':{const ta=$('#f-text');if(ta)copyText(ta.value).then(ok=>{if(ok)toast(T('Скопировано'));else{ta.focus();ta.select();}});break;}
      case 'backup':offerFile(T('Гараж_копия_')+todayFile()+'.json',JSON.stringify(state,null,2),'application/json');break;
      case 'restore':if(isMgr(role))$('#restoreFile').click();break;
      case 'confirm-restore':if(isMgr(role)&&pendingRestore){if(SRV){api('/api/op',{op:'restore',args:[pendingRestore]}).then(j=>{SV=j.v;state=F.upgrade(j.state);render();toast(T('Копия восстановлена'));}).catch(err=>toast(dn(err.message),true));}else{persist(pendingRestore);toast(T('Копия восстановлена'));}pendingRestore=null;closeSheet();}break;
      case 'reset-demo':case 'reset-empty':if(isMgr(role))resetSheet(a==='reset-demo');break;
      case 'confirm-reset':if(isMgr(role)){ui.filter='all';ui.filterCar='all';ui.filterDriver='all';let next;if(b.dataset.mode==='demo'){next=F.demoState();next.drivers=JSON.parse(JSON.stringify(state.drivers));Object.keys(state.carDetails||{}).forEach(k=>{const d=state.carDetails[k];if(d&&(d.model||d.plate||d.color))next.carDetails[k]=Object.assign({},next.carDetails[k],d);});}else{next=F.emptyState();next.drivers=JSON.parse(JSON.stringify(state.drivers));next.carDetails=JSON.parse(JSON.stringify(state.carDetails||{}));}persist(next);closeSheet();toast(b.dataset.mode==='demo'?T('Пример загружен'):T('Журнал очищен. Внесите начальные данные машин'));}break;
    }
  }catch(err){reportError(err);}
});

function formLive(){
  const f=$('#f');if(!f)return;
  const loc=f.querySelector('input[name="location"]:checked');
  const req=$('#f-spot-req'),lbl=$('#f-spot-lbl'),spot=$('#f-spot');
  if(req){const other=loc&&loc.value==='other';req.textContent=other?T('обязательно'):T('необязательно');lbl.textContent=other?T('Адрес или ориентир'):T('Этаж, место или адрес');spot.placeholder=other?T('Например: у офиса на Багдат'):T('Например: −2 этаж, место 18');}
  const kk=f.querySelector('input[name="keyKind"]:checked'),kd=$('#f-keydrv');if(kd)kd.hidden=!(kk&&kk.value==='driver');
  const it=f.querySelector('input[name="issueType"]:checked'),nr=$('#f-note-req');if(nr&&it)nr.textContent=it.value==='fuel'?T('можно пропустить'):T('обязательно');
  const btn=$('#f-submit');
  if(btn&&f.dataset.kind==='park'&&loc)btn.innerHTML=ic('park')+T('Поставить · ')+esc(F.locationName(loc.value));
  if(btn&&f.dataset.kind==='handover_request'){const to=f.querySelector('input[name="toId"]:checked');if(to)btn.innerHTML=ic('swap')+T('Передать · ')+esc(nameOf(to.value));}
}
function kmHint(){
  const inp=$('#f-odo'),h=$('#f-odo-hint');if(!inp||!h)return;
  const prev=inp.dataset.prev===''?null:+inp.dataset.prev,kind=inp.dataset.kind,txt=inp.value.replace(/\s/g,'');
  const protectedOdo=kind==='checkout'||kind==='park';
  if(!txt){h.className='hint';h.textContent=T('Введите показание с приборной панели');return;}
  if(!/^\d+$/.test(txt)){h.className='hint err';h.textContent=T('Только цифры, без точек и букв');return;}
  const v=+txt;
  const unchangedPark=kind==='park'&&prev!==null&&v===prev;
  if(prev==null){h.className='hint';h.textContent=fmt(v)+T(' км');return;}
  const d=v-prev;
  if(d<0){h.className='hint warn';h.textContent=T('Меньше последней записи (')+fmt(prev)+T(' км). Проверьте одометр');return;}
  if(kind==='checkout'){if(d===0){h.className='hint';h.textContent=T('Совпадает с одометром — просто подтвердите. Отличается — нажмите и исправьте');}else{h.className='hint warn';h.textContent='+'+fmt(d)+T(' км с последней записи. Руководитель увидит это как пробег без записи');}return;}
  if(kind==='park'&&d===0){h.className='hint warn';h.textContent=T('Пробег не изменился. Проверьте одометр');return;}
  if(kind==='handover_accept'){h.className=d===0?'hint ok':'hint warn';h.textContent=d===0?T('Совпадает с пробегом при передаче'):'+'+fmt(d)+T(' км после запроса на передачу');return;}
  if(d>1500){h.className='hint warn';h.textContent='+'+fmt(d)+T(' км. Проверьте, нет ли лишней цифры');return;}
  h.className='hint ok';h.textContent='+'+fmt(d)+T(' км ')+(kind==='handover_request'?T('за вашу поездку'):T('за поездку'));
}
document.addEventListener('focusin',e=>{
  const inp=e.target;
  if(inp.id==='f-odo'&&(inp.dataset.kind==='checkout'||inp.dataset.kind==='park'))inp.select();
  if(/^(INPUT|TEXTAREA|SELECT)$/.test(inp.tagName)){
    if(dlg.open)applyKeyboardHints(dlg);
    setTimeout(()=>{if(document.activeElement===inp){if(dlg.open)updateSheetViewport();inp.scrollIntoView({block:'center'});}},90);
  }
});
document.addEventListener('keydown',e=>{
  if(e.key!=='Enter'||e.isComposing||e.target.tagName==='TEXTAREA')return;
  const t=e.target;
  if(t.tagName==='INPUT'&&!/^(button|submit|reset|checkbox|radio|file|range|color|hidden)$/i.test(t.type||'text')){
    e.preventDefault();t.blur();
  }
});
document.addEventListener('input',e=>{
  if(e.target.id==='f-odo')kmHint();
  if(e.target.id==='f-reset-word'){
    const btn=$('#f-submit'),expected=T('СБРОС');
    if(btn)btn.disabled=serverResetBusy||e.target.value!==expected||SRV_PENDING.length>0||SRV_BUSY;
  }
});
document.addEventListener('change',async e=>{
  const t=e.target;
  try{
    if(t.id==='flt-car'){ui.logLimit=30;ui.filterCar=t.value;render();return;}
    if(t.id==='flt-drv'){ui.filterDriver=t.value;render();return;}
    if(t.id==='svc-car'){ui.svcCar=t.value;render();return;}
    if(t.name==='type'&&t.closest('#f')){const h=$('#svc-iv');if(h)h.textContent=ivText(t.value);const n=$('#f-svcodo-note');if(n)n.textContent=F.serviceType(t.value).needOdo?T('км'):T('необязательно');return;}
    if(t.name==='carId'&&t.closest('#f')){const c=carOf(t.value),o=$('#f-svcodo');if(o&&c&&c.odo!=null){o.value=c.odo;o.placeholder=fmt(c.odo);}return;}
    if(t.id==='f-photo'||t.id==='f-photo-cam'){
      {const other=$(t.id==='f-photo'?'#f-photo-cam':'#f-photo');if(other&&t.files[0])other.value='';}
      const token=++photoSeq,prev=$('#f-photo-prev');photoData=null;
      if(!t.files[0]){photoBusy=false;prev.textContent='';return;}
      photoBusy=true;prev.textContent=T('Подготовка фото…');
      const out=await compressPhoto(t.files[0]);if(token!==photoSeq)return;
      photoData=out;photoBusy=false;
      const preview='<img src="'+esc(out)+T('" alt="Предпросмотр фото"><span>Фото прикреплено</span>');
      prev.innerHTML=$('#f').dataset.kind==='park'?preview+'<button type="button" class="linkbtn sm" data-act="photo-remove">'+ic('x')+T('Убрать')+'</button>':preview;
      return;
    }
    if(t.id==='restoreFile'){
      const file=t.files[0];t.value='';if(!file)return;
      if(file.size>12000000)throw new Error(T('Файл копии слишком большой.'));
      restoreSheet(F.upgrade(JSON.parse(await file.text())));return;
    }
    if(t.closest&&t.closest('#f'))formLive();
  }catch(err){photoBusy=false;reportError(err);}
});
document.addEventListener('submit',e=>{
  if(serverResetBusy){e.preventDefault();return;}
  const f=e.target;if(f.id==='login-form'){e.preventDefault();const fd=new FormData(f);loginSubmit(String(fd.get('username')||''),String(fd.get('password')||''));return;}if(f.id!=='f')return;e.preventDefault();
  const fd=new FormData(f),get=n=>fd.get(n);
  try{
    if(photoBusy)throw new Error(T('Подождите, пока подготовится фото.'));
    const form=f.dataset.form;
    if(form==='server-reset'){
      if(role!=='anton'||!SRV)throw new Error(T('Сброс доступен только Антону.'));
      const confirmation=String(get('confirmation')||''),expected=T('СБРОС');
      if(confirmation!==expected)throw new Error(T('Слово подтверждения не совпадает.'));
      if(SRV_PENDING.length||SRV_BUSY)throw new Error(T('Дождитесь синхронизации изменений перед сбросом.'));
      serverResetBusy=true;$('#f-submit').disabled=true;
      api('/api/reset',{confirmation}).then(j=>{
        SRV_PENDING=[];SV=j.v;state=F.upgrade(j.state);
        ui.filter='all';ui.filterCar='all';ui.filterDriver='all';
        closeSheet();render();toast(T('Данные сброшены. Резервная копия сохранена.'));
      }).catch(err=>reportError(new Error(T(err.message)))).finally(()=>{
        serverResetBusy=false;
        const btn=$('#f-submit'),inp=$('#f-reset-word');
        if(btn&&inp)btn.disabled=inp.value!==expected||SRV_PENDING.length>0||SRV_BUSY;
      });
      return;
    }
    if(form==='pin'){const uid=f.dataset.user;api('/api/pin',{id:uid,pin:String(get('pin')||'')}).then(()=>{closeSheet();toast(T('PIN сохранён'));}).catch(err=>reportError(err));return;}
    if(form==='password'){const uid=f.dataset.user;api('/api/password',{id:uid,password:String(get('password')||'')}).then(()=>{if(uid===role){location.reload();return;}closeSheet();toast(T('Пароль сохранён'));}).catch(err=>reportError(err));return;}
    if(form==='odofix'){runCommand({carId:f.dataset.car,actorId:role,kind:'odo_fix',odo:get('odo'),note:get('note')});return;}
    if(form==='wash'){const w=get('when'),d=w==='yesterday'?dayKey(NOW-DAY):w==='other'?String(get('washDate')||''):dayKey(NOW);
      if(!get('carId'))throw new Error(T('Выберите машину.'));
      runCommand({carId:get('carId'),actorId:role,kind:'wash',washType:get('washType'),washDate:d,note:get('note')});return;}
    if(form==='rename'){persist(F.renameDriver(state,f.dataset.driver,get('name')));closeSheet();toast(T('Имя сохранено'));return;}
    if(form==='settings'){persist(F.setSettings(state,{shiftEnd:get('shiftEnd'),transferMinutes:get('transferMinutes'),tripHours:get('tripHours')}));closeSheet();toast(T('Напоминания сохранены'));return;}
    if(form==='service'){persist(F.addServiceRecord(state,{carId:get('carId'),type:get('type'),date:get('date'),odo:get('odo'),cost:get('cost'),place:get('place'),note:get('note'),actorId:role},Date.now()));closeSheet();render();toast(T('Запись сохранена'));return;}
    if(form==='intervals'){const m={};F.SERVICE_TYPES.forEach(t=>{if(t.id!=='other')m[t.id]={km:get('km_'+t.id),months:get('mo_'+t.id)};});persist(F.setIntervals(state,m));closeSheet();toast(T('Интервалы сохранены'));return;}
    if(form==='place'){const pid=f.dataset.place,raw=String(get('geo')||'').trim(),cur=(state.places||{})[pid]||{},g=F.parseGeo(raw),isLink=/^https:\/\//i.test(raw);
      if(!raw)throw new Error(T('Укажите точку на карте, координаты или ссылку Google Maps.'));
      if(!g&&!isLink)throw new Error(T('Не удалось распознать координаты. Пример: 41.1106, 28.9878'));
      const keep=!g&&!cur.demo&&cur.lat!=null;
      persist(F.setPlace(state,pid,{lat:g?g.lat:(keep?cur.lat:null),lng:g?g.lng:(keep?cur.lng:null),link:isLink?raw:''}));closeSheet();
      toast(g||keep?T('Точка сохранена'):T('Ссылка сохранена. Чтобы паркинг появился на карте, укажите точку.'));return;}
    if(form==='details'){const cur=carOf(f.dataset.car);persist(F.setCarDetails(state,f.dataset.car,{model:get('model'),plate:get('plate'),color:get('color'),photo:photoData||(get('photoReset')?'':cur.photo)}));closeSheet();toast(T('Данные машины сохранены'));return;}
    const cmd={carId:f.dataset.car,actorId:role,note:get('note'),photo:photoData};
    if(form==='action'){
      Object.assign(cmd,{kind:f.dataset.kind,odo:get('odo'),location:get('location'),spot:get('spot'),toId:get('toId'),parkedById:get('parkedById'),keyKind:get('keyKind'),keyDriverId:get('keyDriverId'),keyNote:get('keyNote')});
      if(cmd.kind==='handover_request'&&!cmd.toId)throw new Error(T('Выберите, кому передаёте.'));
      if((cmd.kind==='park'||cmd.kind==='init')&&!cmd.location)throw new Error(T('Выберите, где оставили машину.'));
      if(cmd.kind==='handover_accept'){const c=carOf(cmd.carId);cmd.requestId=c&&c.pendingTransfer?c.pendingTransfer.id:'';}
    }
    else if(form==='simple')Object.assign(cmd,{kind:f.dataset.kind,requestId:f.dataset.request});
    else if(form==='keys')Object.assign(cmd,{kind:'keys',keyKind:get('keyKind'),keyDriverId:get('keyDriverId'),keyNote:get('keyNote')});
    else if(form==='issue'){if(!get('issueType'))throw new Error(T('Выберите тип замечания.'));Object.assign(cmd,{kind:'issue_report',issueType:get('issueType')});}
    else if(form==='resolve')Object.assign(cmd,{kind:'issue_resolve',issueId:f.dataset.issue});
    else return;
    runCommand(cmd);
  }catch(err){reportError(err);}
});
/* смахнуть шторку вниз */
let sy=null,sdy=0;
dlg.addEventListener('touchstart',e=>{
  if(!narrow||dlg.scrollTop>4)return;
  const t=e.target;if(!t.closest('.grab,.sheet-head')||t.closest('button,input,select,textarea,a'))return;
  sy=e.touches[0].clientY;sdy=0;dlg.style.transition='none';
},{passive:true});
dlg.addEventListener('touchmove',e=>{if(sy==null)return;sdy=Math.max(0,e.touches[0].clientY-sy);dlg.style.transform='translateY('+sdy+'px)';},{passive:true});
dlg.addEventListener('touchend',()=>{if(sy==null)return;dlg.style.transition='transform .2s ease-out';if(sdy>90)closeSheet();else dlg.style.transform='';sy=null;});
if(mq){const onMq=()=>{narrow=mq.matches;if(!dlg.open)render();};if(mq.addEventListener)mq.addEventListener('change',onMq);else if(mq.addListener)mq.addListener(onMq);}
if(mqWide){const onWide=()=>{wide=mqWide.matches;if(!dlg.open)render();};if(mqWide.addEventListener)mqWide.addEventListener('change',onWide);else if(mqWide.addListener)mqWide.addListener(onWide);}
{let rz;window.addEventListener('resize',()=>{clearTimeout(rz);rz=setTimeout(mountMaps,120);});}
document.addEventListener('pointerdown',e=>{
  const el=e.target.closest&&e.target.closest('.map[data-map]');if(!el)return;
  mapMoved=false;if(e.target.closest('button,a')||e.pointerType!=='mouse'||e.button!==0)return;
  const v=MV[el.dataset.map];if(!v)return;
  mapDrag={el,v,x:e.clientX,y:e.clientY,ox:v.x,oy:v.y,raf:0};
});
document.addEventListener('pointermove',e=>{
  const d=mapDrag;if(!d)return;const dx=e.clientX-d.x,dy=e.clientY-d.y;
  if(!mapMoved&&Math.abs(dx)+Math.abs(dy)<5)return;
  if(!mapMoved){mapMoved=true;d.el.classList.add('dragging');}
  const k=d.v.w/d.el.clientWidth;d.v.x=d.ox-dx*k;d.v.y=d.oy-dy*k;d.v.auto=false;
  if(!d.raf)d.raf=requestAnimationFrame(()=>{d.raf=0;drawMap(d.el,d.v);});
});
document.addEventListener('pointerup',()=>{if(mapDrag){mapDrag.el.classList.remove('dragging');mapDrag=null;}});
document.addEventListener('wheel',e=>{
  const el=e.target.closest&&e.target.closest('.map[data-map]');if(!el||!MV[el.dataset.map])return;
  if(!(e.ctrlKey||(wide&&el.dataset.map==='park')))return;
  e.preventDefault();const [cx,cy]=mapPoint(el,e.clientX,e.clientY);zoomMap(el.dataset.map,e.deltaY>0?1.2:1/1.2,cx,cy);
},{passive:false});
document.addEventListener('click',e=>{
  if(!mapPick)return;const el=e.target.closest&&e.target.closest('.map[data-map="park"]');
  if(!el||e.target.closest('button,a'))return;
  if(mapMoved){mapMoved=false;return;}
  try{pickAt(el,e.clientX,e.clientY);}catch(err){toast(dn(err.message),true);}
});
dlg.addEventListener('cancel',e=>{
  if(serverResetBusy){e.preventDefault();return;}
  const full=dlg.querySelector('.park-photo-full');
  if(full){e.preventDefault();closeParkPhoto();return;}
  photoSeq++;photoBusy=false;parkedPhotoSeq++;parkPhotoData=null;
});
window.addEventListener('storage',e=>{if(e.key===KEY&&e.newValue){try{state=F.upgrade(JSON.parse(e.newValue));if(!dlg.open)render();toast(T('Журнал обновлён в другой вкладке'));}catch(err){}}});

setInterval(()=>{
  NOW=Date.now();const clk=document.querySelector('[data-clock]');if(clk)clk.textContent=T('Стамбул · ')+tFmt.format(NOW);
},20000);
setInterval(()=>{const a=document.activeElement;if(dlg.open||(a&&/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)))return;render();},60000);
if(SRV)srvBoot();else render();
})();
