// Mapa de la casa: dos pisos con selector (Piso abajo / Piso arriba).
//
// Sensores: cada nodo publica retenido en casa/sensor/<nodo> un JSON con "ubic".
// Se busca la habitación cuyo código (Ajustes) coincide con "ubic" y, si está
// colocada en el plano (pos: {floor, x, y} en % de la imagen), se pinta ahí
// "21,8° · 58 %". El nodo publica además casa/sensor/<nodo>/estado = online/offline.
//
// #/casa?colocar=<roomId> -> modo colocar: tocar el plano guarda la posición de esa habitación.

import * as store from '../store.js';
import { h, icon, sectionTitle, empty, sheet } from '../ui.js';

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

// WiFi: % aproximado a partir del RSSI. -50 dBm o mejor = 100 %, -100 dBm = 0 %.
export const wifiPct = (rssi) => (typeof rssi === 'number' ? Math.max(0, Math.min(100, 2 * (rssi + 100))) : null);

// Icono de 4 rayas: se encienden en proporción al % (cada raya = 25 %).
// 1 raya roja, 2 naranjas, 3 o 4 en el color normal (blanco en el mapa).
export function wifiIcon(rssi) {
  const pct = wifiPct(rssi);
  if (pct == null) return null;
  const bars = Math.ceil(pct / 25);
  const lvl = bars <= 1 ? 'bad' : bars === 2 ? 'mid' : 'ok';
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 20 16');
  svg.setAttribute('class', 'wifi-bars ' + lvl);
  svg.setAttribute('aria-label', `WiFi ${pct} %`);
  for (let i = 0; i < 4; i++) {
    const r = document.createElementNS(NS, 'rect');
    const hgt = 4 + i * 4;
    r.setAttribute('x', String(1 + i * 5)); r.setAttribute('y', String(16 - hgt));
    r.setAttribute('width', '3.4'); r.setAttribute('height', String(hgt)); r.setAttribute('rx', '1');
    if (i < bars) r.setAttribute('class', 'on');
    svg.append(r);
  }
  return svg;
}

// ---------- Gráfica de 24 h (casa/historico/<nodo>, la publica la Raspberry) ----------
// Tramos de `paso` segundos con media, mínimo y máximo. Se pinta desde el primer tramo con
// datos hasta el último (los ejes se ajustan a lo que hay). Donde falta un tramo, la línea
// y la franja mín–máx se cortan.
const HIST_PREFIX = 'casa/historico/';
const hhmm = (ts) => new Date(ts * 1000).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
const isNum = (v) => typeof v === 'number' && isFinite(v);

function chart(hist, key, unit) {
  const arr = (k) => (hist && Array.isArray(hist[k]) ? hist[k] : []);
  const avg = arr(key), mins = arr(key + 'min'), maxs = arr(key + 'max');
  const first = avg.findIndex(isNum);
  if (first < 0) {
    return h('p', { class: 'hint chart-empty' }, hist
      ? 'Recogiendo datos: el primer punto sale en el próximo cuarto de hora.'
      : 'Sin histórico todavía. Lo genera la Raspberry cada 15 min.');
  }
  const paso = hist.paso || 900;
  const n = avg.length - first;                 // tramos que se pintan (de first al final)
  const lowOf = (i) => (isNum(mins[i]) ? mins[i] : avg[i]);
  const highOf = (i) => (isNum(maxs[i]) ? maxs[i] : avg[i]);
  const idx = [];
  for (let i = first; i < avg.length; i++) if (isNum(avg[i])) idx.push(i);
  const lows = idx.map(lowOf), highs = idx.map(highOf);
  let lo = Math.min(...lows), hi = Math.max(...highs);
  const pad = Math.max((hi - lo) * 0.12, unit === '%' ? 1 : 0.2);
  lo -= pad; hi += pad;

  const W = 300, H = 130, L = 34, R = 6, T = 8, B = 20;
  const x = (i) => L + (i - first + 0.5) * ((W - L - R) / n);
  const y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs, text) => {
    const e = document.createElementNS(NS, tag);
    Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, String(v)));
    if (text != null) e.textContent = text;
    return e;
  };
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img' });
  const dec = unit === '%' ? 0 : 1;
  [hi - pad, (hi + lo) / 2, lo + pad].forEach((v) => {
    svg.append(el('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), class: 'chart-grid' }));
    svg.append(el('text', { x: L - 4, y: y(v) + 3, class: 'chart-label', 'text-anchor': 'end' }, num(v, dec)));
  });

  // Tramos seguidos con dato: cada grupo es un trozo de línea y de franja
  const runs = [];
  idx.forEach((i) => { const r = runs[runs.length - 1]; if (r && r[r.length - 1] === i - 1) r.push(i); else runs.push([i]); });
  const half = ((W - L - R) / n) / 2;
  runs.forEach((r) => {
    // Franja mín–máx (un tramo suelto se dibuja como un rectángulo estrecho)
    const xs = r.length > 1 ? r.map(x) : [x(r[0]) - half / 2, x(r[0]) + half / 2];
    const top = r.length > 1 ? r.map((i) => y(highOf(i))) : [y(highOf(r[0])), y(highOf(r[0]))];
    const bot = r.length > 1 ? r.map((i) => y(lowOf(i))) : [y(lowOf(r[0])), y(lowOf(r[0]))];
    const ptsBand = [...xs.map((xv, k) => `${xv.toFixed(1)},${top[k].toFixed(1)}`),
      ...xs.map((xv, k) => `${xv.toFixed(1)},${bot[k].toFixed(1)}`).reverse()].join(' ');
    svg.append(el('polygon', { points: ptsBand, class: 'chart-band' }));
    if (r.length > 1) {
      svg.append(el('polyline', { points: r.map((i) => `${x(i).toFixed(1)},${y(avg[i]).toFixed(1)}`).join(' '), class: 'chart-line' }));
    }
  });
  idx.forEach((i) => svg.append(el('circle', { cx: x(i), cy: y(avg[i]), r: idx.length > 40 ? 1.2 : 2, class: 'chart-dot' })));

  // Eje de tiempo: del inicio del primer tramo pintado al final del último
  const t0 = hist.inicio + first * paso, t1 = hist.inicio + avg.length * paso;
  [[L, 'start', t0], [(L + W - R) / 2, 'middle', (t0 + t1) / 2], [W - R, 'end', t1]].forEach(([xv, anchor, t]) => {
    svg.append(el('text', { x: xv, y: H - 5, class: 'chart-label', 'text-anchor': anchor }, hhmm(t)));
  });

  const horas = (t1 - t0) / 3600;
  const span = horas >= 23.9 ? 'Últimas 24 h' : `Últimas ${horas < 1 ? Math.round(horas * 60) + ' min' : num(horas, horas % 1 ? 1 : 0) + ' h'}`;
  const fmt = (v) => `${num(v, dec)} ${unit}`;
  return h('div', {},
    svg,
    h('div', { class: 'chart-foot' },
      h('span', {}, `Mín ${fmt(Math.min(...lows))}`),
      h('span', {}, `${span} · cada ${Math.round(paso / 60)} min`),
      h('span', {}, `Máx ${fmt(Math.max(...highs))}`)));
}

// Punto de rocío (fórmula de Magnus, error < 0,4 °C entre -45 y 60 °C).
function dewPoint(t, rh) {
  if (typeof t !== 'number' || typeof rh !== 'number' || rh <= 0) return null;
  const g = Math.log(rh / 100) + (17.62 * t) / (243.12 + t);
  return (243.12 * g) / (17.62 - g);
}

const reading = (d) => [`${num(tempOf(d))}°  ${num(humOf(d), 0)} %`, wifiIcon(d.rssi)];

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
      }, ...reading(s.data)));
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
        h('span', { class: 'row-title reading' }, ...reading(d)),
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

    // Temperatura, humedad y punto de rocío: al tocarlas se abre debajo su gráfica de 24 h.
    // Solo una abierta a la vez; tocar la misma la cierra.
    let hist = null;
    let open = null;   // { key, box }
    const charts = [];
    const metric = (key, k, v, unit) => {
      const box = h('div', { class: 'chart-box', hidden: true });
      const btn = h('button', { type: 'button', class: 'kv kv-btn', 'aria-expanded': 'false' },
        h('span', {}, k), h('strong', {}, v, icon('chevron')));
      const show = () => box.replaceChildren(chart(hist, key, unit));
      btn.addEventListener('click', () => {
        const same = open && open.key === key;
        charts.forEach((c) => { c.box.hidden = true; c.btn.setAttribute('aria-expanded', 'false'); });
        open = null;
        if (same) return;
        show();
        box.hidden = false;
        btn.setAttribute('aria-expanded', 'true');
        open = { key, show };
      });
      charts.push({ btn, box });
      return [btn, box];
    };
    const list = h('div', { class: 'kv-list' },
      ...metric('t', 'Temperatura', `${num(tempOf(d), 2)} °C`, '°C'),
      ...metric('h', 'Humedad', `${num(humOf(d), 1)} %`, '%'),
      ...metric('pr', 'Punto de rocío', `${num(dewPoint(tempOf(d), humOf(d)), 1)} °C`, '°C'),
      line('Última lectura', `${when} (${ago(Date.now() / 1000 - ts)})`),
      line('Estado', s.estado === 'offline' ? 'desconectado' : (s.estado === 'online' ? 'conectado' : '–')),
      line('Nodo', nodo),
      line('Ubicación (ubic)', d.ubic || '–'),
      line('Señal WiFi', d.rssi != null ? `${wifiPct(d.rssi)} % (${d.rssi} dBm)` : '–'),
      line('Red', d.red || '–'),
      line('IP', d.ip || '–'),
      line('Firmware', d.fw || '–'),
      d.err ? line('Sensores con fallo', d.err) : null,
      !r ? h('p', { class: 'hint' }, `Ninguna habitación tiene el código «${d.ubic}». Ponlo en Más → Ajustes.`) : null);
    sheet(r ? r.name : nodo, list);
    // Medias de 24 h que publica la Raspberry cada 30 min (retenido); si llega una nueva
    // con la gráfica abierta, se repinta.
    const unsubHist = store.onTopic(HIST_PREFIX + nodo, (v) => {
      hist = v && typeof v === 'object' ? v : null;
      if (open) open.show();
    });
    const dlg = list.closest('dialog');
    if (dlg) dlg.addEventListener('close', unsubHist); else unsubHist();
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
