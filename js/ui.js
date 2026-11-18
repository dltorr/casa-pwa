// Utilidades de interfaz compartidas por todas las vistas.

// Crea elementos: h('div', {class: 'x', onclick: fn}, 'texto', otroNodo)
export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  let value;
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'value') value = v;
    else if (k === 'checked' || k === 'disabled' || k === 'hidden') el[k] = !!v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  if (value !== undefined) el.value = value; // después de las opciones (para <select>)
  return el;
}

// ---------- Iconos (SVG propios, sin dependencias) ----------
const ICONS = {
  hex: '<path d="M14.2 18.2h1.4l3.6-6.2-3.6-6.2H8.4L4.8 12l3.6 6.2h1.4v-4.8h4.4v4.8"/>',
  check: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8.5 12.5l2.5 2.5 5-5.5"/>',
  pot: '<path d="M4 10h16v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M2 10h2M20 10h2M9.5 3.5c-.8 1 .8 2 0 3M14.5 3.5c-.8 1 .8 2 0 3"/>',
  calendar: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  dots: '<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>',
  cart: '<path d="M3 4h2l2.4 11h10.2l2-8H6.3"/><circle cx="9" cy="19" r="1.4"/><circle cx="17" cy="19" r="1.4"/>',
  box: '<path d="M4 8l8-4 8 4v8l-8 4-8-4z"/><path d="M4 8l8 4 8-4M12 12v8"/>',
  sliders: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  chevron: '<path d="M9 5l7 7-7 7"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  trash: '<path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  snow: '<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9"/><path d="M9.5 4.5L12 6l2.5-1.5M9.5 19.5L12 18l2.5 1.5"/>',
  drops: '<path d="M8 3.5c-1.8 2.6-2.8 4.2-2.8 5.5a2.8 2.8 0 0 0 5.6 0c0-1.3-1-2.9-2.8-5.5z"/><path d="M16 3.5c-1.8 2.6-2.8 4.2-2.8 5.5a2.8 2.8 0 0 0 5.6 0c0-1.3-1-2.9-2.8-5.5z"/><path d="M12 11.5c-1.8 2.6-2.8 4.2-2.8 5.5a2.8 2.8 0 0 0 5.6 0c0-1.3-1-2.9-2.8-5.5z"/>',
  fan: '<circle cx="12" cy="12" r="1.6"/><path d="M12 10.4C11.6 6 12.6 3.6 15 4.1s1.8 3.9-3 6.3"/><path d="M13.4 12.8c3.6 2.4 4.8 4.8 3.2 6.6s-4.1-.5-4.6-5.8"/><path d="M10.6 12.6c-4 1.9-6.6 1.6-7-.8s3.3-3 7.1-1.6"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  acauto: '<path d="M7 19h10M15 17l2 2-2 2"/><path d="M18.5 16L13 6.5M12.4 9.3l.6-2.8 2.7.8"/><path d="M11 5.5L5.5 15M5.2 12.3l.3 2.7 2.7-.7"/>',
  power: '<path d="M12 3v8"/><path d="M6.6 6.6a8 8 0 1 0 10.8 0"/>',
  mute: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 9l5 6M22 9l-5 6"/>',
  volup: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 9.5a3.5 3.5 0 0 1 0 5M19 7a7 7 0 0 1 0 10"/>',
  voldown: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 9.5a3.5 3.5 0 0 1 0 5"/>',
  playpause: '<path d="M5 6v12l7-6z"/><path d="M15 6v12M19 6v12"/>',
  house: '<path d="M4 11l8-7 8 7v9H4z"/><path d="M10 20v-6h4v6"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
  chup: '<path d="M6 15l6-6 6 6"/>',
  chdown: '<path d="M6 9l6 6 6-6"/>',
  dot: '<circle cx="12" cy="12" r="3"/>',
  remote: '<rect x="8" y="2.5" width="8" height="19" rx="3"/><circle cx="12" cy="7.5" r="1.5"/><path d="M10.5 12h3M10.5 15h3"/>',
  plate: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/>',
  utensils: '<path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 21V3c-2 0-3.5 2.5-3.5 6s1.5 4 3.5 4"/>',
  bulb:'<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
};

export function icon(name) {
  const span = document.createElement('span');
  span.className = 'ico';
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;
  return span;
}

// ---------- Componentes pequeños ----------
export const field = (label, control) => h('label', { class: 'field' }, h('span', {}, label), control);
export const empty = (text) => h('p', { class: 'empty' }, text);
export const sectionTitle = (text) => h('h3', { class: 'section-title' }, text);

// Hoja inferior (bottom sheet) para editar. onSave puede devolver false para no cerrar.
export function sheet(title, body, { onSave, onDelete, onClose, saveLabel = 'Guardar', dismissable = true } = {}) {
  const dlg = h('dialog', { class: 'sheet' });
  const close = () => dlg.close();
  dlg.addEventListener('close', () => { dlg.remove(); if (onClose) onClose(); });
  dlg.addEventListener('click', (e) => { if (dismissable && e.target === dlg) close(); });
  if (!dismissable) dlg.addEventListener('cancel', (e) => e.preventDefault());

  const form = h('form', {
    tabindex: '-1',
    onsubmit: (e) => {
      e.preventDefault();
      if (onSave && onSave() === false) return;
      close();
    },
  },
    h('header', { class: 'sheet-head' },
      h('h2', {}, title),
      dismissable && h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Cerrar', onclick: close }, icon('x'))),
    h('div', { class: 'sheet-body' }, body),
    h('footer', { class: 'sheet-foot' },
      onDelete && h('button', {
        type: 'button', class: 'btn danger',
        onclick: () => { if (confirm('¿Seguro que quieres borrarlo?')) { onDelete(); close(); } },
      }, icon('trash'), 'Borrar'),
      h('span', { class: 'spacer' }),
      onSave && h('button', { type: 'submit', class: 'btn primary' }, saveLabel)));

  dlg.append(form);
  document.body.append(dlg);
  dlg.showModal();
  form.focus(); // sin foco en un botón ni teclado abierto al abrir
  return { close };
}

// ---------- Fechas (siempre como 'AAAA-MM-DD' en hora local) ----------
export function ymd(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export function parseYmd(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function fmtDate(s, long = false) {
  const opts = long
    ? { weekday: 'long', day: 'numeric', month: 'long' }
    : { weekday: 'short', day: 'numeric', month: 'short' };
  return parseYmd(s).toLocaleDateString('es-ES', opts);
}
export const today = () => ymd(new Date());

// Línea de autoría al pie de una tarjeta abierta (gris y cursiva).
export function auditLine(item) {
  if (!item) return null;
  const when = (iso, withTime) => {
    const d = new Date(iso);
    if (isNaN(d)) return '';
    const day = d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
    return withTime ? `${day} ${d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}` : day;
  };
  const parts = [];
  if (item.createdBy) parts.push(`Creado por ${item.createdBy}${item.createdAt ? ' el ' + when(item.createdAt) : ''}`);
  if (item.updatedBy) parts.push(`Última modificación: ${item.updatedBy}${item.updatedAt ? ', ' + when(item.updatedAt, true) : ''}`);
  return parts.length ? h('p', { class: 'audit' }, parts.join(' · ')) : null;
}
