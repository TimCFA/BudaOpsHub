// ===== TRAINER TRIAL =====
// The 30-day Trainer Trial (The Foundations Lab), rebuilt Oct 19 2026 from
// the Trainer Playbook, the Trainer Training Guide and the Certified Trainer
// Evaluation. One trial per candidate:
//
//  1. Plan: the Playbook's four weeks (each a theme and its tasks), the trial
//     requirements, and the final evaluation in the first week of the month
//     after the trial ends.
//  2. Shift log: leaders rate the five trainer behaviors on a shift (1–3) and
//     write a win plus What / So What / Now What; a shift can be tagged as a
//     story for any other evaluation line.
//  3. Evaluation: the Certified Trainer Evaluation, Parts 1–3, Self and Leader
//     side by side; parts weighted equally; A 2.5+ certifies. Each line shows
//     the stories behind it, and the evaluation's own rule is enforced: a 2
//     needs a story from the past week, a 3 needs 2–3.
//  4. Decision: the certification gate and the director's call.
//
// What Levelset already gives the hub is used instead of typing it again:
//  - PEAs the candidate GAVE during the trial (week 3's "complete 3 PEAs",
//    week 4's zone PEAs) tick themselves.
//  - The candidate's own team member PEA average is the evidence for
//    "Maintain 2.75+ TM PEA".
//  - The mentee's outcome: their PEAs from raters OTHER than the candidate,
//    so the trainer is judged on how the trainee does, not on their own
//    scoring. Where the candidate also rated the mentee, how far their scores
//    sit from everyone else's shows (grading calibration).
//  - Directors (director PIN) see the Levelset notes written about the
//    candidate and the notes the candidate wrote on the PEAs they gave, and
//    tag sentences to evaluation lines (tt1/tt2/tt3 cards in leaders.js);
//    tagged sentences count as stories.
//
// Saved in the private people section: each trial is an entry of
// trainerTrainees ({id, name, coach, startDate} as before, plus the fields
// below). trainerProgress holds the old 23-item curriculum statuses; nothing
// reads it any more, but it stays saved untouched.

let trainerTrainees = []; // persisted: [{id, name, coach, startDate, peaName, director, mentee, menteePeaName, checks, evalLead, evalSelf, reflect, growth, decision, shifts}]
let trainerProgress = {}; // persisted (legacy, kept as it was)
let ttActiveId = null;
let ttTab = 'plan';        // 'plan' | 'shifts' | 'eval' | 'decision'
let ttShiftForm = null;    // the shift form that's open: {id} ('' id = new)
let ttRepaintPending = false;

const TT_DAYS = 30;
const TT_WEEKS = [
  {n: 1, title: 'Foundation & Mindset', theme: 'Lead self first', items: [
    ['w1-orient', 'Orientation + expectations overview'],
    ['w1-playbook', 'Complete the Trainer Playbook'],
    ['w1-shadow', 'Shadow a Certified Trainer / Team Lead'],
    ['w1-mentee', 'Meet your 3H’er (new hire mentee)'],
    ['w1-dir', 'Learn and practice the Demonstrate-Imitate-Repeat method']]},
  {n: 2, title: 'Skill Practice & Zone Ownership', theme: 'Model the standard', items: [
    ['w2-coach', 'Lead coaching conversations with your new hire'],
    ['w2-growth', 'Identify growth areas and deliver coaching'],
    ['w2-gaps', 'Close execution gaps with your team'],
    ['w2-zone', 'Participate in zone leadership alongside a leader']]},
  {n: 3, title: 'Coaching & Mentorship', theme: 'Lead others with influence', items: [
    ['w3-zone', 'Fully lead a zone with light oversight'],
    ['w3-peas', 'Complete 3 PEAs']]},
  {n: 4, title: 'Ownership & Execution', theme: 'Multiply the mission', items: [
    ['w4-moments', 'Begin leading training moments with your new hire'],
    ['w4-peak', 'Partner with team members during peak times'],
    ['w4-zonepea', 'Practice zone PEAs'],
    ['w4-guest', 'Support guest experience with precision']]}
];
const TT_REQS = [
  ['r-pathway', 'Pathway training plans complete up to Trainer'],
  ['r-fish', 'Fish Assessment passed'],
  ['r-quiz', 'Trainer Quiz passed'],
  ['r-meeting', 'Attended the monthly Trainer Meeting']
];
const TT_FINAL = ['w3-final', 'Final coaching evaluation held'];
// Checkoffs Levelset can tick: the PEAs the candidate gave, from the trial's
// first day through the given day, at least `min`.
const TT_AUTO = {'w3-peas': {from: 1, to: 21, min: 3}, 'w4-zonepea': {from: 22, to: TT_DAYS, min: 1}};
const TT_REFLECT = [
  ['Team Member Values', [
    ['v1', 'How do you make sure every trainee, and every guest, feels seen, valued, and welcomed through your actions and attitude?'],
    ['v2', 'What does “working with urgency and excellence” look like to you during training, and how do you model that standard for new team members?'],
    ['v3', 'How do you demonstrate humility in your role: being open to feedback, putting the team first, and serving others with integrity?']]],
  ['Execution of Daily Operations', [
    ['o1', 'How do you bring energy, enthusiasm, and positivity to your training shifts to help new hires feel comfortable and excited to learn?'],
    ['o2', 'In what ways do you consistently demonstrate the standard and protect our culture through your daily example?'],
    ['o3', 'How do you ensure you explain and demonstrate tasks clearly so new hires understand and can confidently perform their role?']]],
  ['Self-Leadership', [
    ['s1', 'How do you balance celebrating wins with challenging team members to keep growing during training?'],
    ['s2', 'What steps do you take to develop others into confident team members and potential future leaders?'],
    ['s3', 'How do you seek feedback and use it to improve your own skills while helping others reach their potential?']]]
];
const TT_DAYPARTS = ['Breakfast', 'Lunch', 'Afternoon', 'Dinner', 'Close'];
const TT_ZONES = ['FOH', 'BOH', 'Drive-Thru'];
const TT_OUTCOMES = [['certify', 'Certify', 'Trainer certified'], ['extend', 'Extend', 'More time to close gaps'], ['notyet', 'Not yet', 'Stays Certified Team Member']];

// ----- Helpers -----
const ttKey = s => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
function ttAddDays(iso, n){ const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return toLocalISODate(d); }
function ttDay(start, on){ if(!start) return 0; return Math.round((new Date((on || today) + 'T00:00:00') - new Date(start + 'T00:00:00')) / 86400000) + 1; }
const ttWeekOf = day => day < 1 ? 0 : Math.min(4, Math.ceil(day / 7));
const ttEnd = t => ttAddDays(t.startDate, TT_DAYS - 1);
function ttFmt(iso){ return iso ? new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {month: 'short', day: 'numeric'}) : '—'; }
const ttF2 = n => n == null ? '—' : n.toFixed(2);
function ttAvg(list){ const v = list.filter(x => typeof x === 'number' && x > 0); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; }
const ttBy = () => (typeof getInitials === 'function' && getInitials()) || '';
const ttIsDirector = () => typeof tpDirector !== 'undefined' && !!tpDirector;
const ttRatings = () => typeof peaAllRatings === 'function' ? peaAllRatings() : [];
const ttPeaName = t => (t.peaName || t.name || '').trim();
const ttMenteeName = t => (t.menteePeaName || t.mentee || '').trim();
function ttUid(p){ return (p || 'tt') + Date.now() + Math.random().toString(36).slice(2, 8); }
function ttLsNames(){ const n = (typeof peaRatings === 'object' && peaRatings && Array.isArray(peaRatings.names)) ? peaRatings.names : []; return [...new Set(n.filter(Boolean))].sort((a, b) => a.localeCompare(b)); }
// A typed name, as Levelset spells it (same name, any case or spacing).
function ttLsMatch(name){ const k = ttKey(name); return k ? (ttLsNames().find(n => ttKey(n) === k) || '') : ''; }
function ttFinalWindow(t){ const e = new Date(ttEnd(t) + 'T00:00:00'); const from = toLocalISODate(new Date(e.getFullYear(), e.getMonth() + 1, 1)); return {from, to: ttAddDays(from, 6)}; }
const ttActive = () => trainerTrainees.find(t => t.id === ttActiveId) || null;
function ttGrade(score){
  if(score == null) return {g: '—', cls: '', label: 'Not scored yet'};
  if(score >= 2.5) return {g: 'A', cls: 'is-a', label: 'Certified & eligible for promotion'};
  if(score >= 2) return {g: 'B', cls: 'is-b', label: 'Good performance, working toward mastery'};
  if(score >= 1.6) return {g: 'C', cls: 'is-c', label: 'Below expectations on a few items'};
  return {g: 'F', cls: 'is-f', label: 'Needs immediate action'};
}

// The evaluation's lines, from the tt1/tt2/tt3 cards (leaders.js).
function ttParts(){
  const C = typeof LD_CARDS === 'object' ? LD_CARDS : {};
  return [
    {k: 'p1', card: 'tt1', name: 'Part 1 · Team Culture', note: 'Hospitality, Hustle, Humility'},
    {k: 'p2', card: 'tt2', name: 'Part 2 · Trainer Execution', note: 'The five trainer behaviors, plus team member PEAs'},
    {k: 'p3', card: 'tt3', name: 'Part 3 · What’s Important Now', note: 'Leadership capacity traits'}
  ].map(p => ({...p, rows: ((C[p.card] || {}).pillars || []).map(([k, name, desc]) => ({k, name, desc, tag: `${p.card}:${k}`, area: p.card === 'tt2'}))
    .concat(p.k === 'p2' ? [{k: 'pea275', name: 'Maintain 2.75+ TM PEA performance', desc: 'Role-models positional excellence in ALL team member roles.', tag: '', levelset: true}] : [])}));
}
const ttRows = () => ttParts().flatMap(p => p.rows);
const ttAreas = () => ttRows().filter(r => r.area);
function ttScores(ratings){
  const out = {}, parts = ttParts();
  parts.forEach(p => { out[p.k] = ttAvg(p.rows.map(r => (ratings || {})[r.k])); });
  const vals = parts.map(p => out[p.k]);
  out.overall = vals.every(v => v != null) ? ttAvg(vals) : null;
  out.partial = ttAvg(vals);
  return out;
}

// ----- From Levelset -----
// PEAs the candidate gave (not on themselves), oldest first.
function ttGiven(t){
  const me = ttKey(ttPeaName(t));
  return me ? ttRatings().filter(r => ttKey(r.leader) === me && ttKey(r.employee) !== me).sort((a, b) => a.at.localeCompare(b.at)) : [];
}
function ttGivenBetween(t, fromDay, toDay){
  const from = ttAddDays(t.startDate, fromDay - 1), to = ttAddDays(t.startDate, toDay - 1);
  return ttGiven(t).filter(r => r.date >= from && r.date <= to);
}
function ttAutoDone(t, key){ const a = TT_AUTO[key]; return a ? ttGivenBetween(t, a.from, a.to).length >= a.min : false; }
// The candidate's own team member positions (FOH/BOH), latest ratings.
function ttOwnTM(t){
  const strength = typeof peaStrengthByPerson === 'function' ? peaStrengthByPerson() : {};
  const me = ttKey(ttPeaName(t));
  const name = Object.keys(strength).find(n => ttKey(n) === me);
  const groups = typeof PEA_POSITION_GROUPS !== 'undefined' ? PEA_POSITION_GROUPS : [];
  const tm = new Set(groups.filter(g => g.key === 'foh' || g.key === 'boh').flatMap(g => g.positions));
  const cells = name ? Object.entries(strength[name].positions).filter(([pos]) => tm.has(pos)).map(([pos, c]) => ({pos, avg: c.avg, tier: c.tier})) : [];
  const avg = cells.length ? cells.reduce((s, c) => s + c.avg, 0) / cells.length : null;
  return {cells, avg, green: cells.filter(c => c.avg >= 2.75).length};
}
// The mentee's standing from raters other than the candidate, plus how the
// candidate's own scores of the mentee compare (positions both rated).
function ttMentee(t){
  const who = ttKey(ttMenteeName(t)), me = ttKey(ttPeaName(t));
  if(!who) return {none: true};
  const recent = typeof PEA_RECENT_RATINGS === 'number' ? PEA_RECENT_RATINGS : 5;
  const all = ttRatings().filter(r => ttKey(r.employee) === who);
  const others = all.filter(r => r.leader && ttKey(r.leader) !== me);
  const mine = all.filter(r => me && ttKey(r.leader) === me);
  const byPos = list => {
    const m = {};
    list.slice().sort((a, b) => b.at.localeCompare(a.at)).forEach(r => { (m[r.position] = m[r.position] || []).push(r); });
    return Object.keys(m).map(pos => { const rec = m[pos].slice(0, recent); return {pos, avg: rec.reduce((s, r) => s + (+r.overall || 0), 0) / rec.length, n: m[pos].length}; });
  };
  const pos = byPos(others), minePos = byPos(mine);
  const avg = pos.length ? pos.reduce((s, x) => s + x.avg, 0) / pos.length : null;
  const tier = avg == null ? null : (typeof peaTierFor === 'function' ? peaTierFor(avg) : null);
  const shared = minePos.filter(m => pos.some(o => o.pos === m.pos));
  const delta = shared.length ? shared.reduce((s, m) => s + m.avg - pos.find(o => o.pos === m.pos).avg, 0) / shared.length : null;
  const first = all.length ? all.map(r => r.date).sort()[0] : '';
  return {name: ttMenteeName(t), total: all.length, others: others.length, mine: mine.length, pos, avg, tier, first, day30: first ? ttAddDays(first, 29) : '',
    delta, shared: shared.length, pass: !!tier && tier.key !== 'notyet'};
}

// ----- Stories: the evaluation's evidence -----
// A story for a line is a logged shift (a trainer behavior rated 2+, or the
// line tagged on the shift) or, for directors, a Levelset sentence tagged to
// the line (about the candidate, or written by them on a PEA).
function ttLsTagged(t){
  if(typeof tpLsTagged !== 'function') return [];
  const n = ttPeaName(t);
  return n ? tpLsTagged(n).concat(tpLsTagged((typeof TP_LS_RATER === 'string' ? TP_LS_RATER : 'rater:') + n)) : [];
}
function ttStories(t, row, tagged){
  const out = [];
  (t.shifts || []).forEach(s => {
    const r = (s.ratings || {})[row.k];
    if((row.area && r >= 2) || (s.evidence || []).includes(row.k)) out.push({date: s.date, from: 'Shift', by: s.observer || '', text: s.win || s.what || ''});
  });
  if(row.tag) (tagged || []).forEach(x => { if((x.pillars || []).includes(row.tag)) out.push({date: x.date, from: 'Levelset', by: x.leader || '', text: x.text || '', position: x.position || ''}); });
  return out.sort((a, b) => b.date.localeCompare(a.date));
}
// "The past week": the 7 days ending today, or the trial's last day once it's over.
function ttRefDate(t){ const end = ttEnd(t); return today < end ? today : end; }
function ttEvidence(t, row, tagged){
  const all = ttStories(t, row, tagged), ref = ttRefDate(t), from = ttAddDays(ref, -6);
  return {all, week: all.filter(s => s.date >= from && s.date <= ref)};
}
const ttNeeded = r => r === 3 ? 2 : r === 2 ? 1 : 0;
// Leader ratings the evidence doesn't hold up: [{row, why}].
function ttShort(t, tagged){
  const lead = t.evalLead || {}, out = [];
  const own = ttOwnTM(t);
  ttRows().forEach(row => {
    const r = lead[row.k];
    if(!r) return;
    if(row.levelset){
      if(r >= 2 && (own.avg == null || own.avg < 2.75)) out.push({row, why: own.avg == null ? 'No team member PEAs in Levelset to back it' : `Levelset average is ${own.avg.toFixed(2)}, under 2.75`});
      return;
    }
    const need = ttNeeded(r), have = ttEvidence(t, row, tagged).week.length;
    if(have < need) out.push({row, why: `A ${r} needs ${need === 2 ? '2–3 stories' : 'a story'} from the past week (${have})`});
  });
  return out;
}

function ttCheckDone(t, key){ const c = (t.checks || {})[key]; return !!(c && c.done) || ttAutoDone(t, key); }
const ttAllCheckKeys = () => [...TT_WEEKS.flatMap(w => w.items.map(i => i[0])), ...TT_REQS.map(r => r[0]), TT_FINAL[0]];
function ttGate(t, tagged){
  const ls = ttScores(t.evalLead), open = ttAllCheckKeys().filter(k => !ttCheckDone(t, k));
  const short = ttShort(t, tagged), mentee = ttMentee(t);
  const lines = {
    score: ls.overall != null && ls.overall >= 2.5,
    checks: open.length === 0,
    window: ttDay(t.startDate) >= TT_DAYS,
    final: ttCheckDone(t, TT_FINAL[0]),
    stories: ls.overall != null && short.length === 0,
    mentee: !mentee.none && mentee.pass
  };
  return {ls, open, short, mentee, lines, ok: Object.values(lines).every(Boolean)};
}
function ttStatus(t){
  const d = t.decision && t.decision.outcome;
  if(d === 'certify') return {cls: 'is-good', label: 'Certified'};
  if(d === 'extend') return {cls: 'is-warn', label: 'Extended'};
  if(d === 'notyet') return {cls: 'is-bad', label: 'Not yet'};
  const day = ttDay(t.startDate);
  if(day < 1) return {cls: 'is-quiet', label: 'Starts ' + ttFmt(t.startDate)};
  if(day > TT_DAYS){ const fw = ttFinalWindow(t); return ttCheckDone(t, TT_FINAL[0]) ? {cls: 'is-info', label: 'Decision due'} : {cls: 'is-info', label: `Final eval ${ttFmt(fw.from)}–${ttFmt(fw.to)}`}; }
  const wk = ttWeekOf(day);
  const behind = TT_WEEKS.filter(w => w.n < wk).flatMap(w => w.items).filter(i => !ttCheckDone(t, i[0])).length;
  return behind ? {cls: 'is-warn', label: `Behind · ${behind} open`} : {cls: 'is-good', label: 'On track'};
}

// ----- Rendering -----
function ttChip(st){ return `<span class="ttv-chip ${st.cls}">${escapeHtml(st.label)}</span>`; }
function ttStrip(t){
  const day = ttDay(t.startDate), dates = new Set((t.shifts || []).map(s => s.date)), given = new Set(ttGiven(t).map(r => r.date));
  let cells = '';
  for(let i = 1; i <= TT_DAYS; i++){
    const date = ttAddDays(t.startDate, i - 1);
    const marks = [dates.has(date) ? 'shift logged' : '', given.has(date) ? 'PEA given' : ''].filter(Boolean);
    cells += `<i class="w${ttWeekOf(i)} ${i <= day ? 'is-past' : ''} ${i === day ? 'is-today' : ''} ${dates.has(date) ? 'has-shift' : ''} ${given.has(date) ? 'has-pea' : ''}" title="${escapeHtml(`Day ${i} · ${ttFmt(date)}${marks.length ? ' · ' + marks.join(', ') : ''}`)}">${i}</i>`;
  }
  return `<div class="ttv-strip-wrap"><div class="ttv-strip" aria-label="The 30-day trial">${cells}</div></div>
    <div class="ttv-legend">${TT_WEEKS.map(w => `<span><i class="w${w.n}"></i>Week ${w.n}: ${escapeHtml(w.theme)}</span>`).join('')}<span><i class="is-dot-shift"></i>Shift logged</span><span><i class="is-dot-pea"></i>PEA given</span></div>`;
}
function ttCheckRow(t, key, label, canEdit){
  const c = (t.checks || {})[key] || {}, auto = ttAutoDone(t, key), done = !!c.done || auto;
  const a = TT_AUTO[key];
  const meta = c.done ? `${escapeHtml(c.by || '')}${c.at ? ' · ' + escapeHtml(ttFmt(toLocalISODate(new Date(c.at)))) : ''}` : auto ? `From Levelset · ${ttGivenBetween(t, a.from, a.to).length} PEAs given` : a ? `Levelset ticks this at ${a.min} PEA${a.min === 1 ? '' : 's'} given (${ttGivenBetween(t, a.from, a.to).length} so far)` : '';
  return `<label class="ttv-check ${done ? 'is-done' : ''}"><input type="checkbox" data-ttv-check="${key}" ${done ? 'checked' : ''} ${canEdit && !auto ? '' : 'disabled'}><span><span class="ttv-check-label">${escapeHtml(label)}</span>${meta ? `<small>${meta}</small>` : ''}</span></label>`;
}

function ttPlanHtml(t){
  const day = ttDay(t.startDate), wk = ttWeekOf(Math.min(day, TT_DAYS)), fw = ttFinalWindow(t);
  const given = ttGivenBetween(t, 1, TT_DAYS), own = ttOwnTM(t), m = ttMentee(t);
  const weeks = TT_WEEKS.map(w => {
    const from = ttAddDays(t.startDate, (w.n - 1) * 7), to = ttAddDays(t.startDate, w.n === 4 ? TT_DAYS - 1 : w.n * 7 - 1);
    return `<section class="ttv-week w${w.n} ${w.n === wk && day <= TT_DAYS && day >= 1 ? 'is-now' : ''}"><div class="ttv-week-head"><b>Week ${w.n}</b><span>${ttFmt(from)}–${ttFmt(to)}</span></div>
      <h4>${escapeHtml(w.title)}</h4><p class="ttv-week-theme">${escapeHtml(w.theme)}</p>${w.items.map(i => ttCheckRow(t, i[0], i[1], true)).join('')}</section>`;
  }).join('');
  const final = `<section class="ttv-week is-final ${day > TT_DAYS ? 'is-now' : ''}"><div class="ttv-week-head"><b>After day 30</b><span>${ttFmt(fw.from)}–${ttFmt(fw.to)}</span></div>
    <h4>Final Evaluation</h4><p class="ttv-week-theme">First week of the next month</p>${ttCheckRow(t, TT_FINAL[0], TT_FINAL[1], true)}
    <p class="dir-note">The candidate self-rates and answers the reflection first; leaders score in Evaluation.</p></section>`;
  const byWeek = TT_WEEKS.map(w => ttGivenBetween(t, (w.n - 1) * 7 + 1, w.n === 4 ? TT_DAYS : w.n * 7).length);
  const menteeLine = m.none ? '<p class="dir-empty">Add the 3H’er mentee in Trial details below.</p>'
    : !m.total ? `<p class="dir-empty">No Levelset ratings under “${escapeHtml(m.name)}” yet. If Levelset spells the name differently, set it in Trial details.</p>`
    : !m.others ? `<p class="dir-note">Only ${escapeHtml(ldShortSafe(ttPeaName(t)))} has rated ${escapeHtml(ldShortSafe(m.name))} so far. It counts once another leader rates them.</p>`
    : `<p class="ttv-big"><span class="tp-tier is-${m.tier.key}">${m.avg.toFixed(2)}</span> ${escapeHtml(m.tier.label)} <small class="dir-muted">from ${m.others} rating${m.others === 1 ? '' : 's'} by other leaders · ${m.pos.length} position${m.pos.length === 1 ? '' : 's'}</small></p>
       ${m.day30 ? `<p class="dir-note">First rated ${escapeHtml(ttFmt(m.first))}; 30-day evaluation around ${escapeHtml(ttFmt(m.day30))}.</p>` : ''}
       ${m.delta != null ? `<p class="dir-note ${Math.abs(m.delta) >= 0.5 ? 'ttv-flag' : ''}">Grading check: ${escapeHtml(ldShortSafe(ttPeaName(t)))}’s scores of ${escapeHtml(ldShortSafe(m.name))} run ${m.delta >= 0 ? '+' : '−'}${Math.abs(m.delta).toFixed(2)} ${m.delta >= 0 ? 'above' : 'below'} other leaders’ on ${m.shared} shared position${m.shared === 1 ? '' : 's'}${Math.abs(m.delta) >= 0.5 ? '. Worth a calibration talk.' : '.'}</p>` : ''}`;
  return `<div class="ttv-weeks">${weeks}${final}</div>
    <div class="ttv-two">
      <section class="dir-card"><h3>From Levelset</h3>
        <div class="ld-stats"><div><b>${given.length}</b><span>PEAs given in the trial</span></div><div><b>${own.avg == null ? '—' : own.avg.toFixed(2)}</b><span>Own TM PEA avg (${own.green}/${own.cells.length} green)</span></div></div>
        <div class="ttv-weekbars" aria-label="PEAs given each week">${byWeek.map((n, i) => `<span class="w${i + 1}"><i style="height:${Math.min(100, n * 25)}%"></i><b>${n}</b><small>Wk ${i + 1}</small></span>`).join('')}</div>
        <p class="dir-note">Week 3 asks for 3 PEAs; the rhythm after that is at least 1 PEA per daypart worked.${ttPeaName(t) && !ttLsMatch(ttPeaName(t)) ? ` <b>No Levelset ratings under “${escapeHtml(ttPeaName(t))}”.</b> Set their Levelset name in Trial details.` : ''}</p>
        ${given.length ? `<details class="tp-log"><summary>${given.length} PEA${given.length === 1 ? '' : 's'} given</summary><ul class="dir-list dir-list-sm">${given.slice().reverse().map(r => `<li><span>${escapeHtml(ttFmt(r.date))} · ${escapeHtml(ldShortSafe(r.employee))} on ${escapeHtml(r.position)}</span><span class="tp-tier is-${peaTierFor(+r.overall || 0).key}">${escapeHtml(String(r.overall))}</span></li>`).join('')}</ul></details>` : ''}
      </section>
      <section class="dir-card"><h3>Mentee outcome</h3><p class="dir-note">${escapeHtml(t.mentee || 'The 3H’er')}’s PEAs from leaders other than the candidate. The trainer’s result is the trainee’s result.</p>${menteeLine}</section>
    </div>
    <section class="dir-card"><h3>Trial requirements</h3>${TT_REQS.map(r => ttCheckRow(t, r[0], r[1], true)).join('')}</section>
    <details class="dir-card ttv-details"><summary>Trial details</summary>
      <div class="ttv-fields">
        ${ttField('Candidate', 'name', t.name)}${ttField('Their name in Levelset', 'peaName', t.peaName, 'ttvLsNames', ttLsMatch(t.name) || 'Same as above')}
        ${ttField('Team Lead training them', 'coach', t.coach)}${ttField('Recommended by (Director)', 'director', t.director)}
        ${ttField('3H’er mentee', 'mentee', t.mentee, 'ttvLsNames')}${ttField('Mentee’s name in Levelset', 'menteePeaName', t.menteePeaName, 'ttvLsNames', 'Same as above')}
        <label class="ttv-field"><span>Start date</span><input type="date" data-ttv-field="startDate" value="${escapeHtml(t.startDate || '')}"></label>
      </div>
      <datalist id="ttvLsNames">${ttLsNames().map(n => `<option value="${escapeHtml(n)}"></option>`).join('')}</datalist>
      <button type="button" class="btn btn-ghost dir-btn ttv-danger" data-ttv-remove="${escapeHtml(t.id)}">Remove this trial</button>
    </details>`;
}
function ttField(label, key, value, list, placeholder){
  return `<label class="ttv-field"><span>${escapeHtml(label)}</span><input type="text" data-ttv-field="${key}" value="${escapeHtml(value || '')}" ${list ? `list="${list}"` : ''} ${placeholder ? `placeholder="${escapeHtml(placeholder)}"` : ''} autocomplete="off"></label>`;
}
const ldShortSafe = n => typeof ldShort === 'function' ? ldShort(n) : n;

function ttShiftFormHtml(t){
  const s = (ttShiftForm.id && (t.shifts || []).find(x => x.id === ttShiftForm.id)) || {};
  const r = s.ratings || {}, ev = s.evidence || [];
  const tagRows = ttRows().filter(x => !x.area && !x.levelset);
  return `<form class="dir-card ttv-shift-form" id="ttvShiftForm">
    <div class="ld-row"><h3>${s.id ? 'Edit shift' : 'Log a trial shift'}</h3><button type="button" class="btn btn-ghost dir-btn" data-ttv-shift-cancel>Cancel</button></div>
    <div class="ttv-fields">
      <label class="ttv-field"><span>Date</span><input type="date" name="date" value="${escapeHtml(s.date || today)}" max="${today}" required></label>
      <label class="ttv-field"><span>Daypart</span><select name="daypart">${TT_DAYPARTS.map(d => `<option ${s.daypart === d ? 'selected' : ''}>${d}</option>`).join('')}</select></label>
      <label class="ttv-field"><span>Zone</span><select name="zone">${TT_ZONES.map(d => `<option ${s.zone === d ? 'selected' : ''}>${d}</option>`).join('')}</select></label>
      <label class="ttv-field"><span>Observed by</span><input type="text" name="observer" value="${escapeHtml(s.observer || ttBy())}" required></label>
    </div>
    <p class="ttv-label">Trainer behaviors <small>1 Below · 2 Meets · 3 Exceeding · skip what you didn’t see</small></p>
    ${ttAreas().map(a => `<div class="ttv-erow is-compact"><div><b>${escapeHtml(a.name)}</b><small>${escapeHtml(a.desc)}</small></div><div class="ttv-rate" data-ttv-form-rate="${a.k}">${[1, 2, 3].map(v => `<button type="button" class="v${v}" aria-pressed="${r[a.k] === v}" data-v="${v}">${v}</button>`).join('')}</div></div>`).join('')}
    <p class="ttv-label">This shift is a story for <small>tag what you saw done well; behaviors rated 2+ above count on their own</small></p>
    <div class="ld-chips">${tagRows.map(x => `<button type="button" class="ld-chip" data-ttv-evtag="${x.k}" aria-pressed="${ev.includes(x.k)}">${escapeHtml(x.name)}</button>`).join('')}</div>
    <label class="ttv-field"><span>Win to celebrate</span><textarea name="win" rows="2" placeholder="The specific thing they did that set the standard">${escapeHtml(s.win || '')}</textarea></label>
    <div class="ttv-fields">
      <label class="ttv-field"><span>What</span><textarea name="what" rows="3" placeholder="What did you see or hear?">${escapeHtml(s.what || '')}</textarea></label>
      <label class="ttv-field"><span>So what</span><textarea name="sowhat" rows="3" placeholder="Why it matters for guests, team, or results">${escapeHtml(s.sowhat || '')}</textarea></label>
      <label class="ttv-field"><span>Now what</span><textarea name="nowwhat" rows="3" placeholder="What to do differently next shift">${escapeHtml(s.nowwhat || '')}</textarea></label>
    </div>
    <label class="ttv-field ttv-narrow"><span>CARES Cash they gave</span><input type="number" name="cares" min="0" value="${+s.cares || 0}"></label>
    <div class="ld-acts"><button type="submit" class="btn btn-primary dir-btn">${s.id ? 'Save changes' : 'Save shift'}</button>${s.id ? `<button type="button" class="btn btn-ghost dir-btn ttv-danger" data-ttv-shift-del="${escapeHtml(s.id)}">Delete shift</button>` : ''}</div>
  </form>`;
}
function ttShiftsHtml(t){
  const list = (t.shifts || []).slice().sort((a, b) => b.date.localeCompare(a.date) || (b.at || 0) - (a.at || 0));
  const rows = ttRows();
  const head = `<div class="ld-row ttv-head"><div><h3>Shift observations</h3><p class="dir-note">Log after each trial shift. PEAs come from Levelset on their own.</p></div>${ttShiftForm ? '' : '<button type="button" class="btn btn-primary dir-btn" data-ttv-shift-new>Log a shift</button>'}</div>`;
  const items = list.map(s => `<li class="ttv-shift"><div class="ttv-shift-when"><b>${escapeHtml(ttFmt(s.date))}</b><small>Day ${ttDay(t.startDate, s.date)} · ${escapeHtml(s.daypart || '')}${s.zone ? ' · ' + escapeHtml(s.zone) : ''}</small></div>
    <div class="ttv-shift-body"><div class="dir-note-meta"><span>Observed by <b>${escapeHtml(s.observer || '—')}</b>${+s.cares ? ` · ${+s.cares} CARES Cash given` : ''}</span><button type="button" class="ld-link" data-ttv-shift-edit="${escapeHtml(s.id)}">Edit</button></div>
      <div class="ttv-pills">${ttAreas().filter(a => (s.ratings || {})[a.k]).map(a => `<span class="ttv-pill r${s.ratings[a.k]}">${escapeHtml(a.name)} <b>${s.ratings[a.k]}</b></span>`).join('')}${(s.evidence || []).map(k => `<span class="ttv-pill">Story: ${escapeHtml((rows.find(x => x.k === k) || {}).name || k)}</span>`).join('')}</div>
      <dl class="ttv-www">${[['Win', s.win], ['What', s.what], ['So what', s.sowhat], ['Now what', s.nowwhat]].filter(x => x[1]).map(([l, v]) => `<dt>${l}</dt><dd>${escapeHtml(v)}</dd>`).join('')}</dl></div></li>`).join('');
  return head + (ttShiftForm ? ttShiftFormHtml(t) : '') + (list.length ? `<ul class="ttv-shifts">${items}</ul>` : '<p class="dir-empty">No shifts logged yet. After a trial shift, log it to rate the five trainer behaviors and capture the feedback.</p>');
}

function ttRate(group, key, val){ return `<div class="ttv-rate" role="group">${[1, 2, 3].map(v => `<button type="button" class="v${v}" aria-pressed="${val === v}" data-ttv-rate="${group}" data-key="${key}" data-v="${v}" aria-label="${v}">${v}</button>`).join('')}</div>`; }
function ttEvalHtml(t){
  const tagged = ttLsTagged(t), lead = t.evalLead || {}, self = t.evalSelf || {};
  const ls = ttScores(lead), ss = ttScores(self), g = ttGrade(ls.overall), short = ttShort(t, tagged), own = ttOwnTM(t);
  const shortOf = k => short.find(x => x.row.k === k);
  const director = ttIsDirector();
  let h = `<div class="ttv-two">
    <section class="dir-card"><p class="ttv-label">Certified Trainer Evaluation · leader score</p>
      <div class="ttv-grade-row"><span class="ttv-grade ${g.cls}">${g.g}</span><div><b class="ttv-num">${ttF2(ls.overall)}</b><p class="dir-note">${escapeHtml(g.label)}</p></div></div>
      <div class="ld-stats">${ttParts().map(p => `<div><b>${ttF2(ls[p.k])}</b><span>${escapeHtml(p.name.split(' · ')[0])}</span></div>`).join('')}<div><b>${ttF2(ss.overall)}</b><span>Self score</span></div></div>
      ${short.length ? `<p class="ttv-flag">${short.length} leader rating${short.length === 1 ? '' : 's'} not backed by the evidence yet.</p>` : ''}</section>
    <section class="dir-card"><p class="ttv-label">How scoring works</p>
      <p class="dir-note"><b>1</b> Below standard · <b>2</b> Meets standard · <b>3</b> Exceeding standard. Each part averages out of 3 and the three parts weigh the same. <b>A</b> 2.5+ certified · <b>B</b> 2–2.49 · <b>C</b> 1.6–1.99 · <b>F</b> under 1.6.</p>
      <p class="dir-note">Story rule, from the evaluation: a 2 needs a story from the past week, a 3 needs 2–3. Stories are logged shifts${director ? ' and Levelset sentences tagged below' : ' (directors also see tagged Levelset notes)'}. “Maintain 2.75+ TM PEA” is checked against Levelset.</p>
      <p class="dir-note">Self is the candidate’s own score from their eval folder; leaders enter it.</p></section></div>`;
  ttParts().forEach(p => {
    h += `<section class="dir-card"><div class="ld-row"><div><h3>${escapeHtml(p.name)}</h3><p class="dir-note">${escapeHtml(p.note)}</p></div><span class="ttv-num-sm">Self ${ttF2(ss[p.k])} · Leader ${ttF2(ls[p.k])}</span></div>
      <div class="ttv-erow ttv-colhead"><span></span><span>Self</span><span>Leader</span></div>
      ${p.rows.map(row => {
        const sh = shortOf(row.k);
        let ev;
        if(row.levelset) ev = `<small class="ttv-ev">Levelset: ${own.avg == null ? 'no team member PEAs yet' : `${own.avg.toFixed(2)} across ${own.cells.length} position${own.cells.length === 1 ? '' : 's'} (${own.green} green)`}</small>`;
        else {
          const E = ttEvidence(t, row, tagged);
          ev = `<small class="ttv-ev">Stories: <b>${E.week.length}</b> in the past week · <b>${E.all.length}</b> in the trial</small>${E.all.length ? `<details class="ttv-stories"><summary>See stories</summary><ul>${E.all.slice(0, 8).map(s => `<li><b>${escapeHtml(ttFmt(s.date))}</b> <em class="ld-pill ${s.from === 'Levelset' ? 'is-ls' : ''}">${s.from}</em> ${escapeHtml(s.text || '(no note)')}${s.by ? ` <small class="dir-muted">${escapeHtml(ldShortSafe(s.by))}</small>` : ''}</li>`).join('')}</ul></details>` : ''}`;
        }
        return `<div class="ttv-erow"><div><b>${escapeHtml(row.name)}</b><small>${escapeHtml(row.desc)}</small>${ev}${sh ? `<span class="ttv-flag">${escapeHtml(sh.why)}</span>` : ''}</div>
          <div data-col="Self">${ttRate('evalSelf', row.k, self[row.k])}</div><div data-col="Leader">${ttRate('evalLead', row.k, lead[row.k])}</div></div>`;
      }).join('')}</section>`;
  });
  const rf = t.reflect || {};
  h += `<section class="dir-card"><h3>Candidate reflection</h3><p class="dir-note">The questions from the eval folder, answered by the candidate before the coaching evaluation.</p>
    ${TT_REFLECT.map(([sec, qs]) => `<p class="ttv-label">${escapeHtml(sec)}</p>${qs.map(([k, q]) => `<label class="ttv-field"><span class="ttv-q">${escapeHtml(q)}</span><textarea rows="2" data-ttv-reflect="${k}">${escapeHtml(rf[k] || '')}</textarea></label>`).join('')}`).join('')}</section>`;
  const name = ttPeaName(t), cards = ['tt1', 'tt2', 'tt3'];
  if(name && typeof tpLsCardHtml === 'function'){
    h += `<p class="ttv-label ttv-ls-head">Stories from Levelset · tag a sentence to an evaluation line and it counts above</p>`;
    h += tpLsCardHtml(name, cards) + tpLsCardHtml((typeof TP_LS_RATER === 'string' ? TP_LS_RATER : 'rater:') + name, cards);
  }
  return h;
}

function ttDecisionHtml(t){
  const G = ttGate(t, ttLsTagged(t)), d = t.decision || {}, gp = t.growth || {}, fw = ttFinalWindow(t), director = ttIsDirector();
  const rowsAll = [...TT_WEEKS.flatMap(w => w.items), ...TT_REQS, TT_FINAL];
  const label = k => (rowsAll.find(i => i[0] === k) || [k, k])[1];
  const m = G.mentee;
  const line = (ok, text, aside) => `<li class="${ok ? 'is-ok' : 'is-no'}"><span class="ttv-mark" aria-label="${ok ? 'Met' : 'Not met'}">${ok ? '✓' : '✕'}</span><span>${text}${aside ? ` <small class="dir-muted">${aside}</small>` : ''}</span></li>`;
  return `<div class="ttv-two">
    <section class="dir-card"><h3>Certification gate</h3><ul class="ttv-gate">
      ${line(G.lines.score, 'Leader evaluation score of 2.5 or higher', ttF2(G.ls.overall))}
      ${line(G.lines.stories, 'Every leader rating backed by stories and Levelset', G.ls.overall == null ? 'not scored' : `${G.short.length} short`)}
      ${line(G.lines.mentee, 'Mentee at On the Rise or better, rated by other leaders', m.none ? 'no mentee set' : !m.others ? 'no other leader’s rating yet' : `${m.tier.label} ${m.avg.toFixed(2)}`)}
      ${line(G.lines.checks, 'All checkoffs and requirements complete', `${ttAllCheckKeys().length - G.open.length}/${ttAllCheckKeys().length}`)}
      ${line(G.lines.window, '30-day window complete', ttFmt(ttEnd(t)))}
      ${line(G.lines.final, 'Final evaluation held', `${ttFmt(fw.from)}–${ttFmt(fw.to)}`)}
    </ul>
    ${G.open.length ? `<p class="dir-note">Still open: ${G.open.map(k => escapeHtml(label(k))).join('; ')}</p>` : ''}
    ${G.short.length ? `<p class="dir-note">Ratings to back up: ${G.short.map(x => escapeHtml(x.row.name)).join('; ')}</p>` : ''}
    <p class="ttv-verdict ${G.ok ? 'is-ok' : ''}">${G.ok ? 'Meets the bar for certification. Certified pay starts the next payroll period in the next month, and the trainer is eligible for promotion.' : 'Doesn’t meet the bar yet. Extend the trial, or mark Not yet with the gaps and next steps.'}</p></section>
    <section class="dir-card"><h3>Decision</h3>
      <div class="ttv-outcomes">${TT_OUTCOMES.map(([k, l, s]) => `<button type="button" aria-pressed="${d.outcome === k}" data-ttv-outcome="${k}" ${director ? '' : 'disabled'}><b>${l}</b><small>${s}</small></button>`).join('')}</div>
      ${director ? '' : '<p class="dir-note">Directors record the decision (sign in with the director PIN).</p>'}
      <label class="ttv-field"><span>Reasoning</span><textarea rows="3" data-ttv-decreason ${director ? '' : 'readonly'} placeholder="Why this decision, in specifics">${escapeHtml(d.reason || '')}</textarea></label>
      ${d.outcome ? `<p class="dir-note">Recorded${d.by ? ` by ${escapeHtml(d.by)}` : ''}${d.at ? ` · ${escapeHtml(ttFmt(toLocalISODate(new Date(d.at))))}` : ''}${director ? ' · <button type="button" class="ld-link" data-ttv-outcome-clear>Clear</button>' : ''}</p>` : ''}
    </section></div>
  <section class="dir-card"><h3>Growth plan for next quarter</h3><div class="ttv-fields">${[['professional', 'Professional goals'], ['personal', 'Personal goal'], ['support', 'Support needed from leadership'], ['notes', 'Notes']].map(([k, l]) => `<label class="ttv-field"><span>${l}</span><textarea rows="3" data-ttv-growth="${k}">${escapeHtml(gp[k] || '')}</textarea></label>`).join('')}</div></section>
  <section class="dir-card"><h3>After certification: quarterly Trainer goals</h3>
    <div class="ld-stats"><div><b>80+</b><span>PEAs a quarter</span></div><div><b>50+</b><span>CARES Cash a quarter</span></div><div><b>90%</b><span>New hires On the Rise+ by day 30</span></div></div>
    <p class="dir-note">Plus the monthly Trainer Meeting, at least 1 PEA per daypart worked, and real-time Oreo feedback.</p></section>`;
}

function renderTrainerTrial(){
  const root = document.getElementById('trainerTrialRoot');
  if(!root) return;
  ttRepaintPending = false;
  const mast = `<div class="trial-masthead"><p class="trial-masthead-eyebrow">The Foundations Lab</p><h2 class="trial-masthead-title">Trainer Trial</h2><p class="trial-masthead-subtitle">30 days from Certified Team Member to certified Trainer</p></div>`;
  if(!trainerTrainees.length){
    root.innerHTML = `<div class="trial-root ttv" data-theme="trainer">${mast}<div class="trial-empty-state"><p>No Trainer Trials yet.</p><button class="trial-cta" data-ttv-open-add>Start a Trainer Trial</button></div></div>`;
    return;
  }
  if(!ttActive()) ttActiveId = trainerTrainees[0].id;
  const t = ttActive(), st = ttStatus(t), day = ttDay(t.startDate);
  const tabs = [['plan', 'Plan'], ['shifts', `Shift log <small>${(t.shifts || []).length}</small>`], ['eval', 'Evaluation'], ['decision', 'Decision']];
  const body = ttTab === 'shifts' ? ttShiftsHtml(t) : ttTab === 'eval' ? ttEvalHtml(t) : ttTab === 'decision' ? ttDecisionHtml(t) : ttPlanHtml(t);
  root.innerHTML = `<div class="trial-root ttv" data-theme="trainer">${mast}
    <div class="trial-trainee-tabs">${trainerTrainees.map(x => `<button class="trial-trainee-tab ${x.id === ttActiveId ? 'active' : ''}" data-ttv-select="${escapeHtml(x.id)}">${escapeHtml(x.name)} ${ttChip(ttStatus(x))}</button>`).join('')}<button class="trial-add-trainee-btn" data-ttv-open-add>+ Start a trial</button></div>
    <div class="ttv-hero"><div><p class="ttv-label">${escapeHtml(ttFmt(t.startDate))} – ${escapeHtml(ttFmt(ttEnd(t)))}</p><h3 class="ttv-name">${escapeHtml(t.name)} ${ttChip(st)}</h3>
      <p class="dir-note">${[t.coach ? `Team Lead <b>${escapeHtml(t.coach)}</b>` : '', t.director ? `Recommended by <b>${escapeHtml(t.director)}</b>` : '', t.mentee ? `3H’er <b>${escapeHtml(t.mentee)}</b>` : ''].filter(Boolean).join(' · ') || 'Add the Team Lead and mentee in Plan → Trial details.'}</p></div>
      <div class="ttv-day"><b>${day < 1 ? '—' : `${Math.min(day, TT_DAYS)}/${TT_DAYS}`}</b><span>${day < 1 ? 'Not started' : day > TT_DAYS ? 'Window closed' : `Day · Week ${ttWeekOf(day)}`}</span></div></div>
    ${ttStrip(t)}
    <div class="uo-panes ld-panes ttv-tabs" role="tablist">${tabs.map(([k, l]) => `<button type="button" role="tab" class="uo-pane-btn ${ttTab === k ? 'active' : ''}" aria-selected="${ttTab === k}" data-ttv-tab="${k}">${l}</button>`).join('')}</div>
    <div class="ttv-body">${body}</div></div>`;
  // Directors: fetch both sets of Levelset notes once, so the story counts include them.
  if(ttIsDirector() && typeof tpLoadLevelsetNotes === 'function' && ttPeaName(t)){
    const n = ttPeaName(t);
    setTimeout(() => { tpLoadLevelsetNotes(n); tpLoadLevelsetNotes((typeof TP_LS_RATER === 'string' ? TP_LS_RATER : 'rater:') + n); });
  }
}
// team-pea.js calls this when Levelset notes load or a tag changes. True
// when the trial redrew (the notes card with it).
function ttLsPainted(k){
  const root = document.getElementById('trainerTrialRoot'), t = ttActive();
  if(!root || !t || !root.offsetParent) return false;
  const n = ttKey(ttPeaName(t));
  if(!n || (k !== n && k !== ttKey('rater:' + n))) return false;
  const a = document.activeElement;
  if(a && root.contains(a) && (a.tagName === 'TEXTAREA' || (a.tagName === 'INPUT' && a.type !== 'checkbox'))){ ttRepaintPending = true; return false; }
  renderTrainerTrial();
  return true;
}

// ----- Events -----
async function ttSave(){ await saveState(); }
const ttRoot = document.getElementById('trainerTrialRoot');
ttRoot.addEventListener('click', async e => {
  const el = e.target.closest('button,[data-ttv-tab]');
  if(!el) return;
  const t = ttActive();
  const d = el.dataset;
  if(el.closest('[data-ttv-form-rate]')){
    const grp = el.closest('[data-ttv-form-rate]'), on = el.getAttribute('aria-pressed') === 'true';
    grp.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', 'false'));
    if(!on) el.setAttribute('aria-pressed', 'true');
    return;
  }
  if(d.ttvEvtag){ el.setAttribute('aria-pressed', String(el.getAttribute('aria-pressed') !== 'true')); return; }
  if(d.ttvSelect){ ttActiveId = d.ttvSelect; ttShiftForm = null; renderTrainerTrial(); return; }
  if(d.ttvTab){ ttTab = d.ttvTab; renderTrainerTrial(); return; }
  if('ttvOpenAdd' in d){ ttOpenAdd(); return; }
  if(!t) return;
  if(d.ttvRate){
    const grp = d.ttvRate, k = d.key, v = +d.v;
    t[grp] = t[grp] || {};
    if(t[grp][k] === v) delete t[grp][k]; else t[grp][k] = v;
    renderTrainerTrial(); await ttSave(); return;
  }
  if(d.ttvOutcome){
    if(!ttIsDirector() || (t.decision || {}).outcome === d.ttvOutcome) return;
    t.decision = Object.assign({}, t.decision, {outcome: d.ttvOutcome, by: ttBy(), at: Date.now()});
    renderTrainerTrial(); showToast('Decision recorded'); await ttSave(); return;
  }
  if('ttvOutcomeClear' in d){ if(!ttIsDirector()) return; t.decision = Object.assign({}, t.decision, {outcome: '', by: '', at: 0}); renderTrainerTrial(); await ttSave(); return; }
  if('ttvShiftNew' in d){ ttShiftForm = {id: ''}; renderTrainerTrial(); return; }
  if(d.ttvShiftEdit){ ttShiftForm = {id: d.ttvShiftEdit}; renderTrainerTrial(); window.scrollTo(0, ttRoot.getBoundingClientRect().top + window.scrollY); return; }
  if('ttvShiftCancel' in d){ ttShiftForm = null; renderTrainerTrial(); return; }
  if(d.ttvShiftDel){
    if(!confirm('Delete this shift observation?')) return;
    t.shifts = (t.shifts || []).filter(s => s.id !== d.ttvShiftDel);
    ttShiftForm = null; renderTrainerTrial(); showToast('Shift deleted'); await ttSave(); return;
  }
  if(d.ttvRemove){
    if(!confirm(`Remove ${t.name}’s Trainer Trial? Its checkoffs, scores, shifts and decision go with it. This cannot be undone.`)) return;
    trainerTrainees = trainerTrainees.filter(x => x.id !== t.id);
    ttActiveId = trainerTrainees[0] ? trainerTrainees[0].id : null;
    renderTrainerTrial(); await ttSave();
  }
});
ttRoot.addEventListener('change', async e => {
  const el = e.target, t = ttActive();
  if(!t) return;
  const d = el.dataset;
  if(d.ttvCheck){
    t.checks = t.checks || {};
    t.checks[d.ttvCheck] = el.checked ? {done: true, by: ttBy(), at: Date.now()} : {done: false};
    renderTrainerTrial(); await ttSave(); return;
  }
  if(d.ttvField){
    const v = el.value.trim();
    if(d.ttvField === 'name' && !v){ el.value = t.name; return; }
    if(d.ttvField === 'startDate' && !/^\d{4}-\d{2}-\d{2}$/.test(v)){ el.value = t.startDate; return; }
    t[d.ttvField] = v;
    renderTrainerTrial(); showToast('Saved'); await ttSave(); return;
  }
  // Text: saved without a redraw (it would swallow the next tap).
  if(d.ttvReflect){ t.reflect = Object.assign({}, t.reflect, {[d.ttvReflect]: el.value}); await ttSave(); return; }
  if(d.ttvGrowth){ t.growth = Object.assign({}, t.growth, {[d.ttvGrowth]: el.value}); await ttSave(); return; }
  if('ttvDecreason' in d && ttIsDirector()){ t.decision = Object.assign({}, t.decision, {reason: el.value}); await ttSave(); }
});
ttRoot.addEventListener('focusout', () => { if(ttRepaintPending) setTimeout(() => { if(ttRepaintPending) renderTrainerTrial(); }, 0); });
ttRoot.addEventListener('submit', async e => {
  if(e.target.id !== 'ttvShiftForm') return;
  e.preventDefault();
  const t = ttActive(); if(!t || !ttShiftForm) return;
  const f = e.target, fd = new FormData(f);
  const ratings = {};
  f.querySelectorAll('[data-ttv-form-rate]').forEach(g => { const on = g.querySelector('[aria-pressed="true"]'); if(on) ratings[g.dataset.ttvFormRate] = +on.dataset.v; });
  const shift = {
    id: ttShiftForm.id || ttUid('ts'), date: fd.get('date') || today, daypart: fd.get('daypart') || '', zone: fd.get('zone') || '',
    observer: String(fd.get('observer') || '').trim().slice(0, 80), ratings,
    evidence: [...f.querySelectorAll('[data-ttv-evtag][aria-pressed="true"]')].map(b => b.dataset.ttvEvtag),
    win: String(fd.get('win') || '').slice(0, 1000), what: String(fd.get('what') || '').slice(0, 1000), sowhat: String(fd.get('sowhat') || '').slice(0, 1000), nowwhat: String(fd.get('nowwhat') || '').slice(0, 1000),
    cares: Math.max(0, Math.round(+fd.get('cares') || 0)), at: Date.now()
  };
  t.shifts = (t.shifts || []).filter(s => s.id !== shift.id).concat([shift]);
  const editing = !!ttShiftForm.id;
  ttShiftForm = null; renderTrainerTrial(); showToast(editing ? 'Shift updated' : 'Shift logged'); await ttSave();
});

// ----- Start a trial (the modal in the page) -----
function ttOpenAdd(){
  ['ttAddName', 'ttAddCoach', 'ttAddDirector', 'ttAddMentee'].forEach(id => { const el = document.getElementById(id); if(el) el.value = ''; });
  document.getElementById('ttAddStart').value = today;
  document.querySelectorAll('#ttAddModal input[type="checkbox"]').forEach(c => { c.checked = false; });
  const list = document.getElementById('ttAddLsNames');
  if(list) list.innerHTML = ttLsNames().map(n => `<option value="${escapeHtml(n)}"></option>`).join('');
  document.getElementById('ttAddModal').classList.add('active');
}
document.getElementById('btnTTCancelAdd').addEventListener('click', () => {
  document.getElementById('ttAddModal').classList.remove('active');
});
document.getElementById('ttAddModal').addEventListener('click', e => {
  if(e.target === document.getElementById('ttAddModal')) document.getElementById('ttAddModal').classList.remove('active');
});
document.getElementById('btnTTConfirmAdd').addEventListener('click', async () => {
  const val = id => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
  const name = val('ttAddName');
  if(!name){ showToast('Enter the candidate’s name'); return; }
  const unchecked = [...document.querySelectorAll('#ttAddModal input[type="checkbox"]')].filter(c => !c.checked);
  if(unchecked.length){ showToast('Confirm all three eligibility points first'); return; }
  const mentee = val('ttAddMentee');
  const trainee = {id: ttUid(), name, coach: val('ttAddCoach'), startDate: val('ttAddStart') || today,
    peaName: ttLsMatch(name), director: val('ttAddDirector'), mentee, menteePeaName: ttLsMatch(mentee),
    eligibility: {certified: true, recommended: true, commitment: true}, checks: {}, evalLead: {}, evalSelf: {}, reflect: {}, growth: {}, decision: {outcome: ''}, shifts: [], createdAt: Date.now()};
  trainerTrainees.push(trainee);
  ttActiveId = trainee.id; ttTab = 'plan'; ttShiftForm = null;
  document.getElementById('ttAddModal').classList.remove('active');
  renderTrainerTrial();
  showToast('Trainer Trial started');
  await ttSave();
});
