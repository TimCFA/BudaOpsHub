// Chips (36 px default, 44 px `tall`; dark / line / amber / red variants) and the FOH·BOH / EN·ES segment.
//   html`<${Chip} tall dark onClick=${...}>Lunch</${Chip}>`
//   html`<${Chip} href="#/more" line>Dorian ▾</${Chip}>`        (renders an <a>)
//   html`<${Chip}>Sat, Oct 3 · 10:52</${Chip}>`               (no handler: a plain <span>)
//   html`<${Seg} value="foh" options=${[['foh','FOH'],['boh','BOH']]} onChange=${side => store.setSide(side)} label="Side" />`
import { html } from '../../lib/h.js';

export function Chip({ tall, dark, line, amber, red, small, muted, on, href, onClick, ariaLabel, title, cls = '', style, children, type = 'button', disabled }) {
  const classes = ['chip', tall && 'tall', (dark || on) && 'dark', line && 'line', amber && 'amber', red && 'red', small && 'small', muted && 'muted', cls].filter(Boolean).join(' ');
  if (href) return html`<a class=${classes} href=${href} aria-label=${ariaLabel} title=${title} style=${style} aria-current=${on ? 'true' : null}>${children}</a>`;
  if (onClick) return html`<button class=${classes} type=${type} onClick=${onClick} aria-label=${ariaLabel} title=${title} style=${style} aria-pressed=${on != null ? String(!!on) : null} disabled=${disabled}>${children}</button>`;
  return html`<span class=${classes} title=${title} style=${style}>${children}</span>`;
}

// options: [[value, label], ...]
export function Seg({ value, options = [], onChange, label, cls = '' }) {
  return html`<span class=${'seg ' + cls} role="group" aria-label=${label}>
    ${options.map(([v, text]) => html`<button type="button" class=${v === value ? 'on' : ''} aria-pressed=${String(v === value)} onClick=${() => onChange && onChange(v)}>${text}</button>`)}
  </span>`;
}

export default Chip;
