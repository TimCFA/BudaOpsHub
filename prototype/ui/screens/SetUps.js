// Set Ups (#/setups): the leader's board for one side and daypart, matching the Main artboard.
// Header: date chip (day type, tap toggles Game/Practice) · Saved dot · identity chip; title + window +
// FOH/BOH; "8 of 12 placed · 2 flags · carried from Breakfast"; daypart chips. Content: three strips folded
// to one 48 px line each (Lead/Breaks, Keep an eye on, At 1:00) — the whole strip is a button with a
// trailing chevron that expands it in place (component state, not the store) — then the priority rows;
// the first row starts no lower than 470 px so four rows show above the nav. Fill is a bar the shell docks
// above the bottom nav (`Screen.Dock`, like the snackbar): "Fill N open spots" while Needed spots exist,
// hidden while the snackbar or the Fill preview is open, never shown to team members.
// Sheets open from the query string (?sheet=pick|person|fill|lead|develop|at1|dayparts) so the back
// button closes them. Team members (role 'tm') see the same board read-only.
//
//   export default Screen({ store, state, t, route, go });   Screen.Dock = Dock (app.js renders it in .bottom)
//   export function renderPrintable(state, t?) → html for the whole day (More → Print uses it)
import { html, useState, useMemo } from '../../lib/h.js';
import { Header, TitleRow } from '../components/Header.js';
import { Chip, Seg } from '../components/Chip.js';
import { Row } from '../components/Row.js';
import { Fold, Label } from '../components/Card.js';
import { dateLabel, daypartName, tFor } from '../../state/i18n.js';
import { personById } from '../../data/people.js';
import { boardContext, currentDaypartKey, daypartSummaries, hrefFor, firstName, L, DAYPARTS, fmt, fmtRange, leaverLine } from '../sheets/ctx.js';
import PickName from '../sheets/PickName.js';
import FillPreview from '../sheets/FillPreview.js';
import Person from '../sheets/Person.js';
import Lead, { BreakRow } from '../sheets/Lead.js';
import Develop from '../sheets/Develop.js';
import At1 from '../sheets/At1.js';
import DaypartPicker from '../sheets/DaypartPicker.js';

const SHEETS = { pick: PickName, person: Person, fill: FillPreview, lead: Lead, develop: Develop, at1: At1, dayparts: DaypartPicker };

function flagsText(t, n) {
  return n === 1 ? t('flagOne') : (n === 0 ? t('noFlags') : t('flags', { n }));
}

// Which board this phone shows: a team member (or no identity) sees their own side read-only; leaders
// (TL, Trainer, manager) get the FOH/BOH toggle (state.side). The daypart comes from ?dp=, else the clock.
export function resolveBoard(state, route) {
  const me = personById(state.me);
  const readOnly = !me || me.role === 'tm';
  const side = (readOnly && me && me.side) || state.side;
  const q = (route && route.query) || {};
  const dpKey = (q.dp && DAYPARTS[side].some(d => d.key === q.dp)) ? q.dp : currentDaypartKey(state, side);
  return { side, dpKey, readOnly };
}

// ---------- the three folded strips ----------
// "LEAD  Sam · Runner  ·  BREAKS  off Maria, back 11:15 ›" on one line. Expanded: the lead with the rotation
// reason and working spot, the breaks off now and next (cover and a Move control each), the Lead Captain link.
function LeadFold({ ctx, store, state, t, route, readOnly }) {
  const [open, setOpen] = useState(false);
  const [moving, setMoving] = useState(null);
  const { board, names, breaks } = ctx;
  const lead = board.lead;
  const soon = [...breaks.offNow, ...breaks.next];
  const short = breaks.offNow.length
    ? breaks.offNow.map(b => t('offShort', { name: firstName(b.personId, names), t: fmt(b.end) })).join(' · ')
    : (breaks.next.length ? t('nextShort', { name: firstName(breaks.next[0].personId, names), t: fmt(breaks.next[0].start) }) : t('noBreaks'));
  const head = html`<${Label}>${t('leadShort')}</${Label}><span>${lead ? [lead.name, lead.homeName].filter(Boolean).join(' · ') : L(t, 'noTL')}</span><span class="sep">·</span><${Label}>${t('breaks')}</${Label}><span>${short}</span>`;
  return html`<${Fold} open=${open} onToggle=${() => setOpen(!open)} head=${head} cls="lead">
    <div class="row" style="flex-wrap: wrap; row-gap: 2px">
      <${Label}>${t('leadCaptain')}</${Label}>
      ${lead ? html`<span class="tag">TL</span><span class="name">${lead.name}</span><span class="sub">${lead.reason}</span>` : html`<span class="sub">${L(t, 'noTL')}</span>`}
      ${lead && lead.homeName ? html`<span class="sub" style="margin-left: auto">${L(t, 'worksSpot', { slot: lead.homeName })}</span>` : null}
    </div>
    <${Label} style="margin-top: 6px">${t('breaks')}</${Label}>
    ${soon.length
      ? html`<div style="margin: 0 calc(-1 * var(--gutter))">${soon.map(b => html`<${BreakRow} key=${b.personId} b=${b} ctx=${ctx} store=${store} state=${state} t=${t} moving=${moving} setMoving=${setMoving} readOnly=${readOnly} />`)}</div>`
      : html`<span class="sub">${t('noBreaks')}</span>`}
    ${readOnly ? null : html`<a class="fold-link" href=${hrefFor(route, { sheet: 'lead' })}>${t('leadCaptain')} ›</a>`}
  </${Fold}>`;
}

// "KEEP AN EYE ON  Sienna · Emilio · Tobias ›" (first names). Expanded: one reason each and the Develop › link.
function EyeFold({ ctx, t, route }) {
  const [open, setOpen] = useState(false);
  const eye = ctx.board.keepAnEye || [];
  if (!eye.length) return null;
  const head = html`<${Label}>${t('keepAnEye')}</${Label}><span>${eye.map(k => k.name).join(' · ')}</span>`;
  return html`<${Fold} open=${open} onToggle=${() => setOpen(!open)} head=${head} cls="eye">
    ${eye.map(k => html`<span class="l" key=${k.personId}><b>${k.name}</b> · ${k.reason}</span>`)}
    <a class="fold-link" href=${hrefFor(route, { sheet: 'develop' })}>${t('develop')} ›</a>
  </${Fold}>`;
}

// "AT 1:00  3 leave · 1 spot to cover ›". Expanded: the per-person lines and the link to the At 1:00 sheet.
function At1Fold({ ctx, t, route }) {
  const [open, setOpen] = useState(false);
  const at1 = ctx.board.at1;
  if (!at1) return null;
  const n = at1.leavers.length;
  const opens = (at1.opens || []).length;
  const closes = at1.closes.length;
  const summary = [n === 1 ? t('leaveOne') : t('leave', { n }),
    opens ? (opens === 1 ? t('spotToCover') : t('spotsToCover', { n: opens })) : null,
    closes ? (closes === 1 ? t('spotCloses') : t('spotsClose', { n: closes })) : null].filter(Boolean).join(' · ');
  const head = html`<${Label}>${t('at1', { t: at1.label })}</${Label}><span>${summary}</span>`;
  return html`<${Fold} open=${open} onToggle=${() => setOpen(!open)} head=${head} cls="at1">
    ${at1.leavers.map(l => html`<span class="l" key=${l.personId}><b>${l.name}</b> ${leaverLine(t, l, ctx.names, at1)}</span>`)}
    <a class="fold-link" href=${hrefFor(route, { sheet: 'at1' })}>${L(t, 'whoLeaves')} ›</a>
  </${Fold}>`;
}

function DaypartChips({ ctx, state, t, route, side, go }) {
  const list = DAYPARTS[side];
  const i = list.findIndex(d => d.key === ctx.dp.key);
  const from = Math.max(0, Math.min(i - 1, list.length - 3));
  const shown = list.slice(from, from + 3);
  const hasAny = key => Object.keys((state.assignments[side] || {})[key] || {}).some(k => !k.startsWith('__'));
  return html`<div class="row scrollx" style="gap: 8px">
    ${shown.map(d => {
      const on = d.key === ctx.dp.key;
      const done = !on && d.start < ctx.dp.start && hasAny(d.key);
      return html`<${Chip} key=${d.key} tall dark=${on} onClick=${() => go('setups', { dp: d.key })} style=${on ? null : 'color: var(--ink2)'} ariaLabel=${`${daypartName(d.key)} ${fmtRange(d.start, d.end)}`}>${daypartName(d.key)}${done ? ' ✓' : ''}</${Chip}>`;
    })}
    <${Chip} tall onClick=${() => go('setups', { dp: route.query.dp, sheet: 'dayparts' })} style="color: var(--ink2)">${t('daypartAll', { n: list.length })} ▾</${Chip}>
  </div>`;
}

export default function Screen({ store, state, t, route, go }) {
  const [showFolded, setShowFolded] = useState(false);
  const { side, dpKey } = resolveBoard(state, route);
  const ctx = useMemo(() => boardContext({ state, side, daypartKey: dpKey, t }), [state, side, dpKey, t]);
  const { board, readOnly, dp } = ctx;
  const counts = board.counts;
  const isGame = ctx.dayType.type === 'game';
  const dateText = `${dateLabel(state.date, t.lang)} · ${isGame ? t('gameDay') : t('practiceDay')} ▾`;
  const toggleDay = () => store.setDayType(dp.key, isGame ? 'practice' : 'game');
  const close = () => go('setups', { dp: route.query.dp });

  const summary = [
    t('placed', { n: counts.placed, of: counts.expected }),
    html`<span class=${counts.flags ? 'flags' : ''}>${flagsText(t, counts.flags)}</span>`,
    ctx.carriedFrom ? t('carriedFrom', { from: daypartName(ctx.carriedFrom) }) : null,
  ].filter(Boolean);

  const visible = board.rows.filter(r => !r.folded);
  const folded = board.rows.filter(r => r.folded);

  const rowEl = (r) => {
    const a = r.assign;
    const st = r.needed ? 'needed' : (a && a.pending ? 'pending' : (r.folded ? 'folded' : 'plain'));
    const flag = r.flags.length ? r.flags[0].text : null;
    const props = {
      rank: r.rank, pos: r.slot.name, sub: r.subText || null, flag, state: st,
      roleTag: r.roleTag, name: r.name, note: r.note, needLabel: t('needed'),
      score: readOnly ? null : r.scoreChip,
    };
    if (readOnly) return html`<${Row} key=${r.slot.id} ...${props} />`;
    const pickHref = hrefFor(route, { sheet: 'pick', slot: r.slot.id });
    const href = r.personId ? hrefFor(route, { sheet: 'person', id: r.personId, slot: r.slot.id }) : pickHref;
    const onFlag = r.flags.length ? () => go('setups', { dp: route.query.dp, sheet: 'pick', slot: r.slot.id, flag: r.flags[0].kind }) : null;
    return html`<${Row} key=${r.slot.id} ...${props} href=${href} onFlag=${onFlag} />`;
  };

  const SheetView = route.query.sheet ? SHEETS[route.query.sheet] : null;

  return html`
    <${Header} state=${state} store=${store} t=${t} dateLabel=${dateText} onDate=${readOnly ? null : toggleDay}>
      <${TitleRow} title=${daypartName(dp.key)} sub=${fmtRange(dp.start, dp.end)}
        right=${readOnly
          ? html`<${Chip}>${side.toUpperCase()}</${Chip}>`
          : html`<${Seg} value=${side} options=${[['foh', 'FOH'], ['boh', 'BOH']]} onChange=${s => store.setSide(s)} label=${t('side')} />`} />
      <div class="summary">${summary.map((s, i) => html`${i ? ' · ' : ''}${s}`)}</div>
      <${DaypartChips} ctx=${ctx} state=${state} t=${t} route=${route} side=${side} go=${go} />
    </${Header}>
    <div class="content" style="display: flex; flex-direction: column; gap: 8px; padding-top: 8px">
      ${readOnly ? html`<div class="pad"><span class="sub">${L(t, 'readOnlyBoard')}</span></div>` : null}
      <${LeadFold} ctx=${ctx} store=${store} state=${state} t=${t} route=${route} readOnly=${readOnly} />
      ${readOnly ? null : html`<${EyeFold} ctx=${ctx} t=${t} route=${route} />`}
      <${At1Fold} ctx=${ctx} t=${t} route=${route} />
      <div class="row" style="padding: 2px 16px 0">
        <${Label}>${t('positionsPriority')}</${Label}>
        <span class="grow"></span>
        <span class="sub" style="text-align: right">${t('onShift', { n: counts.onShift })}${readOnly ? '' : ` · ${t('tapName')}`}</span>
      </div>
      <div class="rows">
        ${visible.map(rowEl)}
        ${showFolded ? folded.map(rowEl) : null}
      </div>
      ${folded.length ? html`<button type="button" class="textbtn" style="margin: 0 16px; align-self: flex-start; min-height: 44px" onClick=${() => setShowFolded(!showFolded)}>
        ${showFolded ? t('lessSpots') : t('moreSpots', { n: folded.length })}
      </button>` : null}
    </div>
    ${SheetView && !(readOnly && route.query.sheet !== 'dayparts' && route.query.sheet !== 'at1')
      ? html`<${SheetView} ctx=${ctx} store=${store} state=${state} t=${t} route=${route} go=${go} close=${close} />`
      : null}`;
}

// The Fill bar. app.js renders Screen.Dock inside .bottom, above the snackbar and the nav, so it is docked
// exactly like the snackbar: a full-width red 48 px "Fill N open spots". Null for team members, while the
// snackbar shows, while the Fill preview is open, and when nothing is Needed.
export function Dock({ state, t, route }) {
  const { side, dpKey, readOnly } = resolveBoard(state, route);
  const ctx = useMemo(() => boardContext({ state, side, daypartKey: dpKey, t }), [state, side, dpKey, t]);
  if (readOnly || state.toast || route.query.sheet === 'fill') return null;
  const n = ctx.board.counts.needed;
  if (!(n > 0)) return null;
  return html`<div class="fillbar"><a class="btn block" href=${hrefFor(route, { sheet: 'fill' })}>${n === 1 ? t('fillOne') : t('fill', { n })}</a></div>`;
}
Screen.Dock = Dock;

// ---------- print view (More → Print) ----------
// renderPrintable(state, t?) → html for the whole day: every daypart of both sides, rows with names.
export function renderPrintable(state, t = tFor(state.lang || 'en')) {
  const sides = ['foh', 'boh'];
  return html`<div class="print-day" style="padding: 16px; background: #fff; color: var(--ink)">
    <h1 style="font-size: 22px; font-weight: 700; margin-bottom: 4px">${L(t, 'printTitle', { date: dateLabel(state.date, t.lang) })}</h1>
    <p class="sub" style="margin-bottom: 12px">${t('sample')}</p>
    ${sides.map(side => html`
      <section key=${side} style="margin-bottom: 18px">
        <h2 style="font-size: 18px; font-weight: 700; margin: 10px 0 6px">${side.toUpperCase()}</h2>
        ${daypartSummaries(state, side, t).map(s => {
          const rows = s.ctx.board.rows.filter(r => r.personId || r.needed);
          const lead = s.ctx.board.lead;
          return html`<div key=${s.key} style="margin-bottom: 10px; break-inside: avoid">
            <div class="row" style="gap: 8px; margin-bottom: 4px">
              <span style="font-size: 15px; font-weight: 600">${s.name}</span>
              <span class="sub">${fmtRange(s.dp.start, s.dp.end)}</span>
              <span class="sub">· ${t('placed', { n: s.placed, of: s.expected })}</span>
              ${lead ? html`<span class="sub">· ${t('leadCaptain')}: ${lead.name}</span>` : null}
            </div>
            ${rows.length ? html`<table style="width: 100%; border-collapse: collapse; font-size: 13px">
              <tbody>${rows.map(r => html`<tr key=${r.slot.id} style="border-top: 1px solid var(--line)">
                <td style="padding: 3px 6px 3px 0; width: 24px; color: var(--ink3)">${r.rank}</td>
                <td style="padding: 3px 6px 3px 0">${r.slot.name}${r.subText ? html`<span class="sub"> · ${r.subText}</span>` : ''}</td>
                <td style="padding: 3px 0; text-align: right; font-weight: 500">${r.personId ? html`${r.roleTag ? html`<span class="tag" style="margin-right: 6px">${r.roleTag}</span>` : null}${r.name}${r.note ? html`<span class="sub"> · ${r.note}</span>` : ''}` : html`<span class="red">${t('needed')}</span>`}</td>
              </tr>`)}</tbody>
            </table>` : html`<span class="sub">${L(t, 'empty')}</span>`}
          </div>`;
        })}
      </section>`)}
  </div>`;
}
