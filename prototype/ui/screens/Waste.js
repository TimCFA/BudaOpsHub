// Waste (#/waste), the Waste artboard: FOH / BOH, "Today · N entries" with the "$ view needs item
// costs" chip while every cost is 0, a grid of product tiles with 44 px size buttons (×1 for a
// single size). Tapping a size logs it at once (store.logWaste, who = this phone's person, at =
// the demo clock) and shows the snackbar "Nuggets 12 ct logged · Brielle" with UNDO for 5 s
// (store.undoWaste). Below: the last 15 minutes as a tape.
import { html } from '../../lib/h.js';
import { Header, TitleRow } from '../components/Header.js';
import { Chip, Seg } from '../components/Chip.js';
import { Label } from '../components/Card.js';
import { t as tIn } from '../../state/i18n.js';
import { productsFor, PRODUCTS_BY_ID, sizeLabel } from '../../data/products.js';
import { personById } from '../../data/people.js';
import { fmt } from '../../rules/time.js';
import { tape, todayCount, needsCosts, UNDO_WINDOW_SEC } from '../../rules/waste.js';

export default function Screen({ store, state, t }) {
  const es = (t.lang || state.lang) === 'es';
  const side = state.side;
  const products = productsFor(side);
  const entries = (state.waste && state.waste.entries) || [];
  const count = todayCount(entries, state.date);
  const recent = tape(entries, state.now, 15, state.date);
  const me = personById(state.me);
  const meName = me ? me.first : '';
  const other = es ? 'en' : 'es';

  const log = (product, size) => {
    const e = store.logWaste({ productId: product.id, size: size ? size.label : null, qty: 1 });
    if (!e) return;
    store.showToast(t('loggedBy', { item: sizeLabel(product, size ? size.label : null, t.lang, t('ct')), who: meName }), {
      undo: () => { store.undoWaste(e.id); },
      ttl: UNDO_WINDOW_SEC * 1000,
    });
  };

  const tile = (p) => html`<div class="tile" key=${p.id}>
    <span class="en">${es ? p.es || p.name : p.name}</span>
    ${p.es && p.es !== p.name ? html`<span class="es">${es ? p.name : p.es}</span>` : null}
    <div class="sizes">
      ${p.sizes && p.sizes.length
        ? p.sizes.map(s => html`<button type="button" key=${s.label} onClick=${() => log(p, s)} aria-label=${`${sizeLabel(p, s.label, t.lang, t('ct'))} · ${t('waste')}`}>${s.label}</button>`)
        : html`<button type="button" onClick=${() => log(p, null)} aria-label=${`${p.name} · ${t('waste')}`}>×1</button>`}
    </div>
  </div>`;

  const tapeRow = (e) => {
    const p = PRODUCTS_BY_ID[e.productId];
    const who = personById(e.who);
    return html`<div class="tape" key=${e.id}>
      <span class="t">${fmt(e.at)}</span>
      <span style="min-width: 0">${p ? sizeLabel(p, e.size, t.lang, t('ct')) : e.productId} ×${e.qty}</span>
      <span class="w">${who ? who.first : e.who}</span>
    </div>`;
  };

  return html`
    <${Header} state=${state} store=${store} t=${t}>
      <${TitleRow} title=${t('waste')} sub=${`· ${tIn('waste', null, other)}`}
        right=${html`<${Seg} value=${side} options=${[['foh', 'FOH'], ['boh', 'BOH']]} onChange=${s => store.setSide(s)} label=${t('side')} />`} />
      <div class="panel">
        <span style="font-size: 14px; color: var(--ink3)">${t('today')}</span>
        <span style="font-size: 16px; font-weight: 600; white-space: nowrap">${count === 1 ? t('entryOne') : t('entries', { n: count })}</span>
        <span class="grow"></span>
        ${needsCosts(products) ? html`<${Chip} small amber>${t('needsCosts')}</${Chip}>` : null}
      </div>
      <div style="font-size: 13px; color: var(--ink3)">${t('tapSize')} · ${tIn('tapSize', null, other)}</div>
    </${Header}>

    <div class="stack">
      ${side === 'boh' ? html`<div class="sub">${t('prepWaste')} · ${tIn('prepWaste', null, other)}</div>` : null}
      <div class="grid">${products.map(tile)}</div>
      <${Label} style="padding-top: 4px">${t('last15')}</${Label}>
      ${recent.length ? recent.map(tapeRow) : html`<div class="tape" style="color: var(--ink3)">${t('nothing15')}</div>`}
      <div class="sub" style="padding: 0 4px 8px">${t('sample')}</div>
    </div>`;
}
