// The amber flag pill on a row: "⚠ outside all Breakfast · swap ›" — drawn with an inline SVG, not an emoji.
// Inside a Row it is a <span>; the Row's onFlag handler fires when the tap lands on it. Standalone it can be a button.
//   html`<${Flag}>${t('outsideAgain', { prev: 'Breakfast' })}</${Flag}>`
//   html`<${Flag} onClick=${...}>…</${Flag}>`
import { html } from '../../lib/h.js';
import { Icon } from './Icons.js';

export function Flag({ children, text, onClick, cls = '' }) {
  const body = html`<${Icon} name="warn" size=${12} /><span>${text != null ? text : children}</span>`;
  if (onClick) return html`<button type="button" class=${'flag ' + cls} onClick=${onClick}>${body}</button>`;
  return html`<span class=${'flag ' + cls} data-flag="1">${body}</span>`;
}

export default Flag;
