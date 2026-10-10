// ===== LEADERS (Directors → Leaders) =====
// A profile for each leader on the Directors page (Tim, Oct 2026), built
// from the Levelset ratings and the directors' own notes:
//
//  1. The PEA scoreboard: PEAs given this quarter against the goal per
//     leader (12) and the team's goal (50), the pace to hit it, the weekly
//     streak, and the quarter's week-by-week bars. A PEA is one Levelset
//     positional rating (one row of the report).
//  2. A focus for the quarter: the growth goals agreed in the leader's eval.
//  3. Notes, each a Win, Coaching, Watch or Conversation, dated, optionally
//     tagged to a pillar of the store's Role Clarity Cards; grouped by month.
//  4. Calibrate to the PEC: the Team Leader card plus the leader's role
//     card(s), each pillar with the notes that evidence it.
//  5. Quarter history: PEAs and notes per quarter, so a leader's year reads
//     across evals.
//
// Leaders are the names in Manage → Settings → Leaders (with their PEC
// roles), plus anyone who gave a PEA this quarter, has notes, or holds a
// Team Leader shift on a roster the hub has; directors are left out unless
// they're on the list. leaderRoster and peaGoals live in the manager
// section; leaderFocus and leaderNotes in the private people section.

const LD_TYPES = [
  {id: 'win', label: 'Win', hint: 'Something to celebrate'},
  {id: 'coach', label: 'Coaching', hint: 'A gap to coach'},
  {id: 'watch', label: 'Watch', hint: 'A pattern to track'},
  {id: 'talk', label: 'Conversation', hint: 'A talk you had'},
];
const PEA_GOALS_SEED = {team: 50, leader: 12};

// Role Clarity Cards (Chick-fil-A Buda PEC), as Tim's Leader Notes page
// carries them. Every leader is calibrated to the Team Leader card plus
// their role card(s).
const LD_CARDS = {
  tl: {name: 'Team Leader (Foundational)', short: 'Team Leader',
    desc: "Culture carriers and shift coaches. Drive execution through zone and house leadership, coach team members to PEC standards and 3H values, obsess over the guest, lead with clarity, execute the 6E's and foster a Team vs I mindset. They don't just manage, they LEAD.",
    pillars: [['zone', 'Lead the Zone', "Take ownership of your area, anticipate needs, and ensure excellence in execution (6E's)"],
      ['engage', 'Engage the Team', 'Motivate, support, and challenge team members to give their best. Lead through GLEC with high care + high challenge'],
      ['guest', 'Champion Guest Experience', 'Operational excellence and 2nd mile service so every guest feels valued. Move fast but not rushed; look for moments to show CARE and warmth'],
      ['standards', 'Hold the Standards', "Remove obstacles, protect guests, and steward systems. Standards met through daily PEAs; lead with the 6E's"],
      ['self', 'Lead Yourself First', 'Discipline, humility, and growth before leading others; extreme ownership of all entrusted (people & results)']],
    win: ['PEA submissions: 1 per daypart', 'Maintain 2.75+ TM PEA performance'],
    actions: ['Lead and coach zones during peak shifts', 'Conduct at least 1 PEA per daypart worked', "Celebrate TM wins and address misses in real time (6E's)", 'Ensure WHED is executed on every shift']},
  hs: {name: 'Hospitality & Service', short: 'Hospitality & Service',
    desc: 'Owns the guest experience. Obsesses over how guests feel so every visit reflects Winning Hearts Every Day, through personal, proactive, generous second-mile service.',
    pillars: [['whed', 'Execute WHED', 'Obsess over operational excellence + 2nd mile service'],
      ['remarkable', 'Create REMARKable Moments', "Lead surprise & delight experiences that make guests' days"],
      ['welcoming', 'Champion a Welcoming Environment', 'Fresh flowers, clean dining, and warm greetings are constant'],
      ['teamhosp', 'Elevate Team Hospitality', 'Coach team members to engage guests with CORE 4 & Care'],
      ['fun', 'Bring the Fun', 'Sampling, cows, contests, and creativity make our service unforgettable']],
    win: ['ACE CEM +2pts above top 20%', 'Cleanliness CEM +2pts above top 20%'],
    actions: ['Audit and celebrate customer comments & SHARE stories', 'Hospitality kits stocked and used with intention', 'Samples, cow appearance, and contest happen daily']},
  stew: {name: 'Stewardship', short: 'Stewardship',
    desc: 'Treats the restaurant like they own it: building, equipment, and environment clean, organized, visit-ready, and functional at all times. Guardian of the building & equipment.',
    pillars: [['pride', 'Take Pride Like an Owner', 'CARE (Clean And Repair Everything) for the building, equipment, and environment'],
      ['resources', 'Protect Resources', 'Maintain equipment, fix what can be fixed, call for repairs without delay'],
      ['clean', 'Champion Cleanliness & Order', 'Daily, weekly, and monthly stewardship lists completed with excellence'],
      ['visit', 'Stay Visit Ready', 'A restaurant that shows guests and visitors we care'],
      ['business', 'Steward the Business', 'Watch systems, labor, and organization to protect profit and efficiency']],
    win: ['Repairs cost below 0.5% per month', '100% VSBL stewardship list completion'],
    actions: ['Oversee daily/weekly/monthly list completion', 'Keep inventory organized and tidy', 'Schedule and oversee 1x monthly Sunday clean', 'Submit and follow up on repair/maintenance requests']},
  dt: {name: 'Drive-Thru Leader', short: 'Drive-Thru',
    desc: 'Owns the speed, accuracy, and friendliness of the drive-thru. Pushes for flawless execution and system compliance so the experience is fast and remarkable, and makes sure team members have the tools, resources, and support to succeed.',
    pillars: [['speed', 'Obsess Over Speed & Accuracy', 'Drive urgency while protecting order accuracy. Move fast, not rushed'],
      ['hosp', 'Elevate Hospitality', 'Warmth and friendliness that create lasting guest connections and drive frequency'],
      ['protect', 'Protect the Team', 'Tools, tech, and gear always functional and available. Cared-for people care for people'],
      ['audit', 'Audit & Improve Systems', 'Monitor compliance, execution, and results daily'],
      ['own', 'Own the Drive-Thru', 'Lead the charge toward top-100 performance through systems, people, and culture']],
    win: ['DT ranking top 100 or better', 'Fast service CEM +2pts above top 20% & accuracy 98%'],
    actions: ['Audit drive-thru performance & coach gaps', 'Keep ranking updated and visible', 'Ensure ALL tools & resources are functional & available', 'Drive Mobile Thru performance']},
  cc: {name: 'Catering & Connections', short: 'Catering & Connections',
    desc: "Extends Chick-fil-A Buda's hospitality beyond the restaurant as the voice of the customer and the bridge to the community. Catering executed with excellence, CEM insights championed, social media collaboration to highlight people, culture, and community.",
    pillars: [['voice', 'Champion the Guest Voice', 'Monitor, review, and communicate CEM insights so the team understands guest feedback and acts on it'],
      ['catering', 'Elevate Catering & Events', 'Catering prepped and executed with excellence; represent Buda with professionalism and warmth at events'],
      ['extend', 'Extend the Guest Experience', 'Catering, pickup, and events reflect our standards; every detail makes guests feel valued'],
      ['community', 'Strengthen Connections', 'Relationships with schools, churches, and local organizations; a true community partner'],
      ['inspire', 'Communicate & Inspire', 'Social media strategy that highlights our people and culture; share guest wins that inspire pride']],
    win: ['100% catering accuracy and on-time delivery', 'At least 2 meaningful social highlights per week'],
    actions: ['Verify ALL catering orders are prepped in advance and drivers selected', 'Share weekly CEM & customer feedback', 'Partner with social media creator to highlight TMs']},
  nht: {name: 'New Hire Talent Leader', short: 'New Hire Talent',
    desc: "Pre-90 day. Owns the beginning of the team member's journey: every new hire engaged, equipped, and connected to Hustle, Hospitality & Humility. If a new hire doesn't succeed, it's never from our lack of care.",
    pillars: [['early', 'Engage New Hires Early', 'A welcoming, intentional experience from day one'],
      ['equip', 'Equip for Success', 'Training is clear, consistent, and aligned to standards of excellence'],
      ['3h', 'Champion 3H Values', 'Model and coach Hustle, Hospitality & Humility every shift'],
      ['protect', 'Protect Standards', 'Advocate for excellence while recognizing not everyone is built for this level'],
      ['retention', 'Own Retention Outcomes', 'Strong early retention through confidence, connection, and belonging']],
    win: ['100% of new hire training completed (On the Rise / Crushing It in all initial positions)', '100% DIR engagement from trainers to new hires, using PEAs'],
    actions: ['Partner with trainers so training meets expectations', 'Monitor 30-day evaluation readiness', 'Regular check-ins with new hires to celebrate wins and address challenges', 'Present at Trainer Meetings, 30 & 90 Day EMs']},
  ct: {name: 'Certified Talent Leader', short: 'Certified Talent',
    desc: 'Post 90-180 day. Owns development of team members past onboarding so every TM masters all positions and reaches excellence by 180 days. Partners with trainers and leaders on rotations, versatility, and PEAs.',
    pillars: [['versatility', 'Champion Versatility', 'Team members trained and capable across ALL positions'],
      ['standard', 'Hold the Standard', 'Use PECs to keep training consistent and expectations clear'],
      ['develop', 'Develop with Intentionality', 'Opportunities for TMs to rotate and grow in skill'],
      ['evaluate', 'Equip & Evaluate', 'Prepare TMs to succeed at their 180-day evaluation'],
      ['culture', 'Protect the Culture', 'Care and accountability; enthusiastically expect excellence from everyone every day']],
    win: ['PEA positional average 2.6+ (2.4=1, 2.5=2, 2.6=3)', '90% of post-180-day TMs demonstrate positional excellence'],
    actions: ['Partner with leaders so rotations across all roles happen regularly', 'Perform PEAs to reinforce standards', 'Identify high-potential TMs for certification', 'Identify opportunity Big 5 behaviors', 'Present at Trainer Meetings, CTM Evals, 180 Day EMs']},
  fs: {name: 'Food Safety', short: 'Food Safety',
    desc: "Protects guests, team, and brand through elite food safety and cleanliness. Inspection-ready at ALL times: stay ready so you don't have to get ready. Daily accountability, immediate coaching, corrective action.",
    pillars: [['guests', 'Protect Guests First', 'No shortcuts are ever taken with food safety'],
      ['pride', 'Lead with Pride', 'An environment that is always visit ready'],
      ['coach', 'Coach Immediately', 'Address food safety gaps in the moment with clear solutions'],
      ['system', 'Drive System Consistency', 'Daily SAFE checks and food safety audits completed without fail'],
      ['results', 'Own Food Safety Results', 'Elite food safety scores through relentless standards']],
    win: ['Food Safety Score 1 “Elite”', '100% daily SAFE and food safety audits completed'],
    actions: ['100% completion of Daily SAFE', 'Coach TMs immediately when standards are missed', 'Perform 1 mock visit per week', 'Celebrate & highlight food safety wins']},
  fq: {name: 'Food Quality', short: 'Food Quality',
    desc: 'Ensures every bite reflects the promise: food is essential to live, therefore make it good. Upholds recipe, consistency, and freshness through coaching, systems, and accountability.',
    pillars: [['standard', 'Protect the Standard', 'Food consistently meets CFA recipes and quality standards'],
      ['consistency', 'Coach for Consistency', 'Train and develop TMs to execute with precision every time'],
      ['freshness', 'Steward Freshness', 'Lead systems like boil outs, FIFO, and proper holding times'],
      ['guest', 'Elevate Guest Experience', 'Taste and portioning drive guest satisfaction and loyalty'],
      ['results', 'Own Quality Results', 'QIV of 98% and taste scores +2pts above top 20%']],
    win: ['QIV 98% or better', 'Taste scores +2pts above top 20%'],
    actions: ['Boil outs completed on schedule', 'Audit and coach portioning and recipe compliance', 'Track and report on product CEMs', 'Celebrate TMs delivering perfect product standards']},
  fcm: {name: 'Food Cost Management', short: 'Food Cost',
    desc: 'Owns stewardship of our expensive resource, FOOD. Protects quality while driving waste reduction and tracking (DRIP), so what we buy ends up with guests, not in the trash.',
    pillars: [['steward', 'Champion Stewardship', 'Treat food as a resource to be protected and maximized'],
      ['waste', 'Eliminate Waste', 'A culture of “cook less, more often”'],
      ['quality', 'Protect Quality', 'Freshness and presentation never slip'],
      ['facts', 'Lead with Facts', 'Chicken counts, spot checks, AHA, LEAN prep, and waste tracking guide coaching and decisions'],
      ['results', 'Own Food Cost Results', 'PFCG of 0.30% or better through consistent systems; bring the team along']],
    win: ['PFCG 0.4% or better', '100% of waste logged daily'],
    actions: ['Ensure 100% of waste is tracked', 'Coach TMs to cook less, more often', 'Audit & report weekly on waste trends & gap progress']},
};
// PEC roles a leader can hold, and the card(s) each one adds to the Team Leader card.
const LD_ROLE_CARDS = {
  'Hospitality & Service': ['hs'], 'Stewardship': ['stew'], 'Drive-Thru Leader': ['dt'], 'Catering & Connections': ['cc'],
  'Talent Leader': ['nht', 'ct'], 'Food Safety': ['fs'], 'Food Quality': ['fq'], 'Food Cost Management': ['fcm'], 'Senior Leader': [],
};
const LD_ROLES = Object.keys(LD_ROLE_CARDS);

let ldOpen = '';          // the leader whose profile is open ('' = everyone)
let ldQuarter = '';       // quarter on screen, '2026-Q4' ('' = the current one)
let ldCard = '';          // role card shown on the profile
let ldPillar = '';        // pillar the notes are filtered to
let ldHide = {};          // note types hidden on the profile {id: true}
let ldFocusEdit = false;  // the quarter focus is being edited
let ldNoteOpen = false;   // the add-a-note form is open
let ldTagEdit = -1;       // index of the note whose tags are being edited

// ----- Quarters -----
const LD_MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function ldQuarterKey(iso){ return `${iso.slice(0, 4)}-Q${Math.ceil(+iso.slice(5, 7) / 3)}`; }
function ldQuarterBounds(key){
  const [y, q] = key.split('-Q').map(Number);
  const m0 = (q - 1) * 3;
  const end = new Date(y, m0 + 3, 0);
  return {key, from: `${y}-${String(m0 + 1).padStart(2, '0')}-01`, to: toLocalISODate(end), label: `Q${q} ${y}`, span: `${LD_MON[m0]}–${LD_MON[m0 + 2]} ${y}`};
}
function ldQuarterNow(){ return ldQuarterKey(today); }
function ldQuarterOn(){ return ldQuarter || ldQuarterNow(); }
const ldDaysBetween = (a, b) => Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);
const ldRatings = () => typeof peaAllRatings === 'function' ? peaAllRatings() : [];
const ldNoteDate = n => n.date || toLocalISODate(new Date(n.ts || 0));
// Every quarter with ratings, notes or a focus, plus the current one; newest first.
function ldQuarters(){
  const set = new Set([ldQuarterNow()]);
  ldRatings().forEach(r => set.add(ldQuarterKey(r.date)));
  Object.values(leaderNotes).forEach(list => (list || []).forEach(n => set.add(ldQuarterKey(ldNoteDate(n)))));
  Object.keys(leaderFocus).forEach(k => { const q = k.split('__')[1]; if(/^\d{4}-Q[1-4]$/.test(q || '')) set.add(q); });
  return [...set].sort().reverse();
}
// The Mondays of the quarter's weeks.
function ldWeeksOf(b){
  const out = [];
  for(let w = peaWeekStart(b.from); w <= b.to; w = fcAddDaysSafe(w, 7)) out.push(w);
  return out;
}

// ----- Goals, the leader list and their notes -----
function ldGoals(){
  const g = peaGoals && typeof peaGoals === 'object' ? peaGoals : {};
  return {team: +g.team > 0 ? Math.round(+g.team) : PEA_GOALS_SEED.team, leader: +g.leader > 0 ? Math.round(+g.leader) : PEA_GOALS_SEED.leader};
}
function ldRoster(){ return Array.isArray(leaderRoster) ? leaderRoster : []; }
function ldRolesFor(name){ const k = dirKey(name); const r = ldRoster().find(x => dirKey(x.name) === k); return r && Array.isArray(r.roles) ? r.roles.filter(x => LD_ROLE_CARDS[x]) : []; }
function ldCardsFor(name){
  const ids = ['tl'];
  ldRolesFor(name).forEach(r => LD_ROLE_CARDS[r].forEach(c => { if(!ids.includes(c)) ids.push(c); }));
  return ids;
}
function ldPillarLabel(tag){
  const [c, p] = String(tag).split(':'); const card = LD_CARDS[c];
  const pl = card && card.pillars.find(x => x[0] === p);
  return pl ? pl[1] : tag;
}
// Notes on a leader, whichever spelling they were saved under.
function ldNoteKey(name){ const k = dirKey(name); return Object.keys(leaderNotes).find(x => dirKey(x) === k) || name; }
function ldNotesFor(name){ const list = leaderNotes[ldNoteKey(name)]; return Array.isArray(list) ? list : []; }
function ldFocusFor(name, q){ const f = leaderFocus[`${dirKey(name)}__${q || ldQuarterOn()}`]; return Array.isArray(f) ? f : []; }

// Everyone with a profile for the quarter: the Leaders list, PEA givers,
// anyone with notes, Team Leader shifts on the rosters the hub holds.
function ldLeaderNames(q){
  const names = new Map();
  const listed = new Set(ldRoster().map(r => dirKey(r.name)));
  const add = (n, force) => { const k = dirKey(n); if(!k || names.has(k)) return; if(!force && !listed.has(k) && dirIsDirector(n)) return; names.set(k, n); };
  ldRoster().forEach(r => add(r.name, true));
  const b = ldQuarterBounds(q);
  ldRatings().forEach(r => { if(r.leader && r.date >= b.from && r.date <= b.to) add(r.leader); });
  Object.keys(leaderNotes).forEach(n => { if(leaderNotes[n] && leaderNotes[n].length) add(n); });
  [fohRoster, bohRoster].forEach(rost => Object.values(rost).forEach(list => (Array.isArray(list) ? list : []).forEach(p => { if(p.leader) add(p.name); })));
  return [...names.values()];
}

// ----- The scoreboard -----
function ldScore(q){
  q = q || ldQuarterOn();
  const b = ldQuarterBounds(q), goals = ldGoals();
  const rows = ldRatings().filter(r => r.date >= b.from && r.date <= b.to);
  const days = ldDaysBetween(b.from, b.to) + 1;
  const elapsed = today < b.from ? 0 : today > b.to ? days : ldDaysBetween(b.from, today) + 1;
  const frac = elapsed / days;
  const weeksLeft = Math.max(0, Math.ceil((days - elapsed) / 7));
  const weeks = ldWeeksOf(b), cur = peaWeekStart(today);
  const names = ldLeaderNames(q);
  const leaders = names.map(name => {
    const k = dirKey(name);
    const mine = rows.filter(r => dirKey(r.leader) === k);
    const byWeek = {};
    mine.forEach(r => { const w = peaWeekStart(r.date); byWeek[w] = (byWeek[w] || 0) + 1; });
    const series = weeks.map(w => byWeek[w] || 0);
    // Weeks in a row with a PEA, counted back from this week (a week still in
    // progress with none yet doesn't break it).
    let streak = 0;
    for(let i = weeks.length - 1; i >= 0; i--){
      if(weeks[i] > cur) continue;
      if(series[i] > 0) streak++; else if(weeks[i] !== cur) break;
    }
    const expected = goals.leader * frac;
    const count = mine.length;
    const status = count >= goals.leader ? 'done' : elapsed >= days ? 'missed' : count >= Math.floor(expected) ? 'pace' : 'behind';
    const avg = count ? mine.reduce((s, r) => s + (+r.overall || 0), 0) / count : null;
    return {name, roles: ldRolesFor(name), count, goal: goals.leader, expected, status, series, streak,
      last: mine.reduce((m, r) => r.date > m ? r.date : m, ''), people: new Set(mine.map(r => dirKey(r.employee))).size,
      positions: new Set(mine.map(r => r.position)).size, avg, best: Math.max(0, ...series),
      perWeek: weeksLeft ? Math.max(0, goals.leader - count) / weeksLeft : 0, notes: ldNotesFor(name).length, focus: ldFocusFor(name, q)};
  }).sort((a, c) => c.count - a.count || a.name.localeCompare(c.name));
  const keys = new Set(names.map(dirKey));
  const directorsGiven = rows.filter(r => !keys.has(dirKey(r.leader)) && dirIsDirector(r.leader)).length;
  const total = rows.length;
  return {quarter: b, goals, total, expected: goals.team * frac, frac, elapsed, days, weeksLeft, weeks, leaders, directorsGiven,
    done: leaders.filter(l => l.status === 'done').length, current: q === ldQuarterNow(), over: elapsed >= days,
    teamStatus: total >= goals.team ? 'done' : elapsed >= days ? 'missed' : total >= Math.floor(goals.team * frac) ? 'pace' : 'behind'};
}

// ----- Rendering -----
const LD_ICON_TROPHY = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8"/><path d="M12 17v4"/><path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4a3 3 0 0 0 3 5"/><path d="M17 6h3a3 3 0 0 1-3 5"/></svg>';
const LD_ICON_FLAME = '<svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3c1 3 4 5 4 9a4 4 0 0 1-8 0c0-1 .3-2 1-3 0 2 1 3 2 3 0-3-1-5 1-9z"/></svg>';
const ldDate = iso => new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {month: 'short', day: 'numeric'});
const ldDateY = iso => new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric'});
const ldMonth = iso => new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {month: 'long', year: 'numeric'});
const ldPlural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const ldShort = n => typeof suDisplayName === 'function' ? suDisplayName(n) : n;
const ldStatusText = {done: 'Hit the goal', pace: 'On pace', behind: 'Behind pace', missed: 'Quarter closed'};

function ldStatusChip(status, text){ return `<span class="ld-status is-${status}">${status === 'done' ? LD_ICON_TROPHY : ''}${escapeHtml(text || ldStatusText[status])}</span>`; }

// A ring with the count inside: count of goal.
function ldRing(count, goal, status, size){
  const r = 26, c = 2 * Math.PI * r, pct = Math.min(1, goal ? count / goal : 0);
  return `<svg class="ld-ring is-${status}" viewBox="0 0 64 64" width="${size || 72}" height="${size || 72}" role="img" aria-label="${count} of ${goal}">
    <circle cx="32" cy="32" r="${r}" class="ld-ring-track"/>
    <circle cx="32" cy="32" r="${r}" class="ld-ring-fill" stroke-dasharray="${(pct * c).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 32 32)"/>
    <text x="32" y="32" class="ld-ring-n">${count}</text><text x="32" y="44" class="ld-ring-of">of ${goal}</text></svg>`;
}
// One pip per PEA toward the goal.
function ldPips(count, goal){ return `<div class="ld-pips" aria-hidden="true">${Array.from({length: goal}, (_, i) => `<i class="${i < count ? 'on' : ''}"></i>`).join('')}${count > goal ? `<b>+${count - goal}</b>` : ''}</div>`; }
function ldPaceText(L, S){
  if(L.status === 'done') return `${L.count} of ${L.goal}${L.count > L.goal ? `, ${L.count - L.goal} over` : ''}. Goal met.`;
  if(S.over) return `Finished at ${L.count} of ${L.goal}.`;
  const need = L.goal - L.count;
  return `${need} to go in ${ldPlural(S.weeksLeft, 'week')}: about ${L.perWeek < 1 ? 'one every other week' : L.perWeek <= 1.05 ? 'one a week' : `${Math.ceil(L.perWeek * 2) / 2} a week`}. ${L.status === 'pace' ? `Ahead of the ${Math.floor(L.expected)} expected by today.` : `Expected ${Math.floor(L.expected)} by today.`}`;
}

function ldQuarterSelect(){
  const on = ldQuarterOn();
  return `<label class="ld-q"><span>Quarter</span><select id="ldQuarter" aria-label="Quarter">${ldQuarters().map(q => `<option value="${q}" ${q === on ? 'selected' : ''}>${escapeHtml(ldQuarterBounds(q).label)}${q === ldQuarterNow() ? ' (now)' : ''}</option>`).join('')}</select></label>`;
}
function ldActionsHtml(){
  return ldOpen ? `<button type="button" class="btn btn-ghost dir-btn" data-ld-copy>Copy profile</button>` : ldQuarterSelect();
}

// The team's progress toward its goal, with the pace marker.
function ldTeamBar(S){
  const pct = Math.min(100, S.goals.team ? S.total / S.goals.team * 100 : 0), mark = Math.min(100, S.frac * 100);
  return `<div class="ld-team is-${S.teamStatus}">
    <div class="ld-team-head"><b>${S.total}</b><span>of ${S.goals.team} PEAs · ${escapeHtml(S.quarter.label)}</span>${ldStatusChip(S.teamStatus)}</div>
    <div class="ld-bar"><i style="width:${pct.toFixed(1)}%"></i>${S.current ? `<u style="left:${mark.toFixed(1)}%" title="Today"></u>` : ''}</div>
    <p class="dir-note">${S.over ? `The quarter is closed.` : `${Math.floor(S.expected)} expected by today · ${ldPlural(S.weeksLeft, 'week')} left`}${S.leaders.length ? ` · ${S.done} of ${ldPlural(S.leaders.length, 'leader')} at ${S.goals.leader}` : ''}${S.directorsGiven ? ` · directors gave ${S.directorsGiven}` : ''}</p>
  </div>`;
}

// The brief's summary (directors.js shows it; the text brief uses ldBriefLines).
function ldSummaryHtml(){
  const S = ldScore(ldQuarterNow());
  const top = S.leaders.slice(0, 6);
  return `<section class="dir-card"><h3>PEA scoreboard</h3>
    ${ldTeamBar(S)}
    ${top.length ? `<ul class="dir-list dir-list-sm ld-mini">${top.map(L => `<li class="${L.status === 'behind' ? 'is-flag' : ''}"><span>${escapeHtml(ldShort(L.name))}</span><span class="dir-muted"><b>${L.count}</b> of ${L.goal}${L.streak > 1 ? ` · ${L.streak}-week streak` : ''}</span></li>`).join('')}</ul>` : ''}
    <button type="button" class="btn btn-ghost dir-btn" data-dir-view="leaders">Open Leaders</button>
  </section>`;
}
function ldBriefLines(){
  const S = ldScore(ldQuarterNow());
  const L = [`Team: ${S.total} of ${S.goals.team} (${ldStatusText[S.teamStatus].toLowerCase()}${S.over ? '' : `, ${Math.floor(S.expected)} expected by today`})`];
  if(S.leaders.length) L.push(`Leaders: ${S.leaders.map(l => `${ldShort(l.name)} ${l.count}/${l.goal}${l.status === 'done' ? ' ✓' : l.status === 'behind' ? ' (behind)' : ''}`).join(', ')}`);
  return L;
}

function ldLeaderCard(L, S){
  return `<button type="button" class="ld-card is-${L.status}" data-ld-open="${escapeHtml(L.name)}">
    <div class="ld-card-top">${ldRing(L.count, L.goal, L.status, 64)}<div class="ld-card-name"><b>${escapeHtml(ldShort(L.name))}</b><span>${escapeHtml(L.roles.length ? L.roles.join(' · ') : 'Team Leader')}</span>${ldStatusChip(L.status)}</div></div>
    ${ldPips(L.count, L.goal)}
    <div class="ld-card-meta"><span>${L.last ? `Last PEA ${escapeHtml(ldDate(L.last))}` : 'No PEA this quarter'}</span>${L.streak > 1 ? `<span class="ld-streak">${LD_ICON_FLAME}${L.streak}-week streak</span>` : ''}${L.notes ? `<span>${ldPlural(L.notes, 'note')}</span>` : ''}</div>
    ${L.focus.length ? `<div class="ld-card-focus"><b>Focus</b> ${escapeHtml(L.focus[0])}${L.focus.length > 1 ? ` (+${L.focus.length - 1})` : ''}</div>` : ''}
  </button>`;
}

function ldOverviewHtml(){
  const S = ldScore();
  return `
    <section class="dir-card"><h3>PEA scoreboard</h3><p class="dir-note">A PEA is one Levelset positional rating, from Manage → PEA. The team’s goal is ${S.goals.team} a quarter and each leader’s is ${S.goals.leader}; change either in Manage → Settings → Leaders.</p>${ldTeamBar(S)}</section>
    ${S.leaders.length ? `<div class="ld-grid">${S.leaders.map(L => ldLeaderCard(L, S)).join('')}</div>`
      : '<p class="dir-empty">No leaders yet. Add them in Manage → Settings → Leaders, or sync Levelset in Manage → PEA and anyone who gives a PEA shows here.</p>'}`;
}

// The week-by-week bars of the quarter.
function ldWeekBars(L, S){
  const max = Math.max(1, ...L.series);
  const cur = peaWeekStart(today);
  return `<div class="ld-weeks" role="img" aria-label="PEAs by week">${S.weeks.map((w, i) => `<span class="${w === cur ? 'is-now' : ''} ${w > cur ? 'is-future' : ''}" title="Week of ${escapeHtml(ldDate(w))}: ${L.series[i]}"><i style="height:${Math.round(L.series[i] / max * 100)}%"></i><small>${L.series[i] || ''}</small></span>`).join('')}</div>
    <div class="ld-weeks-axis"><span>${escapeHtml(ldDate(S.weeks[0]))}</span><span>${escapeHtml(ldDate(S.weeks[S.weeks.length - 1]))}</span></div>`;
}

function ldProfileHtml(){
  const S = ldScore();
  const name = ldOpen;
  const L = S.leaders.find(l => dirKey(l.name) === dirKey(name)) || {name, roles: ldRolesFor(name), count: 0, goal: S.goals.leader, expected: S.goals.leader * S.frac, status: S.over ? 'missed' : 'behind', series: S.weeks.map(() => 0), streak: 0, last: '', people: 0, positions: 0, avg: null, best: 0, perWeek: S.weeksLeft ? S.goals.leader / S.weeksLeft : 0, notes: 0, focus: ldFocusFor(name)};
  const all = ldNotesFor(name).map((n, i) => ({...n, i, date: ldNoteDate(n)}));
  const counts = {}; LD_TYPES.forEach(t => counts[t.id] = all.filter(n => n.type === t.id).length);
  const shown = all.filter(n => !ldHide[n.type || 'none'] && (!ldPillar || (n.pec || []).includes(ldPillar))).sort((a, b) => b.date.localeCompare(a.date) || (b.ts || 0) - (a.ts || 0));
  const cards = ldCardsFor(name);
  if(!cards.includes(ldCard)) ldCard = cards.length > 1 ? cards[1] : cards[0];
  const card = LD_CARDS[ldCard];
  const focus = ldFocusFor(name);
  const untagged = all.filter(n => !(n.pec && n.pec.length)).length;
  const history = ldQuarters().map(q => {
    const b = ldQuarterBounds(q);
    const peas = ldRatings().filter(r => dirKey(r.leader) === dirKey(name) && r.date >= b.from && r.date <= b.to).length;
    const notes = all.filter(n => n.date >= b.from && n.date <= b.to).length;
    return {q, b, peas, notes, focus: ldFocusFor(name, q).length};
  }).filter(h => h.peas || h.notes || h.focus || h.q === ldQuarterOn());
  const stats = [[L.streak > 1 ? `${L.streak} weeks` : L.streak === 1 ? '1 week' : '—', 'Streak'], [L.best || '—', 'Best week'], [L.people || '—', 'Team members rated'], [L.positions || '—', 'Positions'], [L.avg != null ? L.avg.toFixed(2) : '—', 'Avg score given']];

  let months = '', curM = '';
  shown.forEach(n => {
    const mk = ldMonth(n.date);
    if(mk !== curM){ months += `${curM ? '</ul>' : ''}<h4 class="ld-month">${escapeHtml(mk)}</h4><ul class="dir-notes">`; curM = mk; }
    const t = LD_TYPES.find(x => x.id === n.type);
    const tags = n.pec || [];
    months += `<li class="ld-note ${t ? 'is-' + t.id : ''}"><div class="dir-note-meta"><span>${escapeHtml(ldDateY(n.date))}${n.by ? ` · ${escapeHtml(n.by)}` : ''}${t ? ` <em class="ld-pill is-${t.id}">${escapeHtml(t.label)}</em>` : ''}</span><span class="ld-note-acts">${ldTagEdit === n.i ? '' : `<button type="button" class="ld-link" data-ld-tag="${n.i}">${tags.length ? 'Edit tags' : 'Tag'}</button>`}<button type="button" class="dir-x" data-ld-note-del="${n.i}" aria-label="Delete note">${UO_X_ICON}</button></span></div><p>${escapeHtml(n.text)}</p>
      ${tags.length && ldTagEdit !== n.i ? `<div class="ld-tags">${tags.map(g => `<span>${escapeHtml(ldPillarLabel(g))}</span>`).join('')}</div>` : ''}
      ${ldTagEdit === n.i ? `<div class="ld-tagbox">${ldPillarChecks(cards, tags)}<div class="ld-acts"><button type="button" class="btn btn-primary dir-btn" data-ld-tag-save="${n.i}">Save tags</button><button type="button" class="btn btn-ghost dir-btn" data-ld-tag-cancel>Cancel</button></div></div>` : ''}</li>`;
  });
  if(curM) months += '</ul>';

  return `
    <button type="button" class="ld-back" data-ld-back>← All leaders</button>
    <section class="dir-card ld-profile">
      <div class="ld-profile-head"><div><h3>${escapeHtml(name)}</h3><p class="dir-sub">${escapeHtml(L.roles.length ? L.roles.join(' · ') : 'Team Leader')} · ${escapeHtml(S.quarter.label)}</p></div>${ldStatusChip(L.status)}</div>
      <div class="ld-score">
        <div class="ld-score-ring">${ldRing(L.count, L.goal, L.status, 108)}<p>${escapeHtml(ldPaceText(L, S))}</p>${ldPips(L.count, L.goal)}</div>
        <div class="ld-score-weeks">${ldWeekBars(L, S)}<div class="ld-stats">${stats.map(([v, l]) => `<div><b>${escapeHtml(String(v))}</b><span>${escapeHtml(l)}</span></div>`).join('')}</div></div>
      </div>
    </section>
    <section class="dir-card ld-focus"><div class="ld-row"><h3>${escapeHtml(S.quarter.label)} focus</h3>${ldFocusEdit ? '' : `<button type="button" class="ld-link" data-ld-focus-edit>${focus.length ? 'Edit' : 'Add focus'}</button>`}</div>
      ${ldFocusEdit ? `<p class="dir-note">One focus per line.</p><textarea id="ldFocusText" rows="4" maxlength="1500">${escapeHtml(focus.join('\n'))}</textarea><div class="ld-acts"><button type="button" class="btn btn-primary dir-btn" data-ld-focus-save>Save focus</button><button type="button" class="btn btn-ghost dir-btn" data-ld-focus-cancel>Cancel</button></div>`
        : focus.length ? `<ol class="ld-focus-list">${focus.map(f => `<li>${escapeHtml(f)}</li>`).join('')}</ol>` : '<p class="dir-empty">No focus set for this quarter yet. Add the growth goals you agreed on in their eval.</p>'}
    </section>
    <section class="dir-card"><div class="ld-row"><h3>Notes</h3><button type="button" class="btn ${ldNoteOpen ? 'btn-ghost' : 'btn-primary'} dir-btn" data-ld-note-open>${ldNoteOpen ? 'Close' : 'Add a note'}</button></div>
      ${ldNoteOpen ? `<form class="ld-note-form" id="ldNoteForm">
        <div class="ld-note-row"><label>Date <input type="date" id="ldNoteDate" value="${today}" max="${today}" required></label><div class="ld-type-pick" role="radiogroup" aria-label="Type">${LD_TYPES.map((t, i) => `<label class="ld-type is-${t.id}" title="${escapeHtml(t.hint)}"><input type="radio" name="ldType" value="${t.id}" ${i === 0 ? 'checked' : ''}><span>${escapeHtml(t.label)}</span></label>`).join('')}</div></div>
        <textarea id="ldNoteText" rows="3" maxlength="1000" placeholder="What did you see or say? Specifics help later: the moment, the position, what changed." required></textarea>
        <details class="ld-tagbox"><summary>Tag to a pillar (optional)</summary>${ldPillarChecks(cards, [])}</details>
        <button type="submit" class="btn btn-primary dir-btn">Save note</button></form>` : ''}
      ${all.length ? `<div class="ld-chips">${LD_TYPES.map(t => `<button type="button" class="ld-chip is-${t.id}" data-ld-type="${t.id}" aria-pressed="${ldHide[t.id] ? 'false' : 'true'}">${escapeHtml(t.label)} <b>${counts[t.id]}</b></button>`).join('')}${ldPillar ? `<span class="dir-muted">Tagged <b>${escapeHtml(ldPillarLabel(ldPillar))}</b> <button type="button" class="ld-link" data-ld-pillar="">Show all</button></span>` : ''}</div>` : ''}
      ${all.length ? (shown.length ? months : '<p class="dir-empty">No notes match the filters.</p>') : '<p class="dir-empty">No notes yet. Log a win, a coaching moment, something to watch, or a conversation.</p>'}
    </section>
    <section class="dir-card"><div class="ld-row"><h3>Calibrate to the PEC</h3>${cards.length > 1 ? `<div class="uo-panes ld-panes" role="tablist" aria-label="Role card">${cards.map(id => `<button type="button" class="uo-pane-btn ${id === ldCard ? 'active' : ''}" data-ld-card="${id}">${escapeHtml(LD_CARDS[id].short)}</button>`).join('')}</div>` : ''}</div>
      <p class="dir-note"><b>${escapeHtml(card.name)}:</b> ${escapeHtml(card.desc)}</p>
      <div class="ld-pillars">${card.pillars.map(pl => {
        const tag = `${ldCard}:${pl[0]}`;
        const ev = all.filter(n => (n.pec || []).includes(tag));
        const dots = LD_TYPES.map(t => { const c = ev.filter(n => n.type === t.id).length; return c ? `<span class="ld-pill is-${t.id}">${c} ${escapeHtml(t.label.toLowerCase())}</span>` : ''; }).join('');
        return `<button type="button" class="ld-pillar ${ev.length ? '' : 'is-gap'}" data-ld-pillar="${escapeHtml(tag)}" aria-pressed="${ldPillar === tag ? 'true' : 'false'}"><span class="ld-pillar-name">${escapeHtml(pl[1])}</span><span class="ld-pillar-ev">${ev.length ? dots : '<em>No evidence yet</em>'}</span><span class="ld-pillar-desc">${escapeHtml(pl[2])}</span></button>`;
      }).join('')}</div>
      <div class="dir-two ld-wins"><div><h4>You are winning when</h4><ul>${card.win.map(w => `<li>${escapeHtml(w)}</li>`).join('')}</ul></div><div><h4>Expected actions</h4><ul>${card.actions.map(w => `<li>${escapeHtml(w)}</li>`).join('')}</ul></div></div>
      ${untagged ? `<p class="dir-note">${ldPlural(untagged, 'note')} not tagged to a pillar yet. Use “Tag” on a note.</p>` : ''}
      ${!L.roles.length ? '<p class="dir-note">Set this leader’s PEC role in Manage → Settings → Leaders and their role card shows here too.</p>' : ''}
    </section>
    <section class="dir-card"><h3>Quarter by quarter</h3>
      <table class="ld-history"><thead><tr><th>Quarter</th><th>PEAs</th><th>Notes</th><th>Focus</th></tr></thead><tbody>${history.map(h => `<tr class="${h.q === ldQuarterOn() ? 'is-on' : ''}"><td><button type="button" class="ld-link" data-ld-quarter="${h.q}">${escapeHtml(h.b.label)}</button></td><td>${h.peas}${h.peas >= S.goals.leader ? ` ${LD_ICON_TROPHY}` : ''}</td><td>${h.notes}</td><td>${h.focus ? ldPlural(h.focus, 'item') : '—'}</td></tr>`).join('')}</tbody></table>
      <p class="dir-note">Ratings are kept a year; notes and the focus stay.</p>
    </section>`;
}
function ldPillarChecks(cards, tags){
  return cards.map(cid => `<fieldset class="ld-fieldset"><legend>${escapeHtml(LD_CARDS[cid].name)}</legend>${LD_CARDS[cid].pillars.map(pl => { const tg = `${cid}:${pl[0]}`; return `<label><input type="checkbox" name="ldPec" value="${escapeHtml(tg)}" ${tags.includes(tg) ? 'checked' : ''}> ${escapeHtml(pl[1])}</label>`; }).join('')}</fieldset>`).join('');
}

function ldBodyHtml(){
  if(ldOpen && !ldLeaderNames(ldQuarterOn()).some(n => dirKey(n) === dirKey(ldOpen)) && !ldNotesFor(ldOpen).length) ldOpen = '';
  return ldOpen ? ldProfileHtml() : ldOverviewHtml();
}

// ----- The profile as text (eval prep) -----
function ldProfileText(name){
  const S = ldScore();
  const L = S.leaders.find(l => dirKey(l.name) === dirKey(name));
  const b = S.quarter;
  const out = [`${name}${L && L.roles.length ? ' — ' + L.roles.join(', ') : ''}`, `${b.label} (${b.span})`, ''];
  out.push(`PEAs: ${L ? L.count : 0} of ${S.goals.leader}${L ? ' · ' + ldPaceText(L, S) : ''}`);
  if(L && L.streak > 1) out.push(`Streak: ${L.streak} weeks with a PEA`);
  const focus = ldFocusFor(name);
  out.push(''); out.push(`${b.label} FOCUS`);
  focus.length ? focus.forEach((f, i) => out.push(`${i + 1}. ${f}`)) : out.push('None set.');
  const notes = ldNotesFor(name).map(n => ({...n, date: ldNoteDate(n)})).filter(n => n.date >= b.from && n.date <= b.to).sort((a, c) => a.date.localeCompare(c.date));
  const counts = LD_TYPES.map(t => `${notes.filter(n => n.type === t.id).length} ${t.label.toLowerCase()}`).join(', ');
  out.push(''); out.push(`NOTES (${notes.length}: ${counts})`);
  notes.length ? notes.forEach(n => { const t = LD_TYPES.find(x => x.id === n.type); out.push(`${ldDate(n.date)} · ${t ? t.label : 'Note'}: ${n.text}${n.pec && n.pec.length ? ` [${n.pec.map(ldPillarLabel).join(', ')}]` : ''}`); }) : out.push('None this quarter.');
  const gaps = [];
  ldCardsFor(name).forEach(cid => LD_CARDS[cid].pillars.forEach(pl => { if(!notes.some(n => (n.pec || []).includes(`${cid}:${pl[0]}`))) gaps.push(pl[1]); }));
  if(gaps.length && notes.length) { out.push(''); out.push(`PILLARS WITH NO EVIDENCE YET: ${gaps.join(', ')}`); }
  return out.join('\n');
}

// ----- Events (inside #directorsRoot, Leaders view) -----
function ldRender(){ if(typeof renderDirectorsView === 'function') renderDirectorsView(); }
function ldSaveNote(name, note){ const key = ldNoteKey(name); (leaderNotes[key] = leaderNotes[key] || []).push(note); }

document.addEventListener('click', e => {
  const t = e.target && e.target.closest ? e.target : null;
  if(!t || !t.closest('#directorsRoot')) return;
  const open = t.closest('[data-ld-open]');
  if(open){ ldOpen = open.dataset.ldOpen; ldCard = ''; ldPillar = ''; ldHide = {}; ldFocusEdit = false; ldNoteOpen = false; ldTagEdit = -1; ldRender(); window.scrollTo(0, 0); return; }
  if(t.closest('[data-ld-back]')){ ldOpen = ''; ldRender(); return; }
  const card = t.closest('[data-ld-card]');
  if(card){ ldCard = card.dataset.ldCard; ldPillar = ''; ldRender(); return; }
  const pillar = t.closest('[data-ld-pillar]');
  if(pillar){ const tag = pillar.dataset.ldPillar; ldPillar = ldPillar === tag ? '' : tag; ldRender(); return; }
  const type = t.closest('[data-ld-type]');
  if(type){ ldHide[type.dataset.ldType] = !ldHide[type.dataset.ldType]; ldRender(); return; }
  const q = t.closest('[data-ld-quarter]');
  if(q){ ldQuarter = q.dataset.ldQuarter; ldRender(); return; }
  if(t.closest('[data-ld-focus-edit]')){ ldFocusEdit = true; ldRender(); const ta = document.getElementById('ldFocusText'); if(ta) ta.focus(); return; }
  if(t.closest('[data-ld-focus-cancel]')){ ldFocusEdit = false; ldRender(); return; }
  if(t.closest('[data-ld-focus-save]')){
    const items = (document.getElementById('ldFocusText').value || '').split('\n').map(s => s.trim()).filter(Boolean).slice(0, 10);
    const key = `${dirKey(ldOpen)}__${ldQuarterOn()}`;
    if(items.length) leaderFocus[key] = items; else delete leaderFocus[key];
    ldFocusEdit = false; ldRender(); saveState(); return;
  }
  if(t.closest('[data-ld-note-open]')){ ldNoteOpen = !ldNoteOpen; ldRender(); const ta = document.getElementById('ldNoteText'); if(ta) ta.focus(); return; }
  const del = t.closest('[data-ld-note-del]');
  if(del){
    const key = ldNoteKey(ldOpen), list = leaderNotes[key] || [], n = list[+del.dataset.ldNoteDel];
    if(!n || !confirm('Delete this note?')) return;
    list.splice(+del.dataset.ldNoteDel, 1);
    if(!list.length) delete leaderNotes[key];
    ldTagEdit = -1; ldRender(); saveState(); return;
  }
  const tag = t.closest('[data-ld-tag]');
  if(tag){ ldTagEdit = +tag.dataset.ldTag; ldRender(); return; }
  if(t.closest('[data-ld-tag-cancel]')){ ldTagEdit = -1; ldRender(); return; }
  const tagSave = t.closest('[data-ld-tag-save]');
  if(tagSave){
    const n = (leaderNotes[ldNoteKey(ldOpen)] || [])[+tagSave.dataset.ldTagSave];
    if(n){ const picked = [...tagSave.closest('.ld-tagbox').querySelectorAll('input[name="ldPec"]:checked')].map(i => i.value); if(picked.length) n.pec = picked; else delete n.pec; }
    ldTagEdit = -1; ldRender(); saveState(); return;
  }
  const copy = t.closest('[data-ld-copy]');
  if(copy){
    const text = ldProfileText(ldOpen);
    const done = ok => { const orig = copy.textContent; copy.textContent = ok ? 'Copied' : 'Copy failed'; setTimeout(() => { copy.textContent = orig; }, 1600); };
    if(navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(() => done(true), () => done(false)); else done(false);
  }
});
document.addEventListener('change', e => {
  if(e.target && e.target.id === 'ldQuarter'){ ldQuarter = e.target.value; ldRender(); }
});
document.addEventListener('submit', e => {
  if(e.target.id !== 'ldNoteForm') return;
  e.preventDefault();
  const text = (document.getElementById('ldNoteText').value || '').trim();
  const date = document.getElementById('ldNoteDate').value || today;
  const typeEl = e.target.querySelector('input[name="ldType"]:checked');
  if(!text || !ldOpen) return;
  const note = {text: text.slice(0, 1000), by: (typeof getInitials === 'function' && getInitials()) || '', ts: Date.now(), date, type: typeEl ? typeEl.value : 'win'};
  const pec = [...e.target.querySelectorAll('input[name="ldPec"]:checked')].map(i => i.value);
  if(pec.length) note.pec = pec;
  ldSaveNote(ldOpen, note);
  ldNoteOpen = false; ldRender(); showToast('Note saved'); saveState();
});

// ----- Manage → Settings: the leaders, their PEC roles, the PEA goals -----
function ldEnsureOwn(){ if(!Array.isArray(leaderRoster)) leaderRoster = []; }
function renderLeadersManage(){
  const root = document.getElementById('leadersManageRoot');
  if(!root) return;
  const goals = ldGoals();
  const known = [...new Set([...ldRatings().map(r => r.leader), ...ldLeaderNames(ldQuarterNow())].filter(Boolean))].sort((a, b) => a.localeCompare(b));
  root.innerHTML = `
    <div class="ld-goals"><label>Team, per quarter <input type="number" min="1" max="999" value="${goals.team}" data-ld-goal="team"></label><label>Each leader, per quarter <input type="number" min="1" max="99" value="${goals.leader}" data-ld-goal="leader"></label></div>
    <datalist id="ldKnownLeaders">${known.map(n => `<option value="${escapeHtml(n)}">`).join('')}</datalist>
    <div class="dir-m-list">${ldRoster().map((r, i) => `
      <div class="ld-m-row">
        <div class="ld-m-top"><input type="text" value="${escapeHtml(r.name)}" maxlength="80" list="ldKnownLeaders" placeholder="Name as in Levelset" data-ld-m-name="${i}" aria-label="Name"><button type="button" class="dir-x" data-ld-m-del="${i}" aria-label="Remove ${escapeHtml(r.name)}">${UO_X_ICON}</button></div>
        <div class="ld-m-roles">${LD_ROLES.map(role => `<button type="button" class="ld-chip ${(r.roles || []).includes(role) ? 'is-on' : ''}" data-ld-m-role="${escapeHtml(role)}" data-ld-m-i="${i}" aria-pressed="${(r.roles || []).includes(role) ? 'true' : 'false'}">${escapeHtml(role)}</button>`).join('')}</div>
      </div>`).join('')}</div>
    <button type="button" class="btn btn-ghost dir-btn" data-ld-m-add>+ Add a leader</button>
    <p class="mv-saved" data-mv-saved>Saves as you go</p>`;
}
document.addEventListener('change', e => {
  const t = e.target;
  if(!t || !t.closest || !t.closest('#leadersManageRoot')) return;
  if(t.dataset.ldGoal){
    const g = ldGoals(); const v = Math.round(+t.value);
    if(v > 0) g[t.dataset.ldGoal] = v;
    peaGoals = g; saveState(); dirRerender(); return;
  }
  if(t.dataset.ldMName !== undefined){ ldEnsureOwn(); const r = leaderRoster[+t.dataset.ldMName]; if(r){ r.name = t.value.trim(); saveState(); dirRerender(); } }
});
document.addEventListener('click', e => {
  const t = e.target && e.target.closest ? e.target : null;
  if(!t || !t.closest('#leadersManageRoot')) return;
  if(t.closest('[data-ld-m-add]')){ ldEnsureOwn(); leaderRoster.push({name: '', roles: []}); renderLeadersManage(); const rows = document.querySelectorAll('#leadersManageRoot [data-ld-m-name]'); if(rows.length) rows[rows.length - 1].focus(); return; }
  const del = t.closest('[data-ld-m-del]');
  if(del){ ldEnsureOwn(); leaderRoster.splice(+del.dataset.ldMDel, 1); renderLeadersManage(); saveState(); dirRerender(); return; }
  const role = t.closest('[data-ld-m-role]');
  if(role){
    ldEnsureOwn(); const r = leaderRoster[+role.dataset.ldMI]; if(!r) return;
    r.roles = Array.isArray(r.roles) ? r.roles : [];
    const name = role.dataset.ldMRole;
    r.roles = r.roles.includes(name) ? r.roles.filter(x => x !== name) : [...r.roles, name];
    renderLeadersManage(); saveState(); dirRerender();
  }
});
