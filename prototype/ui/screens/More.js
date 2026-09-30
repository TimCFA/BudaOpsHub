// More (#/more): Who's using this phone (roster pick), English / Español, Demo clock presets,
// FOH / BOH, Manage (PIN sheet → Manage.js page), Structure & assumptions (docs/ASSUMPTIONS.md
// rendered with a tiny Markdown converter), Print (SetUps.js renderPrintable when it exists,
// else the board as a table) and Reset demo data. Sheets and pages live in the query string
// (#/more?sheet=who · ?sheet=pin · ?sheet=reset · ?page=manage · ?page=structure) so the back
// button closes them.
import { html, useState, useEffect } from '../../lib/h.js';
import { Header, TitleRow } from '../components/Header.js';
import { Chip, Seg } from '../components/Chip.js';
import { Card, Label, Callout } from '../components/Card.js';
import { Sheet, SheetSection } from '../components/Sheet.js';
import { PersonRow } from '../components/Row.js';
import { Icon } from '../components/Icons.js';
import { SyncDot } from '../components/Header.js';
import { t as tIn, roleTag as roleTagOf, dateLabel, daypartName } from '../../state/i18n.js';
import { PEOPLE, personById } from '../../data/people.js';
import { rosterFor } from '../../data/roster.js';
import { fmt, fmtRange } from '../../rules/time.js';
import { DAYPARTS } from '../../rules/dayparts.js';
import { entryMinutes } from '../../rules/roster.js';
import { dayTypeLabel } from '../../rules/gameday.js';
import Manage from './Manage.js';
import { boardFor } from './MiPuesto.js';

const ASSUMPTIONS_URL = './docs/ASSUMPTIONS.md';

// ---------- tiny Markdown → preact (headings, lists, paragraphs, **bold**, `code`) ----------

function inline(text) {
  const parts = String(text).split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**')) return html`<b key=${i}>${p.slice(2, -2)}</b>`;
    if (p.startsWith('`') && p.endsWith('`')) return html`<code key=${i} style="font-size: 13px; background: var(--chip); padding: 1px 4px; border-radius: 4px">${p.slice(1, -1)}</code>`;
    return p;
  });
}

export function renderMarkdown(md) {
  const lines = String(md || '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let para = [];
  let list = null; // { ordered, items: [] }
  let key = 0;
  const flushPara = () => { if (para.length) { out.push(html`<p key=${key++} style="font-size: 15px; line-height: 22px">${inline(para.join(' '))}</p>`); para = []; } };
  const flushList = () => {
    if (!list) return;
    const items = list.items.map((it, i) => html`<li key=${i} style="font-size: 15px; line-height: 22px; margin-bottom: 6px">${inline(it)}</li>`);
    out.push(list.ordered ? html`<ol key=${key++} style="padding-left: 20px; margin: 0 0 4px">${items}</ol>` : html`<ul key=${key++} style="padding-left: 18px; margin: 0 0 4px">${items}</ul>`);
    list = null;
  };
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    const li = line.match(/^\s*[-*]\s+(.*)$/);
    const ol = line.match(/^\s*(\d+)[.)]\s+(.*)$/);
    const cont = line.match(/^\s{2,}(\S.*)$/);
    if (h) {
      flushPara(); flushList();
      const level = h[1].length;
      const size = level === 1 ? '22px' : level === 2 ? '18px' : '16px';
      out.push(html`<h2 key=${key++} style=${`font-size: ${size}; font-weight: 700; margin-top: ${level === 1 ? 0 : 10}px`}>${inline(h[2])}</h2>`);
    } else if (li || ol) {
      flushPara();
      const ordered = !!ol;
      if (!list || list.ordered !== ordered) { flushList(); list = { ordered, items: [] }; }
      list.items.push(ordered ? ol[2] : li[1]);
    } else if (cont && list) {
      list.items[list.items.length - 1] += ' ' + cont[1];
    } else if (!line.trim()) {
      flushPara(); flushList();
    } else {
      if (list) { list.items[list.items.length - 1] += ' ' + line.trim(); } else para.push(line.trim());
    }
  }
  flushPara(); flushList();
  return out;
}

// ---------- print fallback: every daypart with people placed, as tables ----------

const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function fallbackPrintable({ state, store, t }) {
  const parts = [];
  for (const side of ['foh', 'boh']) {
    for (const dp of DAYPARTS[side]) {
      const assignments = store.dpAssignments(side, dp.key);
      if (!Object.keys(assignments).length) continue;
      const { board, dayType } = boardFor({ state, store, side, daypartKey: dp.key, now: dp.start });
      const rows = board.rows.filter(r => r.personId || r.needed).map(r => `<tr>
        <td class="r">${r.rank}</td><td>${esc(r.slot.name)}${r.slot.sub ? ` <small>${esc(r.slot.sub)}</small>` : ''}</td>
        <td>${r.personId ? esc(r.name) : `<em>${esc(t('needed'))}</em>`}${r.roleTag ? ` <small>${esc(r.roleTag)}</small>` : ''}</td>
        <td class="n">${esc(r.note || '')}${r.flags.length ? ` <small>⚠ ${esc(r.flags.map(f => f.text).join(' · '))}</small>` : ''}</td></tr>`).join('');
      parts.push(`<section><h2>${esc(daypartName(dp, t.lang))} · ${esc(fmtRange(dp.start, dp.end))} · ${side.toUpperCase()}
        <small>${esc(t('placed', { n: board.counts.placed, of: board.counts.expected }))}${board.lead ? ` · ${esc(t('leadCaptain'))}: ${esc(board.lead.name)}` : ''} · ${esc(dayTypeLabel(dayType))}</small></h2>
        <table><thead><tr><th></th><th>${esc(t('positionsPriority'))}</th><th></th><th></th></tr></thead><tbody>${rows}</tbody></table></section>`);
    }
  }
  const title = `Buda Ops Hub · ${esc(dateLabel(state.date, t.lang))}`;
  return `<!doctype html><html lang="${esc(t.lang || 'en')}"><head><meta charset="utf-8"><title>${title}</title>
  <style>body{font-family:'DM Sans',system-ui,sans-serif;color:#1C1B19;margin:24px;font-size:13px}h1{font-size:20px;margin:0 0 4px}h2{font-size:15px;margin:18px 0 6px}small{font-weight:400;color:#5F5B55}
  table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #E6E1D8;padding:5px 6px;text-align:left;vertical-align:top}td.r{width:24px;color:#6B665F}td.n{color:#5F5B55}th{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#6B665F}em{color:#C8102E;font-style:normal;font-weight:600}section{page-break-inside:avoid}</style></head>
  <body><h1>${title} <small>${esc(t('printDay'))}</small></h1><div><small>${esc(t('sample'))}</small></div>${parts.join('') || `<p>${esc(t('notPlacedYet'))}</p>`}</body></html>`;
}

// ---------- pages ----------

function Structure({ state, t, go }) {
  const es = (t.lang || state.lang) === 'es';
  const [md, setMd] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    let alive = true;
    fetch(ASSUMPTIONS_URL).then(r => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
      .then(text => { if (alive) setMd(text); })
      .catch(e => { if (alive) setErr(e); });
    return () => { alive = false; };
  }, []);
  return html`
    <header class="hdr">
      <div class="row">
        <button type="button" class="iconbtn" onClick=${() => go('more')} aria-label=${t('back')}><${Icon} name="back" /></button>
        <h1 class="title" style="font-size: 22px">${t('structure')}</h1>
        <span class="grow"></span>
        <${SyncDot} syncState=${state.syncState} t=${t} />
      </div>
      <div class="summary">docs/ASSUMPTIONS.md</div>
    </header>
    <div class="stack">
      <${Card} rounded>
        ${md != null ? renderMarkdown(md)
          : err ? html`<p style="font-size: 15px">${es ? 'No se pudo leer docs/ASSUMPTIONS.md desde aquí (abre el prototipo desde un servidor estático).' : 'Could not read docs/ASSUMPTIONS.md from here (open the prototype from a static server).'}</p>`
          : html`<p class="sub">…</p>`}
      </${Card}>
    </div>`;
}

// ---------- the screen ----------

export default function Screen({ store, state, t, route, go }) {
  const es = (t.lang || state.lang) === 'es';
  const L = (en, esText) => (es ? esText : en);
  const other = es ? 'en' : 'es';
  const q = (route && route.query) || {};
  const me = personById(state.me);
  const [pin, setPin] = useState('');

  if (q.page === 'manage') return html`<${Manage} state=${state} store=${store} t=${t} go=${go} />`;
  if (q.page === 'structure') return html`<${Structure} state=${state} t=${t} go=${go} />`;

  const close = () => go('more');

  // ---- who's using this phone ----
  const pick = (id) => { store.setMe(id); close(); };
  const rosterRows = (side) => rosterFor(state.date, side).map(r => ({ r, p: personById(r.personId) })).filter(x => x.p);
  const personRow = ({ r, p }) => {
    const m = r ? entryMinutes(r) : null;
    const tag = roleTagOf(p.role, t.lang);
    return html`<${PersonRow} key=${p.id} name=${p.first} roleTag=${tag || null} score=${tag ? null : { score: null }}
      meta=${m ? fmtRange(m[0], m[1]) : t('isManager')} on=${p.id === state.me} onClick=${() => pick(p.id)} />`;
  };

  // ---- PIN ----
  const press = (d) => {
    if (pin.length >= 4) return;
    const next = pin + d;
    setPin(next);
    if (next.length === 4) { setPin(''); go('more', { page: 'manage' }); }
  };
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'back'];

  // ---- print ----
  const printDay = async () => {
    const w = typeof window !== 'undefined' ? window.open('', '_blank') : null;
    if (!w) { store.showToast(L('Pop-up blocked: allow pop-ups to print the day', 'Se bloqueó la ventana: permite pop-ups para imprimir el día'), { ttl: 4000 }); return; }
    try { w.document.write(`<!doctype html><title>${esc(t('printDay'))}</title><p style="font-family:system-ui">…</p>`); } catch (e) { /* ignore */ }
    let out = null;
    try {
      const m = await import('./SetUps.js');
      if (typeof m.renderPrintable === 'function') out = await m.renderPrintable({ state, store, t, side: state.side, date: state.date });
    } catch (e) { out = null; }
    if (out && typeof out === 'object' && typeof out.outerHTML === 'string') out = out.outerHTML;
    if (out && typeof out === 'object' && typeof out.html === 'string') out = out.html;
    let body = typeof out === 'string' && out.trim() ? out : fallbackPrintable({ state, store, t });
    if (!/<html[\s>]/i.test(body)) body = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(t('printDay'))}</title><style>body{font-family:'DM Sans',system-ui,sans-serif;margin:24px}</style></head><body>${body}</body></html>`;
    try { w.document.open(); w.document.write(body); w.document.close(); } catch (e) { /* ignore */ }
    setTimeout(() => { try { w.focus(); w.print(); } catch (e) { /* ignore */ } }, 400);
  };

  // ---- reset ----
  const doReset = () => { store.reset(); close(); store.showToast(t('resetDone'), { ttl: 3000 }); };

  const group = (label, children) => html`<section>
    <div class="section-head" style="padding: 0 4px 6px"><span class="label">${label}</span></div>
    <div class="card" style="padding: 0; border-radius: var(--r-16); overflow: hidden; gap: 0">${children}</div>
  </section>`;

  const settingRow = (label, right, sub) => html`<div class="person" style="min-height: 56px; padding-top: 6px; padding-bottom: 6px">
    <span class="col" style="gap: 1px; min-width: 0"><span class="n">${label}</span>${sub ? html`<span class="sub">${sub}</span>` : null}</span>
    <span class="grow"></span>
    ${right}
  </div>`;

  const linkRow = (label, meta, onClick, icon) => html`<button type="button" class="person" onClick=${onClick}>
    ${icon ? html`<${Icon} name=${icon} size=${20} cls="muted" />` : null}
    <span class="n">${label}</span>
    <span class="m">${meta} ›</span>
  </button>`;

  return html`
    <${Header} state=${state} store=${store} t=${t} identityHref="#/more?sheet=who">
      <${TitleRow} title=${t('nav.more')} sub=${`· ${tIn('nav.more', null, other)}`} />
    </${Header}>

    <div class="stack">
      ${group(t('identity'), html`
        <button type="button" class="person" onClick=${() => go('more', { sheet: 'who' })}>
          <${Icon} name="person" size=${20} cls="muted" />
          <span class="col" style="gap: 1px; min-width: 0">
            <span class="n">${me ? me.first : state.me}</span>
            <span class="sub">${t('whosPhone')} · ${me && me.role === 'manager' ? t('isManager') : (roleTagOf(me && me.role, t.lang) || t('role.tm'))}</span>
          </span>
          <span class="m">${t('change')} ›</span>
        </button>
        ${settingRow(t('language'), html`<${Seg} value=${state.lang} options=${[['en', 'EN'], ['es', 'ES']]} onChange=${l => store.setLang(l)} label=${t('language')} />`, `${t('english')} · ${t('spanish')}`)}
        ${settingRow(t('side'), html`<${Seg} value=${state.side} options=${[['foh', 'FOH'], ['boh', 'BOH']]} onChange=${s => store.setSide(s)} label=${t('side')} />`, null)}
      `)}

      ${group(t('demoClock'), html`
        ${settingRow(t('clockAt', { t: fmt(state.now) }), html`<${Chip}>${dateLabel(state.date, t.lang)}</${Chip}>`, `${t('presets')} · ${L('every "now" reads this clock', 'todo "ahora" lee este reloj')}`)}
        <div class="row wrap" style="padding: 4px 16px 14px">
          ${(state.presets || []).map(p => html`<${Chip} key=${p} tall on=${p === state.now} onClick=${() => store.setNow(p)} ariaLabel=${t('clockAt', { t: fmt(p) })}>${fmt(p)}</${Chip}>`)}
        </div>
      `)}

      ${group(t('manage'), html`
        ${linkRow(t('manage'), t('managePin'), () => { setPin(''); go('more', { sheet: 'pin' }); }, 'lock')}
        ${linkRow(t('structure'), 'ASSUMPTIONS.md', () => go('more', { page: 'structure' }), 'doc')}
        ${linkRow(t('print'), t('printDay'), printDay, 'print')}
        ${linkRow(t('reset'), L('this phone', 'este teléfono'), () => go('more', { sheet: 'reset' }), 'reset')}
      `)}

      <div class="sub" style="padding: 0 4px 8px">${t('sample')}</div>
    </div>

    <${Sheet} open=${q.sheet === 'who'} title=${t('whosPhone')} sub=${t('pickYourName')} onClose=${close}>
      <${SheetSection} label="FOH" right=${dateLabel(state.date, t.lang)} />
      ${rosterRows('foh').map(personRow)}
      <${SheetSection} label="BOH" />
      ${rosterRows('boh').map(personRow)}
      <${SheetSection} label=${t('role.manager')} />
      ${PEOPLE.filter(p => p.role === 'manager').map(p => personRow({ r: null, p }))}
    </${Sheet}>

    <${Sheet} open=${q.sheet === 'pin'} title=${t('managePin')} sub=${t('enterPin')} onClose=${close} closeLabel=${t('cancel')}>
      <div class="row" style="justify-content: center; gap: 14px; padding: 6px 0 14px" aria-live="polite" aria-label=${`${pin.length} / 4`}>
        ${[0, 1, 2, 3].map(i => html`<span key=${i} style=${`width: 14px; height: 14px; border-radius: 50%; border: 2px solid var(--ink3); background: ${i < pin.length ? 'var(--ink)' : 'transparent'}`}></span>`)}
      </div>
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; padding: 0 16px 8px">
        ${keys.map((k, i) => k === ''
          ? html`<span key=${i}></span>`
          : html`<button key=${i} type="button" class="btn alt" style="height: 56px; font-size: 22px" onClick=${() => (k === 'back' ? setPin(pin.slice(0, -1)) : press(k))} aria-label=${k === 'back' ? t('back') : k}>${k === 'back' ? html`<${Icon} name="back" />` : k}</button>`)}
      </div>
      <p class="sub" style="padding: 0 16px 6px">${L('Mock: any 4 digits open the Manage page. The real app would also need a one-time device code.', 'Mock: cualquier 4 números abren Administrar. La app real pediría además un código de dispositivo.')}</p>
    </${Sheet}>

    <${Sheet} open=${q.sheet === 'reset'} title=${t('reset')} onClose=${close} closeLabel=${t('cancel')}
      footer=${html`<button type="button" class="btn alt" style="width: 110px" onClick=${close}>${t('cancel')}</button><button type="button" class="btn" style="flex-grow: 1" onClick=${doReset}>${t('reset')}</button>`}>
      <div style="padding: 4px 16px 10px">
        <${Callout} head=${L('Forget this phone’s changes?', '¿Olvidar los cambios de este teléfono?')}>${L('Placements, hand-offs, breaks, waste entries and task progress go back to the sample day (Sat, Oct 3 · 10:52). Nothing real is touched.', 'Puestos, entregas, descansos, registros de desperdicio y avance de tareas vuelven al día de muestra (sáb, 3 oct · 10:52). No se toca nada real.')}</${Callout}>
      </div>
    </${Sheet}>`;
}
