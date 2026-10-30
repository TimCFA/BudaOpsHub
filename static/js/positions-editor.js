// ===== POSITIONS (Tim, Oct 30 2026) =====
// Directors and the Admin Team arrange each daypart's positions on Set Ups:
// drag them into order (top first: it's the priority Set Ups fills by and
// never skips for a spot lower down), add new ones, take one off. Saved as
// positionLists in the manager section, which only a manager session may
// change (app.py MANAGER_ONLY_KEYS); a daypart nobody has changed keeps the
// built-in list (zone-reset.js fohPositions / bohPositions). Someone placed
// in a position that's taken off keeps their entry: it comes back with the
// position.

const POS_DEFAULTS = {foh: JSON.parse(JSON.stringify(fohPositions)), boh: JSON.parse(JSON.stringify(bohPositions))};
const POS_NAME_MAX = 40;
const PE_ICON_GRIP = '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>';
const PE_ICON_EDIT = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg>';
const PE_ICON_X = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

function posListsFor(side){ return side === 'foh' ? fohPositions : bohPositions; }
// A position's name as it's kept: one line, no "|" (it separates the parts of
// a Set Ups key), at most POS_NAME_MAX characters.
function posCleanName(n){ return String(n || '').replace(/\|/g, '/').replace(/\s+/g, ' ').trim().slice(0, POS_NAME_MAX); }
function posCleanList(v){
  if(!Array.isArray(v)) return null;
  const seen = new Set(), out = [];
  v.forEach(n => { const s = posCleanName(n); if(s && !seen.has(s.toLowerCase())){ seen.add(s.toLowerCase()); out.push(s); } });
  return out.length ? out : null;
}
// Set Ups' lists: the saved one for a daypart, else the built-in one.
function posApplyLists(){
  ['foh', 'boh'].forEach(side => {
    const target = posListsFor(side), saved = (positionLists && positionLists[side]) || {};
    Object.keys(POS_DEFAULTS[side]).forEach(dp => { target[dp] = posCleanList(saved[dp]) || POS_DEFAULTS[side][dp].slice(); });
  });
}
function posCanEdit(){ return typeof launchManager !== 'undefined' && !!launchManager; }
const posSame = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

// Today's and later days' people in a position (what taking it off hides).
function posPlacedCount(side, dp, slot){
  const tail = `||${dp}||${slot}`;
  return Object.keys(posAssignments || {}).filter(k => k.startsWith(side + '||') && k.endsWith(tail) && k.split('||')[1] >= today && posAssignments[k]).length;
}

// The chip above the daypart cards, for directors and the Admin Team.
function posEditChipHtml(){
  if(!posCanEdit()) return '';
  return `<button type="button" class="su-rowchip su-chip-edit" data-pe-open>${PE_ICON_EDIT}<span>Edit positions${esLine('Edit positions')}</span></button>`;
}

// ----- The sheet -----
let pe = null;   // {side, dp, drafts: {daypart: [names]}, drag}
function peLayer(){
  let el = document.getElementById('peModal');
  if(!el){
    el = document.createElement('div');
    el.id = 'peModal';
    el.className = 'overlay su-pick pe-modal';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-labelledby', 'peTitle');
    document.body.appendChild(el);
    el.addEventListener('click', peClick);
    el.addEventListener('pointerdown', peDragStart);
    el.addEventListener('keydown', peKey);
  }
  return el;
}
function peList(dp){ return pe.drafts[dp] || posListsFor(pe.side)[dp].slice(); }
function peChanged(){ return Object.keys(pe.drafts).filter(dp => !posSame(pe.drafts[dp], posListsFor(pe.side)[dp])); }

function posEditorOpen(){
  if(!posCanEdit()) return;
  const side = currentPosSection === 'boh' ? 'boh' : 'foh';
  const dps = suDaypartsFor(side).map(d => d.name);
  const dp = dps.includes(suSelectedDaypart[side]) ? suSelectedDaypart[side] : dps[0];
  pe = {side, dp, drafts: {}, drag: null};
  peRender();
  peLayer().classList.add('active');
}
function posEditorClose(){
  if(pe && peChanged().length && !confirm('Leave without saving your changes to the positions?')) return;
  pe = null;
  const el = document.getElementById('peModal');
  if(el) el.classList.remove('active');
}

function peRender(focusIndex){
  const el = peLayer(), side = pe.side, list = peList(pe.dp);
  const dps = suDaypartsFor(side);
  const isDefault = posSame(list, POS_DEFAULTS[side][pe.dp] || []);
  const changed = peChanged();
  el.innerHTML = `<div class="sheet su-pick-sheet pe-sheet">
      <div class="su-pick-head">
        <div class="su-pick-titles"><span class="su-pick-kicker">${side.toUpperCase()} positions</span><h2 id="peTitle">${escapeHtml(suShortDaypart(pe.dp))}</h2></div>
        <button type="button" class="su-sheet-close" data-pe-close aria-label="Close">${PE_ICON_X}</button>
      </div>
      <div class="pe-dps" role="tablist">${dps.map(d => `<button type="button" role="tab" class="pe-dp${d.name === pe.dp ? ' is-on' : ''}${pe.drafts[d.name] && !posSame(pe.drafts[d.name], posListsFor(side)[d.name]) ? ' is-changed' : ''}" aria-selected="${d.name === pe.dp}" data-pe-dp="${escapeHtml(d.name)}">${escapeHtml(suShortDaypart(d.name))}</button>`).join('')}</div>
      <p class="pe-note">Top is filled first. Drag <span class="pe-note-grip">${PE_ICON_GRIP}</span> to move a position.</p>
      <ol class="pe-list">${list.map((n, i) => {
        const placed = posPlacedCount(side, pe.dp, n);
        return `<li class="pe-row" data-pe-i="${i}">
          <span class="pe-grip" data-pe-grip="${i}" tabindex="0" role="button" aria-label="Move ${escapeHtml(n)} (up and down arrows)">${PE_ICON_GRIP}</span>
          <span class="pe-num">${i + 1}</span>
          <span class="pe-name">${escapeHtml(n)}${placed ? `<small>${placed} placed</small>` : ''}</span>
          <button type="button" class="pe-del" data-pe-del="${i}" aria-label="Take ${escapeHtml(n)} off">${PE_ICON_X}</button>
        </li>`; }).join('')}</ol>
      <form class="pe-add" data-pe-add>
        <input type="text" class="pe-input" id="peNew" maxlength="${POS_NAME_MAX}" placeholder="New position, e.g. iPOS 9 LANE 1" autocomplete="off" aria-label="New position">
        <button type="submit" class="su-btn-line">Add</button>
      </form>
      <div class="pe-foot">
        ${isDefault ? '<span></span>' : `<button type="button" class="pe-link" data-pe-default>Use the standard list</button>`}
        <button type="button" class="su-btn-line" data-pe-close>Cancel</button>
        <button type="button" class="pe-save" data-pe-save ${changed.length ? '' : 'disabled'}>Save${changed.length > 1 ? ` ${changed.length} dayparts` : ''}</button>
      </div>
    </div>`;
  if(focusIndex !== undefined){ const g = el.querySelector(`[data-pe-grip="${focusIndex}"]`); if(g) g.focus(); }
}

function peSet(list){ pe.drafts[pe.dp] = list; }
function peMove(from, to){
  const list = peList(pe.dp).slice();
  if(to < 0 || to >= list.length || from === to) return false;
  list.splice(to, 0, list.splice(from, 1)[0]);
  peSet(list);
  return true;
}

function peClick(e){
  const t = e.target;
  if(t === e.currentTarget || t.closest('[data-pe-close]')){ posEditorClose(); return; }
  const dp = t.closest('[data-pe-dp]');
  if(dp){ pe.dp = dp.dataset.peDp; peRender(); return; }
  const del = t.closest('[data-pe-del]');
  if(del){
    const i = +del.dataset.peDel, list = peList(pe.dp).slice(), name = list[i];
    if(list.length === 1){ showToast('Keep at least one position'); return; }
    const placed = posPlacedCount(pe.side, pe.dp, name);
    if(placed && !confirm(`${placed} ${placed === 1 ? 'person is' : 'people are'} placed in ${name} today or later. Take it off anyway? They come back if you add it again.`)) return;
    list.splice(i, 1);
    peSet(list); peRender();
    return;
  }
  if(t.closest('[data-pe-default]')){ peSet(POS_DEFAULTS[pe.side][pe.dp].slice()); peRender(); return; }
  if(t.closest('[data-pe-save]')) peSave();
}
document.addEventListener('submit', e => {
  if(!e.target.closest || !e.target.closest('[data-pe-add]')) return;
  e.preventDefault();
  const input = document.getElementById('peNew'), name = posCleanName(input && input.value);
  if(!name) return;
  const list = peList(pe.dp).slice();
  if(list.some(n => n.toLowerCase() === name.toLowerCase())){ showToast(`${name} is already on the list`); return; }
  list.push(name);
  peSet(list); peRender();
  const again = document.getElementById('peNew');
  if(again) again.focus();
  const rows = document.querySelectorAll('#peModal .pe-row');
  if(rows.length) rows[rows.length - 1].scrollIntoView({block: 'nearest'});
});
document.addEventListener('click', e => { if(e.target.closest && e.target.closest('[data-pe-open]')) posEditorOpen(); });

// Arrow keys on a grip move that position one place.
function peKey(e){
  if(e.key === 'Escape'){ posEditorClose(); return; }
  const g = e.target.closest && e.target.closest('[data-pe-grip]');
  if(!g || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
  e.preventDefault();
  const i = +g.dataset.peGrip, to = i + (e.key === 'ArrowUp' ? -1 : 1);
  if(peMove(i, to)) peRender(to);
}

// Drag: the row follows the finger (or mouse) and the others make room. The
// list scrolls inside the sheet; held near its top or bottom edge, it
// scrolls on its own, so a position can go anywhere in one drag.
const PE_EDGE = 48;
function peDragStart(e){
  const g = e.target.closest && e.target.closest('[data-pe-grip]');
  if(!g || (e.button !== undefined && e.button !== 0)) return;
  e.preventDefault();
  const row = g.closest('.pe-row'), list = row.parentElement, rows = [...list.querySelectorAll('.pe-row')];
  const from = +g.dataset.peGrip;
  pe.drag = {from, to: from, row, rows, list, y0: e.clientY, y: e.clientY, s0: list.scrollTop,
    mids: rows.map(r => { const b = r.getBoundingClientRect(); return b.top + b.height / 2; }), h: row.getBoundingClientRect().height + 6};
  row.classList.add('is-dragging');
  try{ g.setPointerCapture(e.pointerId); }catch(err){}
  g.addEventListener('pointermove', peDragMove);
  g.addEventListener('pointerup', peDragEnd);
  g.addEventListener('pointercancel', peDragEnd);
  const tick = () => {
    const d = pe && pe.drag;
    if(!d) return;
    const box = d.list.getBoundingClientRect();
    const step = d.y < box.top + PE_EDGE ? -10 : d.y > box.bottom - PE_EDGE ? 10 : 0;
    if(step){ const before = d.list.scrollTop; d.list.scrollTop += step; if(d.list.scrollTop !== before) peDragApply(); }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
function peDragMove(e){
  const d = pe && pe.drag;
  if(!d) return;
  d.y = e.clientY;
  peDragApply();
}
function peDragApply(){
  const d = pe.drag;
  const dy = d.y - d.y0 + d.list.scrollTop - d.s0;
  d.row.style.transform = `translateY(${dy}px)`;
  const y = d.mids[d.from] + dy;
  let to = d.from;
  while(to < d.mids.length - 1 && y > d.mids[to + 1]) to++;
  while(to > 0 && y < d.mids[to - 1]) to--;
  d.to = to;
  d.rows.forEach((r, i) => {
    if(i === d.from) return;
    const shift = d.from < to && i > d.from && i <= to ? -d.h : d.from > to && i < d.from && i >= to ? d.h : 0;
    r.style.transform = shift ? `translateY(${shift}px)` : '';
  });
}
function peDragEnd(e){
  const g = e.currentTarget, d = pe && pe.drag;
  g.removeEventListener('pointermove', peDragMove);
  g.removeEventListener('pointerup', peDragEnd);
  g.removeEventListener('pointercancel', peDragEnd);
  if(!d) return;
  pe.drag = null;
  const moved = e.type !== 'pointercancel' && peMove(d.from, d.to);
  peRender(moved ? d.to : d.from);
}

function peSave(){
  if(!posCanEdit()){ showToast('Directors and the Admin Team change the positions'); return; }
  const changed = peChanged();
  if(!changed.length) return;
  const all = JSON.parse(JSON.stringify(positionLists || {}));
  all[pe.side] = all[pe.side] || {};
  changed.forEach(dp => {
    const list = pe.drafts[dp];
    if(posSame(list, POS_DEFAULTS[pe.side][dp] || [])) delete all[pe.side][dp];
    else all[pe.side][dp] = list.slice();
  });
  if(!Object.keys(all[pe.side]).length) delete all[pe.side];
  positionLists = all;
  posApplyLists();
  saveState();
  const label = changed.length === 1 ? `${pe.side.toUpperCase()} ${suShortDaypart(changed[0])}` : `${changed.length} ${pe.side.toUpperCase()} dayparts`;
  pe.drafts = {};
  posEditorClose();
  if(typeof renderAllDayparts === 'function') renderAllDayparts();
  showToast(`Positions saved: ${label}`);
}
