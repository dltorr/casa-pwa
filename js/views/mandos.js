// Mandos: control de aparatos de casa: proyector (IR desde un ESP32) y Chromecast con Google TV.
// La app manda órdenes por MQTT (casa/chromecast/cmd); el puente (ordenador o Raspberry
// en casa) las pasa al Chromecast y responde con un "ack" para medir el retardo.

import * as store from '../store.js';
import { h, icon } from '../ui.js';
import { wifiIcon, wifiPct } from './casa.js';

const CMD = 'casa/chromecast/cmd';
const ACK = 'casa/chromecast/ack';
const STATE = 'casa/chromecast/estado';
const HOLD_MS = 400;   // a partir de aquí, pulsación larga (volumen)
const STEP_PX = 45;    // panel táctil: recorrido del dedo para avanzar un paso
const TAP_MAX_PX = 12; // panel táctil: por debajo de esto, un toque es OK
const MODE_KEY = 'casa:mando-modo';
const BRIDGE_MIN = '2.1.0';

const SEARCH_TARGETS = [
  ['youtube', 'Buscar en YouTube'],
  ['netflix', 'Buscar en Netflix'],
  ['teclado', 'Escribir (teclado, solo algunas apps)'],
];

// Panel táctil tipo Google TV: deslizar = mover; tocar = OK.
function touchPad(key) {
  const arrow = h('span', { class: 'pad-arrow' });
  const pad = h('div', { class: 'touchpad', role: 'application', 'aria-label': 'Panel táctil: desliza para moverte, toca para OK' },
    h('span', { class: 'pad-hint' }, 'Desliza para moverte · toca para OK'), arrow);
  let start = null;
  let anchor = null;
  let moved = false;

  const show = (dir) => {
    arrow.textContent = { DPAD_UP: '↑', DPAD_DOWN: '↓', DPAD_LEFT: '←', DPAD_RIGHT: '→', DPAD_CENTER: '●' }[dir];
    arrow.classList.remove('pulse');
    void arrow.offsetWidth; // reinicia la animación
    arrow.classList.add('pulse');
  };

  pad.addEventListener('pointerdown', (e) => {
    pad.setPointerCapture(e.pointerId);
    start = anchor = { x: e.clientX, y: e.clientY };
    moved = false;
  });
  pad.addEventListener('pointermove', (e) => {
    if (!anchor) return;
    const dx = e.clientX - anchor.x;
    const dy = e.clientY - anchor.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < STEP_PX) return;
    const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'DPAD_RIGHT' : 'DPAD_LEFT') : (dy > 0 ? 'DPAD_DOWN' : 'DPAD_UP');
    key(dir);
    show(dir);
    moved = true;
    anchor = { x: e.clientX, y: e.clientY }; // siguiente paso desde aquí
  });
  const end = (e) => {
    if (!start) return;
    const dist = Math.hypot(e.clientX - start.x, e.clientY - start.y);
    if (!moved && dist < TAP_MAX_PX) { key('DPAD_CENTER'); show('DPAD_CENTER'); }
    start = anchor = null;
  };
  pad.addEventListener('pointerup', end);
  pad.addEventListener('pointercancel', () => { start = anchor = null; });
  return pad;
}

const olderThan = (v, min) => {
  const a = String(v || '0').split('.').map(Number);
  const b = min.split('.').map(Number);
  for (let i = 0; i < 3; i++) { if ((a[i] || 0) !== b[i]) return (a[i] || 0) < b[i]; }
  return false;
};

const APP_NAMES = {
  'com.google.android.youtube.tv': 'YouTube',
  'com.netflix.ninja': 'Netflix',
  'com.google.android.apps.tv.launcherx': 'Inicio',
  'com.disney.disneyplus': 'Disney+',
  'com.amazon.amazonvideo.livingroom': 'Prime Video',
  'com.hbo.hbonow': 'Max',
};
const appName = (pkg) => (pkg ? APP_NAMES[pkg] || pkg.split('.').pop() : '—');

function chromecastCard() {
  const pending = new Map();
  const dot = h('span', { class: 'dev-dot' });
  const statusText = h('span', { class: 'dev-status' }, 'Sin datos del puente');
  const appText = h('span', { class: 'hint' });
  const latency = h('span', { class: 'dev-latency' });
  const volText = h('span', { class: 'hint' });

  function flash(msg) {
    latency.textContent = msg;
    latency.classList.add('err');
  }

  function send(payload) {
    const id = Math.random().toString(36).slice(2, 9);
    if (!store.publishRaw(CMD, { ...payload, id })) { flash('Sin conexión con el broker'); return; }
    pending.set(id, performance.now());
    setTimeout(() => { if (pending.delete(id)) flash('El puente no responde'); }, 4000);
  }

  const key = (k, dir = 'SHORT') => send({ action: 'key', key: k, dir });

  // Botón normal: una pulsación = una orden.
  const btn = (ic, label, k, cls = '') => h('button', {
    type: 'button', class: 'rc-btn ' + cls, 'aria-label': label, title: label, onclick: () => key(k),
  }, icon(ic));

  // Botón con pulsación larga (volumen): corto = un paso; mantenido = repite el Chromecast.
  function holdBtn(ic, label, k) {
    let timer = null;
    let long = false;
    const b = h('button', { type: 'button', class: 'rc-btn', 'aria-label': label, title: label }, icon(ic));
    const down = (e) => {
      e.preventDefault();
      long = false;
      timer = setTimeout(() => { long = true; key(k, 'START_LONG'); }, HOLD_MS);
    };
    const up = () => {
      if (timer === null) return;
      clearTimeout(timer);
      timer = null;
      key(k, long ? 'END_LONG' : 'SHORT');
    };
    b.addEventListener('pointerdown', down);
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('pointerleave', up);
    b.addEventListener('contextmenu', (e) => e.preventDefault());
    return b;
  }

  const target = h('select', { 'aria-label': 'Dónde buscar' }, SEARCH_TARGETS.map(([v, l]) => h('option', { value: v }, l)));
  const search = h('input', { type: 'text', placeholder: 'Película, serie, vídeo…', autocomplete: 'off', enterkeyhint: 'search' });
  const searchForm = h('form', {
    class: 'search-box',
    onsubmit: (e) => {
      e.preventDefault();
      const text = search.value.trim();
      if (!text) return;
      if (target.value === 'teclado') send({ action: 'text', text });
      else send({ action: 'search', app: target.value, q: text });
      search.value = '';
    },
  }, target, h('div', { class: 'add-row tight' }, search, h('button', { class: 'btn primary', type: 'submit' }, 'Buscar')));

  // Selector Cruceta | Panel (se recuerda en este móvil)
  let mode = localStorage.getItem(MODE_KEY) || 'cruceta';
  const pad = h('div', { class: 'rc-pad' },
    h('span'), btn('chup', 'Arriba', 'DPAD_UP'), h('span'),
    btn('back', 'Izquierda', 'DPAD_LEFT'), btn('dot', 'OK', 'DPAD_CENTER', 'ok'), btn('chevron', 'Derecha', 'DPAD_RIGHT'),
    h('span'), btn('chdown', 'Abajo', 'DPAD_DOWN'), h('span'));
  const touch = touchPad(key);
  const modeBtns = [['cruceta', 'Cruceta'], ['panel', 'Panel']].map(([m, label]) => h('button', {
    type: 'button', class: 'seg-btn', 'data-mode': m, onclick: () => { mode = m; localStorage.setItem(MODE_KEY, m); paintMode(); },
  }, label));
  const modeSeg = h('div', { class: 'seg seg-small', role: 'tablist', 'aria-label': 'Tipo de control' }, modeBtns);
  function paintMode() {
    pad.hidden = mode !== 'cruceta';
    touch.hidden = mode !== 'panel';
    modeBtns.forEach((b) => b.setAttribute('aria-selected', String(b.dataset.mode === mode)));
  }
  paintMode();
  const oldBridge = h('p', { class: 'notice', hidden: true }, 'El puente es antiguo: actualízalo para usar "Buscar en YouTube / Netflix".');

  // Todo lo que manda órdenes va aquí dentro: se bloquea entero (botones, panel táctil
  // y búsqueda) si la app no está conectada o el puente/Chromecast no están disponibles.
  const ctrls = h('div', { class: 'rc-ctrls' },
    h('div', { class: 'rc-row' },
      btn('power', 'Encender / apagar', 'POWER', 'danger'),
      btn('mute', 'Silencio', 'VOLUME_MUTE'),
      btn('playpause', 'Play / pausa', 'MEDIA_PLAY_PAUSE')),

    modeSeg,
    pad,
    touch,

    h('div', { class: 'rc-row' },
      btn('undo', 'Atrás', 'BACK'),
      btn('house', 'Inicio', 'HOME'),
      holdBtn('voldown', 'Bajar volumen', 'VOLUME_DOWN'),
      holdBtn('volup', 'Subir volumen', 'VOLUME_UP')),

    h('div', { class: 'rc-row apps' },
      h('button', { type: 'button', class: 'btn', onclick: () => send({ action: 'app', app: 'youtube' }) }, 'YouTube'),
      h('button', { type: 'button', class: 'btn', onclick: () => send({ action: 'app', app: 'netflix' }) }, 'Netflix')),

    oldBridge,
    searchForm);

  const card = h('div', { class: 'card remote' },
    h('div', { class: 'remote-head' },
      dot,
      h('div', { class: 'remote-title' }, h('span', { class: 'card-title' }, 'Chromecast'), statusText),
      latency),
    h('div', { class: 'remote-info' }, appText, volText),
    ctrls);

  const unsubAck = store.onTopic(ACK, (a) => {
    const t0 = pending.get(a.id);
    if (t0 === undefined) return;
    pending.delete(a.id);
    latency.classList.toggle('err', !a.ok);
    latency.textContent = a.ok ? `${Math.round(performance.now() - t0)} ms` : a.error || 'Error';
  });

  let appOk = store.isConnected();
  let s = null;   // último estado del puente
  function paint() {
    const ready = appOk && !!s && s.online && s.available;
    oldBridge.hidden = !appOk || !s || !s.online || !olderThan(s.bridge, BRIDGE_MIN);
    dot.className = 'dev-dot ' + (!appOk || !s ? '' : ready ? (s.on ? 'on' : 'standby') : 'off');
    statusText.textContent = !appOk ? 'App sin conexión'
      : !s ? 'Sin datos del puente'
        : !s.online ? 'Puente desconectado'
          : !s.available ? 'Chromecast no disponible'
            : s.on ? 'Encendido' : 'En reposo';
    appText.textContent = ready && s.on ? 'App: ' + appName(s.app) : '';
    const v = ready ? s.volume : null;
    volText.textContent = v ? (v.muted ? 'Volumen: silencio' : `Volumen: ${v.level}/${v.max}`) : '';
    ctrls.classList.toggle('locked', !ready);
    ctrls.querySelectorAll('button, input, select').forEach((el) => { el.disabled = !ready; });
  }

  const unsubState = store.onTopic(STATE, (st) => {
    if (!st || typeof st !== 'object') return;
    s = st;
    paint();
  });
  const unsubStatus = store.onStatus((st) => { appOk = !!st.ok; paint(); });

  paint();
  return { el: card, cleanup: () => { unsubAck(); unsubState(); unsubStatus(); } };
}

// ---------- Cine: proyector (IR) + pantalla (RF 433) ----------
// Botón principal: «Empezar cine» baja la pantalla y enciende el proyector; «Acabar cine»
// sube la pantalla y apaga el proyector. El proyector siempre recibe 2 pulsos (al apagar,
// el 2.º confirma; al encender lo ignora). Si está puesto se guarda RETENIDO en
// casa/cine/estado, así los dos móviles ven lo mismo.
// «Controles por separado»: proyector y pantalla sueltos, para corregir desajustes;
// NO cambian el estado del botón principal.
const P_CMD = 'casa/proyector/cmd';
const P_STATE = 'casa/proyector/estado';
const S_CMD = 'casa/pantalla/cmd';
const S_STATE = 'casa/pantalla/estado';
const CINE_STATE = 'casa/cine/estado';
// Proyector, pantalla y aire van en el mismo ESP32 del salón (nodo5). Una conexión MQTT
// solo tiene una última voluntad y va aquí ("online" / "offline"): si el nodo se cae, sus
// temas de mando no se enteran. Un mando solo está conectado si él Y el nodo lo están.
const SALON_STATE = 'casa/sensor/nodo5/estado';
const salonCaido = (v) => v === 'offline';

const newId = () => Math.random().toString(36).slice(2, 9);

function cineCard() {
  const nodes = { proyector: { online: false, rssi: null, known: false }, pantalla: { online: false, rssi: null, known: false } };
  let activo = false;
  let appOk = store.isConnected();   // sin conexión con el broker no sale ninguna orden
  let salonOff = false;              // el ESP32 del salón ha caído
  const up = (name) => nodes[name].online && !salonOff;

  const dot = h('span', { class: 'dev-dot' });
  const statusText = h('span', { class: 'dev-status' });
  const nodeLine = h('div', { class: 'cine-nodes' });

  const proyector = () => store.publishRaw(P_CMD, { accion: 'apagar', id: newId() });   // = 2 pulsos
  const pantalla = (accion) => store.publishRaw(S_CMD, { accion, id: newId() });

  const mainBtn = h('button', {
    type: 'button', class: 'cine-main',
    onclick: () => {
      const empezar = !activo;
      pantalla(empezar ? 'bajar' : 'subir');
      proyector();
      activo = empezar;
      store.publishRaw(CINE_STATE, { activo, por: store.getUserName(), ts: Date.now() }, { retain: true });
      paint();
    },
  });

  const projBtn = h('button', { type: 'button', class: 'rc-btn power-sm', 'aria-label': 'Encender / apagar proyector', onclick: proyector }, icon('power'));
  const upBtn = h('button', { type: 'button', class: 'rc-btn wide', onclick: () => pantalla('subir') }, icon('chup'), 'Subir');
  const downBtn = h('button', { type: 'button', class: 'rc-btn wide', onclick: () => pantalla('bajar') }, icon('chdown'), 'Bajar');

  const sep = h('details', { class: 'cine-sep' },
    h('summary', {}, 'Controles por separado'),
    h('div', { class: 'cine-sep-body' },
      h('div', { class: 'cine-sep-row' }, h('span', {}, 'Proyector'), projBtn),
      h('div', { class: 'cine-sep-row' }, h('span', {}, 'Pantalla'), h('div', { class: 'cine-sep-btns' }, upBtn, downBtn))));

  function nodeTag(name, label) {
    const n = nodes[name];
    if (!appOk) return h('span', { class: 'cine-node' }, label, h('span', { class: 'cine-off' }, 'sin conexión'));
    const on = up(name);
    const ic = on ? wifiIcon(n.rssi) : null;
    return h('span', { class: 'cine-node' + (on ? '' : ' off'), title: ic ? `WiFi: ${wifiPct(n.rssi)} % (${n.rssi} dBm)` : '' },
      label, ic || h('span', { class: 'cine-off' }, n.known ? 'desconectado' : 'sin datos'));
  }

  function paint() {
    const p = appOk && up('proyector');
    const s = appOk && up('pantalla');
    dot.className = 'dev-dot ' + (!appOk ? '' : p && s ? (activo ? 'on' : 'standby') : (p || s ? 'standby' : 'off'));
    statusText.textContent = !appOk ? 'App sin conexión'
      : !(p && s) ? (p || s ? 'Falta un nodo' : 'Nodos desconectados') : (activo ? 'Cine puesto' : 'Apagado');
    nodeLine.replaceChildren(nodeTag('proyector', 'Proyector'), nodeTag('pantalla', 'Pantalla'));
    mainBtn.textContent = activo ? 'Acabar cine' : 'Empezar cine';
    mainBtn.classList.toggle('is-on', activo);
    mainBtn.disabled = !(p && s);   // a medias no: haría solo una de las dos cosas
    projBtn.disabled = !p;
    upBtn.disabled = downBtn.disabled = !s;
  }

  const card = h('div', { class: 'card remote' },
    h('div', { class: 'remote-head' },
      dot,
      h('div', { class: 'remote-title' }, h('span', { class: 'card-title' }, 'Cine'), statusText)),
    nodeLine,
    mainBtn,
    sep);

  const onNode = (name) => (st) => {
    if (!st || typeof st !== 'object') return;
    nodes[name].known = true;
    nodes[name].online = !!st.online;
    if (typeof st.rssi === 'number') nodes[name].rssi = st.rssi;
    paint();
  };
  const unsubs = [
    store.onTopic(P_STATE, onNode('proyector')),
    store.onTopic(S_STATE, onNode('pantalla')),
    store.onTopic(CINE_STATE, (c) => { if (c && typeof c === 'object') { activo = !!c.activo; paint(); } }),
    store.onStatus((st) => { appOk = !!st.ok; paint(); }),
    store.onTopic(SALON_STATE, (v) => { salonOff = salonCaido(v); paint(); }),
  ];

  paint();
  return { el: card, cleanup: () => unsubs.forEach((u) => u()) };
}

// ---------- Aire acondicionado (Argo, IR GREE desde un ESP32) ----------
// Cada orden manda el ESTADO COMPLETO (como su mando), así que la app y el aire no se
// desincronizan. Si alguien usa el mando original, el ESP32 lo lee y publica el estado.
const A_CMD = 'casa/aire/cmd';
const A_STATE = 'casa/aire/estado';
const AIR_MODES = [
  ['cool', 'snow', 'Frío'], ['dry', 'drops', 'Seco'], ['fan', 'fan', 'Ventilar'],
  ['heat', 'sun', 'Calor'], ['auto', 'acauto', 'Auto'],
];
const AIR_FANS = [[0, 'Auto'], [1, 'Bajo'], [2, 'Medio'], [3, 'Alto']];

function airCard() {
  const st = { power: false, mode: 'cool', temp: 25, fan: 0 };
  let online = false;
  let rssi = null;
  let known = false;      // ya llegó algún estado del nodo
  let appOk = store.isConnected();   // sin conexión con el broker no sale ninguna orden
  let salonOff = false;              // el ESP32 del salón ha caído
  let lastLocal = 0;      // último cambio hecho aquí (para no pisarlo con un estado viejo)
  let timer = null;

  const dot = h('span', { class: 'dev-dot' });
  const statusText = h('span', { class: 'dev-status' }, 'Sin datos del nodo');
  const wifiBox = h('span', { class: 'dev-wifi' });

  function send() {
    clearTimeout(timer);
    timer = null;
    store.publishRaw(A_CMD, { ...st, id: Math.random().toString(36).slice(2, 9) });
  }
  // Encender/apagar va al momento; temperatura, modo y ventilador esperan medio segundo
  // por si se pulsan varias veces seguidas (+ + +): se manda solo el estado final.
  function change(patch, now) {
    Object.assign(st, patch);
    lastLocal = Date.now();
    paint();
    if (now) send(); else { clearTimeout(timer); timer = setTimeout(send, 500); }
  }

  const powerBtn = h('button', { type: 'button', class: 'rc-btn power-ac', 'aria-label': 'Encender / apagar aire', onclick: () => change({ power: !st.power }, true) }, icon('power'));
  const modeBtns = AIR_MODES.map(([id, ic, label]) => h('button', {
    type: 'button', class: 'mode-btn', 'data-mode': id, onclick: () => change({ mode: id }),
  }, icon(ic), h('span', {}, label)));
  // Temperatura: tocar el número abre el teclado numérico. Fuera de 16-30 se ajusta al límite.
  const tempVal = h('button', { type: 'button', class: 'temp-val', 'aria-label': 'Escribir temperatura', onclick: () => editTemp() });
  const tempInput = h('input', { type: 'number', inputmode: 'numeric', min: '16', max: '30', step: '1', class: 'temp-input', hidden: true, 'aria-label': 'Temperatura' });
  function editTemp() {
    tempInput.value = String(st.temp);
    tempVal.hidden = true;
    tempInput.hidden = false;
    tempInput.focus();
    tempInput.select();
  }
  function commitTemp() {
    if (tempInput.hidden) return;
    tempInput.hidden = true;
    tempVal.hidden = false;
    const n = Math.round(Number(tempInput.value));
    if (tempInput.value.trim() === '' || !Number.isFinite(n)) { paint(); return; }
    const t = Math.min(30, Math.max(16, n));
    if (t !== st.temp) change({ temp: t }, true); else paint();
  }
  tempInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); commitTemp(); }
    if (e.key === 'Escape') { tempInput.value = ''; commitTemp(); }
  });
  tempInput.addEventListener('blur', commitTemp);
  const minus = h('button', { type: 'button', class: 'rc-btn', 'aria-label': 'Bajar temperatura', onclick: () => change({ temp: Math.max(16, st.temp - 1) }) }, icon('minus'));
  const plus = h('button', { type: 'button', class: 'rc-btn', 'aria-label': 'Subir temperatura', onclick: () => change({ temp: Math.min(30, st.temp + 1) }) }, icon('plus'));
  const fanBtns = AIR_FANS.map(([v, label]) => h('button', { type: 'button', class: 'seg-btn', onclick: () => change({ fan: v }) }, label));

  const modeLabel = () => (AIR_MODES.find((m) => m[0] === st.mode) || [])[2] || '';

  function paint() {
    const on = online && !salonOff;
    const ready = appOk && on && known;
    dot.className = 'dev-dot ' + (!appOk ? '' : !on ? 'off' : st.power ? 'on' : 'standby');
    statusText.textContent = !appOk ? 'App sin conexión'
      : !on ? (known || salonOff ? 'Nodo desconectado' : 'Sin datos del nodo')
        : st.power ? `${modeLabel()} · ${st.temp} °C` : 'Apagado';
    const ic = appOk && on ? wifiIcon(rssi) : null;
    wifiBox.replaceChildren(...(ic ? [ic] : []));
    wifiBox.title = ic ? `WiFi del nodo: ${wifiPct(rssi)} % (${rssi} dBm)` : '';
    powerBtn.classList.toggle('is-on', st.power);
    modeBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === st.mode)));
    fanBtns.forEach((b, i) => b.setAttribute('aria-selected', String(AIR_FANS[i][0] === st.fan)));
    tempVal.textContent = `${st.temp} °C`;
    [powerBtn, minus, plus, tempVal, ...modeBtns, ...fanBtns].forEach((b) => { b.disabled = !ready; });
    body.classList.toggle('is-off', !st.power);
  }

  const body = h('div', { class: 'air-body' },
    h('div', { class: 'air-top' },
      powerBtn,
      h('div', { class: 'temp-box' }, minus, tempVal, tempInput, plus)),
    h('div', { class: 'mode-row' }, ...modeBtns),
    h('div', { class: 'fan-box' },
      h('span', { class: 'fan-label' }, 'Ventilador'),
      h('div', { class: 'fan-row' },
        h('span', { class: 'fan-ico', 'aria-hidden': 'true' }, icon('fan')),
        h('div', { class: 'seg seg-fan', role: 'tablist', 'aria-label': 'Velocidad del ventilador' }, ...fanBtns))));

  const card = h('div', { class: 'card remote' },
    h('div', { class: 'remote-head' },
      dot,
      h('div', { class: 'remote-title' }, h('span', { class: 'card-title' }, 'Aire'), statusText),
      wifiBox),
    body);

  const unsub = store.onTopic(A_STATE, (s) => {
    if (!s || typeof s !== 'object') return;
    online = !!s.online;
    if (typeof s.rssi === 'number') rssi = s.rssi;
    if (typeof s.mode === 'string') {
      known = true;
      // Un estado del mando manda siempre; uno de la app se ignora si aquí hay un cambio más nuevo.
      if (s.origen === 'mando' || (!timer && Date.now() - lastLocal > 1500)) {
        st.power = !!s.power; st.mode = s.mode; st.temp = s.temp; st.fan = s.fan;
      }
    }
    paint();
  });

  const unsubStatus = store.onStatus((s) => { appOk = !!s.ok; paint(); });
  const unsubSalon = store.onTopic(SALON_STATE, (v) => { salonOff = salonCaido(v); paint(); });

  paint();
  return { el: card, cleanup: () => { unsub(); unsubStatus(); unsubSalon(); if (timer) send(); } };
}

export default function render(root) {
  const pj = cineCard();
  const air = airCard();
  const cc = chromecastCard();
  root.append(h('div', { class: 'view' },
    pj.el,
    air.el,
    cc.el,
    h('p', { class: 'hint center' }, 'La luz se añadirá aquí.')));
  return () => { pj.cleanup(); air.cleanup(); cc.cleanup(); };
}
