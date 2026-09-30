// White card, strip and section label. A card with href / onClick is a real <a> / <button>.
//   html`<${Card} href="#/setups?sheet=lead">…</${Card}>`    html`<${Card} rounded>…</${Card}>`
//   html`<${Strip} onClick=${...}>…</${Strip}>`    html`<${Label}>Keep an eye on · 3</${Label}>`
//   html`<${Callout} head="Fill proposed 4 placements">Grey rows aren’t saved yet…</${Callout}>`
//   html`<${Fold} open=${open} onToggle=${...} head=${html`<${Label}>Lead</${Label}><span>Sam · Runner</span>`}>…body…</${Fold}>`
import { html } from '../../lib/h.js';
import { Icon } from './Icons.js';

function tappable(base, { href, onClick, cls = '', ariaLabel, title, style, children }) {
  const classes = [base, cls].filter(Boolean).join(' ');
  if (href) return html`<a class=${classes} href=${href} aria-label=${ariaLabel} title=${title} style=${style}>${children}</a>`;
  if (onClick) return html`<button class=${classes} type="button" onClick=${onClick} aria-label=${ariaLabel} title=${title} style=${style}>${children}</button>`;
  return html`<div class=${classes} style=${style}>${children}</div>`;
}

export function Card({ rounded, amber, line, cls = '', ...rest }) {
  return tappable('card', { ...rest, cls: [rounded && 'rounded', amber && 'amber', line && 'line', cls].filter(Boolean).join(' ') });
}

export function Strip(props) {
  return tappable('strip', props);
}

export function Label({ children, cls = '', style }) {
  return html`<span class=${'label ' + cls} style=${style}>${children}</span>`;
}

// A section header row: label on the left, an optional right-hand link/text.
export function SectionHead({ label, right, cls = '' }) {
  return html`<div class=${'section-head ' + cls}><span class="label">${label}</span><span class="grow"></span>${right}</div>`;
}

export function Callout({ head, children }) {
  return html`<div class="callout">${head ? html`<span class="h">${head}</span>` : null}<span class="b">${children}</span></div>`;
}

// A strip folded to one line: the head is a <button> (aria-expanded) with a trailing chevron; the body
// renders only while `open`. The caller keeps the open state (component state, not the store).
export function Fold({ open, onToggle, head, children, cls = '' }) {
  return html`<div class=${['fold', open && 'open', cls].filter(Boolean).join(' ')}>
    <button type="button" class="fold-head" aria-expanded=${String(!!open)} onClick=${onToggle}>
      <span class="fold-line">${head}</span>
      <${Icon} name="chevron" size=${18} cls="fold-chev" />
    </button>
    ${open ? html`<div class="fold-body">${children}</div>` : null}
  </div>`;
}

export default Card;
