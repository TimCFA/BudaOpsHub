// ===== PREP TIMES (TIM-47) =====
// A "Prep Times" page on the Prep Board: time how long it takes to make the
// cold-side items, and a leaderboard of the fastest.
//  - Pick your name (today's roster first), the item and how many, tap
//    Start; tap Done when finished. Several timers can run at once, and they
//    live in the saved state, so a reload or another device picks them up.
//  - A batch is divided by its count (6 Cobb Salads in 9:30 = 1:35 each), so
//    big and small batches compare fairly.
//  - Leaderboards: fastest per-item time for each item (one best per person),
//    and "fastest overall" — each time compared with that item's average,
//    averaged per person (at least 3 times) — this week, month or all time.
//  - Times under 5 seconds or over 3 hours per item don't count; any entry
//    can be removed if it was a mistake.

const PT_ITEMS = [
  {cat: 'Salads', items: ['Cobb Salad', 'Mkt Salad — Grilled Filet (Cold)', 'Mkt Salad — Other Chicken', 'Spicy SW Salad — Spicy Grilled Filet (Cold)', 'Spicy SW Salad — Other Chicken', 'Side Salad', 'Kale Salad']},
  {cat: 'Wraps', items: ['Regular Cool Wrap', 'Spicy Wrap', 'Veggie Wrap']},
  {cat: 'Sides', items: ['Fruit Cup, Small', 'Fruit Cup, Medium', 'Fruit Cup, Large', 'Parfait']}
];
const PT_MIN_SECS = 5;
const PT_MAX_SECS = 3 * 3600;
const PT_MIN_FOR_OVERALL = 3;
const PT_NAME_KEY = 'cfaBudaPrepTimerName';

// persisted
let prepTimes = [];    // [{id, at, date, name, item, qty, secs, source}]
let prepTimers = [];   // running: [{id, name, item, qty, startedAt}]

// session-only
let ptForm = {name: '', item: '', qty: 1, other: false};
let ptScope = 'week';          // 'week' | 'month' | 'all'
let ptBoardItem = 'Cobb Salad';
let ptManualOpen = false;
let ptTick = null;
try{ ptForm.name = localStorage.getItem(PT_NAME_KEY) || ''; }catch(e){}

function ptUid(){ return 'pt' + Date.now() + Math.random().toString(36).slice(2, 7); }

function ptClock(secs){
  secs = Math.max(0, Math.round(secs));
  const h = Math.floor(secs / 3600), m = Math.floor(secs % 3600 / 60), s = secs % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

function ptShortItem(item){
  return item.replace('Mkt Salad', 'Market').replace('Spicy SW Salad', 'Spicy SW').replace(' — ', ' · ').replace('Grilled Filet', 'Grilled').replace('Spicy Grilled Filet', 'Spicy Grilled').replace(' (Cold)', '').replace('Other Chicken', 'Other');
}

// Today's roster first (both sides), then anyone timed before.
function ptPeople(){
  const iso = today;
  const on = [...(fohRoster[iso] || []), ...(bohRoster[iso] || [])].map(p => p.name.trim());
  const past = prepTimes.map(t => t.name);
  const seen = new Set();
  const list = [];
  [...on.sort((a, b) => a.localeCompare(b)), ...past.sort((a, b) => a.localeCompare(b))].forEach(n => { const k = n.toLowerCase(); if(n && !seen.has(k)){ seen.add(k); list.push({name: n, today: on.includes(n)}); } });
  return list;
}

function ptInScope(t){
  if(ptScope === 'all') return true;
  const d = new Date(t.date + 'T00:00:00');
  const now = new Date();
  if(ptScope === 'month') return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  const mon = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  return d >= mon;
}

const ptPerItem = t => t.secs / Math.max(1, t.qty);

// Item averages (per item made) from every time on file — the yardstick for
// "fastest overall".
function ptItemAverages(){
  const sum = {}, n = {};
  prepTimes.forEach(t => { sum[t.item] = (sum[t.item] || 0) + ptPerItem(t); n[t.item] = (n[t.item] || 0) + 1; });
  const avg = {};
  Object.keys(sum).forEach(k => { avg[k] = sum[k] / n[k]; });
  return avg;
}

// People ranked by how much faster than each item's average they are.
function ptOverallBoard(){
  const avg = ptItemAverages();
  const by = {};
  prepTimes.filter(ptInScope).forEach(t=>{
    if(!avg[t.item]) return;
    const k = t.name.toLowerCase();
    (by[k] = by[k] || {name: t.name, ratios: []}).ratios.push(avg[t.item] / ptPerItem(t));
  });
  return Object.values(by).filter(p => p.ratios.length >= PT_MIN_FOR_OVERALL)
    .map(p => ({name: p.name, n: p.ratios.length, speed: p.ratios.reduce((a, b) => a + b, 0) / p.ratios.length}))
    .sort((a, b) => b.speed - a.speed || b.n - a.n);
}

// Fastest per-item time for one item, one (best) row per person.
function ptItemBoard(item){
  const best = {};
  prepTimes.filter(t => t.item === item && ptInScope(t)).forEach(t=>{
    const k = t.name.toLowerCase();
    if(!best[k] || ptPerItem(t) < ptPerItem(best[k])) best[k] = t;
  });
  return Object.values(best).sort((a, b) => ptPerItem(a) - ptPerItem(b));
}

// Record a finished time; returns a short note for the toast.
function ptRecord({name, item, qty, secs, source}){
  const perItem = secs / Math.max(1, qty);
  if(perItem < PT_MIN_SECS) throw new Error(`That’s under ${PT_MIN_SECS} seconds per item — not counted. Check the count. · ${esText('Too fast', PT_MIN_SECS)}`);
  if(perItem > PT_MAX_SECS) throw new Error(`That’s over 3 hours per item — not counted. · ${esText('Too slow')}`);
  const prevBest = prepTimes.filter(t => t.item === item && t.name.toLowerCase() === name.toLowerCase()).map(ptPerItem).sort((a, b) => a - b)[0];
  const recordBest = prepTimes.filter(t => t.item === item).map(ptPerItem).sort((a, b) => a - b)[0];
  prepTimes.push({id: ptUid(), at: new Date().toISOString(), date: today, name, item, qty, secs: Math.round(secs), source});
  if(prepTimes.length > 5000) prepTimes = prepTimes.slice(-5000);
  const each = ptClock(perItem);
  if(recordBest === undefined || perItem < recordBest) return `🏆 ${each} per ${ptShortItem(item)} — the fastest on record! · ${esText('Fastest on record')}`;
  if(prevBest === undefined) return `✓ ${each} per ${ptShortItem(item)} — first time logged · ${esText('First time logged')}`;
  if(perItem < prevBest) return `⭐ ${each} per ${ptShortItem(item)} — a personal best! · ${esText('Personal best')}`;
  return `✓ ${each} per ${ptShortItem(item)}`;
}

// ----- Rendering -----

function ptItemChipsHtml(attr, selected){
  return PT_ITEMS.map(g => `
    <div class="pt-cat">${g.cat}${esHtml(g.cat)}</div>
    <div class="pt-chips">${g.items.map(it => `<button type="button" class="pt-chip ${selected === it ? 'active' : ''}" data-${attr}="${escapeHtml(it)}" aria-pressed="${selected === it}">${escapeHtml(ptShortItem(it))}</button>`).join('')}</div>`).join('');
}

function ptRenderPage(){
  const people = ptPeople();
  const running = prepTimers.slice().sort((a, b) => a.startedAt - b.startedAt);
  const canStart = ptForm.name && ptForm.item && ptForm.qty >= 1;
  const nameOptions = `<option value="">Who’s prepping? / ${escapeHtml(esText('Who’s prepping?'))}</option>${people.filter(p => p.today).length ? `<optgroup label="On today / ${escapeHtml(esText('On today'))}">${people.filter(p => p.today).map(p => `<option ${p.name === ptForm.name ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('')}</optgroup>` : ''}${people.filter(p => !p.today).length ? `<optgroup label="Others / ${escapeHtml(esText('Others'))}">${people.filter(p => !p.today).map(p => `<option ${p.name === ptForm.name ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('')}</optgroup>` : ''}<option value="__other">Someone else… / ${escapeHtml(esText('Someone else…'))}</option>`;

  const timers = running.length ? `
    <section class="pt-running">
      <h3>Timing now${esHtml('Timing now')}</h3>
      ${running.map(t => `
        <div class="pt-timer">
          <div class="pt-timer-who"><b>${escapeHtml(t.name)}</b><span>${escapeHtml(ptShortItem(t.item))} × ${t.qty}</span></div>
          <div class="pt-timer-clock" data-pt-elapsed="${escapeHtml(t.startedAt)}">${ptClock((Date.now() - t.startedAt) / 1000)}</div>
          <div class="pt-timer-actions">
            <button type="button" class="pt-done" data-pt-done="${escapeHtml(t.id)}">Done${esLine('Done')}</button>
            <button type="button" class="pt-cancel" data-pt-cancel="${escapeHtml(t.id)}" aria-label="Cancel this timer">Cancel${esLine('Cancel')}</button>
          </div>
        </div>`).join('')}
    </section>` : '';

  const start = `
    <section class="pt-start">
      <h3>Start a prep timer${esHtml('Start a prep timer')}</h3>
      <label class="pt-field"><span>Name${esHtml('Name')}</span><select data-pt-name>${nameOptions.replace('<option value="__other">', `<option value="__other" ${ptForm.other ? 'selected' : ''}>`)}</select></label>
      ${ptForm.other ? `<label class="pt-field"><span>Their name${esHtml('Their name')}</span><input type="text" data-pt-other-name value="${escapeHtml(ptForm.name)}" placeholder="First and last name / ${escapeHtml(esText('First and last name'))}" autocomplete="off"></label>` : ''}
      <div class="pt-field"><span>Item${esHtml('Item')}</span>${ptItemChipsHtml('pt-item', ptForm.item)}</div>
      <div class="pt-field pt-qty-row"><span>How many${esHtml('How many')}</span>
        <div class="pt-qty"><button type="button" data-pt-qty="-1" aria-label="One fewer">−</button><output data-pt-qty-out>${ptForm.qty}</output><button type="button" data-pt-qty="1" aria-label="One more">+</button></div>
      </div>
      <button type="button" class="pt-go" data-pt-start ${canStart ? '' : 'disabled'}>▶ Start${esLine('Start')}</button>
      <button type="button" class="pt-link" data-pt-manual-toggle>${ptManualOpen ? `Hide${esHtml('Hide')}` : `Or type in a time you already did${esHtml('Or type in a time you already did')}`}</button>
      ${ptManualOpen ? `
        <div class="pt-manual">
          <p>Uses the name, item and count above.${esLine('Uses the name, item and count above.')}</p>
          <div class="pt-manual-row">
            <label>Min${esHtml('Min')} <input type="number" min="0" max="180" inputmode="numeric" data-pt-man-min placeholder="0"></label>
            <label>Sec${esHtml('Sec')} <input type="number" min="0" max="59" inputmode="numeric" data-pt-man-sec placeholder="0"></label>
            <button type="button" class="pt-go small" data-pt-man-add ${canStart ? '' : 'disabled'}>Add time${esLine('Add time')}</button>
          </div>
        </div>` : ''}
    </section>`;

  // Leaderboards
  const scopeBtn = (k, label) => `<button type="button" class="pt-scope ${ptScope === k ? 'active' : ''}" data-pt-scope="${k}" aria-pressed="${ptScope === k}">${label}${esLine(label)}</button>`;
  const overall = ptOverallBoard();
  const avg = ptItemAverages();
  const itemBoard = ptItemBoard(ptBoardItem);
  const medal = i => ['🥇', '🥈', '🥉'][i] || `${i + 1}.`;
  const overallHtml = overall.length
    ? `<ol class="pt-board">${overall.slice(0, 10).map((p, i) => `<li><span class="pt-rank">${medal(i)}</span><b>${escapeHtml(p.name)}</b><span class="pt-val">${p.speed >= 1 ? `${Math.round((p.speed - 1) * 100)}% faster${esHtml('N% faster', Math.round((p.speed - 1) * 100))}` : `${Math.round((1 - p.speed) * 100)}% slower${esHtml('N% slower', Math.round((1 - p.speed) * 100))}`}</span><span class="pt-n">${p.n} times${esHtml('N times', p.n)}</span></li>`).join('')}</ol>`
    : `<p class="pt-empty">Anyone with ${PT_MIN_FOR_OVERALL}+ times ${ptScope === 'week' ? 'this week' : ptScope === 'month' ? 'this month' : ''} shows up here.${esLine('Overall empty', PT_MIN_FOR_OVERALL, ptScope)}</p>`;
  const itemHtml = itemBoard.length
    ? `<ol class="pt-board">${itemBoard.slice(0, 10).map((t, i) => `<li><span class="pt-rank">${medal(i)}</span><b>${escapeHtml(t.name)}</b><span class="pt-val">${ptClock(ptPerItem(t))} each${esHtml('each')}</span><span class="pt-n">${t.qty} in ${ptClock(t.secs)}${esHtml('N in T', t.qty, ptClock(t.secs))}</span></li>`).join('')}</ol>`
    : `<p class="pt-empty">No ${escapeHtml(ptShortItem(ptBoardItem))} times ${ptScope === 'week' ? 'this week' : ptScope === 'month' ? 'this month' : 'yet'}.${esLine('Item empty', ptShortItem(ptBoardItem), ptScope)}</p>`;
  const recent = prepTimes.slice(-8).reverse();

  const boards = `
    <section class="pt-boards">
      <div class="pt-boards-head"><h3>Leaderboard${esHtml('Leaderboard')}</h3><div class="pt-scopes">${scopeBtn('week', 'This week')}${scopeBtn('month', 'This month')}${scopeBtn('all', 'All time')}</div></div>
      <h4>Fastest overall${esHtml('Fastest overall')}</h4>
      <p class="pt-hint">Each time is compared with that item’s average, so every item counts the same.${esLine('Overall hint')}</p>
      ${overallHtml}
      <h4>Fastest by item${esHtml('Fastest by item')}</h4>
      ${ptItemChipsHtml('pt-board-item', ptBoardItem)}
      ${avg[ptBoardItem] ? `<p class="pt-hint">Average: ${ptClock(avg[ptBoardItem])} per ${escapeHtml(ptShortItem(ptBoardItem))} across ${prepTimes.filter(t => t.item === ptBoardItem).length} times.${esLine('Average per item', ptClock(avg[ptBoardItem]), ptShortItem(ptBoardItem), prepTimes.filter(t => t.item === ptBoardItem).length)}</p>` : ''}
      ${itemHtml}
      ${recent.length ? `
        <details class="pt-recent"><summary>Recent times (${prepTimes.length} logged)${esHtml('Recent times', prepTimes.length)}</summary>
          <ul>${recent.map(t => `<li><span>${escapeHtml(t.name)} · ${escapeHtml(ptShortItem(t.item))} × ${t.qty}</span><b>${ptClock(t.secs)}</b><button type="button" class="pt-remove" data-pt-remove="${t.id}" aria-label="Remove this time">✕</button></li>`).join('')}</ul>
        </details>` : ''}
    </section>`;

  return `<p class="pb-subline">Time a batch of prep — the leaderboard compares time per item.${esLine('Prep times subline')}</p>${timers}${start}${boards}`;
}

// Tick running clocks once a second (text only — no re-render).
function ptStartTicking(){
  if(ptTick) return;
  ptTick = setInterval(()=>{
    const els = document.querySelectorAll('[data-pt-elapsed]');
    if(!els.length){ clearInterval(ptTick); ptTick = null; return; }
    els.forEach(el => { el.textContent = ptClock((Date.now() - +el.dataset.ptElapsed) / 1000); });
  }, 1000);
}

function ptRerender(){
  renderPrepBoard();
  if(prepTimers.length) ptStartTicking();
}

// ----- Events -----

document.getElementById('prepBoardRoot').addEventListener('click', async e=>{
  if(pbCurrentPage !== 'times') return;
  const t = e.target;
  const item = t.closest('[data-pt-item]');
  if(item){ ptForm.item = item.dataset.ptItem; ptRerender(); return; }
  const qty = t.closest('[data-pt-qty]');
  if(qty){ ptForm.qty = Math.max(1, Math.min(99, ptForm.qty + (+qty.dataset.ptQty))); ptRerender(); return; }
  if(t.closest('[data-pt-manual-toggle]')){ ptManualOpen = !ptManualOpen; ptRerender(); return; }
  const scope = t.closest('[data-pt-scope]');
  if(scope){ ptScope = scope.dataset.ptScope; ptRerender(); return; }
  const boardItem = t.closest('[data-pt-board-item]');
  if(boardItem){ ptBoardItem = boardItem.dataset.ptBoardItem; ptRerender(); return; }

  if(t.closest('[data-pt-start]')){
    if(!ptForm.name || !ptForm.item) return;
    prepTimers.push({id: ptUid(), name: ptForm.name, item: ptForm.item, qty: ptForm.qty, startedAt: Date.now()});
    ptRerender();
    showToast(`▶ Timing ${ptForm.name} · ${ptShortItem(ptForm.item)} × ${ptForm.qty} · ${esText('Timing now')}`);
    saveState();
    return;
  }
  const done = t.closest('[data-pt-done]');
  if(done){
    const timer = prepTimers.find(x => x.id === done.dataset.ptDone);
    if(!timer) return;
    const secs = (Date.now() - timer.startedAt) / 1000;
    prepTimers = prepTimers.filter(x => x !== timer);
    try{ showToast(ptRecord({name: timer.name, item: timer.item, qty: timer.qty, secs, source: 'timer'})); }
    catch(err){ showToast(err.message); }
    ptRerender();
    saveState();
    return;
  }
  const cancel = t.closest('[data-pt-cancel]');
  if(cancel){
    if(!confirm(`Cancel this timer? The time won’t be saved.\n${esText('Cancel this timer?')}`)) return;
    prepTimers = prepTimers.filter(x => x.id !== cancel.dataset.ptCancel);
    ptRerender();
    saveState();
    return;
  }
  if(t.closest('[data-pt-man-add]')){
    const root = document.getElementById('prepBoardRoot');
    const secs = (+(root.querySelector('[data-pt-man-min]').value || 0)) * 60 + (+(root.querySelector('[data-pt-man-sec]').value || 0));
    if(!secs){ showToast(`Enter the minutes and seconds it took · ${esText('Enter the minutes and seconds it took')}`); return; }
    try{ showToast(ptRecord({name: ptForm.name, item: ptForm.item, qty: ptForm.qty, secs, source: 'manual'})); }
    catch(err){ showToast(err.message); return; }
    ptManualOpen = false;
    ptRerender();
    saveState();
    return;
  }
  const remove = t.closest('[data-pt-remove]');
  if(remove){
    if(!confirm(`Remove this time from the leaderboard?\n${esText('Remove this time from the leaderboard?')}`)) return;
    prepTimes = prepTimes.filter(x => x.id !== remove.dataset.ptRemove);
    ptRerender();
    saveState();
  }
});

document.getElementById('prepBoardRoot').addEventListener('change', e=>{
  if(pbCurrentPage !== 'times') return;
  if(e.target.matches('[data-pt-name]')){
    ptForm.other = e.target.value === '__other';
    ptForm.name = ptForm.other ? '' : e.target.value;
    try{ if(ptForm.name) localStorage.setItem(PT_NAME_KEY, ptForm.name); }catch(err){}
    ptRerender();
    if(ptForm.other){ const box = document.querySelector('[data-pt-other-name]'); if(box) box.focus(); }
    return;
  }
  if(e.target.matches('[data-pt-other-name]')){
    ptForm.name = e.target.value.trim();
    try{ if(ptForm.name) localStorage.setItem(PT_NAME_KEY, ptForm.name); }catch(err){}
    ptRerender();
  }
});
