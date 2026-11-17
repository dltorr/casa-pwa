// Calendario general: eventos (visitas, viajes…) + tareas con fecha.

import * as store from '../store.js';
import { h, icon, sheet, field, empty, sectionTitle, ymd, fmtDate, today, auditLine } from '../ui.js';
import { taskRow } from './tareas.js';

const TYPES = { visita: 'Visita', viaje: 'Viaje', otro: 'Otro' };
const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const UPCOMING_MAX = 30;   // cuántos eventos se listan en «Próximos eventos»

// Hora: los eventos antiguos no tienen ni allDay ni startTime -> son de todo el día.
const isAllDay = (e) => e.allDay !== false || !e.startTime;
const lastDay = (e) => e.end || e.start;

// Texto de hora de un evento visto en un día concreto.
// Varios días con hora: «desde 18:30» el primero, «hasta 20:00» el último, «Todo el día» en medio.
function timeLabel(e, day) {
  if (isAllDay(e)) return 'Todo el día';
  const multi = e.start !== lastDay(e);
  if (!multi) return e.endTime ? `${e.startTime}–${e.endTime}` : e.startTime;
  if (day === e.start) return 'desde ' + e.startTime;
  if (day === lastDay(e) && e.endTime) return 'hasta ' + e.endTime;
  return 'Todo el día';
}

// Orden dentro de un día: primero los de todo el día, luego por hora de inicio.
const sortTime = (e, day) => (!isAllDay(e) && e.start === day ? e.startTime : '');
const byTime = (day) => (a, b) => sortTime(a, day).localeCompare(sortTime(b, day)) || a.title.localeCompare(b.title, 'es');

function eventRow(e, day) {
  return h('button', { class: 'row row-btn', type: 'button', onclick: () => eventSheet(e.id) },
    h('span', { class: 'tag tag-' + e.type }, TYPES[e.type] || 'Evento'),
    h('span', { class: 'ev-time' }, timeLabel(e, day)),
    h('span', { class: 'row-title' }, e.title));
}

function eventSheet(id, day) {
  const isNew = !id;
  const e = isNew
    ? { title: '', type: 'visita', start: day, end: '', allDay: true, startTime: '', endTime: '', notes: '' }
    : store.get('calendario').find((x) => x.id === id);
  if (!e) return;

  const title = h('input', { type: 'text', value: e.title, required: true, placeholder: 'Ej. Visita de los abuelos' });
  const type = h('select', { value: e.type }, Object.entries(TYPES).map(([k, v]) => h('option', { value: k }, v)));
  const start = h('input', { type: 'date', value: e.start, required: true });
  const end = h('input', { type: 'date', value: e.end || '' });
  const notes = h('textarea', { rows: '3', placeholder: 'Notas' }, e.notes || '');

  const allDay = h('input', { type: 'checkbox', class: 'switch' });
  allDay.checked = isAllDay(e);
  const startTime = h('input', { type: 'time', value: e.startTime || '' });
  const endTime = h('input', { type: 'time', value: e.endTime || '' });
  const times = h('div', { class: 'field-row' }, field('Hora inicio', startTime), field('Hora fin (opcional)', endTime));
  const syncTimes = () => { times.hidden = allDay.checked; startTime.required = !allDay.checked; };
  allDay.addEventListener('change', () => { syncTimes(); if (!allDay.checked && !startTime.value) startTime.focus(); });
  syncTimes();

  sheet(isNew ? 'Nuevo evento' : 'Evento', [
    field('Título', title), field('Tipo', type),
    h('label', { class: 'switch-row' }, h('span', {}, 'Todo el día'), allDay),
    field('Desde', start), field('Hasta (opcional)', end), times,
    field('Notas', notes),
    isNew ? null : auditLine(e),
  ], {
    onSave: () => {
      const data = {
        title: title.value.trim(),
        type: type.value,
        start: start.value,
        end: end.value && end.value > start.value ? end.value : '',
        allDay: allDay.checked,
        startTime: allDay.checked ? '' : startTime.value,
        endTime: allDay.checked ? '' : endTime.value,
        notes: notes.value,
      };
      if (!data.title || !data.start) return false;
      if (!data.allDay && !data.startTime) return false;
      // En un solo día, una hora de fin anterior o igual a la de inicio no tiene sentido: se descarta.
      if (!data.end && data.endTime && data.endTime <= data.startTime) data.endTime = '';
      store.update('calendario', (list) => {
        if (isNew) list.push({ id: store.uid(), ...data });
        else Object.assign(list.find((i) => i.id === id) || {}, data);
      });
    },
    onDelete: isNew ? null : () => store.update('calendario', (list) => list.filter((i) => i.id !== id)),
  });
}

export default function render(root) {
  const cursor = new Date();
  cursor.setDate(1);
  let selected = today();

  const monthTitle = h('span', { class: 'cal-title' });
  const head = h('div', { class: 'cal-head' },
    h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Mes anterior', onclick: () => { cursor.setMonth(cursor.getMonth() - 1); draw(); } }, icon('back')),
    monthTitle,
    h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Mes siguiente', onclick: () => { cursor.setMonth(cursor.getMonth() + 1); draw(); } }, icon('chevron')));
  const grid = h('div', { class: 'cal-grid' });
  const dayTitle = sectionTitle('');
  const dayList = h('div', { class: 'list' });
  const addBtn = h('button', { class: 'btn primary block', type: 'button', onclick: () => eventSheet(null, selected) }, icon('plus'), 'Añadir evento');
  const upcomingList = h('div', { class: 'upcoming' });

  const itemsOn = (day) => ({
    events: store.get('calendario').filter((e) => e.start <= day && lastDay(e) >= day).sort(byTime(day)),
    tasks: store.get('tareas').filter((t) => t.date === day),
  });

  function draw() {
    const month = cursor.toLocaleDateString('es-ES', { month: 'long' });
    monthTitle.textContent = month.charAt(0).toUpperCase() + month.slice(1) + ' ' + cursor.getFullYear();
    const offset = (cursor.getDay() + 6) % 7; // lunes = 0
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1 - offset);
    const now = today();

    const cells = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(first.getFullYear(), first.getMonth(), first.getDate() + i);
      const key = ymd(d);
      const { events, tasks } = itemsOn(key);
      const cls = ['cal-day',
        d.getMonth() !== cursor.getMonth() && 'out',
        key === now && 'today',
        key === selected && 'sel'].filter(Boolean).join(' ');
      cells.push(h('button', { type: 'button', class: cls, onclick: () => { selected = key; draw(); } },
        h('span', { class: 'num' }, d.getDate()),
        h('span', { class: 'dots' },
          events.length ? h('i', { class: 'dot ev' }) : null,
          tasks.length ? h('i', { class: 'dot task' }) : null)));
    }
    grid.replaceChildren(...WEEKDAYS.map((w) => h('span', { class: 'cal-wd' }, w)), ...cells);

    dayTitle.textContent = fmtDate(selected, true);
    const { events, tasks } = itemsOn(selected);
    const rows = [
      ...events.map((e) => eventRow(e, selected)),
      ...tasks.map((t) => taskRow(t, { showDate: false })),
    ];
    dayList.replaceChildren(...(rows.length ? rows : [empty('Nada este día.')]));
    drawUpcoming(now);
  }

  // Próximos eventos desde hoy, agrupados por día. Uno que ya ha empezado y sigue va en «hoy».
  function drawUpcoming(now) {
    const list = store.get('calendario')
      .filter((e) => lastDay(e) >= now)
      .map((e) => ({ e, day: e.start < now ? now : e.start }))
      .sort((a, b) => a.day.localeCompare(b.day) || byTime(a.day)(a.e, b.e))
      .slice(0, UPCOMING_MAX);
    if (!list.length) { upcomingList.replaceChildren(empty('No hay eventos próximos.')); return; }
    const out = [];
    let group = null;
    list.forEach(({ e, day }) => {
      if (day !== group) {
        group = day;
        out.push(h('div', { class: 'up-day' }, day === now ? 'Hoy · ' + fmtDate(day) : fmtDate(day)));
      }
      out.push(eventRow(e, day));
    });
    upcomingList.replaceChildren(...out);
  }

  root.append(h('div', { class: 'view' }, head, grid, dayTitle, dayList, addBtn,
    sectionTitle('Próximos eventos'), upcomingList));
  const unsubs = ['calendario', 'tareas'].map((s) => store.subscribe(s, draw));
  draw();
  return () => unsubs.forEach((u) => u());
}
