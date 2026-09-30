// White card, strip and section label. A card with href / onClick is a real <a> / <button>.
//   html`<${Card} href="#/setups?sheet=lead">…</${Card}>`    html`<${Card} rounded>…</${Card}>`
//   html`<${Strip} onClick=${...}>…</${Strip}>`    html`<${Label}>Keep an eye on · 3</${Label}>`
//   html`<${Callout} head="Fill proposed 4 placements">Grey rows aren’t saved yet…</${Callout}>`
import { html } from '../../lib/h.js';

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

export default Card;
