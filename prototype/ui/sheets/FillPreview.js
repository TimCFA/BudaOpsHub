// Fill preview (FillPreview artboard): the whole board with Fill's proposals as pending rows,
// reasons and flags kept, "tap to swap" on a proposed row (an inline list of the free people
// replaces the rows until one is tapped), sticky Confirm N / Cancel. Confirm applies through
// store.applyProposals (hand placements are never moved); Cancel discards.
import { html, useState, useMemo } from '../../lib/h.js';
import { Sheet } from '../components/Sheet.js';
import { Row, PersonRow } from '../components/Row.js';
import { Callout } from '../components/Card.js';
import { daypartName } from '../../state/i18n.js';
import { L, firstName, shiftLabel, roleTagText, tierText, fmt, fmtRange, scoreFor, PEA, HISTORY, PEOPLE, personById } from './ctx.js';
import { fill } from '../../rules/fill.js';

export default function FillPreview({ ctx, store, state, t, route, go, close }) {
  const { side, dp, board, names, rosterById, slots, assignments, dayType } = ctx;
  const [swaps, setSwaps] = useState({});
  const [swapSlot, setSwapSlot] = useState(null);
  const game = dayType.type === 'game';

  const result = useMemo(() => fill({
    side, daypartKey: dp.key, slots, assignments, onShift: board.onShift, pairs: board.pairs, people: PEOPLE, rosterById,
    peaRows: PEA, history: HISTORY, date: state.date, dayType, todayAssignmentsByDaypart: state.assignments[side], leadCaptainId: ctx.leadId,
  }), [ctx]);

  // Proposals with the leader's swaps applied (score, tier and Game Day flags recomputed for a swapped name).
  const proposals = result.proposals.map(p => {
    const pid = swaps[p.slotId] || p.personId;
    if (pid === p.personId) return p;
    const slot = slots.find(s => s.id === p.slotId);
    const s = slot && slot.pea ? scoreFor(PEA, pid, slot.pea) : { score: null, tier: null };
    const flags = [];
    if (!ctx.leaderOf(pid) && game && slot && slot.pea) {
      if (s.score == null) flags.push({ kind: 'not-rated-gameday', text: t('neverRatedGame', { pos: slot.pea }) + ' · ' + t('swap') + ' ›', slotId: slot.id, personId: pid });
      else if (s.tier === 'notyet') flags.push({ kind: 'not-yet-gameday', text: t('notYetGame', { pos: slot.pea }) + ' · ' + t('swap') + ' ›', slotId: slot.id, personId: pid });
    }
    if (slot && slot.captain && !ctx.leaderOf(pid)) flags.push({ kind: 'non-leader-captain', text: `${t('notLeader', { name: firstName(pid, names) })} ›`, slotId: slot.id, personId: pid });
    return { ...p, personId: pid, reason: t('tapToSwap'), flags, score: s.score, tier: s.tier, leader: ctx.leaderOf(pid), swapped: true };
  });
  const bySlot = new Map(proposals.map(p => [p.slotId, p]));
  const open = new Map(result.staysOpen.map(o => [o.slotId, o]));
  const n = proposals.length;
  const flagCount = board.counts.flags + proposals.reduce((k, p) => k + p.flags.length, 0);
  const openCount = result.staysOpen.length;

  const confirm = () => {
    if (!n) { close(); return; }
    // Only slots that are empty right now get filled (store.applyProposals skips occupied ones), so
    // UNDO clears exactly those slots and never a hand placement.
    const ids = proposals.filter(p => !ctx.board.rows.find(r => r.slot.id === p.slotId)?.personId).map(p => p.slotId);
    store.applyProposals(proposals.map(p => ({ slotId: p.slotId, personId: p.personId })), dp.key, { side });
    store.showToast(n === 1 ? t('fillProposedOne') : t('fillProposed', { n }), {
      undo: () => { ids.forEach(id => store.clear(dp.key, id, { side })); },
    });
    close();
  };
  const cancel = () => { store.setFillPreview(null); close(); };

  const usedIds = new Set(proposals.map(p => p.personId));
  const shiftOf = pid => board.onShift.find(p => p.personId === pid);

  // The inline swap list: everyone free (not placed, not proposed elsewhere) plus the current proposal.
  if (swapSlot) {
    const slot = slots.find(s => s.id === swapSlot);
    const cur = bySlot.get(swapSlot);
    const cands = board.onShift.filter(p => (!usedIds.has(p.personId) && result.free.includes(p.personId)) || (cur && p.personId === cur.personId))
      .filter(p => !board.rows.some(r => r.personId === p.personId));
    const chip = pid => {
      const tag = roleTagText(personById(pid), rosterById[pid]);
      if (tag) return { roleTag: tag };
      const s = slot.pea ? scoreFor(PEA, pid, slot.pea) : { score: null };
      return { score: { score: s.score, tier: s.tier } };
    };
    const meta = p => {
      const s = slot.pea ? scoreFor(PEA, p.personId, slot.pea) : { score: null };
      const parts = [ctx.leaderOf(p.personId) ? t(`role.${ctx.leaderOf(p.personId)}`) : (s.score != null ? t('tierOn', { tier: tierText(t, s.tier), pos: slot.pea }) : t('notRatedHere')), shiftLabel(rosterById[p.personId])];
      if (p.leaves != null) parts.push(t('leavesAt', { t: fmt(p.leaves) }));
      return parts.join(' · ');
    };
    return html`<${Sheet} open title=${L(t, 'swapName', { slot: slot ? slot.name : swapSlot })} sub=${L(t, 'tapToSwapHint')} onClose=${() => setSwapSlot(null)} closeLabel=${t('back')}>
      ${cands.map(p => html`<${PersonRow} key=${p.personId} name=${firstName(p.personId, names)} ...${chip(p.personId)} meta=${meta(p)} on=${cur && cur.personId === p.personId}
        onClick=${() => { setSwaps({ ...swaps, [swapSlot]: p.personId }); setSwapSlot(null); }} />`)}
      ${!cands.length ? html`<div class="pad" style="padding-bottom: 12px"><span class="sub">${t('nobodyFree')}</span></div>` : null}
    </${Sheet}>`;
  }

  const rowEl = (r) => {
    const p = bySlot.get(r.slot.id);
    const o = open.get(r.slot.id);
    if (p) {
      const on = shiftOf(p.personId);
      const tag = p.leader ? (p.leader === 'tl' ? 'TL' : 'TRAINER') : null;
      const noteParts = [];
      if (on && on.whole) noteParts.push(shiftLabel(rosterById[p.personId]));
      noteParts.push(t('tapToSwap'));
      return html`<${Row} key=${r.slot.id} rank=${r.rank} pos=${r.slot.name} state="pending"
        sub=${[r.slot.captain ? t('captain') : null, p.swapped ? p.reason : L(t, 'fillReason', { reason: p.reason || '' }).replace(/ · $/, '')].filter(Boolean).join(' · ')}
        flag=${p.flags.length ? p.flags[0].text : null} onFlag=${() => setSwapSlot(r.slot.id)}
        roleTag=${tag} name=${firstName(p.personId, names)} score=${tag ? null : { score: p.score, tier: p.tier }}
        note=${noteParts.join(' · ')} onClick=${() => setSwapSlot(r.slot.id)} />`;
    }
    const a = r.assign;
    const st = r.needed ? 'needed' : (a && a.pending ? 'pending' : 'plain');
    return html`<${Row} key=${r.slot.id} rank=${r.rank} pos=${r.slot.name} state=${st}
      sub=${[r.subText, o ? L(t, 'staysOpenRow') : null].filter(Boolean).join(' · ')}
      flag=${r.flags.length ? r.flags[0].text : null} roleTag=${r.roleTag} name=${r.name} score=${r.scoreChip} note=${r.note} needLabel=${t('needed')} />`;
  };

  const summary = [
    t('proposed', { placed: board.counts.placed, n }),
    html`<span class=${flagCount ? 'flags' : ''} style=${flagCount ? 'font-weight: 600; color: var(--amber-text)' : ''}>${flagCount === 1 ? t('flagOne') : t('flags', { n: flagCount })}</span>`,
    openCount ? (openCount === 1 ? t('staysOpen', { n: openCount }) : t('staysOpenMany', { n: openCount })) : null,
  ].filter(Boolean);

  const footer = html`
    <button type="button" class="btn" style="flex-grow: 1" onClick=${confirm} disabled=${!n}>${n === 1 ? t('confirmOne') : t('confirmN', { n })}</button>
    <button type="button" class="btn alt" style="width: 110px" onClick=${cancel}>${t('cancel')}</button>`;

  return html`<${Sheet} open title=${daypartName(dp.key)} suffix=${html`<span style="color: var(--ink3); font-weight: 400">${fmtRange(dp.start, dp.end)} · ${side.toUpperCase()}</span>`}
      sub=${summary.map((s, i) => html`${i ? '  ·  ' : ''}${s}`)} onClose=${cancel} closeLabel=${t('cancel')} footer=${footer}>
    <div class="pad" style="padding-bottom: 10px">
      <${Callout} head=${n ? (n === 1 ? t('fillProposedOne') : t('fillProposed', { n })) : L(t, 'proposedNone')}>
        ${t('fillExplain')}${game ? ` ${t('fillGameDay')}` : ''}
      </${Callout}>
    </div>
    <div class="rows">${board.rows.filter(r => !r.folded).map(rowEl)}</div>
  </${Sheet}>`;
}
