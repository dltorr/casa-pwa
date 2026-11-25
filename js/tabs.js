// Pestañas: cada móvil elige cuáles ve y en qué orden (se guarda solo en este móvil).
//
//  - Las 4 primeras visibles van a la barra inferior; «Más» va siempre al final de la barra.
//  - El resto, en ese orden, va dentro de «Más»; «Ajustes» va siempre el último ahí.
//  - El swipe sigue el mismo orden: barra, Más y lo que hay dentro de Más.
//  - Las ocultas desaparecen de todo eso, pero siguen existiendo: sus datos se sincronizan
//    igual y se pueden volver a activar en Ajustes.

// Todas las pestañas que se pueden ordenar, en el orden de fábrica.
export const CATALOG = [
  ['casa', 'hex', 'Casa'],
  ['tareas', 'check', 'Tareas'],
  ['batch', 'pot', 'Batch'],
  ['calendario', 'calendar', 'Calendario'],
  ['mandos', 'remote', 'Mandos'],
  ['rutina', 'star', 'Rutina del peque'],
  ['semanal', 'plate', 'Menú semanal'],
  ['menu', 'utensils', 'Menú Trueba'],
  ['compra', 'cart', 'Lista de la compra'],
  ['almacen', 'box', 'Almacenaje'],
  ['mejoras', 'bulb', 'Mejoras de la app'],
];
export const MAS = ['mas', 'dots', 'Más'];
export const AJUSTES = ['ajustes', 'sliders', 'Ajustes'];
export const BAR_SIZE = 4;   // pestañas en la barra, además de «Más»

// No se pueden ocultar: sin ellas no se podría volver a activar nada.
export const FIXED = new Set(['casa', 'mas', 'ajustes']);

const KEY_HIDDEN = 'casa:pestanas-ocultas';
const KEY_ORDER = 'casa:pestanas-orden';
const listeners = new Set();
const byRoute = new Map([...CATALOG, MAS, AJUSTES].map((t) => [t[0], t]));

const readJson = (key) => { try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; } };
const writeJson = (key, v) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* sin espacio */ } };
const changed = () => listeners.forEach((fn) => fn());

export const info = (route) => byRoute.get(route);

export const isHidden = (route) => !FIXED.has(route) && readJson(KEY_HIDDEN).includes(route);

export function setHidden(route, hidden) {
  if (FIXED.has(route)) return;
  const s = new Set(readJson(KEY_HIDDEN));
  if (hidden) s.add(route); else s.delete(route);
  writeJson(KEY_HIDDEN, [...s]);
  changed();
}

// Orden guardado; las pestañas nuevas que no conocía este móvil van en su sitio de fábrica.
export function order() {
  const known = CATALOG.map((t) => t[0]);
  const saved = readJson(KEY_ORDER).filter((r) => known.includes(r));
  known.forEach((r, i) => {
    if (saved.includes(r)) return;
    const prev = known.slice(0, i).reverse().find((p) => saved.includes(p));
    saved.splice(prev ? saved.indexOf(prev) + 1 : 0, 0, r);
  });
  return saved;
}

export function setOrder(routes) {
  writeJson(KEY_ORDER, routes);
  changed();
}

const visible = () => order().filter((r) => !isHidden(r));
export const barRoutes = () => visible().slice(0, BAR_SIZE);
export const masRoutes = () => [...visible().slice(BAR_SIZE), 'ajustes'];
export const swipeRoutes = () => [...barRoutes(), 'mas', ...masRoutes()];
export const inBar = (route) => route === 'mas' || barRoutes().includes(route);

export function onTabsChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
