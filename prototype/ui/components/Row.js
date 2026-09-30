// The position row from the Main artboard.
//   html`<${Row} rank=${3} pos="Drinks 1" state="needed" needLabel=${t('needed')} onClick=${...} />`
//   html`<${Row} rank=${1} pos="iPOS 1" sub="Captain · outside" roleTag="TRAINER" name="Maria" note=${html`on break · back 11:15<br/>Harper covering`} href="#/setups?sheet=person&id=p-maria" />`
//   html`<${Row} rank=${6} pos="iPOS 2" sub="outside" name="Tobias" score=${{ score: 2.8, tier: 'crushing' }} note="on till 3:00" flag="outside all Breakfast · swap ›" onFlag=${...} onClick=${...} />`
//   state: 'plain' (default) | 'needed' | 'pending' | 'folded'
// The whole row is one <button> (onClick) or <a> (href). A tap on the flag pill calls onFlag instead
// of onClick when onFlag is given (no nested interactive elements).
import { html } from '../../lib/h.js';
import { Flag } from './Flag.js';
import { ScoreChip } from './ScoreChip.js';

export function Row({ rank, pos, sub, flag, onFlag, state = 'plain', roleTag, score, name, note, needLabel = 'Needed', href, onClick, ariaLabel, cls = '' }) {
  const needed = state === 'needed';
  const pending = state === 'pending';
  const classes = ['prow', needed && 'need', pending && 'pend', state === 'folded' && 'folded', cls].filter(Boolean).join(' ');

  const handle = (e) => {
    if (onFlag && e.target && e.target.closest && e.target.closest('[data-flag]')) { e.preventDefault(); e.stopPropagation(); onFlag(e); return; }
    if (onClick) onClick(e);
  };

  const left = html`<span class="left">
    <span><span class="rank">${rank}</span><span class="pos">${pos}</span></span>
    ${sub ? html`<span class="sub">${sub}</span>` : null}
    ${flag ? html`<${Flag} text=${flag} />` : null}
  </span>`;

  const who = needed
    ? html`<span class="name need">${needLabel}</span>`
    : html`<span class="who">
        ${roleTag ? html`<span class="tag">${roleTag}</span>` : null}
        ${score && score.score != null ? html`<span class=${'name' + (pending ? ' pend' : '')}>${name}</span><${ScoreChip} ...${score} />` : html`<span class=${'name' + (pending ? ' pend' : '')}>${name}</span>`}
      </span>`;

  const right = html`<span class="right">${who}${note ? html`<span class="note">${note}</span>` : null}</span>`;

  if (href) return html`<a class=${classes} href=${href} onClick=${handle} aria-label=${ariaLabel}>${left}${right}</a>`;
  if (onClick || onFlag) return html`<button class=${classes} type="button" onClick=${handle} aria-label=${ariaLabel}>${left}${right}</button>`;
  return html`<div class=${classes}>${left}${right}</div>`;
}

// A person row for sheets (PickName artboard): score chip or role tag, name, meta on the right.
//   html`<${PersonRow} name="Rafael" score=${{ score: 2.9 }} meta="Crushing It on Drinks · 11:00–5:30" onClick=${...} />`
export function PersonRow({ name, score, roleTag, meta, on, href, onClick, cls = '', ariaLabel }) {
  const classes = ['person', on && 'on', cls].filter(Boolean).join(' ');
  const body = html`
    ${roleTag ? html`<span class="tag">${roleTag}</span>` : (score ? html`<${ScoreChip} showEmpty ...${score} />` : null)}
    <span class="n">${name}</span>
    ${meta ? html`<span class="m">${meta}</span>` : null}`;
  if (href) return html`<a class=${classes} href=${href} aria-label=${ariaLabel}>${body}</a>`;
  if (onClick) return html`<button class=${classes} type="button" onClick=${onClick} aria-label=${ariaLabel} aria-pressed=${on != null ? String(!!on) : null}>${body}</button>`;
  return html`<div class=${classes}>${body}</div>`;
}

export default Row;
