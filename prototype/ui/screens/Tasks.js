// Tasks (#/tasks): Now / Zone reset / Food safety / Transition (Tasks artboard).
// Now = the tasks due on the clock (DUE NOW card: time and duration, owner spot and who is on it,
// bilingual title, progress for this task, whole-row checklist buttons, Mark done), then Next.
// Zone reset = the zone checklists for the reset window on the clock, one zone open at a time.
// Food safety and Transition keep the current app's content (placeholders here).
// The tab lives in the query string (#/tasks?tab=zone) so the back button returns to Now.
import { html, useState } from '../../lib/h.js';
import { Header, TitleRow } from '../components/Header.js';
import { Chip } from '../components/Chip.js';
import { Card, Label } from '../components/Card.js';
import { Icon } from '../components/Icons.js';
import { daypartName } from '../../state/i18n.js';
import { fmt, fmtRange } from '../../rules/time.js';
import { daypartAt } from '../../rules/dayparts.js';
import { TASKS, dueNow, nextTasks, checklistProgress } from '../../rules/tasks.js';
import { CHECKLISTS, FINAL_CHECK, CHECKLISTS_BY_KEY, zoneWindowAt } from '../../data/checklists.js';
import { personById } from '../../data/people.js';
import { boardFor } from './MiPuesto.js';

const TABS = ['now', 'zone', 'food', 'transition'];

function itemsOf(task) {
  if (!task) return [];
  if (Array.isArray(task.items) && task.items.length) return task.items;
  const cl = task.checklist ? CHECKLISTS_BY_KEY[task.checklist] : null;
  return cl ? cl.items : [];
}

// One bilingual checklist row: the whole row is the button, the 30 px box shows the tick.
function Step({ item, done, es, onToggle }) {
  return html`<button type="button" class=${'step' + (done ? ' done' : '')} onClick=${onToggle} aria-pressed=${String(!!done)}>
    <span class=${'box' + (done ? ' on' : '')}>${done ? html`<${Icon} name="check" size=${16} />` : null}</span>
    <span class="col" style="gap: 1px">
      <span class="en">${es ? item.es || item.en : item.en}</span>
      <span class="es">${es ? item.en : item.es}</span>
    </span>
  </button>`;
}

function Progress({ done, total, t }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return html`<div class="row" style="padding: 4px 0 2px">
    <span class="progress" role="progressbar" aria-valuenow=${done} aria-valuemin="0" aria-valuemax=${total}><span style=${`width: ${pct}%`}></span></span>
    <span style="font-size: 13px; font-weight: 600; color: var(--ink2); white-space: nowrap">${t('progress', { done, total })}</span>
  </div>`;
}

// The DUE NOW card: one task, its owner spot and holder, bilingual title, progress, steps, Mark done.
function TaskCard({ task, store, t, es, holder }) {
  const L = (en, esText) => (es ? esText : en);
  const items = itemsOf(task);
  const ts = store.taskState(task.id);
  const prog = checklistProgress(items, ts.items);
  const by = ts.by ? (personById(ts.by) || {}).first || ts.by : null;
  return html`<${Card} rounded>
    <div class="row" style="flex-wrap: wrap; row-gap: 2px">
      <${Chip} small red>${t('dueNow')}</${Chip}>
      <span style="font-size: 13px; color: var(--ink3); white-space: nowrap">${fmt(task.at)} · ${es ? (task.minsEs || task.mins) : task.mins}</span>
      <span style="font-size: 13px; color: var(--ink3); text-align: right; margin-left: auto; min-width: 0">${t('owner', { slot: task.owner, name: holder })}</span>
    </div>
    <div style="font-size: 20px; font-weight: 700">${es ? task.es : task.name}</div>
    <div style="font-size: 13px; color: var(--ink2)">${es ? task.name : task.es}</div>
    ${items.length ? html`
      <${Progress} done=${prog.done} total=${prog.total} t=${t} />
      <div style="display: flex; flex-direction: column">
        ${items.map((it, i) => html`<${Step} key=${i} item=${it} es=${es} done=${ts.items.includes(i)} onToggle=${() => store.toggleChecklist(task.id, i)} />`)}
      </div>` : null}
    ${ts.complete
      ? html`<div class="row" style="min-height: 44px">
          <span style="font-size: 14px; color: var(--green); font-weight: 600">${t('done')}${by ? ` · ${by}` : ''}${ts.at != null ? ` · ${fmt(ts.at)}` : ''}</span>
          <span class="grow"></span>
          <button type="button" class="textbtn" onClick=${() => store.resetTask(task.id)}>${L('Reopen', 'Reabrir')}</button>
        </div>`
      : html`<button type="button" class="btn block" style="margin-top: 4px" onClick=${() => store.markTaskDone(task.id, items.length)}>${t('markDone')}</button>`}
  </${Card}>`;
}

function NextRow({ task, es }) {
  return html`<div class="next">
    <span class="t">${fmt(task.at)}</span>
    <span style="min-width: 0">${es ? task.es : task.name}</span>
    <span class="m">${es ? (task.minsEs || task.mins) : task.mins} · ${task.owner}</span>
  </div>`;
}

// One zone checklist as an accordion card; `taskKey` scopes its progress to the reset window.
function ZoneCard({ cl, taskKey, open, onOpen, store, t, es }) {
  const ts = store.taskState(taskKey);
  const prog = checklistProgress(cl.items, ts.items);
  return html`<div class="card rounded" style="gap: 0; padding-top: 4px; padding-bottom: 4px">
    <button type="button" class="row" style="min-height: 48px; width: 100%; text-align: left" onClick=${onOpen} aria-expanded=${String(open)}>
      <span class="col" style="gap: 1px; min-width: 0">
        <span style="font-size: 16px; font-weight: 600">${es ? cl.es : cl.zone}</span>
        <span style="font-size: 13px; color: var(--ink2)">${es ? cl.zone : cl.es}</span>
      </span>
      <span class="grow"></span>
      <span style=${`font-size: 13px; font-weight: 600; white-space: nowrap; color: ${prog.done === prog.total ? 'var(--green)' : 'var(--ink3)'}`}>${t('progress', { done: prog.done, total: prog.total })}</span>
      <${Icon} name=${open ? 'chevronDown' : 'chevron'} size=${20} cls="muted" />
    </button>
    ${open ? html`
      <${Progress} done=${prog.done} total=${prog.total} t=${t} />
      <div style="display: flex; flex-direction: column">
        ${cl.items.map((it, i) => html`<${Step} key=${i} item=${it} es=${es} done=${ts.items.includes(i)} onToggle=${() => store.toggleChecklist(taskKey, i)} />`)}
      </div>
      ${prog.done === prog.total ? null : html`<button type="button" class="btn block alt" style="margin: 8px 0 6px" onClick=${() => store.markTaskDone(taskKey, cl.items.length)}>${t('markDone')}</button>`}` : null}
  </div>`;
}

export default function Screen({ store, state, t, route, go }) {
  const es = (t.lang || state.lang) === 'es';
  // Zone reset window title from the daypart names ('Breakfast → Lunch'), the same words as every other screen.
  const winTitle = w => (w.into ? `${daypartName(w.daypartKey, t.lang)} → ${daypartName(w.into, t.lang)}` : daypartName(w.daypartKey, t.lang));
  const L = (en, esText) => (es ? esText : en);
  const now = state.now;
  const tab = TABS.includes(route && route.query && route.query.tab) ? route.query.tab : 'now';
  const setTab = k => go('tasks', k === 'now' ? {} : { tab: k });
  const strict = daypartAt('foh', now);
  const [openZone, setOpenZone] = useState(CHECKLISTS[0].key);

  // The FOH board on the clock, to name who holds a task's owner spot (strict daypart, then the
  // look-ahead one when the strict one has nobody there yet).
  const boardNow = boardFor({ state, store, side: 'foh', daypartKey: strict.key });
  const ahead = store.currentDaypart('foh');
  const boardAhead = ahead.key !== strict.key ? boardFor({ state, store, side: 'foh', daypartKey: ahead.key }) : null;
  const holderOf = (ownerName) => {
    for (const b of [boardNow, boardAhead]) {
      if (!b) continue;
      const row = b.board.rows.find(r => r.slot.name === ownerName && r.personId);
      if (row) {
        const brk = row.note && /back/.test(row.note) ? row.note : null;
        return brk ? `${row.name} · ${t('onBreak')}` : row.name;
      }
    }
    return t('unassigned');
  };

  const due = dueNow(TASKS, now);
  const next = nextTasks(TASKS, now, 3);

  // ---- Zone reset: the window on the clock; progress is kept per window + zone ----
  const win = zoneWindowAt(now);
  const lists = CHECKLISTS.concat([FINAL_CHECK]);
  const zoneKey = cl => `zone:${win ? win.key : 'none'}:${cl.key}`;

  const placeholder = (label, en, esText) => html`<${Card} rounded>
    <${Label}>${label}</${Label}>
    <p style="font-size: 15px; line-height: 21px">${L(en, esText)}</p>
    <p class="sub">${L('Kept from the current app; not rebuilt in this prototype.', 'Se mantiene de la app actual; no se rehizo en este prototipo.')}</p>
  </${Card}>`;

  return html`
    <${Header} state=${state} store=${store} t=${t}>
      <${TitleRow} title=${t('tasks')} sub=${`· ${es ? 'Tasks' : 'Tareas'}`} right=${html`<${Chip} small>${daypartName(strict, t.lang)} · FOH</${Chip}>`} />
      <div class="row scrollx">
        <${Chip} tall on=${tab === 'now'} onClick=${() => setTab('now')}>${t('now')}</${Chip}>
        <${Chip} tall on=${tab === 'zone'} onClick=${() => setTab('zone')}>${t('zoneReset')}</${Chip}>
        <${Chip} tall on=${tab === 'food'} onClick=${() => setTab('food')}>${t('foodSafety')}</${Chip}>
        <${Chip} tall on=${tab === 'transition'} onClick=${() => setTab('transition')}>${t('transition')}</${Chip}>
      </div>
    </${Header}>

    <div class="stack">
      ${tab === 'now' ? html`
        ${due.length ? due.map(task => html`<${TaskCard} key=${task.id} task=${task} store=${store} t=${t} es=${es} holder=${holderOf(task.owner)} />`) : html`<${Card} rounded>
          <${Label}>${t('now')} · ${fmt(now)}</${Label}>
          <p style="font-size: 17px; font-weight: 500">${t('nothingDue')}</p>
          <p class="sub">${L('Tasks belong to a spot: Restrooms → Host 1, Restock → Host 2, Trash → Runner, Lemonades → Drinks 1.', 'Las tareas son de un puesto: Baños → Host 1, Reponer → Host 2, Basura → Runner, Limonadas → Drinks 1.')}</p>
        </${Card}>`}
        ${next.length ? html`<${Label}>${t('nextUp')}</${Label}>${next.map(task => html`<${NextRow} key=${task.id} task=${task} es=${es} />`)}` : null}` : null}

      ${tab === 'zone' ? html`
        <div class="panel">
          <span class="col" style="gap: 2px">
            <span style="font-size: 15px; font-weight: 600">${win ? `${winTitle(win)} · ${fmtRange(win.start, win.end)}` : L('No reset window left today', 'Ya no queda ventana de reset hoy')}</span>
            <span class="sub">${win && now < win.start ? `${L('opens at', 'abre a las')} ${fmt(win.start)} · ` : ''}${t('oneWindow')}</span>
          </span>
        </div>
        ${lists.map(cl => html`<${ZoneCard} key=${cl.key} cl=${cl} taskKey=${zoneKey(cl)} open=${openZone === cl.key} onOpen=${() => setOpenZone(openZone === cl.key ? null : cl.key)} store=${store} t=${t} es=${es} />`)}` : null}

      ${tab === 'food' ? placeholder(t('foodSafety'),
        'The food safety walkthrough (bilingual questions, 44 px Yes / No answers, temperatures) keeps the current app’s content and order.',
        'El recorrido de seguridad alimentaria (preguntas bilingües, respuestas Sí / No de 44 px, temperaturas) mantiene el contenido y el orden de la app actual.') : null}

      ${tab === 'transition' ? placeholder(t('transition'),
        'The leader transition list and the safe count keep the current app’s content. On the board, Transition is folded into Lunch and the “At 1:00” strip.',
        'La lista de transición de líderes y el conteo de caja mantienen el contenido de la app actual. En el tablero, Transición va dentro de Lunch y de la tira “A la 1:00”.') : null}
    </div>`;
}
