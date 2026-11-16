// Mandos: control de aparatos de casa. De momento, el Chromecast con Google TV.
// La app manda órdenes por MQTT (casa/chromecast/cmd); el puente (ordenador o Raspberry
// en casa) las pasa al Chromecast y responde con un "ack" para medir el retardo.

import * as store from '../store.js';
import { h, icon } from '../ui.js';

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

  const card = h('div', { class: 'card remote' },
    h('div', { class: 'remote-head' },
      dot,
      h('div', { class: 'remote-title' }, h('span', { class: 'card-title' }, 'Chromecast'), statusText),
      latency),
    h('div', { class: 'remote-info' }, appText, volText),

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

  const unsubAck = store.onTopic(ACK, (a) => {
    const t0 = pending.get(a.id);
    if (t0 === undefined) return;
    pending.delete(a.id);
    latency.classList.toggle('err', !a.ok);
    latency.textContent = a.ok ? `${Math.round(performance.now() - t0)} ms` : a.error || 'Error';
  });

  const unsubState = store.onTopic(STATE, (s) => {
    const ready = s.online && s.available;
    oldBridge.hidden = !s.online || !olderThan(s.bridge, BRIDGE_MIN);
    dot.className = 'dev-dot ' + (ready ? (s.on ? 'on' : 'standby') : 'off');
    statusText.textContent = !s.online ? 'Puente desconectado'
      : !s.available ? 'Chromecast no disponible'
        : s.on ? 'Encendido' : 'En reposo';
    appText.textContent = ready && s.on ? 'App: ' + appName(s.app) : '';
    const v = s.volume;
    volText.textContent = ready && v ? (v.muted ? 'Volumen: silencio' : `Volumen: ${v.level}/${v.max}`) : '';
  });

  return { el: card, cleanup: () => { unsubAck(); unsubState(); } };
}

export default function render(root) {
  const cc = chromecastCard();
  root.append(h('div', { class: 'view' },
    cc.el,
    h('p', { class: 'hint center' }, 'Proyector, pantalla y luz se añadirán aquí.')));
  return cc.cleanup;
}
