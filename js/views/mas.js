import { h, icon } from '../ui.js';
import { info, masRoutes } from '../tabs.js';

// Lo que este móvil no lleva en la barra, en el orden que ha elegido (Ajustes > Pestañas).
// Es también el orden del swipe después de «Más».
export default function render(root) {
  root.append(h('div', { class: 'view list' },
    masRoutes().map((route) => {
      const [, ic, label] = info(route);
      return h('a', { class: 'row row-link', href: '#/' + route },
        icon(ic), h('span', { class: 'row-title' }, label), icon('chevron'));
    })));
}
