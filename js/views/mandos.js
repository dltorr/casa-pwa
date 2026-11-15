// Mandos: control de aparatos de casa. De momento, el Chromecast con Google TV.
// La app manda órdenes por MQTT (casa/chromecast/cmd); el puente (ordenador o Raspberry
// en casa) las pasa al Chromecast y responde con un "ack" para medir el retardo.

import * as store from '../store.js';
import { h, icon } from '../ui.js';

const CMD = 'casa/chromecast/cmd';
const ACK = 'casa/chromecast/ack';
const STATE = 'casa/chromecast/estado';
const HOLD_MS = 400; // a partir de aquí, pulsación larga (volumen)

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

  const search = h('input', { type: 'text', placeholder: 'Escribir en el buscador del Chromecast…', autocomplete: 'off', enterkeyhint: 'send' });
  const searchForm = h('form', {
    class: 'add-row tight',
    onsubmit: (e) => {
      e.preventDefault();
      const text = search.value.trim();
      if (text) { send({ action: 'text', text }); search.value = ''; }
    },
  }, search, h('button', { class: 'btn primary', type: 'submit' }, 'Enviar'));

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

    h('div', { class: 'rc-pad' },
      h('span'), btn('chup', 'Arriba', 'DPAD_UP'), h('span'),
      btn('back', 'Izquierda', 'DPAD_LEFT'), btn('dot', 'OK', 'DPAD_CENTER', 'ok'), btn('chevron', 'Derecha', 'DPAD_RIGHT'),
      h('span'), btn('chdown', 'Abajo', 'DPAD_DOWN'), h('span')),

    h('div', { class: 'rc-row' },
      btn('undo', 'Atrás', 'BACK'),
      btn('house', 'Inicio', 'HOME'),
      holdBtn('voldown', 'Bajar volumen', 'VOLUME_DOWN'),
      holdBtn('volup', 'Subir volumen', 'VOLUME_UP')),

    h('div', { class: 'rc-row apps' },
      h('button', { type: 'button', class: 'btn', onclick: () => send({ action: 'app', app: 'youtube' }) }, 'YouTube'),
      h('button', { type: 'button', class: 'btn', onclick: () => send({ action: 'app', app: 'netflix' }) }, 'Netflix')),

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
