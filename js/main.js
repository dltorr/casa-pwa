// Arranque: navegación (barra inferior + "Más"), cabecera y conexión.

import * as store from './store.js';
import { h, icon } from './ui.js';
import casa from './views/casa.js';
import tareas from './views/tareas.js';
import batch from './views/batch.js';
import calendario from './views/calendario.js';
import mas, { ITEMS as MAS_ITEMS } from './views/mas.js';
import compra from './views/compra.js';
import almacen from './views/almacen.js';
import ajustes from './views/ajustes.js';
import mejoras from './views/mejoras.js';
import menu, { autoCheckMenu } from './views/menu.js';
import semanal from './views/semanal.js';
import mandos from './views/mandos.js';
import rutina from './views/rutina.js';
import { BOTTOM, isHidden, onTabsChange } from './tabs.js';
import { sheet, field } from './ui.js';
import { initConflicts } from './components/conflicts.js';

// Para añadir una sección: crear su vista y añadirla aquí (en TABS o dentro de "Más").
const ROUTES = {
  casa:       { title: 'Casa',               view: casa },
  tareas:     { title: 'Tareas',             view: tareas },
  batch:      { title: 'Batch cooking',      view: batch },
  calendario: { title: 'Calendario',         view: calendario },
  mas:        { title: 'Más',                view: mas },
  compra:     { title: 'Lista de la compra', view: compra,  parent: 'mas' },
  almacen:    { title: 'Almacenaje',         view: almacen, parent: 'mas' },
  ajustes:    { title: 'Ajustes',            view: ajustes, parent: 'mas' },
  mejoras:    { title: 'Mejoras de la app',  view: mejoras, parent: 'mas' },
  menu:       { title: 'Menú Trueba',        view: menu,    parent: 'mas' },
  semanal:    { title: 'Menú semanal',       view: semanal, parent: 'mas' },
  mandos:     { title: 'Mandos',             view: mandos,  parent: 'mas' },
  rutina:     { title: 'Rutina del peque',   view: rutina,  parent: 'mas' },
};

const TABS = BOTTOM;   // en tabs.js, junto con qué pestañas oculta cada móvil

const main = document.getElementById('main');
const titleEl = document.getElementById('title');
const backBtn = document.getElementById('back');
const statusBtn = document.getElementById('status');
const tabbar = document.getElementById('tabbar');

backBtn.append(icon('back'));
backBtn.addEventListener('click', () => { location.hash = '#/mas'; });
statusBtn.addEventListener('click', () => { location.hash = '#/ajustes'; });

// Aviso de versión nueva: franja bajo la cabecera; al tocarla se reinicia la app.
const updateBtn = document.getElementById('update');
updateBtn.addEventListener('click', () => location.reload());
function markUpdatePending() { updateBtn.hidden = false; }

const tabEls = TABS.map(([route, ic, label]) => {
  const a = h('a', { class: 'tab', href: '#/' + route }, icon(ic), h('span', {}, label));
  tabbar.append(a);
  return [route, a];
});
const paintTabs = () => tabEls.forEach(([r, a]) => { a.hidden = isHidden(r); });
paintTabs();
onTabsChange(paintTabs);

store.onStatus((s) => {
  statusBtn.textContent = s.text;
  statusBtn.classList.toggle('ok', s.ok);
});

let cleanup = null;
let current = 'casa';

function navigate() {
  const m = location.hash.match(/^#\/(\w+)(?:\?(.*))?$/);
  const name = m && ROUTES[m[1]] ? m[1] : 'casa';
  const params = new URLSearchParams((m && m[2]) || '');
  const route = ROUTES[name];
  current = name;

  if (cleanup) cleanup();
  main.replaceChildren();
  window.scrollTo(0, 0);

  titleEl.textContent = route.title;
  document.title = route.title + ' · Casa';
  backBtn.hidden = !route.parent;
  const activeTab = route.parent || name;
  tabEls.forEach(([r, a]) => (r === activeTab ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));

  cleanup = route.view(main, params) || null;
  slideIn();
}

// ---------- Swipe entre pestañas ----------
// Orden: las de la barra inferior y, tras «Más», sus páginas en el orden de su lista.
// Dedo de derecha a izquierda -> siguiente; de izquierda a derecha -> anterior.
// Las pestañas ocultas en este móvil se saltan.
const SWIPE_ORDER = [...TABS.map((t) => t[0]), ...MAS_ITEMS.map((i) => i[0])];
const swipeOrder = () => SWIPE_ORDER.filter((r) => !isHidden(r));
// Zonas donde el dedo ya tiene otro uso: el touchpad del Chromecast, campos de texto,
// el plano al colocar una habitación, zonas con scroll horizontal...
const NO_SWIPE = 'input, textarea, select, .touchpad, .zoom-scroll, .diff, .plan.placing, [data-noswipe]';

function scrollsHorizontally(el) {
  for (; el && el !== document.body; el = el.parentElement) {
    if (el.scrollWidth > el.clientWidth + 2) {
      const ox = getComputedStyle(el).overflowX;
      if (ox === 'auto' || ox === 'scroll') return true;
    }
  }
  return false;
}

// El contenido sigue al dedo mientras se arrastra. Al soltar: si se pasa de un cuarto de
// pantalla (o es un golpe rápido) la vista sale por ese lado y la nueva entra por el otro;
// si no, vuelve a su sitio. Es cíclico: desde Casa hacia atrás se va a Ajustes y viceversa.
let drag = null;
let enterFrom = 0;   // -1 / 1: la próxima vista entra desde la derecha / izquierda

const slide = (x, ms, ease = 'ease-out') => {
  main.style.transition = ms ? `transform ${ms}ms ${ease}` : 'none';
  main.style.transform = x ? `translateX(${x}px)` : '';
};
const neighbour = (dx) => {
  const order = swipeOrder();
  const i = order.indexOf(current);
  if (i < 0) return null;
  const n = order.length;
  return order[(i + (dx < 0 ? 1 : -1) + n) % n];   // cíclico: tras Ajustes vuelve a Casa
};

document.addEventListener('touchstart', (e) => {
  drag = null;
  if (e.touches.length !== 1 || document.querySelector('dialog[open]')) return;
  const t = e.touches[0];
  // Los bordes de la pantalla son del gesto «atrás» del sistema.
  if (t.clientX < 24 || t.clientX > window.innerWidth - 24) return;
  if (e.target.closest(NO_SWIPE) || scrollsHorizontally(e.target)) return;
  drag = { x: t.clientX, y: t.clientY, t: Date.now(), dir: null, dx: 0 };
}, { passive: true });

// No pasivo: cuando el gesto es horizontal se bloquea el scroll vertical de la página.
document.addEventListener('touchmove', (e) => {
  if (!drag) return;
  const t = e.touches[0];
  const dx = t.clientX - drag.x;
  const dy = t.clientY - drag.y;
  if (!drag.dir) {
    if (Math.abs(dx) > 10 && Math.abs(dx) > 1.5 * Math.abs(dy)) drag.dir = 'h';
    else if (Math.abs(dy) > 10) { drag = null; return; }   // es un scroll: no se toca
    else return;
  }
  e.preventDefault();
  drag.dx = dx;
  slide(neighbour(dx) ? dx : dx * 0.25, 0);
}, { passive: false });

document.addEventListener('touchend', () => {
  if (!drag) return;
  const { dx, dir, t } = drag;
  drag = null;
  if (dir !== 'h') return;
  const next = neighbour(dx);
  const w = window.innerWidth;
  const v = Math.abs(dx) / Math.max(1, Date.now() - t);   // px/ms
  if (next && (Math.abs(dx) > w * 0.25 || (v > 0.5 && Math.abs(dx) > 40))) {
    const sign = dx < 0 ? -1 : 1;
    slide(sign * w, 160, 'ease-in');
    setTimeout(() => { enterFrom = sign; location.hash = '#/' + next; }, 160);
  } else {
    slide(0, 200);
  }
}, { passive: true });

document.addEventListener('touchcancel', () => { if (drag) { drag = null; slide(0, 200); } }, { passive: true });

// Llamado al terminar de pintar una vista: si venimos de un swipe, entra deslizándose.
function slideIn() {
  if (!enterFrom) { slide(0, 0); return; }
  const from = -enterFrom * window.innerWidth;
  enterFrom = 0;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { slide(0, 0); return; }
  slide(from, 0);
  main.getBoundingClientRect();   // fuerza el reflow para que arranque desde fuera
  slide(0, 220);
}

window.addEventListener('hashchange', navigate);
navigate();
initConflicts();
store.connect();

// Primer arranque: pedir el nombre de quien usa este móvil (para la autoría de las tarjetas).
if (!store.getUserName()) {
  const input = h('input', { type: 'text', required: true, placeholder: 'Ej. Juan', autocomplete: 'given-name' });
  sheet('¿Quién usa este móvil?', [
    h('p', { class: 'hint' }, 'Tu nombre aparecerá en las tarjetas que crees o modifiques. Puedes cambiarlo en Ajustes.'),
    field('Tu nombre', input),
  ], { dismissable: false, saveLabel: 'Guardar', onSave: () => store.setUserName(input.value) });
}

// Menú Trueba: comprobación automática en segundo plano (respeta el flag del mes).
setTimeout(autoCheckMenu, 3000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) autoCheckMenu(); });

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js');
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'update-ready') markUpdatePending();
  });
  // Por si el aviso llegó antes de que la app terminara de arrancar
  if (window.caches) caches.match('/__update-pending').then((r) => { if (r) markUpdatePending(); });
}
