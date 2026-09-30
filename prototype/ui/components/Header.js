// The white header block: date chip · sync dot · identity chip, then whatever the screen puts under it
// (title row, summary, chips, Fill button). Sticky at the top of the column.
//   html`<${Header} state=${state} store=${store} t=${t} dateLabel="Sat, Oct 3 · Game Day ▾" onDate=${...}>
//     <${TitleRow} title="Lunch" sub="11:00–2:00" right=${html`<${Seg} … />`} />
//     <div class="summary">8 of 13 placed · <span class="flags">2 flags</span> · carried from Breakfast</div>
//   </${Header}>`
// Props: dateLabel (default 'Sat, Oct 3 · 10:52'), onDate (makes the date chip a button), dateHref,
// hideIdentity, identityHref (default '#/more'), syncText (override the Saved/Saving…/Offline text), children.
import { html } from '../../lib/h.js';
import { Chip } from './Chip.js';
import { dateLabel as fmtDate } from '../../state/i18n.js';
import { fmt } from '../../rules/time.js';
import { personById } from '../../data/people.js';

export function SyncDot({ syncState = 'saved', text, t = (k) => k }) {
  const label = text != null ? text : t(syncState === 'saving' ? 'saving' : (syncState === 'offline' ? 'offline' : 'saved'));
  return html`<span class="sync" aria-live="polite"><span class=${'dot ' + (syncState === 'saving' ? 'saving' : (syncState === 'offline' ? 'offline' : ''))}></span>${label}</span>`;
}

export function TitleRow({ title, sub, right, cls = '' }) {
  // Title and sub wrap together: the sub sits inline when it fits and drops under the title when not.
  return html`<div class=${'row ' + cls}>
    <span class="title-wrap">
      <h1 class="title">${title}</h1>
      ${sub ? html`<span class="title-sub">${sub}</span>` : null}
    </span>
    ${right}
  </div>`;
}

export function Header({ state, t = (k) => k, dateLabel, onDate, dateHref, hideIdentity, identityHref = '#/more', syncText, children, cls = '' }) {
  const s = state || {};
  const me = personById(s.me);
  const meName = me ? me.first : (s.me || '');
  const dateText = dateLabel != null ? dateLabel : `${fmtDate(s.date, s.lang)} · ${fmt(s.now)}`;
  return html`<header class=${'hdr ' + cls}>
    <div class="row">
      ${onDate || dateHref
        ? html`<${Chip} tall onClick=${onDate} href=${dateHref} ariaLabel=${t('dateAria')}>${dateText}</${Chip}>`
        : html`<${Chip}>${dateText}</${Chip}>`}
      <span class="grow"></span>
      <${SyncDot} syncState=${s.syncState} text=${syncText} t=${t} />
      ${hideIdentity ? null : html`<${Chip} line href=${identityHref} ariaLabel=${t('identityAria', { name: meName })}>${meName} ▾</${Chip}>`}
    </div>
    ${children}
  </header>`;
}

export default Header;
