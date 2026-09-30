// Pick a name for a slot (PickName artboard). Opened by a Needed row, a flag, "Change" on the
// Person sheet, or "Hand off" (mode=handoff: only people arriving later this daypart).
// Sections: Not placed yet · Arriving later · Already placed (tap to move). One tap places and
// closes; the row shows pending until the store saves. Query: sheet=pick&slot=<id>&flag=<kind>&mode=handoff
import { html, useState } from '../../lib/h.js';
import { Sheet, SheetSection } from '../components/Sheet.js';
import { PersonRow } from '../components/Row.js';
import { daypartName } from '../../state/i18n.js';
import { L, firstName, shiftLabel, roleTagText, tierText, previousOutside, lastWorkedZone, fmt, scoreFor, PEA, personById } from './ctx.js';
import { zoneName, zonesCovered } from '../../rules/leaders.js';
import { relativeDay, daysBetween } from '../../rules/time.js';

export default function PickName({ ctx, store, state, t, route, go, close }) {
  const [q, setQ] = useState('');
  const { side, dp, board, names, rosterById, slots, assignments, dayType } = ctx;
  const slotId = route.query.slot;
  const slot = slots.find(s => s.id === slotId);
  if (!slot) return html`<${Sheet} open title=${t('setUps')} onClose=${close} closeLabel=${t('cancel')}><div class="pad"><span class="sub">${L(t, 'empty')}</span></div></${Sheet}>`;

  const mode = route.query.mode === 'handoff' ? 'handoff' : 'pick';
  const row = board.rows.find(r => r.slot.id === slot.id);
  const current = row && row.assign ? row.assign : null;
  const flag = route.query.flag ? (row ? row.flags.find(f => f.kind === route.query.flag) : null) : null;
  const game = dayType.type === 'game';
  const { prev, outside: wasOutside, inside: wasInside } = previousOutside(state, side, dp.key);

  const placedBy = new Map(); // personId → row
  for (const r of board.rows) if (r.personId) placedBy.set(r.personId, r);
  const takerOf = new Map();  // handoffTo → row
  for (const r of board.rows) if (r.assign && r.assign.handoffTo) takerOf.set(r.assign.handoffTo, r);

  const score = pid => (slot.pea ? scoreFor(PEA, pid, slot.pea) : { score: null, tier: null });
  const leaderOf = pid => ctx.leaderOf(pid);
  const peaLabel = slot.pea ? slot.pea.replace(/ 1\/3$/, '') : null; // the floor says "Drinks", the PEA group is "Drinks 1/3"

  const meta = (p) => {
    const parts = [];
    const kind = leaderOf(p.personId);
    const s = score(p.personId);
    if (kind) parts.push(kind === 'tl' ? t('role.tl') : t('role.trainer'));
    else if (s.score != null) parts.push(t('tierOn', { tier: tierText(t, s.tier), pos: peaLabel }));
    else if (slot.pea) parts.push(t('notRatedHere'));
    parts.push(shiftLabel(rosterById[p.personId]));
    if (!kind && slot.outside && prev && wasInside.has(p.personId)) parts.push(t('wasInside', { prev: daypartName(prev.key) }));
    if (!kind && slot.outside && prev && wasOutside.has(p.personId) && !p.lastDaypart) parts.push(L(t, 'wasOutside', { prev: daypartName(prev.key) }));
    // 'worked here Thu' only when it matters for the rotation rule (worked this zone in the last 2 days).
    if (!kind && s.score != null) {
      const lw = lastWorkedZone(side, p.personId, slot.zone, state.date);
      if (lw && daysBetween(lw, state.date) <= 2) parts.push(t('workedHere', { when: relativeDay(lw, state.date) }));
    }
    if (!kind && game && slot.pea && (s.score == null || s.tier === 'notyet')) parts.push(t('noGameDayPick'));
    return parts.filter(Boolean).join(' · ');
  };

  // Sorting: leaders first on a captain slot or a leader flag, else by score (never rated last);
  // for an outside flag the people who were inside come first.
  const leaderFirst = slot.captain || (flag && flag.kind !== 'outside-again');
  const insideFirst = flag && flag.kind === 'outside-again';
  const rank = (p) => {
    const kind = leaderOf(p.personId);
    const s = score(p.personId);
    const blocked = slot.outside && wasOutside.has(p.personId) && !p.lastDaypart;
    return [
      blocked ? 1 : 0,
      leaderFirst ? (kind ? 0 : 1) : (kind ? 2 : 0),
      insideFirst ? (wasInside.has(p.personId) ? 0 : 1) : 0,
      s.score == null ? 1 : 0,
      -(s.score || 0),
      String(p.personId),
    ];
  };
  const cmp = (a, b) => { const x = rank(a), y = rank(b); for (let i = 0; i < x.length; i++) { if (x[i] < y[i]) return -1; if (x[i] > y[i]) return 1; } return 0; };

  const shift = ctx.board.onShift;
  const exclude = pid => current && pid === current.personId;
  const notPlaced = shift.filter(p => p.arrives === null && !placedBy.has(p.personId) && !takerOf.has(p.personId)).sort(cmp);
  const arriving = shift.filter(p => p.arrives !== null && !placedBy.has(p.personId)).sort((a, b) => a.arrives - b.arrives || cmp(a, b));
  const already = shift.filter(p => placedBy.has(p.personId) && !exclude(p.personId)).sort(cmp);
  const filter = list => (q ? list.filter(p => firstName(p.personId, names).toLowerCase().includes(q.toLowerCase())) : list);

  const chipFor = (p) => {
    const tag = roleTagText(personById(p.personId), rosterById[p.personId]);
    if (tag) return { roleTag: tag };
    const s = score(p.personId);
    return { score: { score: s.score, tier: s.tier } };
  };

  const meName = firstName(state.me, names);
  const pick = (pid) => {
    if (mode === 'handoff') {
      const at = (shift.find(p => p.personId === pid) || {}).arrives;
      store.setHandoff(dp.key, slot.id, pid, at != null ? at : state.now, { side });
      store.showToast(t('handedOff', { slot: slot.name, name: firstName(pid, names), t: fmt(at != null ? at : state.now) }), { undo: () => store.setHandoff(dp.key, slot.id, null, null, { side }) });
    } else {
      const before = current ? { ...current } : null;
      const moving = placedBy.get(pid);
      store.assign(dp.key, slot.id, pid, { side });
      store.showToast(t('placedBy', { who: meName, name: firstName(pid, names), slot: slot.name }), {
        undo: () => {
          if (before) store.assign(dp.key, slot.id, before.personId, { side }); else store.clear(dp.key, slot.id, { side });
          if (moving) store.assign(dp.key, moving.slot.id, pid, { side });
        },
      });
    }
    close();
  };

  const bagCaptain = board.rows.find(r => r.personId && leaderOf(r.personId) && r.slot.zone !== slot.zone && zonesCovered(r.slot.zone).includes(slot.zone));
  const subParts = [daypartName(dp.key), t('priority', { n: slot.rank || (slots.indexOf(slot) + 1) })];
  subParts.push(html`<span style="font-weight: 600; color: var(--ink2)">${game ? t('gameDay') : t('practiceDay')}</span>`);
  if (flag) subParts.push(html`<span style="color: var(--amber-text); font-weight: 500">${flag.text.replace(/\s*›\s*$/, '')}</span>`);
  if (bagCaptain) subParts.push(t('reaches', { name: `${firstName(bagCaptain.personId, names)} (${zoneName(side, bagCaptain.slot.zone)} ${t('captain').toLowerCase()})`, zone: zoneName(side, slot.zone) }));
  if (slot.pea) subParts.push(t('scoreIs', { pos: peaLabel }));

  const title = mode === 'handoff' ? L(t, 'handoffPick', { slot: slot.name }) : slot.name;
  const suffix = mode === 'handoff' ? null : (current ? `· ${L(t, 'changeName')}` : `· ${t('needed')}`);

  const section = (label, list, metaFn) => (list.length ? html`
    <${SheetSection} label=${label} />
    ${list.map(p => html`<${PersonRow} key=${p.personId} name=${firstName(p.personId, names)} ...${chipFor(p)} meta=${metaFn(p)} onClick=${() => pick(p.personId)} />`)}` : null);

  if (mode === 'handoff') {
    const cands = filter(shift.filter(p => p.arrives !== null && !placedBy.has(p.personId) && !exclude(p.personId)));
    return html`<${Sheet} open title=${title} sub=${html`${daypartName(dp.key)} · ${L(t, 'handoffHint')}`} onClose=${close} closeLabel=${t('cancel')}>
      ${cands.length ? cands.map(p => html`<${PersonRow} key=${p.personId} name=${firstName(p.personId, names)} ...${chipFor(p)} meta=${`${t('arrives', { t: fmt(p.arrives) })} · ${meta(p)}`} onClick=${() => pick(p.personId)} />`)
        : html`<div class="pad" style="padding-bottom: 12px"><span class="sub">${L(t, 'noArrivals')}</span></div>`}
      ${current && current.handoffTo ? html`<div class="pad" style="padding-top: 10px"><button type="button" class="textbtn red" onClick=${() => { store.setHandoff(dp.key, slot.id, null, null, { side }); close(); }}>${L(t, 'removeHandoff')}</button></div>` : null}
    </${Sheet}>`;
  }

  return html`<${Sheet} open title=${title} suffix=${suffix} sub=${subParts.map((s, i) => html`${i ? ' · ' : ''}${s}`)} onClose=${close} closeLabel=${t('cancel')}>
    <label class="search"><span>${q ? '' : t('search')}</span><input type="search" aria-label=${t('search')} value=${q} onInput=${e => setQ(e.target.value)} /></label>
    ${section(`${t('notPlaced')} · ${filter(notPlaced).length}`, filter(notPlaced), meta)}
    ${section(`${t('arrivingLater')} · ${filter(arriving).length}`, filter(arriving), (p) => {
      const taking = takerOf.get(p.personId);
      const parts = [t('arrives', { t: fmt(p.arrives) })];
      if (taking) parts.push(taking.assign.handoffAt != null && taking.assign.handoffAt !== p.arrives ? t('takesAt', { slot: taking.slot.name, t: fmt(taking.assign.handoffAt) }) : t('takes', { slot: taking.slot.name }));
      const s = score(p.personId);
      if (!leaderOf(p.personId) && slot.pea && s.score == null) parts.push(t('notRatedHere'));
      return parts.join(' · ');
    })}
    ${section(`${t('alreadyPlaced')} · ${t('tapToMove')}`, filter(already), (p) => {
      const r = placedBy.get(p.personId);
      return [r.slot.name, r.note].filter(Boolean).join(' · ');
    })}
    ${!filter(notPlaced).length && !filter(arriving).length && !filter(already).length ? html`<div class="pad" style="padding: 8px 16px 14px"><span class="sub">${t('nobodyFree')}</span></div>` : null}
  </${Sheet}>`;
}
