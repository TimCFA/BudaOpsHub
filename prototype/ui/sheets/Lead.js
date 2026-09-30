// Lead Captain + Breaks sheet. Who leads: TLs ordered by rotation (leadCaptainOptions); one tap sets
// the lead and their working spot (store.setLead). Breaks: off now / next / everyone's planned time,
// cover, and a Move control per break (store.moveBreak; a hand-moved break sticks).
import { html, useState } from '../../lib/h.js';
import { Sheet, SheetSection } from '../components/Sheet.js';
import { PersonRow } from '../components/Row.js';
import { Chip } from '../components/Chip.js';
import { daypartName } from '../../state/i18n.js';
import { L, firstName, shiftLabel, fmt, personById } from './ctx.js';
import { legalStarts } from '../../rules/breaks.js';

export default function Lead({ ctx, store, state, t, route, go, close }) {
  const { side, dp, board, names, rosterById, leadOptions, leadId, breaks } = ctx;
  const [moving, setMoving] = useState(null);
  const lead = board.lead;
  const overrides = (state.breakOverrides && state.breakOverrides[side]) || {};

  // A Lead Captain is never also a zone captain: a TL captaining a zone is moved off that captain
  // slot first (the zone then shows its honest 'no leader' flag) and works the lead's home spot.
  const setLead = (pid) => {
    const opt = leadOptions.find(o => o.personId === pid);
    const captaining = opt && opt.captaining ? opt.captaining : null;
    const home = ctx.homeSlotFor(pid, captaining);
    if (captaining) store.clear(dp.key, captaining, { side });
    store.setLead(dp.key, pid, home, { side });
    const slot = home ? ctx.slots.find(s => s.id === home) : null;
    store.showToast(`${t('leadCaptain')}: ${firstName(pid, names)}${slot ? ` · ${L(t, 'worksSpot', { slot: slot.name })}` : ''}`);
    close();
  };

  const optionMeta = (o) => {
    const parts = [o.reason];
    const placed = board.rows.find(r => r.personId === o.personId);
    if (o.captaining) {
      const home = ctx.homeSlotFor(o.personId, o.captaining);
      const slot = home ? ctx.slots.find(s => s.id === home) : null;
      parts.push(slot ? L(t, 'movesTo', { slot: slot.name }) : L(t, 'leavesCaptain'));
    } else if (placed) parts.push(L(t, 'worksSpot', { slot: placed.slot.name }));
    else {
      const home = ctx.homeSlotFor(o.personId);
      const slot = home ? ctx.slots.find(s => s.id === home) : null;
      if (slot) parts.push(L(t, 'worksSpot', { slot: slot.name }));
    }
    return parts.join(' · ');
  };

  const breakRow = (b) => {
    const name = firstName(b.personId, names);
    const isMoving = moving === b.personId;
    const entry = rosterById[b.personId];
    const starts = isMoving && entry ? legalStarts(entry).filter(x => x % 15 === 0 || x === b.start) : [];
    const offNow = b.start != null && b.start <= state.now && state.now < b.end;
    const line = b.start == null ? L(t, 'noBreak')
      : (b.cover ? L(t, 'breakLine', { t: b.label, cover: firstName(b.cover, names) }) : L(t, 'breakNoCover', { t: b.label }));
    const past = b.end != null && b.end <= state.now;
    return html`<div key=${b.personId} style=${'border-top: 1px solid var(--line)' + (past && !isMoving ? '; opacity: .6' : '')}>
      <div class="row" style="padding: 6px 16px; min-height: 52px; gap: 10px">
        <span class="col" style="flex: 1">
          <span class="row" style="gap: 6px"><span class="n" style="font-size: 16px; font-weight: 500">${name}</span>${b.tl ? html`<span class="tag">TL</span>` : null}${offNow ? html`<span class="sc a">${t('onBreak')}</span>` : null}${b.moved ? html`<span class="sub">· ${L(t, 'moved')}</span>` : null}</span>
          <span class="sub">${line}${b.warn ? html`<span class="amber"> · ${b.warn}</span>` : null}</span>
        </span>
        ${b.start != null || entry ? html`<${Chip} line=${!isMoving} dark=${isMoving} onClick=${() => setMoving(isMoving ? null : b.personId)} ariaLabel=${`${L(t, 'moveBreak')} · ${name}`}>${L(t, 'moveBreak')}</${Chip}>` : null}
      </div>
      ${isMoving ? html`<div style="padding: 0 16px 10px">
        <div class="row" style="margin-bottom: 6px"><span class="sub">${L(t, 'pickStart')} · ${shiftLabel(entry)}</span><span class="grow"></span>
          ${overrides[b.personId] != null ? html`<button type="button" class="textbtn red" style="min-height: 36px" onClick=${() => { store.moveBreak(b.personId, null, { side }); setMoving(null); }}>${L(t, 'resetBreak')}</button>` : null}</div>
        <div class="row" style="flex-wrap: wrap; gap: 6px">
          ${starts.map(x => html`<${Chip} key=${x} tall dark=${x === b.start} onClick=${() => { store.moveBreak(b.personId, x, { side }); setMoving(null); store.showToast(`${name} · ${fmt(x)}–${fmt(x + 30)}`); }}>${fmt(x)}</${Chip}>`)}
          ${!starts.length ? html`<span class="sub">${L(t, 'noBreak')}</span>` : null}
        </div>
      </div>` : null}
    </div>`;
  };

  const off = breaks.offNow.map(b => L(t, 'offNowLine', { name: firstName(b.personId, names), t: fmt(b.end) }) + (b.cover ? ` (${t('covers', { name: firstName(b.cover, names) })})` : ''));
  const next = breaks.next.map(b => `${firstName(b.personId, names)} ${fmt(b.start)}${b.cover ? ` (${t('covers', { name: firstName(b.cover, names) })})` : ''}`);

  return html`<${Sheet} open title=${t('leadCaptain')} sub=${`${daypartName(dp.key)} · ${lead ? `${lead.name} · ${lead.reason}` : L(t, 'noTL')}`} onClose=${close}>
    <${SheetSection} label=${t('leadCandidates')} right=${t('rotation')} />
    ${leadOptions.length ? leadOptions.map(o => html`<${PersonRow} key=${o.personId} roleTag="TL" name=${firstName(o.personId, names)} meta=${optionMeta(o)} on=${o.personId === leadId} onClick=${() => setLead(o.personId)} />`)
      : html`<div class="pad" style="padding-bottom: 10px"><span class="sub">${L(t, 'noTL')}</span></div>`}
    <div class="pad" style="padding: 6px 16px 4px"><span class="sub">${L(t, 'setLeadTap')}${lead && lead.homeReason ? ` · ${lead.homeName}: ${lead.homeReason}` : ''}</span></div>

    <${SheetSection} label=${t('breaks')} right=${`${breaks.plan.filter(b => b.start != null).length}`} />
    <div class="pad" style="padding-bottom: 8px"><span style="font-size: 13px; line-height: 17px">${[off.length ? off.join(', ') : L(t, 'noneOff'), next.length ? L(t, 'nextLine', { list: next.join(', ') }) : null].filter(Boolean).join(' · ')}</span></div>
    ${breaks.plan.map(breakRow)}
    ${!breaks.plan.length ? html`<div class="pad" style="padding-bottom: 12px"><span class="sub">${t('noBreaks')}</span></div>` : null}
  </${Sheet}>`;
}
