// Scores (#/scores, "Marcador"): read-only big numbers. Waste today vs the daily limit in counts
// with the under-limit streak, the All-Green summary over today's roster, and a note that CEM
// and LX come from office uploads and are not in this prototype.
import { html } from '../../lib/h.js';
import { Header, TitleRow } from '../components/Header.js';
import { Chip, Seg } from '../components/Chip.js';
import { Card, Label } from '../components/Card.js';
import { isLeader } from '../components/Nav.js';
import { t as tIn } from '../../state/i18n.js';
import { personById } from '../../data/people.js';
import { rosterFor } from '../../data/roster.js';
import { PEA } from '../../data/pea.js';
import { productsFor } from '../../data/products.js';
import { allGreen, PEA_POSITIONS } from '../../rules/tiers.js';
import { todayCount, todayPieces, needsCosts } from '../../rules/waste.js';

export default function Screen({ store, state, t }) {
  const es = (t.lang || state.lang) === 'es';
  const L = (en, esText) => (es ? esText : en);
  const side = state.side;
  const other = es ? 'en' : 'es';

  // ---- waste today vs limit (counts) ----
  const entries = (state.waste && state.waste.entries) || [];
  const limit = state.waste && state.waste.limitPerDay != null ? state.waste.limitPerDay : 20;
  const count = todayCount(entries, state.date);
  const pieces = todayPieces(entries, state.date);
  const streak = state.waste && state.waste.streakDays != null ? state.waste.streakDays : 0;
  const over = count > limit;
  const pct = limit ? Math.min(100, Math.round((count / limit) * 100)) : 0;

  // ---- all green over today's roster (team members of this side) ----
  const positions = PEA_POSITIONS[side] || [];
  const team = rosterFor(state.date, side).map(r => personById(r.personId)).filter(p => p && p.role === 'tm');
  const rows = team.map(p => ({ person: p, ...allGreen(PEA, p.id, side) }))
    .sort((a, b) => a.missing.length - b.missing.length || b.green.length - a.green.length || a.person.first.localeCompare(b.person.first));
  const greenCount = rows.filter(r => r.isAllGreen).length;
  // ASSUMPTIONS 3: team members never see PEA standing. A leader sees the closest people and what
  // they are missing; a team member sees the summary and at most their own progress count.
  const leader = isLeader(personById(state.me));
  const closest = leader ? rows.filter(r => !r.isAllGreen).slice(0, 4) : [];
  const mine = !leader ? rows.find(r => r.person.id === state.me && !r.isAllGreen) || null : null;

  return html`
    <${Header} state=${state} store=${store} t=${t}>
      <${TitleRow} title=${t('nav.scores')} sub=${`· ${tIn('nav.scores', null, other)}`}
        right=${html`<${Seg} value=${side} options=${[['foh', 'FOH'], ['boh', 'BOH']]} onChange=${s => store.setSide(s)} label=${t('side')} />`} />
      <div class="summary">${t('readOnlyScores')}</div>
    </${Header}>

    <div class="stack">
      <${Card} rounded>
        <${Label}>${t('wasteToday')} · ${t('counts')}</${Label}>
        <div class="row" style="align-items: baseline">
          <span style="font-size: 30px; font-weight: 700">${count}</span>
          <span style="font-size: 16px; color: var(--ink2)">${t('vsLimit', { n: '', limit }).replace(/^\s*/, '')}</span>
          <span class="grow"></span>
          ${over ? html`<${Chip} small amber>${t('overLimit')}</${Chip}>` : html`<${Chip} small style="background: var(--green-bg); color: var(--green)">${t('underLimit')}</${Chip}>`}
        </div>
        <div class="row" style="padding: 2px 0">
          <span class="progress" role="progressbar" aria-valuenow=${count} aria-valuemin="0" aria-valuemax=${limit}><span style=${`width: ${pct}%; background: ${over ? 'var(--amber)' : 'var(--green)'}`}></span></span>
          <span style="font-size: 13px; font-weight: 600; color: var(--ink2); white-space: nowrap">${t('limit', { n: limit })}</span>
        </div>
        <div style="font-size: 15px; font-weight: 500">${streak === 0 ? t('streakNone') : streak === 1 ? t('streakOne') : t('streak', { n: streak })}</div>
        <div class="sub">${L(`${count} entries · ${pieces} pieces today`, `${count} registros · ${pieces} piezas hoy`)}${needsCosts(productsFor(side)) ? ` · ${t('needsCosts')}` : ''}</div>
      </${Card}>

      <${Card} rounded>
        <${Label}>${t('allGreenSummary')} · ${side.toUpperCase()}</${Label}>
        <div style="font-size: 22px; font-weight: 700">${greenCount ? t('peopleAllGreen', { n: greenCount }) : t('nobodyAllGreen')}</div>
        <div class="sub">${L(`Crushing It on every one of ${positions.length} positions: ${positions.join(', ')}. Never rated is not green.`, `Lo domina en los ${positions.length} puestos: ${positions.join(', ')}. Sin PEA no cuenta como verde.`)}</div>
        ${rows.filter(r => r.isAllGreen && (leader || r.person.id === state.me)).map(r => html`<div class="row" key=${r.person.id} style="min-height: 32px">
          <span style="font-size: 16px; font-weight: 500">${r.person.first}</span>
          <span class="grow"></span>
          <span class="sc">${t('allGreen')}</span>
        </div>`)}
        ${closest.length ? html`<${Label} style="padding-top: 6px">${L('Closest', 'Más cerca')}</${Label}>` : null}
        ${closest.map(r => html`<div class="row" key=${r.person.id} style="min-height: 32px">
          <span class="col" style="gap: 1px; min-width: 0">
            <span style="font-size: 16px; font-weight: 500">${r.person.first}</span>
            <span class="sub">${L('missing', 'faltan')}: ${r.missing.join(', ')}</span>
          </span>
          <span class="grow"></span>
          <span style="font-size: 13px; color: var(--ink2); white-space: nowrap">${t('allGreenProgress', { n: r.green.length, of: positions.length })}</span>
        </div>`)}
        ${mine ? html`<div class="row" style="min-height: 32px">
          <span style="font-size: 16px; font-weight: 500">${mine.person.first}</span>
          <span class="grow"></span>
          <span style="font-size: 13px; color: var(--ink2); white-space: nowrap">${t('allGreenProgress', { n: mine.green.length, of: positions.length })}</span>
        </div>` : null}
        ${!rows.length ? html`<div class="sub">${L('No team members on today’s roster for this side.', 'No hay equipo en el rol de hoy para este lado.')}</div>` : null}
      </${Card}>

      <${Card} rounded>
        <${Label}>Guest Obsession (CEM) · Leadership (LX)</${Label}>
        <p style="font-size: 15px; line-height: 21px">${t('cemNote')}</p>
        <p class="sub">${L('Custom trackers and trials would sit here too, as big numbers with no editing.', 'Los trackers y las pruebas irían aquí también, como números grandes sin edición.')}</p>
      </${Card}>

      <div class="sub" style="padding: 0 4px 8px">${t('sample')}</div>
    </div>`;
}
