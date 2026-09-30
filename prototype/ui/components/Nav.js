// Bottom nav: Set Ups (or Mi puesto / My spot for a team member) · Waste · Tasks · Scores · More.
//   html`<${Nav} state=${state} route=${route.path} t=${t} />`
import { html } from '../../lib/h.js';
import { Icon } from './Icons.js';
import { personById } from '../../data/people.js';

export function isLeader(person) {
  return !!person && (person.role === 'tl' || person.role === 'trainer' || person.role === 'manager');
}

export function navItems(state, t) {
  const me = personById(state && state.me);
  const first = isLeader(me)
    ? { key: 'setups', href: '#/setups', label: t('nav.setups'), icon: 'setups' }
    : { key: 'me', href: '#/me', label: t('nav.me'), icon: 'me' };
  return [
    first,
    { key: 'waste', href: '#/waste', label: t('nav.waste'), icon: 'waste' },
    { key: 'tasks', href: '#/tasks', label: t('nav.tasks'), icon: 'tasks' },
    { key: 'scores', href: '#/scores', label: t('nav.scores'), icon: 'scores' },
    { key: 'more', href: '#/more', label: t('nav.more'), icon: 'more' },
  ];
}

export function Nav({ state, route, t = (k) => k }) {
  const items = navItems(state, t);
  const active = (item) => item.key === route || (item.key === 'setups' && route === 'me') || (item.key === 'me' && route === 'setups');
  return html`<nav class="nav" aria-label=${t('nav.aria')}>
    ${items.map(item => html`<a key=${item.key} class=${active(item) ? 'on' : ''} href=${item.href} aria-current=${active(item) ? 'page' : null}>
      <${Icon} name=${item.icon} />${item.label}
    </a>`)}
  </nav>`;
}

export default Nav;
