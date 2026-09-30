// Bottom sheet: backdrop, grab handle, 44 px close, Escape closes, max-height 86vh, inner scroll,
// body scroll lock. Renders nothing when `open` is false.
//   html`<${Sheet} open=${!!sheet} title="Drinks 1" suffix="· Needed" sub="Lunch · priority 3 · Game Day"
//                  closeLabel=${t('cancel')} onClose=${() => go('#/setups')} footer=${html`…`}>…</${Sheet}>`
import { html, useEffect, useRef } from '../../lib/h.js';
import { Icon } from './Icons.js';

let openCount = 0;

export function Sheet({ open = true, title, suffix, sub, onClose, closeLabel, children, footer, labelledBy, cls = '' }) {
  const bodyRef = useRef(null);
  const closeRef = useRef(null);

  useEffect(() => {
    if (!open || typeof document === 'undefined') return undefined;
    openCount += 1;
    document.body.classList.add('sheet-open');
    const onKey = (e) => { if (e.key === 'Escape' && onClose) { e.preventDefault(); onClose(); } };
    document.addEventListener('keydown', onKey);
    const t = setTimeout(() => { if (closeRef.current && closeRef.current.focus) closeRef.current.focus({ preventScroll: true }); }, 30);
    return () => {
      clearTimeout(t);
      document.removeEventListener('keydown', onKey);
      openCount = Math.max(0, openCount - 1);
      if (openCount === 0) document.body.classList.remove('sheet-open');
    };
  }, [open, onClose]);

  if (!open) return null;
  const id = labelledBy || 'sheet-title';
  const onBackdrop = (e) => { if (e.target === e.currentTarget && onClose) onClose(); };

  return html`<div class="sheet-backdrop" onClick=${onBackdrop}>
    <div class=${'sheet ' + cls} role="dialog" aria-modal="true" aria-labelledby=${title ? id : null}>
      <div class="grab" aria-hidden="true"><span></span></div>
      <div class="sheet-head">
        ${title ? html`<span class="st" id=${id}>${title}</span>` : null}
        ${suffix ? html`<span class="st-suffix">${suffix}</span>` : null}
        <span class="grow"></span>
        ${closeLabel
          ? html`<button type="button" class="textbtn" ref=${closeRef} onClick=${onClose}>${closeLabel}</button>`
          : html`<button type="button" class="iconbtn" ref=${closeRef} onClick=${onClose} aria-label="Close"><${Icon} name="close" /></button>`}
      </div>
      ${sub ? html`<div class="sheet-sub">${sub}</div>` : null}
      <div class="sheet-body" ref=${bodyRef}>${children}</div>
      ${footer ? html`<div class="sheet-foot">${footer}</div>` : null}
    </div>
  </div>`;
}

// A section header inside a sheet: "NOT PLACED YET · 4" with optional right text.
export function SheetSection({ label, right }) {
  return html`<div class="sheet-section"><span class="label">${label}</span><span class="grow"></span>${right ? html`<span class="sub">${right}</span>` : null}</div>`;
}

export default Sheet;
