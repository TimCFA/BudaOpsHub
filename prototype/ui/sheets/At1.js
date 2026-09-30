// "At 1:00" sheet: everyone who leaves mid-daypart, grouped by time, with who takes over and
// which spots are open to cover from then on (tappable: pick sheet) and which close.
import { html } from '../../lib/h.js';
import { Sheet, SheetSection } from '../components/Sheet.js';
import { PersonRow } from '../components/Row.js';
import { daypartName } from '../../state/i18n.js';
import { L, firstName, hrefFor, fmt, leaverLine } from './ctx.js';

export default function At1({ ctx, store, state, t, route, go, close }) {
  const { dp, board, names, readOnly } = ctx;
  const at1 = board.at1;
  if (!at1) return html`<${Sheet} open title=${t('at1', { t: '' }).trim()} onClose=${close}><div class="pad" style="padding-bottom: 12px"><span class="sub">—</span></div></${Sheet}>`;

  const rowOf = pid => board.rows.find(r => r.personId === pid) || null;
  const lineFor = (pid, leavers) => {
    const main = (leavers || []).find(l => l.personId === pid);
    if (main) return leaverLine(t, main, names, at1);
    const row = rowOf(pid);
    if (!row) return `${t('leaves')} · ${t('notPlacedYet')}`;
    const to = row.assign && row.assign.handoffTo;
    return `${t('leaves')} · ${row.slot.name}${to ? ` → ${firstName(to, names)}` : ''}`;
  };

  const groups = at1.all && at1.all.length ? at1.all : [{ time: at1.time, label: at1.label, personIds: at1.leavers.map(l => l.personId) }];
  const n = at1.leavers.length;
  const opens = at1.opens || [];
  const closes = at1.closes.length;
  const sub = [n === 1 ? t('leaveOne') : t('leave', { n }),
    opens.length ? (opens.length === 1 ? t('spotToCover') : t('spotsToCover', { n: opens.length })) : null,
    closes ? (closes === 1 ? t('spotCloses') : t('spotsClose', { n: closes })) : null,
    L(t, 'spotsAfter', { n: at1.headcountAfter })].filter(Boolean).join(' · ');

  return html`<${Sheet} open title=${t('at1', { t: at1.label })} sub=${`${daypartName(dp.key)} · ${sub}`} onClose=${close}>
    ${groups.map(g => html`
      <${SheetSection} key=${g.time} label=${`${t('at1', { t: g.label })} · ${g.personIds.length === 1 ? t('leaveOne') : t('leave', { n: g.personIds.length })}`} />
      ${g.personIds.map(pid => {
        const row = rowOf(pid);
        const props = { name: firstName(pid, names), meta: lineFor(pid, g.time === at1.time ? at1.leavers : null), roleTag: row ? row.roleTag : null };
        if (!readOnly && row) return html`<${PersonRow} key=${pid} ...${props} href=${hrefFor(route, { sheet: 'person', id: pid, slot: row.slot.id })} />`;
        return html`<${PersonRow} key=${pid} ...${props} />`;
      })}`)}
    ${opens.length ? html`
      <${SheetSection} label=${opens.length === 1 ? t('spotToCover') : t('spotsToCover', { n: opens.length })} />
      ${opens.map(c => {
        const props = { name: c.name, meta: `${t('openFrom', { t: at1.label })} · ${t('needed')}`, roleTag: null };
        if (!readOnly) return html`<${PersonRow} key=${c.slotId} ...${props} href=${hrefFor(route, { sheet: 'pick', slot: c.slotId })} />`;
        return html`<${PersonRow} key=${c.slotId} ...${props} />`;
      })}` : null}
    ${at1.closes.length ? html`
      <${SheetSection} label=${closes === 1 ? t('spotCloses') : t('spotsClose', { n: closes })} />
      <div class="pad" style="padding-bottom: 12px; display: flex; flex-direction: column; gap: 4px">
        ${at1.closes.map(c => html`<span key=${c.slotId} style="font-size: 14px">${c.name} · ${t('closes')} ${fmt(at1.time)}</span>`)}
      </div>` : null}
  </${Sheet}>`;
}
