// ===== HUDDLE (Tim, Nov 18 2026) =====
// The pre-huddle and post-huddle for each daypart, and the store's focus for
// the month and the week, on the Lists tab beside Leader Transition. Team
// Leads and up.
//
// The look is Know the Numbers' (kn-page.js; the knp- classes in
// theme-cfa.css), dressed in Home's language (the Right Now card, Nov 21
// 2026; "Home's language" in huddle.css): a banner for the one thing, a
// small label over the words that matter, big-number tiles for the counts: a week of days, then one card per daypart with one big
// thing on it: the shift's ONE priority, and once it's closed, how many of
// its goals were hit. The focus sits above them in a navy band.
//
// The pre-huddle is Tim's Team Lead Pre-Shift Card: why are you here today,
// your ONE priority, up to three goals you can check when the shift ends
// (my PEC area, my own leadership, the system I'll make sure runs), each
// tied to the week's or the month's focus with a tap, and who you'll
// develop. The post-huddle closes it: each goal hit, partly or missed and
// why, one recognition, one thing for the next leader.
//
// The shift's numbers: once a daypart has started its card carries what the
// hub already recorded for it, never retyped: per daypart, productivity
// against its goal, the task timers, the waste logged and the food safety
// walkthroughs; per zone, the Zone Resets of its handoffs. The server adds
// them up (huddle_api.py shift_numbers); the drive-thru time and the guests'
// OSAT are Know the Numbers' own (kn-page.js), from the latest uploads.
//
// The week (directors): Day / Week at the top. The week adds up the huddles
// set and closed, the goals hit, the goals written against each focus, each
// leader's huddles, each daypart's numbers and who won a shift
// (huddle_api.py roll_up).
//
// The rules live on the server (huddle_api.py): when each opens, who may
// write, what a huddle holds. This page draws what the server sends and
// posts what was filled in; the quick picks come from the server too.
// Front of house and the kitchen each have their own huddles (FOH / Kitchen
// at the top, remembered on the device). FOH stays English only; on the
// kitchen's side every phrase carries its Spanish from the glossary
// (spanish.js, the Huddle section; CLAUDE.md, Spanish) through L / es / P
// below, and tests/test_huddle.py fails if one is missing. The directors'
// week is English, like their other pages. Line icons, never emoji.
// People's text only reaches the page through h().
(function(){
  'use strict';
  const API = '/api/huddle';
  const POLL_MS = 30000;
  const KINDS = ['pec', 'lead', 'system'];
  const RESULTS = ['hit', 'partly', 'missed'];
  const LS = {
    get: (k, d) => { try { const v = localStorage.getItem('huddle.' + k); return v === null ? d : v; } catch (e) { return d; } },
    set: (k, v) => { try { localStorage.setItem('huddle.' + k, v); } catch (e) {} },
  };
  const ICONS = {
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    flag: '<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>',
    pencil: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
    star: '<path d="m12 3 2.7 5.6 6.1.8-4.5 4.3 1.1 6.1L12 16.9l-5.4 2.9 1.1-6.1-4.5-4.3 6.1-.8z"/>',
    hand: '<path d="M4 12h13"/><path d="m12 6 6 6-6 6"/>',
    person: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/>',
  };

  const S = {root: null, side: LS.get('side', 'foh') === 'boh' ? 'boh' : 'foh', status: 'loading', error: '', data: null, date: null, mode: 'day', week: null, offset: 0, form: null, busy: false, poll: null, seq: 0};

  /* ---------- helpers ---------- */
  const h = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const icon = k => `<svg class="hd-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[k]}</svg>`;
  const now = () => Date.now() + S.offset;
  // Spanish beside the English, on the kitchen's side only.
  const boh = () => S.side === 'boh';
  const esOf = (en, ...a) => boh() && typeof esText === 'function' ? esText(en, ...a) : '';
  const es = (en, ...a) => { const t = esOf(en, ...a); return t ? ` <span class="es" lang="es">${h(t)}</span>` : ''; };
  const L = en => h(en) + es(en);                                                   // a phrase, then its Spanish
  const P = en => { const t = esOf(en); return h(t ? `${en} / ${t}` : en); };       // a placeholder
  const both = en => { const t = esOf(en); return t ? `${en} · ${t}` : en; };       // a toast, an error
  const dpEs = n => boh() && typeof esDaypart === 'function' && esDaypart(n) ? ` <span class="es" lang="es">${h(esDaypart(n))}</span>` : '';
  // The words a goal's kind and a result go by. Spelled out, so the glossary test sees each phrase.
  const kindLabel = k => k === 'pec' ? L('My PEC area') : k === 'lead' ? L('My leadership') : L('The system I’ll make sure runs');
  const kindHint = k => k === 'pec' ? P('One goal for the area you own') : k === 'lead' ? P('One thing you will do as a leader') : P('Pick one, or write your own');
  const kindShort = k => k === 'pec' ? L('PEC area') : k === 'lead' ? L('Leadership') : k === 'system' ? L('System') : L('Goal');
  const resultLabel = r => r === 'hit' ? L('Hit') : r === 'partly' ? L('Partly') : L('Missed');
  const shortName = n => String(n).replace(/\s*\(.*$/, '');
  const timeText = n => { const m = String(n).match(/\(([^)]+)\)/); return m ? m[1].replace('-', '–') : ''; };
  // Times read in the store's time zone, whatever the device is set to.
  function fmtTime(ms){
    const o = {hour: 'numeric', minute: '2-digit'};
    try { return new Date(ms).toLocaleTimeString('en-US', {...o, timeZone: (S.data && S.data.tz) || undefined}); } catch (e) { return new Date(ms).toLocaleTimeString('en-US', o); }
  }
  const atNoon = iso => new Date(iso + 'T12:00:00');
  const addDays = (iso, n) => { const d = atNoon(iso); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const dayLabel = (iso, opts) => atNoon(iso).toLocaleDateString('en-US', opts || {weekday: 'short', month: 'short', day: 'numeric'});
  function toast(msg){ if(typeof showToast === 'function') showToast(msg); }
  function shown(){ const v = document.getElementById('huddleView'); return !!(v && v.classList.contains('active')); }

  /* ---------- server ---------- */
  async function api(path, opts = {}){
    const r = await fetch(API + path, {method: opts.method || 'GET', credentials: 'same-origin', cache: 'no-store',
      headers: opts.body ? {'Content-Type': 'application/json'} : {}, body: opts.body ? JSON.stringify(opts.body) : undefined});
    let d = {};
    try { d = await r.json(); } catch (e) {}
    if(!r.ok){ const err = new Error(both(d.error || 'The Huddle couldn’t reach the server. Try again in a moment.')); err.status = r.status; throw err; }
    return d;
  }
  function take(d){
    S.data = d;
    S.offset = d.serverTime - Date.now();
    S.status = 'ready';
    S.error = '';
  }
  async function load(){
    const seq = ++S.seq;
    try {
      const q = '?side=' + S.side + (S.date ? '&date=' + encodeURIComponent(S.date) : '');
      const [d, w] = await Promise.all([api('/state' + q), S.mode === 'week' ? api('/week' + q) : null]);
      if(seq !== S.seq) return;                 // a newer ask is on its way
      take(d);
      S.week = w;
      if(!d.me.canFocus) S.mode = 'day';
    } catch (e) {
      if(seq !== S.seq) return;
      S.status = e.status === 403 ? 'locked' : (S.data ? 'ready' : 'error');
      S.error = e.message;
    }
    if(!S.form) render();                       // never redraw under someone typing
  }
  async function send(type, data, done){
    if(S.busy) return;
    S.busy = true;
    paintBusy();
    try {
      take(await api('/events', {method: 'POST', body: {type, data: {...data, side: S.side}}}));
      S.form = null;
      toast(both(done));
    } catch (e) {
      S.busy = false;
      paintBusy();
      const box = S.root.querySelector('.hd-error');
      if(box){ box.textContent = e.message; box.hidden = false; box.scrollIntoView({block: 'nearest'}); } else toast(e.message);
      return;
    }
    S.busy = false;
    render();
  }
  function paintBusy(){
    S.root.querySelectorAll('[data-hd-save]').forEach(b => { b.disabled = S.busy; });
  }

  /* ---------- the focus band ---------- */
  function periodLabel(scope){
    const d = S.data;
    if(scope === 'month') return atNoon(d.month + '-01').toLocaleDateString('en-US', {month: 'long'});
    return `${dayLabel(d.week, {month: 'short', day: 'numeric'})} – ${dayLabel(addDays(d.week, 5), {month: 'short', day: 'numeric'})}`;
  }
  function focusOpen(scope){
    const d = S.data;                           // this week or month, or one ahead
    return scope === 'month' ? d.month >= d.today.slice(0, 7) : addDays(d.week, 6) >= d.today;
  }
  function pillarTitles(){
    try { return (typeof lxPillars !== 'undefined' && Array.isArray(lxPillars) ? lxPillars : []).map(p => p && p.title).filter(Boolean); } catch (e) { return []; }
  }
  function focusFormHtml(scope){
    const f = S.data.focus[scope] || {};
    const tags = pillarTitles();
    if(f.tag && !tags.includes(f.tag)) tags.push(f.tag);
    return `
      <form class="hd-focus-form" data-hd-form="focus" data-hd-scope="${scope}">
        <label class="hd-field"><span>The ONE focus for ${scope === 'week' ? 'the week' : 'the month'}</span><input type="text" data-hd-f="text" maxlength="120" value="${h(f.text)}" placeholder="${scope === 'week' ? 'Sub 3-minute drive-thru' : 'Every guest feels known'}"></label>
        <label class="hd-field"><span>Why it matters, in one line</span><input type="text" data-hd-f="why" maxlength="160" value="${h(f.why)}"></label>
        ${tags.length ? `<label class="hd-field"><span>Scoreboard pillar (optional)</span><select data-hd-f="tag"><option value="">None</option>${tags.map(t => `<option ${t === f.tag ? 'selected' : ''}>${h(t)}</option>`).join('')}</select></label>` : ''}
        <p class="hd-error" hidden></p>
        <div class="hd-actions"><button type="submit" class="hd-btn is-light" data-hd-save>Save the focus</button><button type="button" class="hd-link is-light" data-hd-cancel>Cancel</button></div>
        <p class="hd-form-note">Leave the focus empty and save to clear it.</p>
      </form>`;
  }
  function focusHtml(scope){
    const d = S.data, f = d.focus[scope];
    const editing = S.form && S.form.kind === 'focus' && S.form.scope === scope;
    const canSet = d.me.canFocus && focusOpen(scope);
    return `
      <div class="hd-focus-col">
        <div class="hd-focus-k"><span>${scope === 'week' ? L('This week') : L('This month')} · ${h(periodLabel(scope))}</span>${canSet && !editing ? `<button type="button" class="hd-focus-set" data-hd-focus-edit="${scope}">${icon('pencil')}${f ? 'Change' : 'Set'}</button>` : ''}</div>
        ${editing ? focusFormHtml(scope) : f
          ? `<b class="hd-focus-text">${h(f.text)}</b>${f.why ? `<p class="hd-focus-why">${h(f.why)}</p>` : ''}${f.tag ? `<span class="hd-focus-tag">${h(f.tag)}</span>` : ''}`
          : `<p class="hd-focus-none">${canSet ? 'No focus yet. Set one so every huddle aims at it.' : L('No focus set yet. A director sets it.')}</p>`}
      </div>`;
  }

  /* ---------- a daypart's card ---------- */
  function phase(dp){
    const d = S.data, n = now();
    if(d.date !== d.today) return d.date < d.today ? 'past' : 'ahead';
    if(dp.post) return 'closed';
    if(dp.pre) return n >= dp.end ? 'due' : n >= dp.start ? 'running' : 'set';
    return n >= dp.preOpens ? (n >= dp.start ? 'late' : 'open') : 'ahead';
  }
  function goalHtml(g, pre, post){
    const r = post && post.results && post.results[g.id];
    return `
      <li class="hd-goal ${r ? 'is-' + h(r.result) : ''}">
        <span class="hd-goal-k">${kindShort(g.kind)}</span>
        <span class="hd-goal-text">${h(g.text)}${es(g.text)}${g.target ? ` <b class="hd-target">${h(g.target)}</b>` : ''}</span>
        <span class="hd-goal-meta">${g.owner && g.owner !== pre.by ? `<span class="hd-chip">${icon('person')}${h(g.owner)}</span>` : ''}${g.focus ? `<span class="hd-chip is-focus">${icon('flag')}${g.focus === 'week' ? L('Week focus') : L('Month focus')}</span>` : ''}${r ? `<span class="hd-result is-${h(r.result)}">${resultLabel(r.result)}</span>` : ''}</span>
        ${r && r.why ? `<span class="hd-goal-why">${h(r.why)}</span>` : ''}
      </li>`;
  }
  function planHtml(dp){
    const pre = dp.pre, post = dp.post;
    return `
      <p class="hd-purpose"><span class="knp-k">${L('Why I’m here')}</span>${h(pre.purpose)}${es(pre.purpose)}</p>
      <ul class="hd-goals">${pre.goals.map(g => goalHtml(g, pre, post)).join('')}</ul>
      ${pre.develop ? `<p class="hd-line">${icon('person')}<span><b>Developing ${h(pre.develop.who)}</b>${pre.develop.skill ? `: ${h(pre.develop.skill)}` : ''}${pre.develop.pea ? ` <span class="hd-chip">${L('PEA today')}</span>` : ''}${es('Developing N', pre.develop.who)}</span></p>` : ''}
      ${post && post.recognition ? `<p class="hd-line is-win">${icon('star')}<span><b>${h(post.recognition.who)}</b> won the shift${post.recognition.what ? `: ${h(post.recognition.what)}` : ''}${es('N won the shift', post.recognition.who)}</span></p>` : ''}
      ${post && post.handoff ? `<p class="hd-line">${icon('hand')}<span><b>${L('For the next leader:')}</b> ${h(post.handoff)}</span></p>` : ''}
      <p class="hd-by">Set by ${h(pre.by)} at ${h(fmtTime(pre.first || pre.at))}${post ? ` · closed by ${h(post.by)} at ${h(fmtTime(post.at))}` : ''}${es('Set by N at T', pre.by, fmtTime(pre.first || pre.at))}${post ? es('closed by N at T', post.by, fmtTime(post.at)) : ''}</p>`;
  }
  function heroHtml(dp, ph){
    if(dp.score){
      const all = dp.score.hit === dp.score.goals;
      return `<div class="knp-hero hd-hero is-banner is-score ${all ? 'is-ok' : ''}"><b>${dp.score.hit}/${dp.score.goals}</b><span>goals hit${dp.score.partly ? ` · ${dp.score.partly} partly` : ''}${es('N of M goals hit', dp.score.hit, dp.score.goals)}<br>priority: ${h(dp.pre.priority)}${es(dp.pre.priority)}</span></div>`;
    }
    if(dp.pre) return `<div class="knp-hero hd-hero is-banner is-words ${ph === 'due' ? 'is-bad' : ''}"><b>${h(dp.pre.priority)}${es(dp.pre.priority)}</b><span>the ONE priority${es('the ONE priority')}</span></div>`;
    const none = ph === 'past' ? L('No huddle was set for this daypart.')
      : ph === 'ahead' ? (S.data.date === S.data.today ? `The pre-huddle opens at ${h(fmtTime(dp.preOpens))}, ${S.data.preOpensMin} minutes before the daypart.${es('Pre-huddle opens at T', fmtTime(dp.preOpens), S.data.preOpensMin)}` : L('The pre-huddle opens on the day.'))
      : ph === 'late' ? L('No pre-huddle yet. It can still be filled in today.')
      : L('Two minutes before the shift: your purpose, your ONE priority, your goals.');
    return `<div class="knp-hero hd-hero"><span class="knp-none">${none}</span></div>`;
  }
  function actionsHtml(dp, ph){
    const key = h(dp.name);
    if(ph === 'open' || ph === 'late') return `<div class="hd-actions"><button type="button" class="hd-btn" data-hd-open="pre" data-hd-dp="${key}">${L('Start the pre-huddle')}</button></div>`;
    if(ph === 'set') return `<div class="hd-actions"><button type="button" class="hd-link" data-hd-open="pre" data-hd-dp="${key}">${icon('pencil')}${L('Change it')}</button></div>`;
    if(ph === 'running' || ph === 'due') return `<div class="hd-actions"><button type="button" class="hd-btn ${ph === 'due' ? '' : 'is-quiet'}" data-hd-open="post" data-hd-dp="${key}">${ph === 'due' ? L('Close the shift: post-huddle') : L('Post-huddle')}</button><button type="button" class="hd-link" data-hd-open="pre" data-hd-dp="${key}">${icon('pencil')}${L('Change it')}</button></div>`;
    if(ph === 'closed') return `<div class="hd-actions"><button type="button" class="hd-link" data-hd-open="post" data-hd-dp="${key}">${icon('pencil')}${L('Change the post-huddle')}</button></div>`;
    return '';
  }
  function cardHtml(dp){
    const d = S.data, n = now(), ph = phase(dp);
    const isNow = d.date === d.today && n >= dp.start && n < dp.end;
    const form = S.form && S.form.daypart === dp.name ? S.form.kind : null;
    const badge = ph === 'closed' || (ph === 'past' && dp.post) ? `<span class="hd-done">${icon('check')}Closed${es('Huddle closed')}</span>`
      : ph === 'due' ? `<span class="knp-now">${L('Close it')}</span>` : isNow ? `<span class="knp-now">${L('now')}</span>` : '';
    return `
      <section class="knp-card hd-card ${isNow ? 'is-now' : ''} ${dp.post ? 'is-closed' : ''}">
        <div class="knp-head"><h3>${h(shortName(dp.name))} <span>${h(timeText(dp.name))}</span>${dpEs(dp.name)}</h3>${badge}</div>
        ${boh() ? '' : `<p class="hd-lead"><span class="knp-k">Lead Captain</span>${dp.leads.length ? h(dp.leads.join(' / ')) : '<i>Not on Set Ups yet</i>'}</p>`}
        ${form === 'pre' ? preFormHtml(dp) : form === 'post' ? postFormHtml(dp) : `${heroHtml(dp, ph)}${dp.pre ? planHtml(dp) : ''}${actionsHtml(dp, ph)}${numbersHtml(dp)}`}
      </section>`;
  }

  /* ---------- the shift's numbers ---------- */
  const money = v => '$' + (Math.round(v * 100) % 100 ? v.toFixed(2) : Math.round(v).toLocaleString('en-US'));
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  function numbersHtml(dp){
    const n = dp.numbers;
    if(!n) return '';
    const stat = (label, value, note, cls) => `<div class="knp-stat ${cls || ''}"><span class="knp-k">${label}</span><b>${value}</b>${note ? `<small>${note}</small>` : ''}</div>`;
    const stats = [];
    const p = n.productivity;
    if(p && p.actual !== null) stats.push(stat(L('Productivity'), `${money(p.actual)}<i>/hr</i>`, p.goal !== null ? (p.actual >= p.goal ? `goal ${money(p.goal)}: met${es('goal G: met', money(p.goal))}` : `goal ${money(p.goal)}: ${money(p.goal - p.actual)} under${es('goal G: U under', money(p.goal), money(p.goal - p.actual))}`) : L('no goal set'), p.goal === null ? '' : p.actual >= p.goal ? 'is-ok' : 'is-under'));
    else if(p) stats.push(stat(L('Productivity goal'), `${money(p.goal)}<i>/hr</i>`, L('the actual comes in with the sales upload')));
    const t = n.timers;
    if(t){ const all = t.ontime + t.late + t.missed; stats.push(stat('Timers', `${t.ontime} of ${all}`, `on time${t.late ? ` · ${t.late} late` : ''}${t.missed ? ` · ${t.missed} missed` : ''}`, t.missed ? 'is-over' : t.late ? 'is-under' : 'is-ok')); }
    stats.push(stat(L('Waste logged'), n.waste ? money(n.waste.cost) : '$0', boh()
      ? (n.waste ? `${plural(n.waste.count, 'entry', 'entries')}, kitchen${es('N entries, kitchen', n.waste.count)}` : L('nothing logged, kitchen'))
      : (n.waste ? `${plural(n.waste.count, 'entry', 'entries')}, front of house` : 'nothing logged, front of house')));
    if(n.foodSafety) stats.push(stat(L('Food safety'), String(n.foodSafety), `${n.foodSafety === 1 ? 'walkthrough' : 'walkthroughs'} finished this daypart${es('N walkthroughs', n.foodSafety)}${es('finished this daypart')}`, 'is-ok'));
    // Know the Numbers' own, from the latest uploads: not this shift's alone.
    try {
      const dt = typeof knDriveThru === 'function' ? knDriveThru(dp.name) : null;
      if(dt && typeof knClock === 'function') stats.push(stat(L('Drive-thru time'), knClock(dt.secs), `${dt.range ? `average, ${h(dt.range)}` : 'average'}${es('average')}`));
      const osat = typeof knOsat === 'function' ? knOsat(dp.name) : null;
      if(osat) stats.push(stat(L('Guest OSAT'), `${Math.round(osat.osat)}%`, `highly satisfied, ${h(osat.label)}${es('highly satisfied')}`));
    } catch (e) {}
    const zones = (n.zones || []).map(z => `
      <details class="hd-zones">
        <summary><span class="knp-k">Zone Reset · ${h(shortName(z.handoff))}</span><b class="${z.done === z.zones.length ? 'is-done' : ''}">${z.done} of ${z.zones.length} zones done</b></summary>
        <ul>${z.zones.map(r => `<li class="${r.checked >= r.total ? 'is-done' : r.checked ? 'is-part' : ''}"><span>${r.checked >= r.total ? icon('check') : ''}${h(r.name)}</span><span class="hd-zone-n">${r.checked}/${r.total}${r.by.length ? ` · ${h(r.by.join(', '))}` : ''}</span></li>`).join('')}</ul>
      </details>`).join('');
    return `
      <div class="hd-numbers">
        <p class="hd-numbers-k"><b>${L('The shift’s numbers')}</b> ${L('per daypart, from what the hub recorded')}</p>
        <div class="knp-stats">${stats.join('')}</div>
        ${zones ? `<p class="hd-numbers-k"><b>Zone Resets</b> per zone</p>${zones}` : ''}
      </div>`;
  }

  /* ---------- the forms ---------- */
  const picksHtml = (list, target) => `<div class="hd-picks">${list.map(p => `<button type="button" class="hd-pick" data-hd-pick="${target}" data-hd-val="${h(p)}">${h(p)}${es(p)}</button>`).join('')}</div>`;
  const peopleList = dp => `<datalist id="hdPeople">${dp.people.map(p => `<option value="${h(p)}">`).join('')}</datalist>`;
  function preFormHtml(dp){
    const d = S.data, pre = dp.pre || {goals: []};
    const used = new Set();
    // An earlier huddle's goals go back to their own rows; a second goal of a kind takes a free row.
    const rows = KINDS.map(k => { const g = pre.goals.find(x => x.kind === k && !used.has(x)); if(g) used.add(g); return g || null; });
    pre.goals.filter(g => !used.has(g)).forEach(g => { const i = rows.indexOf(null); if(i >= 0) rows[i] = g; });
    const dev = pre.develop || {};
    const focusBtns = g => ['week', 'month'].filter(s => d.focus[s]).map(s => `<button type="button" class="hd-pick is-toggle" data-hd-focus="${s}" aria-pressed="${g && g.focus === s}" title="${h(d.focus[s].text)}">${icon('flag')}${s === 'week' ? L('Week focus') : L('Month focus')}</button>`).join('');
    return `
      <form class="hd-form" data-hd-form="pre" data-hd-dp="${h(dp.name)}">
        ${peopleList(dp)}
        <h4 class="hd-step"><i>1</i><span>${L('Why are you here today?')}</span></h4>
        ${picksHtml(d.picks.purpose, 'purpose')}
        <input type="text" data-hd-f="purpose" maxlength="140" value="${h(pre.purpose)}" placeholder="${P('Your purpose for this shift, in one sentence')}" aria-label="Why are you here today?">
        <h4 class="hd-step"><i>2</i><span>${L('Your ONE priority')}</span></h4>
        ${picksHtml(d.picks.priority, 'priority')}
        <input type="text" data-hd-f="priority" maxlength="80" value="${h(pre.priority)}" placeholder="${P('What you want to accomplish today')}" aria-label="Your ONE priority">
        <h4 class="hd-step"><i>3</i><span>${L('Goals you can check when the shift ends')}</span></h4>
        ${KINDS.map((k, i) => { const g = rows[i]; return `
        <fieldset class="hd-goal-row" data-hd-goal="${k}">
          <legend>${kindLabel(k)}</legend>
          ${k === 'system' ? picksHtml(d.picks.system, 'goal') : ''}
          <input type="text" data-hd-f="text" maxlength="160" value="${h(g && g.text)}" placeholder="${kindHint(k)}">
          <div class="hd-goal-extra">
            <label class="hd-field"><span>${L('Number to hit (optional)')}</span><input type="text" data-hd-f="target" maxlength="24" value="${h(g && g.target)}" placeholder="3:00"></label>
            <label class="hd-field"><span>${L('Owner')}</span><input type="text" data-hd-f="owner" maxlength="60" list="hdPeople" value="${h(g && g.owner !== (dp.pre && dp.pre.by) ? g.owner : '')}" placeholder="${P('Me')}"></label>
          </div>
          ${focusBtns(g) ? `<div class="hd-picks">${focusBtns(g)}</div>` : ''}
        </fieldset>`; }).join('')}
        <h4 class="hd-step"><i>4</i><span>${L('Who would you like to develop?')}</span></h4>
        <div class="hd-goal-extra">
          <label class="hd-field"><span>${L('Who')}</span><input type="text" data-hd-f="who" maxlength="60" list="hdPeople" value="${h(dev.who)}" placeholder="${P('Someone on this shift')}"></label>
          <label class="hd-field"><span>${L('The skill to coach')}</span><input type="text" data-hd-f="skill" maxlength="120" value="${h(dev.skill)}"></label>
        </div>
        <label class="hd-check"><input type="checkbox" data-hd-f="pea" ${dev.pea ? 'checked' : ''}><span>${L('A PEA will be done on them today')}</span></label>
        <p class="hd-error" hidden></p>
        <div class="hd-actions"><button type="submit" class="hd-btn" data-hd-save>${L('Save the pre-huddle')}</button><button type="button" class="hd-link" data-hd-cancel>${L('Cancel')}</button></div>
      </form>`;
  }
  function postFormHtml(dp){
    const pre = dp.pre, post = dp.post || {results: {}};
    const rec = post.recognition || {};
    return `
      <form class="hd-form" data-hd-form="post" data-hd-dp="${h(dp.name)}">
        ${peopleList(dp)}
        ${numbersHtml(dp)}
        <h4 class="hd-step"><i>1</i><span>${L('How did each goal go?')}</span></h4>
        ${pre.goals.map(g => { const r = post.results[g.id] || {}; return `
        <fieldset class="hd-goal-row" data-hd-result-for="${h(g.id)}">
          <legend>${h(g.text)}${es(g.text)}${g.target ? ` <b class="hd-target">${h(g.target)}</b>` : ''}</legend>
          <div class="hd-results" role="group" aria-label="Result">${RESULTS.map(v => `<button type="button" class="hd-res is-${v}" data-hd-res="${v}" aria-pressed="${r.result === v}">${resultLabel(v)}</button>`).join('')}</div>
          <input type="text" data-hd-f="why" maxlength="160" value="${h(r.why)}" placeholder="${P('One line: why')}" aria-label="Why">
        </fieldset>`; }).join('')}
        <h4 class="hd-step"><i>2</i><span>${L('Who won the shift?')}</span></h4>
        <div class="hd-goal-extra">
          <label class="hd-field"><span>${L('Who')}</span><input type="text" data-hd-f="who" maxlength="60" list="hdPeople" value="${h(rec.who)}"></label>
          <label class="hd-field"><span>${L('For what')}</span><input type="text" data-hd-f="what" maxlength="160" value="${h(rec.what)}"></label>
        </div>
        <h4 class="hd-step"><i>3</i><span>${L('One thing for the next leader')}</span></h4>
        <input type="text" data-hd-f="handoff" maxlength="200" value="${h(post.handoff)}" placeholder="${P('What they need to know walking in')}" aria-label="One thing for the next leader">
        <p class="hd-error" hidden></p>
        <div class="hd-actions"><button type="submit" class="hd-btn" data-hd-save>${L('Save the post-huddle')}</button><button type="button" class="hd-link" data-hd-cancel>${L('Cancel')}</button></div>
      </form>`;
  }
  const val = (el, f) => { const x = el.querySelector(`[data-hd-f="${f}"]`); return x ? (x.type === 'checkbox' ? x.checked : x.value.trim()) : ''; };
  function submit(form){
    const kind = form.dataset.hdForm;
    if(kind === 'focus'){
      send('focus', {scope: form.dataset.hdScope, date: S.data.date, text: val(form, 'text'), why: val(form, 'why'), tag: val(form, 'tag')}, 'Focus saved');
    } else if(kind === 'pre'){
      const goals = [...form.querySelectorAll('[data-hd-goal]')].map(row => {
        const on = row.querySelector('[data-hd-focus][aria-pressed="true"]');
        return {kind: row.dataset.hdGoal, text: val(row, 'text'), target: val(row, 'target'), owner: val(row, 'owner'), focus: on ? on.dataset.hdFocus : ''};
      }).filter(g => g.text);
      send('pre', {date: S.data.date, daypart: form.dataset.hdDp, purpose: val(form, 'purpose'), priority: val(form, 'priority'), goals,
        develop: {who: val(form, 'who'), skill: val(form, 'skill'), pea: val(form, 'pea')}}, 'Pre-huddle saved');   // both() adds the Spanish: see TOASTS in the test
    } else {
      const results = {};
      form.querySelectorAll('[data-hd-result-for]').forEach(row => {
        const on = row.querySelector('[data-hd-res][aria-pressed="true"]');
        results[row.dataset.hdResultFor] = {result: on ? on.dataset.hdRes : '', why: val(row, 'why')};
      });
      send('post', {date: S.data.date, daypart: form.dataset.hdDp, results, recognition: {who: val(form, 'who'), what: val(form, 'what')}, handoff: val(form, 'handoff')}, 'Shift closed');
    }
  }

  /* ---------- the week (directors) ---------- */
  const pct = (a, b) => b ? Math.round(a / b * 100) + '%' : '—';
  function tallyText(t){
    if(!t.goals) return 'No goals tied to it yet this week.';
    const bits = [`${t.hit} hit`, t.partly ? `${t.partly} partly` : '', t.missed ? `${t.missed} missed` : '', t.open ? `${t.open} still open` : ''].filter(Boolean);
    return `${plural(t.goals, 'goal', 'goals')} this week · ${bits.join(' · ')}`;
  }
  function weekHtml(){
    const w = S.week;
    if(!w) return '<p class="knp-lede">Adding up the week…</p>';
    const t = w.totals;
    const cell = {};
    w.cells.forEach(c => { cell[c.date + '|' + c.daypart] = c; });
    const cellHtml = (day, dp) => {
      const c = cell[day + '|' + dp];
      if(!c) return '<td class="hd-wk-cell is-off" aria-label="Closed"></td>';
      const label = c.state === 'closed' ? `${c.hit}/${c.goals}` : c.state === 'set' ? 'Set' : c.state === 'none' ? 'None' : '';
      const say = c.state === 'closed' ? `closed, ${c.hit} of ${c.goals} goals hit` : c.state === 'set' ? 'set, not closed' : c.state === 'none' ? 'no huddle' : 'not yet';
      return `<td class="hd-wk-cell is-${c.state}"><button type="button" data-hd-day="${day}" aria-label="${h(dayLabel(day))}, ${h(shortName(dp))}: ${say}${c.by ? ', ' + h(c.by) : ''}" title="${h(c.by)}">${label}</button></td>`;
    };
    const focusCol = scope => {
      const f = w.focus[scope];
      return `<div class="hd-focus-col"><div class="hd-focus-k"><span>${scope === 'week' ? 'This week' : 'This month'} · ${h(periodLabel(scope))}</span></div>${f
        ? `<b class="hd-focus-text">${h(f.text)}</b><p class="hd-focus-why">${h(tallyText(f))}</p>`
        : '<p class="hd-focus-none">No focus was set.</p>'}</div>`;
    };
    const stat = (label, value, note, cls) => `<div class="knp-stat ${cls || ''}"><span class="knp-k">${label}</span><b>${value}</b>${note ? `<small>${note}</small>` : ''}</div>`;
    const partHtml = p => {
      const tm = p.timers, all = tm.ontime + tm.late + tm.missed;
      return `
        <section class="knp-card hd-card">
          <div class="knp-head"><h3>${h(shortName(p.name))} <span>${h(timeText(p.name))}</span></h3></div>
          <div class="knp-hero hd-hero is-banner is-score"><b>${p.closed}/${p.expected}</b><span>huddles closed<br>${p.set} set</span></div>
          <div class="knp-stats">
            ${stat('Goals hit', p.goals ? `${p.hit} of ${p.goals}` : '—', p.goals ? [p.partly ? `${p.partly} partly` : '', p.missed ? `${p.missed} missed` : '', p.open ? `${p.open} open` : ''].filter(Boolean).join(' · ') : 'no goals written')}
            ${stat('Productivity', p.prodKnown ? `${p.prodMet} of ${p.prodKnown}` : '—', p.prodKnown ? 'shifts met the goal' : 'no actuals yet', p.prodKnown ? (p.prodMet === p.prodKnown ? 'is-ok' : 'is-under') : '')}
            ${boh() ? '' : stat('Timers', all ? pct(tm.ontime, all) : '—', all ? `on time · ${tm.late} late · ${tm.missed} missed` : 'none came due', all ? (tm.missed ? 'is-over' : tm.late ? 'is-under' : 'is-ok') : '')}
            ${stat('Waste logged', money(p.waste), boh() ? 'kitchen' : 'front of house')}
          </div>
        </section>`;
    };
    return `
      <div class="knp-day-sum"><div><span>Huddles set</span><b>${t.set} of ${t.expected}</b></div><div><span>Closed</span><b>${t.closed} of ${t.expected}</b></div><div><span>Goals hit</span><b>${t.goals ? `${t.hit} of ${t.goals}` : '—'}</b></div></div>
      <div class="hd-focus">${focusCol('month')}${focusCol('week')}</div>
      <h3 class="hd-h3">The week at a glance</h3>
      <div class="hd-wk-wrap"><table class="hd-wk">
        <thead><tr><th scope="col"><span class="hd-sr">Daypart</span></th>${w.days.map(d => `<th scope="col" class="${d === w.today ? 'is-today' : ''}">${h(dayLabel(d, {weekday: 'short'}))} <b>${+d.slice(8)}</b></th>`).join('')}</tr></thead>
        <tbody>${w.dayparts.map(dp => `<tr><th scope="row">${h(shortName(dp))}</th>${w.days.map(d => cellHtml(d, dp)).join('')}</tr>`).join('')}</tbody>
      </table></div>
      <p class="hd-key"><span class="is-closed">2/3</span> closed, goals hit <span class="is-set">Set</span> set, not closed yet <span class="is-none">None</span> no huddle</p>
      <h3 class="hd-h3">Leaders</h3>
      ${w.leaders.length ? `<ul class="hd-rows">${w.leaders.map(l => `<li><b>${h(l.name)}</b><span>${plural(l.set, 'huddle', 'huddles')} set · ${l.closed} closed · ${l.goals ? `${l.hit} of ${l.goals} goals hit` : 'no goals'}</span></li>`).join('')}</ul>` : '<p class="knp-lede">Nobody has set a huddle this week yet.</p>'}
      ${t.develop ? `<p class="hd-sum"><b>${t.develop}</b> ${t.develop === 1 ? 'huddle named' : 'huddles named'} someone to develop · <b>${t.pea}</b> planned a PEA</p>` : ''}
      <h3 class="hd-h3">Who won a shift</h3>
      ${w.wins.length ? `<ul class="hd-rows">${w.wins.map(x => `<li><b>${icon('star')}${h(x.who)}</b><span>${x.what ? h(x.what) + ' · ' : ''}${h(dayLabel(x.date, {weekday: 'short'}))} ${h(shortName(x.daypart))}, from ${h(x.by)}</span></li>`).join('')}</ul>` : '<p class="knp-lede">No recognition written yet this week.</p>'}
      <h3 class="hd-h3">Each daypart across the week</h3>
      <div class="knp-cards">${w.byDaypart.map(partHtml).join('')}</div>
      <p class="knp-foot">A huddle counts as expected once its daypart has started. Goals tied to a focus are counted in the week they were written. The numbers are per daypart, from what the hub recorded.</p>`;
  }

  /* ---------- the page ---------- */
  function render(){
    const root = S.root;
    if(!root) return;
    const head = `<div class="knp-headrow"><h2 class="knp-title">${L('Huddle')}</h2><p class="knp-lede">${L('Two minutes before the shift, two minutes after: aim it at the focus, then say how it went.')}</p></div>`;
    if(S.status === 'locked'){ root.innerHTML = `${head}<p class="knp-lede">${h(S.error)}</p>`; return; }
    if(!S.data){ root.innerHTML = `${head}<p class="knp-lede">${S.status === 'error' ? h(S.error) : L('Loading the huddles…')}</p>`; return; }
    const d = S.data;
    const week = [0, 1, 2, 3, 4, 5].map(i => addDays(d.week, i));
    const closed = d.dayparts.filter(x => x.post).length, set = d.dayparts.filter(x => x.pre).length;
    const weekMode = S.mode === 'week' && d.me.canFocus;
    // Front of house or the kitchen (the kitchen's name carries its Spanish on both sides, so it can be found); directors also get Day / Week.
    const sides = `<div class="hd-modes" role="group" aria-label="Front of house or kitchen"><button type="button" class="hd-mode" data-hd-side="foh" aria-pressed="${!boh()}">FOH</button><button type="button" class="hd-mode" data-hd-side="boh" aria-pressed="${boh()}">Kitchen${typeof esHtml === 'function' ? esHtml('Kitchen') : ''}</button></div>`;
    const modes = `<div class="hd-switches">${sides}${d.me.canFocus ? `<div class="hd-modes" role="group" aria-label="Day or week">${[['day', 'Day'], ['week', 'Week']].map(([m, label]) => `<button type="button" class="hd-mode" data-hd-mode="${m}" aria-pressed="${S.mode === m}">${label}</button>`).join('')}</div>` : ''}</div>`;
    root.innerHTML = `
      ${head}
      ${modes}
      <div class="knp-days hd-days" role="group" aria-label="Pick a day">
        <button type="button" class="hd-week" data-hd-day="${addDays(d.week, -7)}" aria-label="The week before">‹</button>
        ${week.map(x => `<button type="button" class="knp-day ${x === d.date && !weekMode ? 'is-on' : ''} ${x === d.today ? 'is-today' : ''}" data-hd-day="${x}" aria-pressed="${x === d.date}"><span>${h(dayLabel(x, {weekday: 'short'}))}</span><b>${+x.slice(8)}</b></button>`).join('')}
        <button type="button" class="hd-week" data-hd-day="${addDays(d.week, 7)}" aria-label="The week after">›</button>
      </div>
      ${weekMode ? weekHtml() : `
      <div class="hd-focus">${focusHtml('month')}${focusHtml('week')}</div>
      ${d.dayparts.length ? `
      <p class="hd-sum">${h(dayLabel(d.date, {weekday: 'long', month: 'short', day: 'numeric'}))} · <b>${set}</b> of ${d.dayparts.length} huddles set · <b>${closed}</b> closed${es('N of M huddles set, K closed', set, d.dayparts.length, closed)}</p>
      <div class="knp-cards">${d.dayparts.map(cardHtml).join('')}</div>` : `<p class="knp-lede">The store is closed ${h(dayLabel(d.date, {weekday: 'long'}))}. Pick another day.${es('The store is closed that day. Pick another day.')}</p>`}
      <p class="knp-foot">${boh()
        ? `One huddle a daypart, on the Know the Numbers dayparts. The names offered come from the kitchen's Set Ups. A huddle is filled in on its own day; the pre-huddle opens ${d.preOpensMin} minutes before the daypart, the post-huddle once it has started. The shift's numbers are per daypart.${es('Huddle foot', d.preOpensMin)}`
        : `One huddle a daypart, on the Know the Numbers dayparts. The Lead Captain and the names offered come from Set Ups. A huddle is filled in on its own day; the pre-huddle opens ${d.preOpensMin} minutes before the daypart, the post-huddle once it has started. The shift's numbers are per daypart; only Zone Resets are recorded per zone, so only they are shown per zone. Drive-thru time and OSAT are averages from the latest uploads.`}</p>`}`;
  }

  function mount(){
    if(S.root) return;
    S.root = document.getElementById('huddleRoot');
    S.root.addEventListener('click', e => {
      const t = e.target.closest('button');
      if(!t || !S.root.contains(t)) return;
      if(t.dataset.hdSide){ S.side = t.dataset.hdSide === 'boh' ? 'boh' : 'foh'; LS.set('side', S.side); S.form = null; S.week = null; S.data = null; S.status = 'loading'; render(); load(); return; }
      if(t.dataset.hdMode){ S.mode = t.dataset.hdMode; S.form = null; S.week = null; render(); load(); return; }
      if(t.dataset.hdDay){
        // In the week, the arrows move a week; a day (in the row or the grid) opens that day.
        if(!t.classList.contains('hd-week')) S.mode = 'day';
        S.date = t.dataset.hdDay; S.form = null; S.week = null; load(); return;
      }
      if(t.dataset.hdFocusEdit){ S.form = {kind: 'focus', scope: t.dataset.hdFocusEdit}; render(); focusFirst(); return; }
      if(t.dataset.hdOpen){ S.form = {kind: t.dataset.hdOpen, daypart: t.dataset.hdDp}; render(); focusFirst(); return; }
      if('hdCancel' in t.dataset){ S.form = null; render(); return; }
      if(t.dataset.hdPick){
        // A quick pick fills the line beside it: the purpose, the priority, or its own goal.
        const scope = t.dataset.hdPick === 'goal' ? t.closest('[data-hd-goal]') : t.closest('form');
        const input = scope.querySelector(`[data-hd-f="${t.dataset.hdPick === 'goal' ? 'text' : t.dataset.hdPick}"]`);
        input.value = t.dataset.hdVal;
        t.parentNode.querySelectorAll('.hd-pick').forEach(b => b.classList.toggle('is-on', b === t));
        return;
      }
      if(t.dataset.hdFocus){
        const on = t.getAttribute('aria-pressed') === 'true';
        t.parentNode.querySelectorAll('[data-hd-focus]').forEach(b => b.setAttribute('aria-pressed', 'false'));
        t.setAttribute('aria-pressed', String(!on));
        return;
      }
      if(t.dataset.hdRes){
        t.parentNode.querySelectorAll('[data-hd-res]').forEach(b => b.setAttribute('aria-pressed', String(b === t)));
      }
    });
    S.root.addEventListener('submit', e => { e.preventDefault(); submit(e.target); });
    S.root.addEventListener('input', e => {
      // Typing over a quick pick: it's no longer the pick.
      const box = e.target.previousElementSibling;
      if(box && box.classList && box.classList.contains('hd-picks')) box.querySelectorAll('.is-on').forEach(b => b.classList.remove('is-on'));
    });
  }
  function focusFirst(){
    const form = S.root.querySelector('form');
    if(form && form.scrollIntoView) form.closest('.knp-card, .hd-focus-col').scrollIntoView({block: 'nearest'});
  }

  // navigation.js: the view opened.
  window.hdActivate = function(){
    mount();
    if(!S.form) render();
    load();
    clearInterval(S.poll);
    S.poll = setInterval(() => { if(!shown()){ clearInterval(S.poll); return; } if(!document.hidden && !S.form) load(); }, POLL_MS);
  };
  window.HuddlePage = {S, phase};
})();
