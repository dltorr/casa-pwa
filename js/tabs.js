// Pestañas visibles: cada móvil elige cuáles ve (se guarda solo en este móvil).
// Las ocultas desaparecen de la barra inferior, de «Más» y del swipe, pero siguen
// existiendo: sus datos se sincronizan igual y se pueden volver a activar en Ajustes.

// Barra inferior. «Más» va siempre al final.
export const BOTTOM = [
  ['casa', 'hex', 'Casa'],
  ['tareas', 'check', 'Tareas'],
  ['batch', 'pot', 'Batch'],
  ['calendario', 'calendar', 'Calendario'],
  ['mas', 'dots', 'Más'],
];

// No se pueden ocultar: sin ellas no se podría volver a activar nada.
export const FIXED = new Set(['casa', 'mas', 'ajustes']);

const KEY = 'casa:pestanas-ocultas';
const listeners = new Set();

function read() {
  try { return new Set(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch { return new Set(); }
}

export const isHidden = (route) => !FIXED.has(route) && read().has(route);

export function setHidden(route, hidden) {
  if (FIXED.has(route)) return;
  const s = read();
  if (hidden) s.add(route); else s.delete(route);
  try { localStorage.setItem(KEY, JSON.stringify([...s])); } catch { /* sin espacio */ }
  listeners.forEach((fn) => fn());
}

export function onTabsChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
