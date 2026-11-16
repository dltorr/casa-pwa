// Mapa de la casa: dos pisos con selector (Piso abajo / Piso arriba).
//
// Sensores: cada nodo publica retenido en casa/sensor/<nodo> un JSON con "ubic".
// Se busca la habitación cuyo código (Ajustes) coincide con "ubic" y, si está
// colocada en el plano (pos: {floor, x, y} en % de la imagen), se pinta ahí
// "21,8° · 58 %". El nodo publica además casa/sensor/<nodo>/estado = online/offline.
//
// #/casa?colocar=<roomId> -> modo colocar: tocar el plano guarda la posición de esa habitación.

import * as store from '../store.js';
import { h, sectionTitle, empty, sheet } from '../ui.js';

export const FLOORS = [
  { id: 'abajo', label: 'Piso abajo', src: '/img/plano-abajo.png' },
  { id: 'arriba', label: 'Piso arriba', src: '/img/plano-arriba.jpg' },
];
const FLOOR_KEY = 'casa:piso';
const SENSOR_PREFIX = 'casa/sensor/';
const STALE_S = 180;   // sin datos en 3 min (6 medidas) -> se pinta apagado

const num = (v, d = 1) => (typeof v === 'number' && isFinite(v) ? v.toFixed(d).replace('.', ',') : '–');
const tempOf = (d) => (d.t ?? d.temp);
const humOf = (d) => (d.h ?? d.hum);

function ago(sec) {
  if (sec < 60) return `hace ${Math.max(0, Math.round(sec))} s`;
  if (sec < 3600) return `hace ${Math.round(sec / 60)} min`;
  if (sec < 86400) return `hace ${Math.round(sec / 3600)} h`;
  return `hace ${Math.round(sec / 86400)} d`;
}

// ---------- Sensores recibidos (compartido entre visitas a la vista) ----------
const sensors = new Map();   // nodo -> { data, estado, at }

function sensorTs(s) {
  // ts del nodo (hora de la medida). Si el nodo aún no tenía hora, la de llegada.
  const ts = s.data && s.data.ts;
  return ts && ts > 1700000000 ? ts : s.at;
}
function isStale(s) {
  if (s.estado === 'offline') return true;
  return Date.now() / 1000 - sensorTs(s) > STALE_S;
}

export default function render(root, params) {
  let floor = localStorage.getItem(FLOOR_KEY) || 'abajo';
  const placingId = params && params.get('colocar');

  const segButtons = FLOORS.map((f) => h('button', {
    type: 'button', class: 'seg-btn', 'data-floor': f.id,
    onclick: () => { floor = f.id; localStorage.setItem(FLOOR_KEY, floor); drawPlan(); },
  }, f.label));
  const seg = h('div', { class: 'seg', role: 'tablist', 'aria-label': 'Piso' }, segButtons);

  const planImg = h('img', { class: 'plan-img', alt: '' });
  const layer = h('div', { class: 'plan-layer' });
  const box = h('div', { class: 'plan-box' }, planImg, layer);
  const plan = h('div', { class: 'plan' }, box);

  const roomsEl = h('div', { class: 'chips' });
  const devicesEl = h('div', { class: 'list' });

  // ---------- Modo colocar ----------
  let banner = null;
  if (placingId) {
    const r = store.rooms().find((x) => x.id === placingId);
    if (r) {
      plan.classList.add('placing');
      banner = h('div', { class: 'place-banner' },
        h('span', {}, `Toca el plano donde está «${r.name}». Cambia de piso si hace falta.`),
        h('a', { class: 'btn', href: '#/ajustes' }, 'Cancelar'));
      box.addEventListener('click', (e) => {
        const rect = planImg.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;
        if (x < 0 || x > 100 || y < 0 || y > 100) return;
        store.update('config', (c) => {
          const room = (c.rooms || []).find((i) => i.id === placingId);
          if (!room) return;
          room.pos = { floor, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
          if (!room.code) room.code = store.slug(room.name);   // fija el código: renombrar no rompe el enlace
        });
        location.hash = '#/ajustes';
      });
    }
  }

  function drawPlan() {
    const f = FLOORS.find((x) => x.id === floor) || FLOORS[0];
    planImg.src = f.src;
    planImg.alt = 'Plano ' + f.label.toLowerCase();
    segButtons.forEach((b) => b.setAttribute('aria-selected', String(b.dataset.floor === f.id)));
    drawLayer();
  }

  const roomFor = (ubic) => store.rooms().find((r) => store.roomCode(r) === ubic);

  function drawLayer() {
    const els = [];
    // Habitaciones colocadas en este piso: el sensor si lo hay; si no, solo un punto.
    const withSensor = new Set();
    sensors.forEach((s, nodo) => {
      const r = s.data && roomFor(s.data.ubic);
      if (!r || !r.pos || r.pos.floor !== floor) return;
      withSensor.add(r.id);
      els.push(h('button', {
        type: 'button', class: 'sensor-tag' + (isStale(s) ? ' stale' : ''),
        style: `left:${r.pos.x}%;top:${r.pos.y}%`,
        onclick: (e) => { e.stopPropagation(); details(nodo); },
      }, `${num(tempOf(s.data))}° · ${num(humOf(s.data), 0)} %`));
    });
    store.rooms().forEach((r) => {
      if (!r.pos || r.pos.floor !== floor || withSensor.has(r.id)) return;
      els.push(h('span', { class: 'room-pin' + (r.id === placingId ? ' current' : ''), title: r.name, style: `left:${r.pos.x}%;top:${r.pos.y}%` }));
    });
    const devices = ((store.get('mapa') && store.get('mapa').devices) || []).filter((d) => (d.floor || 'abajo') === floor);
    devices.filter((d) => d.x != null && d.y != null)
      .forEach((d) => els.push(h('span', { class: 'device-dot', title: d.name, style: `left:${d.x}%;top:${d.y}%` })));
    layer.replaceChildren(...els);
    drawDevices();
  }

  function sensorRow(nodo, s) {
    const d = s.data || {};
    const r = roomFor(d.ubic);
    let where;
    if (!r) where = `sin habitación (ubic: ${d.ubic || '¿?'})`;
    else if (!r.pos) where = `${r.name} · sin colocar en el mapa`;
    else where = `${r.name} · ${FLOORS.find((f) => f.id === r.pos.floor)?.label.toLowerCase() || ''}`;
    const age = Date.now() / 1000 - sensorTs(s);
    return h('button', { type: 'button', class: 'row sensor-row' + (isStale(s) ? ' stale' : ''), onclick: () => details(nodo) },
      h('span', { class: 'dev-dot' + (isStale(s) ? ' off' : ' on') }),
      h('span', { class: 'row-main stacked' },
        h('span', { class: 'row-title' }, `${num(tempOf(d))}° · ${num(humOf(d), 0)} %`),
        h('span', { class: 'row-sub' }, `${nodo} · ${where} · ${s.estado === 'offline' ? 'desconectado' : ago(age)}`)));
  }

  function drawDevices() {
    const rows = [...sensors.entries()].filter(([, x]) => x.data).sort().map(([n, s]) => sensorRow(n, s));
    const devices = (store.get('mapa') && store.get('mapa').devices) || [];
    devices.forEach((d) => rows.push(h('div', { class: 'row' }, h('span', { class: 'row-title' }, d.name))));
    devicesEl.replaceChildren(...(rows.length ? rows : [empty('Sin sensores ni actuadores todavía.')]));
  }

  function details(nodo) {
    const s = sensors.get(nodo);
    if (!s) return;
    const d = s.data || {};
    const r = roomFor(d.ubic);
    const ts = sensorTs(s);
    const when = new Date(ts * 1000).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const line = (k, v) => h('div', { class: 'kv' }, h('span', {}, k), h('strong', {}, v));
    sheet(r ? r.name : nodo, h('div', { class: 'kv-list' },
      line('Temperatura', `${num(tempOf(d), 2)} °C`),
      line('Humedad', `${num(humOf(d), 1)} %`),
      line('Última lectura', `${when} (${ago(Date.now() / 1000 - ts)})`),
      line('Estado', s.estado === 'offline' ? 'desconectado' : (s.estado === 'online' ? 'conectado' : '–')),
      line('Nodo', nodo),
      line('Ubicación (ubic)', d.ubic || '–'),
      line('Señal WiFi', d.rssi != null ? `${d.rssi} dBm` : '–'),
      line('Red', d.red || '–'),
      line('IP', d.ip || '–'),
      line('Firmware', d.fw || '–'),
      d.err ? line('Sensores con fallo', d.err) : null,
      !r ? h('p', { class: 'hint' }, `Ninguna habitación tiene el código «${d.ubic}». Ponlo en Más → Ajustes.`) : null));
  }

  function drawRooms() {
    const items = store.get('almacen');
    const rs = store.rooms();
    roomsEl.replaceChildren(...(rs.length
      ? rs.map((r) => {
        const n = items.filter((i) => i.roomId === r.id).length;
        return h('a', { class: 'chip', href: '#/almacen?room=' + r.id }, r.name, h('small', {}, String(n)));
      })
      : [h('p', { class: 'hint' }, 'Sin habitaciones. Créalas en Más → Ajustes.')]));
  }

  root.append(h('div', { class: 'view' },
    banner,
    seg,
    plan,
    sectionTitle('Habitaciones'),
    roomsEl,
    sectionTitle('Dispositivos'),
    devicesEl));

  drawPlan();
  drawRooms();
  const unsubs = [
    store.subscribe('config', () => { drawRooms(); drawLayer(); }),
    store.subscribe('almacen', drawRooms),
    store.subscribe('mapa', drawLayer),
  ];
  const timer = setInterval(drawLayer, 15000);   // "hace X" y apagado por antigüedad
  window.addEventListener('casa:sensores', drawLayer);
  return () => { unsubs.forEach((u) => u()); clearInterval(timer); window.removeEventListener('casa:sensores', drawLayer); };
}

// Se escucha desde que carga el módulo (no solo con la vista abierta), para tener
// el dato al entrar. Se repinta la vista abierta a través de un evento.
store.onPrefix(SENSOR_PREFIX, (topic, data) => {
  const rest = topic.slice(SENSOR_PREFIX.length).split('/');
  const nodo = rest[0];
  if (!nodo) return;
  const s = sensors.get(nodo) || { data: null, estado: '', at: 0 };
  if (rest[1] === 'estado') s.estado = String(data);
  else if (rest.length === 1 && data && typeof data === 'object') { s.data = data; s.at = Date.now() / 1000; }
  else return;
  sensors.set(nodo, s);
  if (!s.data) return;   // solo estado: no se pinta hasta tener dato
  window.dispatchEvent(new Event('casa:sensores'));
});
