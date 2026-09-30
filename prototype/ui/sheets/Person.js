// Person sheet / profile: name, role, shift, today's spots, score chips per PEA position, last PEA,
// all-green progress; leader actions on a slot (Change → PickName, Hand off → arriving people, Clear).
// Query: sheet=person&id=<personId>&slot=<slotId?>
import { html } from '../../lib/h.js';
import { Sheet, SheetSection } from '../components/Sheet.js';
import { ScoreChip } from '../components/ScoreChip.js';
import { Chip } from '../components/Chip.js';
import { daypartName } from '../../state/i18n.js';
import { L, firstName, shiftLabel, roleTagText, tierText, profileOf, dpAssignmentsOf, hrefFor, DAYPARTS, fmt, slotById, personById } from './ctx.js';
import { relativeDay } from '../../rules/time.js';

export default function Person({ ctx, store, state, t, route, go, close }) {
  const { side, dp, board, names, rosterById, readOnly } = ctx;
  const id = route.query.id;
  const person = personById(id);
  if (!person) return html`<${Sheet} open title=${t('profile')} onClose=${close}><div class="pad"><span class="sub">${L(t, 'empty')}</span></div></${Sheet}>`;
  const name = firstName(id, names);
  const entry = rosterById[id] || null;
  const tag = roleTagText(person, entry);
  const leader = !!tag;
  const roleText = person.role === 'manager' ? t('role.manager') : (tag ? t(`role.${ctx.leaderOf(id)}`) : t('role.tm'));
  const slotId = route.query.slot;
  const row = slotId ? board.rows.find(r => r.slot.id === slotId) : null;
  const onRow = row && row.personId === id ? row : null;
  const pside = person.side || side;
  const profile = profileOf(id, pside, state.date);

  // Today's spots across the dayparts of this person's side.
  const spots = [];
  for (const d of DAYPARTS[pside]) {
    const a = dpAssignmentsOf(state, pside, d.key);
    for (const [k, v] of Object.entries(a)) {
      if (k.startsWith('__')) continue;
      const pid = typeof v === 'string' ? v : v && v.personId;
      const to = v && v.handoffTo;
      const s = slotById(pside, d.key, k);
      const sname = s ? s.name : k;
      if (pid === id) spots.push({ key: d.key, text: `${sname}${to ? ` → ${firstName(to, names)}${v.handoffAt != null ? ` ${fmt(v.handoffAt)}` : ''}` : ''}` });
      else if (to === id) spots.push({ key: d.key, text: v.handoffAt != null ? t('takesAt', { slot: sname, t: fmt(v.handoffAt) }) : t('takes', { slot: sname }) });
    }
  }

  const green = profile.green;
  const lastLine = profile.last
    ? L(t, 'lastPeaOn', { when: profile.dueDays === 0 ? t('todayLower') : (profile.dueDays === 1 ? t('yesterday') : L(t, 'daysAgo', { n: profile.dueDays })), pos: profile.last.position })
    : L(t, 'neverRated');

  const actions = !readOnly && onRow ? html`
    <div class="row" style="padding: 12px 16px 4px; gap: 8px; flex-wrap: wrap">
      <${Chip} tall dark href=${hrefFor(route, { sheet: 'pick', slot: onRow.slot.id })}>${t('change')}</${Chip}>
      <${Chip} tall line href=${hrefFor(route, { sheet: 'pick', slot: onRow.slot.id, mode: 'handoff' })}>${t('handOff')}${onRow.assign.handoffTo ? ` · ${firstName(onRow.assign.handoffTo, names)}` : ''}</${Chip}>
      <${Chip} tall line onClick=${() => {
        const before = { ...onRow.assign };
        store.clear(dp.key, onRow.slot.id, { side });
        store.showToast(t('cleared', { slot: onRow.slot.name }), { undo: () => { store.assign(dp.key, onRow.slot.id, before.personId, { side }); if (before.handoffTo) store.setHandoff(dp.key, onRow.slot.id, before.handoffTo, before.handoffAt, { side }); } });
        close();
      }}>${t('clear')}</${Chip}>
    </div>` : null;

  const shiftText = entry ? shiftLabel(entry) : L(t, 'noRoster');
  const on = board.onShift.find(p => p.personId === id);
  const availability = on ? (on.leaves != null ? t('leavesAt', { t: fmt(on.leaves) }) : (on.arrives != null ? t('arrives', { t: fmt(on.arrives) }) : null)) : null;

  return html`<${Sheet} open title=${name} suffix=${tag ? html`<span class="tag">${tag}</span>` : null}
      sub=${[roleText, `${t('shift')} ${shiftText}`, availability, onRow ? `${daypartName(dp.key)} · ${onRow.slot.name}` : null].filter(Boolean).join(' · ')} onClose=${close}>
    ${actions}
    ${onRow && onRow.flags.length ? html`<div class="pad" style="padding-top: 8px">${onRow.flags.map(f => html`<div key=${f.kind} class="flag" style="margin-bottom: 4px">${f.text}</div>`)}</div>` : null}

    <${SheetSection} label=${t('todaysSpots')} />
    <div class="pad" style="padding-bottom: 6px; display: flex; flex-direction: column; gap: 4px">
      ${spots.length ? spots.map(s => html`<div key=${s.key + s.text} class="row" style="min-height: 24px"><span class="sub" style="width: 96px; flex-shrink: 0">${daypartName(s.key)}</span><span style="font-size: 14px">${s.text}</span></div>`)
        : html`<span class="sub">${t('notPlacedYet')}</span>`}
    </div>

    ${leader || readOnly ? html`
      <${SheetSection} label=${t('scores')} />
      <div class="pad" style="padding-bottom: 14px"><span class="sub">${leader ? L(t, 'notTiered') : t('readOnly')}</span></div>` : html`
      <${SheetSection} label=${t('scores')} right=${t('allGreenProgress', { n: green.green.length, of: green.green.length + green.missing.length })} />
      <div class="pad" style="display: flex; flex-wrap: wrap; gap: 8px; padding-bottom: 8px">
        ${profile.scores.map(s => html`<span key=${s.position} class="panel" style="gap: 8px; padding: 6px 10px; min-height: 36px">
          <span style="font-size: 13px">${s.position}</span>
          <${ScoreChip} score=${s.score} tier=${s.tier} showEmpty star=${onRow && onRow.pick && onRow.pick.peaPosition === s.position} />
        </span>`)}
      </div>
      <div class="pad" style="display: flex; flex-direction: column; gap: 4px; padding-bottom: 14px">
        <div class="row"><span class="sub" style="width: 96px; flex-shrink: 0">${t('lastPea')}</span><span style="font-size: 14px">${lastLine}${profile.last ? html`<span class="sub"> · ${relativeDay(String(profile.last.at).slice(0, 10), state.date)}</span>` : null}</span></div>
        <div class="row"><span class="sub" style="width: 96px; flex-shrink: 0">${t('allGreen')}</span><span style="font-size: 14px">${green.isAllGreen ? t('allGreenSummary') : (green.missing.length <= 2 ? (green.missing.length === 1 ? t('oneFromAllGreen') : t('fromAllGreen', { n: green.missing.length })) : t('allGreenProgress', { n: green.green.length, of: green.green.length + green.missing.length }))}${green.missing.length && green.missing.length <= 3 ? html`<span class="sub"> · ${green.missing.join(', ')}</span>` : null}</span></div>
      </div>`}
  </${Sheet}>`;
}
