// Ajustes: conexión al broker + habitaciones y ubicaciones (usadas por Almacenaje y, en el futuro, el mapa).

import * as store from '../store.js';
import { h, icon, field, empty, sectionTitle } from '../ui.js';
import { VERSION } from '../version.js';
import { FLOORS } from './casa.js';
import { BAR_SIZE, FIXED, info, order, setOrder, isHidden, setHidden, barRoutes, onTabsChange } from '../tabs.js';

function connectionForm() {
  const c = store.getConn();
  const url = h('input', { type: 'text', value: c.url || '', placeholder: 'wss://…:8084/mqtt', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false' });
  const user = h('input', { type: 'text', value: c.user || '', autocapitalize: 'off', autocomplete: 'off' });
  const pass = h('input', { type: 'password', value: c.pass || '', autocomplete: 'off' });
  const statusLine = h('p', { class: 'hint' });
  const unsub = store.onStatus((s) => { statusLine.textContent = 'Estado: ' + s.text; });

  const form = h('form', {
    class: 'panel',
    onsubmit: (e) => {
      e.preventDefault();
      store.setConn({ url: url.value.trim(), user: user.value.trim(), pass: pass.value });
    },
  },
    field('URL del broker', url),
    field('Usuario (distingue mayúsculas)', user),
    field('Contraseña', pass),
    h('button', { class: 'btn primary block', type: 'submit' }, 'Guardar y conectar'),
    statusLine);
  return { form, unsub };
}

const updateRoom = (roomId, fn) => store.update('config', (c) => {
  c.rooms = c.rooms || [];
  const r = c.rooms.find((x) => x.id === roomId);
  if (r) fn(r);
});

function roomCard(r) {
  const locInput = h('input', { type: 'text', placeholder: 'Nueva ubicación…', autocomplete: 'off', 'aria-label': 'Nueva ubicación en ' + r.name });

  return h('div', { class: 'card room' },
    h('div', { class: 'room-head' },
      h('span', { class: 'card-title' }, r.name),
      h('button', {
        class: 'icon-btn', type: 'button', 'aria-label': 'Renombrar',
        onclick: () => {
          const n = prompt('Nombre de la habitación', r.name);
          // Al renombrar se fija el código anterior: así los sensores siguen enlazados.
          if (n && n.trim()) updateRoom(r.id, (x) => { x.code = store.roomCode(x); x.name = n.trim(); });
        },
      }, icon('edit')),
      h('button', {
        class: 'icon-btn', type: 'button', 'aria-label': 'Borrar habitación',
        onclick: () => {
          if (!confirm(`¿Borrar "${r.name}" y sus ubicaciones? Los objetos quedarán sin ubicar.`)) return;
          store.update('config', (c) => { c.rooms = (c.rooms || []).filter((x) => x.id !== r.id); });
          store.update('almacen', (l) => l.map((i) => (i.roomId === r.id ? { ...i, roomId: '', locationId: '' } : i)));
        },
      }, icon('trash'))),
    h('div', { class: 'room-map' },
      h('button', {
        type: 'button', class: 'code-btn', 'aria-label': 'Cambiar código para sensores',
        onclick: () => {
          const c = prompt('Código para sensores (lo que el nodo manda en "ubic")', store.roomCode(r));
          if (c != null && store.slug(c)) updateRoom(r.id, (x) => { x.code = store.slug(c); });
        },
      }, 'código: ', h('code', {}, store.roomCode(r))),
      h('span', { class: 'hint' }, r.pos
        ? 'en el mapa · ' + ((FLOORS.find((f) => f.id === r.pos.floor) || {}).label || '').toLowerCase()
        : 'sin colocar'),
      h('a', { class: 'btn small', href: '#/casa?colocar=' + r.id }, r.pos ? 'Recolocar' : 'Colocar en el mapa')),
    h('div', { class: 'chips' },
      r.locations.length
        ? r.locations.map((l) => h('span', { class: 'chip' }, l.name,
          h('button', {
            class: 'chip-x', type: 'button', 'aria-label': 'Quitar ' + l.name,
            onclick: () => {
              updateRoom(r.id, (x) => { x.locations = x.locations.filter((i) => i.id !== l.id); });
              store.update('almacen', (list) => list.map((i) => (i.locationId === l.id ? { ...i, locationId: '' } : i)));
            },
          }, '×')))
        : h('span', { class: 'hint' }, 'Sin ubicaciones')),
    h('form', {
      class: 'add-row tight',
      onsubmit: (e) => {
        e.preventDefault();
        const n = locInput.value.trim();
        if (n) updateRoom(r.id, (x) => { x.locations.push({ id: store.uid(), name: n }); });
      },
    }, locInput, h('button', { class: 'icon-btn', type: 'submit', 'aria-label': 'Añadir ubicación' }, icon('plus'))));
}

function nameForm() {
  const input = h('input', { type: 'text', value: store.getUserName(), placeholder: 'Ej. Juan', autocomplete: 'given-name' });
  const saved = h('p', { class: 'hint' }, 'Aparece en las tarjetas como quién las crea o modifica. Se guarda solo en este móvil.');
  return h('form', {
    class: 'panel',
    onsubmit: (e) => {
      e.preventDefault();
      if (!input.value.trim()) return;
      store.setUserName(input.value);
      saved.textContent = 'Guardado: ' + store.getUserName();
    },
  }, field('Nombre de quien usa este móvil', input), h('button', { class: 'btn primary block', type: 'submit' }, 'Guardar nombre'), saved);
}

// Pestañas de este móvil: tarjetas que se ordenan arrastrando el asa (≡) o con las
// flechas, y un interruptor para mostrarlas u ocultarlas. Las 4 primeras activas van a la
// barra inferior (llevan la marca «Barra»); el resto, dentro de «Más».
function tabsPanel() {
  const list = h('div', { class: 'tabs-list', 'data-noswipe': '' });

  const move = (route, delta) => {
    const o = order();
    const i = o.indexOf(route);
    const j = i + delta;
    if (j < 0 || j >= o.length) return;
    [o[i], o[j]] = [o[j], o[i]];
    setOrder(o);
  };

  function card(route, i, total, bar) {
    const [, ic, label] = info(route);
    const hidden = isHidden(route);
    const handle = h('span', { class: 'tab-handle', 'aria-hidden': 'true' }, '≡');
    const sw = !FIXED.has(route) && h('input', { type: 'checkbox', class: 'switch', 'aria-label': 'Mostrar ' + label });
    if (sw) {
      sw.checked = !hidden;
      sw.addEventListener('change', () => setHidden(route, !sw.checked));
    }
    const el = h('div', { class: 'tab-card' + (bar ? ' in-bar' : '') + (hidden ? ' is-hidden' : ''), 'data-route': route },
      handle,
      h('span', { class: 'tab-row-name' }, icon(ic), h('span', {}, label)),
      bar ? h('span', { class: 'tab-badge' }, 'Barra') : null,
      h('span', { class: 'tab-arrows' },
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Subir ' + label, disabled: i === 0, onclick: () => move(route, -1) }, icon('chup')),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Bajar ' + label, disabled: i === total - 1, onclick: () => move(route, 1) }, icon('chdown'))),
      sw || h('span', { class: 'switch-spacer' }));
    dragFrom(handle, el);
    return el;
  }

  // Arrastre con el asa: solo se mueve la tarjeta que va en el dedo; una línea marca dónde
  // caerá. El orden se calcula y se guarda AL SOLTAR. Si el sistema interrumpe el gesto
  // (pointercancel, p. ej. Safari decide hacer scroll), se cancela y no se guarda nada.
  const dropLine = h('div', { class: 'tab-drop', hidden: true });
  function dragFrom(handle, el) {
    handle.addEventListener('pointerdown', (e) => {
      if (e.button > 0) return;
      e.preventDefault();
      try { handle.setPointerCapture(e.pointerId); } catch { /* sin captura */ }
      const cards = [...list.querySelectorAll('.tab-card')];
      const others = cards.filter((c) => c !== el);
      const listTop = list.getBoundingClientRect().top;
      // Posiciones fijas tomadas al empezar: durante el arrastre no cambia el orden de nada.
      const mids = others.map((c) => { const r = c.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, mid: r.top + r.height / 2 }; });
      const r0 = el.getBoundingClientRect();
      const startY = e.clientY;
      let target = cards.indexOf(el);
      el.classList.add('dragging');

      const onMove = (ev) => {
        const dy = ev.clientY - startY;
        el.style.transform = `translateY(${dy}px)`;
        const mid = r0.top + r0.height / 2 + dy;
        target = mids.filter((m) => m.mid < mid).length;   // cuántas quedan por encima
        // Línea entre la tarjeta «target-1» y la «target» (de las demás)
        const y = target === 0 ? mids[0].top - 5
          : target >= mids.length ? mids[mids.length - 1].bottom + 3
            : (mids[target - 1].bottom + mids[target].top) / 2 - 1;
        dropLine.style.top = (y - listTop) + 'px';
        dropLine.hidden = false;
      };
      const end = (save) => {
        handle.removeEventListener('pointermove', onMove);
        handle.removeEventListener('pointerup', onUp);
        handle.removeEventListener('pointercancel', onCancel);
        el.classList.remove('dragging');
        el.style.transform = '';
        dropLine.hidden = true;
        if (!save) return;
        const routes = others.map((c) => c.dataset.route);
        routes.splice(target, 0, el.dataset.route);
        if (routes.join() !== cards.map((c) => c.dataset.route).join()) setOrder(routes);
      };
      const onUp = () => end(true);
      const onCancel = () => end(false);
      handle.addEventListener('pointermove', onMove);
      handle.addEventListener('pointerup', onUp);
      handle.addEventListener('pointercancel', onCancel);
    });
  }

  function paint() {
    const o = order();
    const bar = new Set(barRoutes());
    list.replaceChildren(...o.map((r, i) => card(r, i, o.length, bar.has(r))), dropLine);
  }
  paint();
  const unsub = onTabsChange(paint);

  const el = h('div', { class: 'panel' },
    h('p', { class: 'hint tabs-hint' },
      `Solo en este móvil. Las ${BAR_SIZE} primeras activas (marca «Barra») salen abajo; el resto, dentro de «Más». `
      + 'Ordénalas arrastrando ≡ o con las flechas. Las ocultas no salen en ningún sitio, pero sus datos se siguen guardando.'),
    list);
  return { el, unsub };
}

export default function render(root) {
  const conn = connectionForm();
  const tabs = tabsPanel();

  const roomInput = h('input', { type: 'text', placeholder: 'Nueva habitación…', autocomplete: 'off', 'aria-label': 'Nueva habitación' });
  const roomForm = h('form', {
    class: 'add-row',
    onsubmit: (e) => {
      e.preventDefault();
      const name = roomInput.value.trim();
      if (!name) return;
      store.update('config', (c) => { c.rooms = c.rooms || []; c.rooms.push({ id: store.uid(), name, code: store.slug(name), locations: [] }); });
      roomInput.value = '';
    },
  }, roomInput, h('button', { class: 'btn primary', type: 'submit' }, icon('plus'), 'Añadir'));

  const roomsEl = h('div', { class: 'cards' });
  const draw = () => {
    const rs = store.rooms();
    roomsEl.replaceChildren(...(rs.length ? rs.map(roomCard) : [empty('Sin habitaciones todavía.')]));
  };

  root.append(h('div', { class: 'view' },
    sectionTitle('Tu nombre'),
    nameForm(),
    sectionTitle('Pestañas'),
    tabs.el,
    sectionTitle('Conexión'),
    conn.form,
    sectionTitle('Habitaciones y ubicaciones'),
    roomForm,
    roomsEl,
    h('p', { class: 'hint center' }, 'Casa · versión ' + VERSION)));

  const unsub = store.subscribe('config', draw);
  draw();
  return () => { unsub(); conn.unsub(); tabs.unsub(); };
}
