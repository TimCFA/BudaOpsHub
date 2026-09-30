// Snackbar docked above the nav (the shell renders it from state.toast; screens call store.showToast()).
//   store.showToast('Nuggets 12 ct logged · Brielle', { undo: () => store.undoWaste(), ttl: 5000 })
// Rendered by app.js as html`<${Toast} toast=${state.toast} onUndo=${...} onClose=${() => store.hideToast()} t=${t} />`
import { html } from '../../lib/h.js';
import { Icon } from './Icons.js';

export function Toast({ toast, onUndo, onClose, t = (k) => k }) {
  if (!toast) return null;
  const undo = () => { if (toast.undo) toast.undo(); if (onUndo) onUndo(toast); if (onClose) onClose(); };
  return html`<div class="snack" role="status" aria-live="polite">
    <span class="dot"></span>
    <span class="txt">${toast.text}</span>
    <span class="grow"></span>
    ${toast.undo || onUndo
      ? html`<button type="button" class="undo" onClick=${undo}>${t('undo')}</button>`
      : html`<button type="button" class="close" onClick=${onClose} aria-label=${t('close')}><${Icon} name="close" size=${18} /></button>`}
  </div>`;
}

export default Toast;
