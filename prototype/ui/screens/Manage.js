// Manage (More → Manage, after the PIN sheet): a read-only mock of what phone Manage would hold —
// uploads with their freshness, the daily waste limit, products, home text and close-out.
// Uploads themselves happen from the office desktop (ASSUMPTIONS 10). Rendered by More.js when
// the route is #/more?page=manage; nothing here writes to the store.
import { html } from '../../lib/h.js';
import { Chip } from '../components/Chip.js';
import { Card, Label, Callout } from '../components/Card.js';
import { Icon } from '../components/Icons.js';
import { SyncDot } from '../components/Header.js';
import { dateLabel } from '../../state/i18n.js';
import { daysBetween } from '../../rules/time.js';
import { personById } from '../../data/people.js';
import { productsFor } from '../../data/products.js';

// Sample upload log (invented dates around the sample day; every number here is fake).
const UPLOADS = [
  { key: 'roster',   name: 'Roster',    es: 'Rol',       at: '2026-10-02', every: 7,  from: 'HotSchedules export' },
  { key: 'cem',      name: 'CEM',       es: 'CEM',       at: '2026-09-28', every: 7,  from: 'weekly report' },
  { key: 'pea',      name: 'PEA',       es: 'PEA',       at: '2026-09-30', every: 14, from: 'leader ratings' },
  { key: 'salesmix', name: 'Sales Mix', es: 'Sales Mix', at: '2026-09-19', every: 7,  from: 'weekly report' },
];

export default function Manage({ state, t, go }) {
  const es = (t.lang || state.lang) === 'es';
  const L = (en, esText) => (es ? esText : en);
  const me = personById(state.me);
  const foh = productsFor('foh');
  const boh = productsFor('boh');
  const zeroCosts = foh.concat(boh).every(p => !(Number(p.cost) > 0));

  const row = (label, value, sub) => html`<div class="row" style="min-height: 44px; border-top: 1px solid var(--line); padding: 6px 0">
    <span class="col" style="gap: 1px; min-width: 0">
      <span style="font-size: 16px; font-weight: 500">${label}</span>
      ${sub ? html`<span class="sub">${sub}</span>` : null}
    </span>
    <span class="grow"></span>
    <span style="font-size: 13px; color: var(--ink2); text-align: right; flex-shrink: 0; max-width: 50%">${value}</span>
  </div>`;

  return html`
    <header class="hdr">
      <div class="row">
        <button type="button" class="iconbtn" onClick=${() => go('more')} aria-label=${t('back')}><${Icon} name="back" /></button>
        <h1 class="title" style="font-size: 22px">${t('manage')}</h1>
        <span class="grow"></span>
        <${SyncDot} syncState=${state.syncState} t=${t} />
        <${Chip} line><${Icon} name="lock" size=${16} />${me ? me.first : ''}</${Chip}>
      </div>
      <div class="summary">${L('Read-only mock · PIN accepted', 'Solo lectura (mock) · PIN aceptado')}</div>
    </header>

    <div class="stack">
      <${Callout} head=${L('What phone Manage would hold', 'Lo que tendría Administrar en el teléfono')}>${t('manageWould')}</${Callout}>

      <${Card} rounded>
        <${Label}>${L('Uploads · what’s due', 'Cargas · lo que falta')}</${Label}>
        <div class="sub">${L('Uploads happen from the office desktop; the phone only shows how fresh each one is.', 'Las cargas se hacen desde la oficina; el teléfono solo muestra qué tan reciente es cada una.')}</div>
        ${UPLOADS.map(u => {
          const days = daysBetween(u.at, state.date);
          const due = days != null && days > u.every;
          return html`<div class="row" key=${u.key} style="min-height: 48px; border-top: 1px solid var(--line); padding: 6px 0">
            <span class="col" style="gap: 1px; min-width: 0">
              <span style="font-size: 16px; font-weight: 500">${es ? u.es : u.name}</span>
              <span class="sub">${dateLabel(u.at, t.lang)} · ${days === 0 ? t('todayLower') : days === 1 ? t('yesterday') : L(`${days} days ago`, `hace ${days} días`)} · ${L(u.from, u.from)}</span>
            </span>
            <span class="grow"></span>
            ${due
              ? html`<${Chip} small amber>${L(`due · every ${u.every} days`, `falta · cada ${u.every} días`)}</${Chip}>`
              : html`<${Chip} small style="background: var(--green-bg); color: var(--green)">${L('fresh', 'al día')}</${Chip}>`}
          </div>`;
        })}
      </${Card}>

      <${Card} rounded>
        <${Label}>${L('Today’s basics', 'Lo básico de hoy')}</${Label}>
        ${row(L('Daily waste limit', 'Límite diario de desperdicio'), L(`${state.waste.limitPerDay} entries`, `${state.waste.limitPerDay} registros`), L('counts until item costs exist', 'en piezas hasta que haya costos'))}
        ${row(L('Products', 'Productos'), `${foh.length} FOH · ${boh.length} BOH`, zeroCosts ? L('every cost is 0 · $ view off', 'todos los costos en 0 · vista en $ apagada') : null)}
        ${row(L('Day type today', 'Tipo de día hoy'), Object.keys(state.dayTypes || {}).length ? t('leaderOverride') : L('calendar rule (Sat = Game Day)', 'regla del calendario (sáb = Día de juego)'), L('leaders override per daypart from the date chip', 'los líderes lo cambian por bloque desde la fecha'))}
      </${Card}>

      <${Card} rounded>
        <${Label}>${L('Home text · Store', 'Texto de inicio · Tienda')}</${Label}>
        ${row(L('Wins of the week', 'Logros de la semana'), L('3 lines', '3 líneas'), L('shown under More › Store', 'se ve en Más › Tienda'))}
        ${row(L('Vision & values', 'Visión y valores'), L('unchanged', 'sin cambios'), null)}
      </${Card}>

      <${Card} rounded>
        <${Label}>${L('Close-out', 'Cierre')}</${Label}>
        ${row(L('Safe count', 'Conteo de caja'), L('leaders only', 'solo líderes'), null)}
        ${row(L('Waste total vs limit', 'Desperdicio total vs límite'), `${state.waste.entries.length} / ${state.waste.limitPerDay}`, null)}
        ${row(L('Tasks done today', 'Tareas hechas hoy'), String(Object.values(state.tasks.done || {}).filter(x => x && x.complete).length), null)}
        ${row(L('Notes for the opener', 'Notas para quien abre'), L('free text', 'texto libre'), null)}
      </${Card}>

      <div class="sub" style="padding: 0 4px 8px">${t('sample')}</div>
    </div>`;
}
