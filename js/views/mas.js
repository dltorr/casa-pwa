import { h, icon } from '../ui.js';
import { isHidden } from '../tabs.js';

// El orden también es el del swipe entre pestañas (después de «Más»).
export const ITEMS = [
  ['mandos', 'remote', 'Mandos'],
  ['rutina', 'star', 'Rutina del peque'],
  ['semanal', 'plate', 'Menú semanal'],
  ['menu', 'utensils', 'Menú Trueba'],
  ['compra', 'cart', 'Lista de la compra'],
  ['almacen', 'box', 'Almacenaje'],
  ['mejoras', 'bulb', 'Mejoras de la app'],
  ['ajustes', 'sliders', 'Ajustes'],
];

export default function render(root) {
  root.append(h('div', { class: 'view list' },
    ITEMS.filter(([route]) => !isHidden(route)).map(([route, ic, label]) => h('a', { class: 'row row-link', href: '#/' + route },
      icon(ic), h('span', { class: 'row-title' }, label), icon('chevron')))));
}
