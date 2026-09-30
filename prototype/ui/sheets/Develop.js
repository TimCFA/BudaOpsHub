// Develop sheet (from Keep an eye on): the three people to watch with their reasons, the
// development picks with reasons and pairing, Practice/Game explained in one line, and a
// "Place ★" button that confirms the pick on the board (assignment gets star: true).
import { html } from '../../lib/h.js';
import { Sheet, SheetSection } from '../components/Sheet.js';
import { PersonRow } from '../components/Row.js';
import { Chip } from '../components/Chip.js';
import { daypartName } from '../../state/i18n.js';
import { L, firstName, hrefFor, fmt } from './ctx.js';

export default function Develop({ ctx, store, state, t, route, go, close }) {
  const { side, dp, board, names, picks, dayType, budgetLine } = ctx;
  const eye = board.keepAnEye || [];
  const game = dayType.type === 'game';

  // Place ★: the pick's person is already on that slot (picks come from the board); confirm it with star: true.
  const place = (pick) => {
    store.set(s => {
      const cur = (s.assignments[side] && s.assignments[side][dp.key]) || {};
      const a = cur[pick.slotId] && cur[pick.slotId].personId === pick.personId ? cur[pick.slotId] : { personId: pick.personId };
      return { assignments: { ...s.assignments, [side]: { ...(s.assignments[side] || {}), [dp.key]: { ...cur, [pick.slotId]: { ...a, star: true, pending: true } } } } };
    });
    store.save();
    const slot = ctx.slots.find(x => x.id === pick.slotId);
    store.showToast(`★ ${firstName(pick.personId, names)} · ${slot ? slot.name : pick.peaPosition}`, {
      undo: () => {
        store.set(s => {
          const cur = { ...((s.assignments[side] && s.assignments[side][dp.key]) || {}) };
          if (cur[pick.slotId]) { const a = { ...cur[pick.slotId] }; delete a.star; cur[pick.slotId] = a; }
          return { assignments: { ...s.assignments, [side]: { ...(s.assignments[side] || {}), [dp.key]: cur } } };
        });
        store.save();
      },
    });
  };

  const isStarred = pick => { const a = ctx.assignments[pick.slotId]; return !!(a && a.personId === pick.personId && a.star); };

  return html`<${Sheet} open title=${t('develop')} sub=${`${daypartName(dp.key)} · ${game ? t('gameExplain') : t('practiceExplain')}`} onClose=${close}>
    <${SheetSection} label=${`${t('keepAnEye')} · ${eye.length}`} />
    ${eye.length ? eye.map(k => html`<${PersonRow} key=${k.personId} name=${k.name} meta=${k.reason} href=${hrefFor(route, { sheet: 'person', id: k.personId })} />`)
      : html`<div class="pad" style="padding-bottom: 8px"><span class="sub">—</span></div>`}

    <${SheetSection} label=${`${t('picks')} · ${picks.length}`} right=${budgetLine} />
    ${picks.length ? picks.map(pick => {
      const slot = ctx.slots.find(x => x.id === pick.slotId);
      const pair = pick.pairedWith ? board.onShift.find(p => p.personId === pick.pairedWith) : null;
      const starred = isStarred(pick);
      return html`<div key=${pick.personId + pick.slotId} style="border-top: 1px solid var(--line); padding: 8px 16px 10px; display: flex; flex-direction: column; gap: 4px">
        <div class="row" style="gap: 8px">
          ${pick.score != null ? html`<span class=${'sc ' + (pick.tier === 'crushing' ? '' : pick.tier === 'rise' ? 'a' : 'h')}>★ ${Number(pick.score).toFixed(1)}</span>` : html`<span class="sc h">★ —</span>`}
          <span style="font-size: 17px; font-weight: 500">${firstName(pick.personId, names)}</span>
          <span class="sub">· ${slot ? slot.name : pick.peaPosition}</span>
          <span class="grow"></span>
          ${starred ? html`<span class="sub" style="color: var(--green); font-weight: 600">${L(t, 'placedStar')}</span>`
            : html`<${Chip} tall dark onClick=${() => place(pick)}>${L(t, 'place')}</${Chip}>`}
        </div>
        <span class="sub">${pick.reason}</span>
        <span style="font-size: 13px">${pick.pairedWith
          ? L(t, 'pairedLine', { name: firstName(pick.pairedWith, names), reason: pick.pairReason })
          : L(t, 'noPair')}${pair && pair.leaves != null && !/till/.test(pick.pairReason || '') ? ` · ${t('till', { t: fmt(pair.leaves) })}` : ''}</span>
      </div>`;
    }) : html`<div class="pad" style="padding: 4px 16px 14px"><span class="sub">${L(t, 'noPicks')} · ${budgetLine}</span></div>`}
  </${Sheet}>`;
}
