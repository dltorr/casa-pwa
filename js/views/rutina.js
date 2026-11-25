// Rutina del peque (prototipo): tareas grandes de la mañana y de la noche que el niño tacha
// tocándolas. Una barra se va vaciando hasta la hora de salir (o de dormir) y cada tarea
// da 3, 2 o 1 estrella según el tercio de la barra en que se tache.
//
// Datos sincronizados (sección «rutina»), para que un móvil las prepare y otro (la tablet
// de casa, en el futuro) las muestre:
//   { manana: {hora, inicio}, noche: {hora, inicio}, tareas: [{id, rutina, icon, name, done, pts}] }
// «inicio» es cuando se pulsó «¡Empezamos!»; si es de otro día, la rutina está sin empezar.

import * as store from '../store.js';
import { h, icon, field, sheet } from '../ui.js';

const RUTINAS = [
  ['manana', '☀️', 'Mañana', 'Salimos'],
  ['noche', '🌙', 'Noche', 'A dormir'],
];
const EMOJIS = ['🚽', '👕', '👖', '🧦', '👟', '🧥', '🥣', '🍎', '💧', '🪥', '🧼', '🛁',
  '💇', '🎒', '🧸', '📖', '🛏️', '😴', '🧴', '🥛', '🐶', '🌱', '🎨', '⭐'];
const MAX_TEXTO = 18;

const isToday = (ms) => ms && new Date(ms).toDateString() === new Date().toDateString();

// Hora límite del día en que empezó la rutina
function deadline(r) {
  const [hh, mm] = (r.hora || '08:30').split(':').map(Number);
  const d = new Date(r.inicio);
  d.setHours(hh, mm, 0, 0);
  return d.getTime();
}

// Parte de la barra ya gastada: 0 al empezar, 1 a la hora límite (o pasada)
function spent(r, now = Date.now()) {
  const end = deadline(r);
  if (end <= r.inicio) return 1;
  return Math.min(1, Math.max(0, (now - r.inicio) / (end - r.inicio)));
}

const pointsAt = (f) => (f < 1 / 3 ? 3 : f < 2 / 3 ? 2 : f < 1 ? 1 : 0);

const stars = (n) => '⭐'.repeat(n);

export default function render(root) {
  let cual = new Date().getHours() < 14 ? 'manana' : 'noche';
  let editing = false;

  const data = () => store.get('rutina');
  const rutina = () => data()[cual] || { hora: '08:30', inicio: null };
  const activa = () => isToday(rutina().inicio);
  const tareas = () => (data().tareas || []).filter((t) => t.rutina === cual);

  // ---------- Selector mañana / noche ----------
  const segBtns = RUTINAS.map(([id, emo, label]) => h('button', {
    type: 'button', class: 'seg-btn', onclick: () => { cual = id; paint(); },
  }, emo + ' ' + label));
  const seg = h('div', { class: 'seg', role: 'tablist' }, segBtns);

  // ---------- Barra del tiempo ----------
  const fill = h('div', { class: 'kid-bar-fill' });
  const runner = h('span', { class: 'kid-bar-runner', 'aria-hidden': 'true' }, '🏃');
  const barText = h('div', { class: 'kid-bar-text' });
  const bar = h('div', { class: 'kid-bar' }, h('div', { class: 'kid-bar-track' }, fill, runner), barText);
  const startBtn = h('button', { type: 'button', class: 'kid-start', onclick: () => empezar() }, '¡Empezamos! 🚀');
  const score = h('div', { class: 'kid-score' });
  const grid = h('div', { class: 'kid-grid' });
  const party = h('div', { class: 'kid-party', hidden: true });

  // ---------- Modo padres ----------
  const horaInput = h('input', { type: 'time', class: 'kid-hora' });
  horaInput.addEventListener('change', () => {
    if (!horaInput.value) return;
    store.update('rutina', (d) => { d[cual] = { ...(d[cual] || {}), hora: horaInput.value }; });
  });
  const horaLabel = h('span');
  const parents = h('div', { class: 'panel kid-parents' },
    h('label', { class: 'switch-row' }, horaLabel, horaInput),
    h('div', { class: 'kid-parent-btns' },
      h('button', { type: 'button', class: 'btn', onclick: () => editTask(null) }, icon('plus'), 'Añadir tarea'),
      h('button', {
        type: 'button', class: 'btn',
        onclick: () => store.update('rutina', (d) => { d[cual] = { ...(d[cual] || {}), inicio: null }; }),
      }, 'Parar rutina')),
    h('p', { class: 'hint' }, 'Toca una tarea para cambiarla o borrarla.'));
  const editBtn = h('button', {
    type: 'button', class: 'btn small kid-edit',
    onclick: () => { editing = !editing; paint(); },
  });

  function empezar() {
    store.update('rutina', (d) => {
      d[cual] = { ...(d[cual] || {}), inicio: Date.now() };
      d.tareas = (d.tareas || []).map((t) => (t.rutina === cual ? { ...t, done: null, pts: 0 } : t));
    });
  }

  function tachar(t, card) {
    if (!activa()) { startBtn.classList.remove('nudge'); void startBtn.offsetWidth; startBtn.classList.add('nudge'); return; }
    const hecha = !(t.done && isToday(t.done));
    const pts = hecha ? pointsAt(spent(rutina())) : 0;
    store.update('rutina', (d) => {
      const x = (d.tareas || []).find((i) => i.id === t.id);
      if (x) { x.done = hecha ? Date.now() : null; x.pts = pts; }
    });
    if (hecha) burst(card, pts);
  }

  // «+3 ⭐» que sube y se desvanece sobre la tarjeta recién tachada
  function burst(card, pts) {
    const el = h('span', { class: 'kid-burst' }, pts ? '+' + pts + ' ⭐' : '✔️');
    const r = card.getBoundingClientRect();
    el.style.left = r.left + r.width / 2 + 'px';
    el.style.top = r.top + r.height / 3 + 'px';
    document.body.append(el);
    setTimeout(() => el.remove(), 1100);
  }

  function editTask(t) {
    let emo = t ? t.icon : EMOJIS[0];
    const name = h('input', { type: 'text', maxlength: String(MAX_TEXTO), required: true, value: t ? t.name : '', placeholder: 'Dos o tres palabras', autocomplete: 'off' });
    const picks = EMOJIS.map((e) => h('button', {
      type: 'button', class: 'kid-emoji', 'aria-pressed': String(e === emo),
      onclick: () => { emo = e; picks.forEach((b) => b.setAttribute('aria-pressed', String(b.textContent === e))); },
    }, e));
    sheet(t ? 'Cambiar tarea' : 'Nueva tarea', [
      h('div', { class: 'kid-emojis' }, picks),
      field('Texto', name),
    ], {
      onSave: () => {
        const n = name.value.trim().slice(0, MAX_TEXTO);
        if (!n) return false;
        store.update('rutina', (d) => {
          d.tareas = d.tareas || [];
          const x = t && d.tareas.find((i) => i.id === t.id);
          if (x) { x.icon = emo; x.name = n; } else d.tareas.push({ id: store.uid(), rutina: cual, icon: emo, name: n, done: null, pts: 0 });
        });
        return true;
      },
      onDelete: t ? () => store.update('rutina', (d) => { d.tareas = (d.tareas || []).filter((i) => i.id !== t.id); }) : null,
    });
  }

  // ---------- Pintado ----------
  function paintBar() {
    const r = rutina();
    const [, , , meta] = RUTINAS.find((x) => x[0] === cual);
    const on = activa();
    bar.hidden = !on;
    startBtn.hidden = on || editing;
    if (!on) return;
    const f = spent(r);
    const left = 1 - f;
    fill.style.width = (left * 100).toFixed(1) + '%';
    runner.style.left = `calc(${(left * 100).toFixed(1)}% - 14px)`;
    fill.className = 'kid-bar-fill ' + (f < 1 / 3 ? 't1' : f < 2 / 3 ? 't2' : 't3');
    const mins = Math.ceil((deadline(r) - Date.now()) / 60000);
    barText.textContent = f >= 1 ? `¡${meta}! ⏰` : `${meta} a las ${r.hora} · quedan ${mins} min · ahora vale ${stars(pointsAt(f))}`;
  }

  function paint() {
    const r = rutina();
    const on = activa();
    segBtns.forEach((b, i) => b.setAttribute('aria-selected', String(RUTINAS[i][0] === cual)));
    editBtn.replaceChildren(...(editing ? ['Listo'] : [icon('edit'), 'Editar']));
    parents.hidden = !editing;
    horaLabel.textContent = (cual === 'manana' ? 'Hora de salir' : 'Hora de dormir');
    if (document.activeElement !== horaInput) horaInput.value = r.hora || '';

    const list = tareas();
    let total = 0;
    grid.replaceChildren(...list.map((t) => {
      const hecha = on && t.done && isToday(t.done);
      if (hecha) total += t.pts || 0;
      const card = h('button', {
        type: 'button', class: 'kid-card' + (hecha ? ' done' : ''),
        'aria-pressed': String(!!hecha),
        onclick: () => (editing ? editTask(t) : tachar(t, card)),
      },
        h('span', { class: 'kid-icon', 'aria-hidden': 'true' }, t.icon),
        h('span', { class: 'kid-name' }, t.name),
        hecha ? h('span', { class: 'kid-pts' }, t.pts ? stars(t.pts) : '✔️') : null);
      return card;
    }), ...(editing ? [h('button', { type: 'button', class: 'kid-card kid-add', onclick: () => editTask(null) },
      h('span', { class: 'kid-icon' }, '➕'), h('span', { class: 'kid-name' }, 'Añadir'))] : []));

    score.textContent = `⭐ ${total}`;
    score.hidden = !on;
    const todas = on && list.length > 0 && list.every((t) => t.done && isToday(t.done));
    party.hidden = !todas || editing;
    party.textContent = `¡Todo hecho! 🎉 Has conseguido ${total} ${total === 1 ? 'estrella' : 'estrellas'}`;
    paintBar();
  }

  root.append(h('div', { class: 'view kid' },
    h('div', { class: 'kid-top' }, seg, editBtn),
    parents,
    startBtn,
    bar,
    score,
    party,
    grid));

  const unsub = store.subscribe('rutina', paint);
  const tick = setInterval(paintBar, 1000);
  paint();
  return () => { unsub(); clearInterval(tick); };
}
