// Inline stroke SVG icons (no emoji as icons). Each is a function returning html.
//   import { Icon, ICONS } from '../components/Icons.js';  html`<${Icon} name="waste" />`
import { html } from '../../lib/h.js';

const SVG = (paths, extra = '') => ({ size = 24, cls = '', label } = {}) => html`
  <svg viewBox="0 0 24 24" width=${size} height=${size} class=${cls} aria-hidden=${label ? null : 'true'} role=${label ? 'img' : null}
       fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" dangerouslySetInnerHTML=${{ __html: (label ? `<title>${label}</title>` : '') + paths + extra }} />`;

export const ICONS = {
  // the five nav icons, as drawn on the Main artboard
  setups: SVG('<rect x="3" y="4" width="18" height="16" rx="2"></rect><path d="M3 10h18M9 10v10"></path>'),
  waste: SVG('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"></path>'),
  tasks: SVG('<path d="M4 6l2 2 4-4M4 12l2 2 4-4M4 18l2 2 4-4M13 6h8M13 12h8M13 18h8"></path>'),
  scores: SVG('<path d="M4 20V10M10 20V4M16 20V13M22 20H2"></path>'),
  more: SVG('<circle cx="5" cy="12" r="1.8"></circle><circle cx="12" cy="12" r="1.8"></circle><circle cx="19" cy="12" r="1.8"></circle>'),
  // Mi puesto uses the same board icon as Set Ups
  me: SVG('<rect x="3" y="4" width="18" height="16" rx="2"></rect><path d="M3 10h18M9 10v10"></path>'),
  // utility
  close: SVG('<path d="M6 6l12 12M18 6L6 18"></path>'),
  chevron: SVG('<path d="M9 6l6 6-6 6"></path>'),
  chevronDown: SVG('<path d="M6 9l6 6 6-6"></path>'),
  back: SVG('<path d="M15 6l-6 6 6 6"></path>'),
  check: SVG('<path d="M5 12l5 5L20 7"></path>'),
  warn: SVG('<path d="M12 3L2 21h20L12 3zM12 10v5M12 18v.5"></path>'),
  search: SVG('<circle cx="11" cy="11" r="7"></circle><path d="M20 20l-4-4"></path>'),
  clock: SVG('<circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path>'),
  person: SVG('<circle cx="12" cy="8" r="4"></circle><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"></path>'),
  people: SVG('<circle cx="9" cy="8" r="3.5"></circle><path d="M2 20c0-3.5 3-6 7-6s7 2.5 7 6M16 4.5a3.5 3.5 0 010 7M22 20c0-3-2-5.2-5-5.8"></path>'),
  globe: SVG('<circle cx="12" cy="12" r="9"></circle><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"></path>'),
  lock: SVG('<rect x="5" y="11" width="14" height="10" rx="2"></rect><path d="M8 11V7a4 4 0 018 0v4"></path>'),
  print: SVG('<path d="M6 9V3h12v6M6 17H4a2 2 0 01-2-2v-4a2 2 0 012-2h16a2 2 0 012 2v4a2 2 0 01-2 2h-2"></path><rect x="6" y="14" width="12" height="7"></rect>'),
  doc: SVG('<path d="M6 3h8l5 5v13H6z"></path><path d="M14 3v5h5M9 13h7M9 17h7"></path>'),
  star: SVG('<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"></path>'),
  swap: SVG('<path d="M4 7h13l-3-3M20 17H7l3 3"></path>'),
  reset: SVG('<path d="M4 12a8 8 0 1 0 3-6.2M4 4v5h5"></path>'),
  plus: SVG('<path d="M12 5v14M5 12h14"></path>'),
  minus: SVG('<path d="M5 12h14"></path>'),
  coffee: SVG('<path d="M4 8h13v6a5 5 0 01-5 5H9a5 5 0 01-5-5V8zM17 10h2a2 2 0 010 4h-2"></path>'),
  wifiOff: SVG('<path d="M2 8.5a16 16 0 0120 0M5.5 12a11 11 0 0113 0M9 15.5a5 5 0 016 0M12 19v.5M3 3l18 18"></path>'),
};

// <Icon name="waste" size=24 cls="" label="" />  (label makes it an accessible image; omit for decorative)
export function Icon({ name, ...rest }) {
  const draw = ICONS[name] || ICONS.more;
  return draw(rest);
}

export default Icon;
