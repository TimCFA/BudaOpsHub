// ===== TEAM LEAD 90-DAY TRIAL TRACKER =====
// Structural mirror of the Trainer Trial Tracker (trainer-trial.js), built from the real
// Chick-fil-A Buda 2025 Leadership Playbook's "Team Leader 90 Day Trial" outline (p.4):
// three months (Foundations / Skills & Execution / Application & Assessments), each
// covering two-week blocks, plus an ongoing Leadership Development reading/video track.
// Reuses TT_STATUS / TT_STATUS_ORDER from trainer-trial.js — same five-state coaching scale.
// Persistence goes through this app's existing Firebase-backed saveState()/loadState().

const TL_TRACKS = {
  ops: { label: 'Business & Execution', ink: '#0B3D66', bg: '#E8F1FA', bar: '#1F5FA8' },
  leadership: { label: 'Leadership Development', ink: '#8A1F1F', bg: '#FDECEC', bar: '#DD0000' }
};

const TL_MONTHS = {
  1: { label: 'Month 1', theme: 'Foundations' },
  2: { label: 'Month 2', theme: 'Skills & Execution' },
  3: { label: 'Month 3', theme: 'Application & Assessments' }
};

const TL_BLOCKS = [
  { id: 1, month: 1, weekStart: 1, label: 'Weeks 1–2', theme: 'Business Framework, Vision & Mission' },
  { id: 2, month: 1, weekStart: 3, label: 'Weeks 3–4', theme: 'The Flywheel & Role Clarity' },
  { id: 3, month: 2, weekStart: 5, label: 'Weeks 5–6', theme: 'Winning Hearts Every Day' },
  { id: 4, month: 2, weekStart: 7, label: 'Weeks 7–8', theme: 'Leading Others & Knowing the Numbers' },
  { id: 5, month: 3, weekStart: 9, label: 'Weeks 9–10', theme: 'Managing Costs & Cash' },
  { id: 6, month: 3, weekStart: 11, label: 'Weeks 11–12', theme: 'Assessments & Certification' }
];

const TL_CURRICULUM = [
  { id: 'b1-purpose', block: 1, track: 'ops', title: 'Our Purpose',
    desc: '"To glorify God by being a faithful steward of all that is entrusted to us. To have a positive influence on all who come in contact with Chick-fil-A." Know it, live it, protect it.', ref: 'Playbook p.6' },
  { id: 'b1-vision-mission', block: 1, track: 'ops', title: 'Vision & Mission',
    desc: 'Vision: "To be the most caring brand in Buda." Mission: "To Win Hearts Everyday." Every interaction is a chance to win a heart.', ref: 'Playbook p.7' },
  { id: 'b1-core-strategy', block: 1, track: 'ops', title: 'Core Strategy: GX, TX & LX',
    desc: 'The triple win — obsess over the Guest Experience, strengthen the Team Member Experience, and execute your own Leadership Experience. Every decision should support all three.', ref: 'Playbook p.10' },
  { id: 'b1-5csf', block: 1, track: 'ops', title: '5 Critical Success Factors',
    desc: 'Leadership, Talent, Customer Experience, Sales & Brand Growth, and Financial Stewardship — the five things that determine whether the restaurant thrives.', ref: 'Playbook p.9' },
  { id: 'b1-capacity', block: 1, track: 'leadership', title: 'Leadership Capacity Traits',
    desc: 'Self-aware & seeks feedback, a Team vs "I" mindset, healthy conflict capacity, committed to self-development, intentional with time, decisive, and executes systems to uphold standards.', ref: 'Playbook p.8' },
  { id: 'b1-heart', block: 1, track: 'leadership', title: 'Heart of Leadership & Working Genius',
    desc: 'Complete the Working Genius Assessment and email results to chickfila@cfabuda.com. Reflect on Simon Sinek’s "Most Leaders Don’t Know" — what game are you actually in?', ref: 'Playbook p.14–15' },

  { id: 'b2-flywheel', block: 2, track: 'ops', title: 'The Flywheel — How We Build Momentum',
    desc: 'Six components drive the business forward: Develop Exceptional Leaders, Build & Retain a High-Performing Team, Deliver Operational Excellence Every Day, Create Meaningful Guest Connections, Grow Sales Through Care, Steward Resources with Excellence.', ref: 'Playbook p.12' },
  { id: 'b2-6es', block: 2, track: 'ops', title: 'The 6E’s: Our Shared Challenge',
    desc: 'To enthusiastically expect excellence in execution by everyone, every day. No one is exempt — every role, every shift, every person matters.', ref: 'Playbook p.11' },
  { id: 'b2-foundational-role', block: 2, track: 'ops', title: 'The Foundational Role of a Leader',
    desc: 'Master the five core responsibilities before specializing: Lead the Zone, Engage the Team, Champion Guest Experience, Hold the Standards, Lead Yourself First.', ref: 'Playbook p.13' },
  { id: 'b2-pea-intro', block: 2, track: 'ops', title: 'Positional Excellence Assessments (PEAs)',
    desc: 'Submit at least 1 PEA per daypart worked and maintain 2.75+ team member PEA performance. PEAs are how you coach with facts, not feelings.', ref: 'Playbook p.13' },
  { id: 'b2-responsibility', block: 2, track: 'leadership', title: 'Andy Stanley: Responsibility vs. Authority',
    desc: 'You don’t need a title to lead — you need to take responsibility. Reflect on where you’re already leading without waiting for permission.', ref: 'Playbook p.17' },
  { id: 'b2-better-before-bigger', block: 2, track: 'leadership', title: 'Andy Stanley: Better Before Bigger',
    desc: 'Before taking on more scope, get better at what’s already in front of you. What does "better" look like in your current zone?', ref: 'Playbook p.18' },

  { id: 'b3-oe', block: 3, track: 'ops', title: 'Operational Excellence Components',
    desc: 'Craveable Food, Fast & Accurate Service, and a Welcoming Environment are the three things guests say build the most trust and loyalty in the brand.', ref: 'Playbook p.20' },
  { id: 'b3-2nd-mile', block: 3, track: 'ops', title: '2nd Mile Service',
    desc: 'Personal, Generous, and Proactive — going beyond what’s expected to turn ordinary moments into remarkable ones (Matthew 5:41).', ref: 'Playbook p.21' },
  { id: 'b3-attentive', block: 3, track: 'ops', title: 'Attentive & Friendly Team Members',
    desc: 'The bridge between Operational Excellence and 2nd Mile Service — paying attention to details, delivering the Core 4, and recovering quickly when something goes wrong.', ref: 'Playbook p.20–21' },
  { id: 'b3-esrc', block: 3, track: 'leadership', title: 'Delivering Feedback & ESRC',
    desc: 'Coach team members through direct, care-filled feedback that names what happened and what needs to change next.', ref: 'Playbook p.19' },
  { id: 'b3-unreasonable', block: 3, track: 'leadership', title: 'Unreasonable Hospitality & Winning Hearts',
    desc: 'Dan Cathy on Winning Hearts Every Day, and what it looks like to go further for a guest than they expect.', ref: 'Playbook p.19 (Leadership Development)' },

  { id: 'b4-glec', block: 4, track: 'ops', title: 'GLEC — Leading Others',
    desc: 'The team member CARE strategy behind coaching: genuine engagement, love tough, expect the best, celebrate the wins.', ref: 'Playbook p.19' },
  { id: 'b4-zone-captain', block: 4, track: 'ops', title: 'Zone Captaining & Huddles',
    desc: 'Own the flow of your zone, run a huddle that sets the tone for the shift, and hand off transitions cleanly to the next leader.', ref: 'Playbook p.19' },
  { id: 'b4-knownumbers', block: 4, track: 'ops', title: 'Know the #’s',
    desc: 'Pull CEM, Speed of Service, and labor reports regularly. Use the Leader App to monitor speed, sales, and labor in real time — then adjust proactively during the shift.', ref: 'Playbook p.50' },
  { id: 'b4-worldclass', block: 4, track: 'leadership', title: 'Andy Stanley: World Class Service (Parts 1 & 2)',
    desc: 'What separates good service from world class — and how a leader sets that standard for a whole team.', ref: 'Playbook p.46 (Leadership Development)' },
  { id: 'b4-highperf', block: 4, track: 'leadership', title: 'Creating High-Performance Teams (Parts 1 & 2)',
    desc: 'What actually makes a team high-performing, and the leader’s role in building it.', ref: 'Playbook p.47 (Leadership Development)' },

  { id: 'b5-bigpicture', block: 5, track: 'ops', title: 'Why Manage Costs — The Big Financial Picture',
    desc: 'Food Cost, Labor Cost, Other Costs, and Profit together make up 100% of every dollar in net sales. Food and labor are nearly half of it — the two biggest levers on profit.', ref: 'Playbook p.49' },
  { id: 'b5-foodcost', block: 5, track: 'ops', title: 'Food Cost & the DRIP Method',
    desc: 'Food Cost = Beginning Inventory + Purchases & Transfers − Ending Inventory. Keep the Food Cost Gap at 0.25% or less by watching Deliveries, Registers, Inventory, and Prep.', ref: 'Playbook p.52–53' },
  { id: 'b5-labor', block: 5, track: 'ops', title: 'Labor Report & Productivity',
    desc: 'Productivity is sales dollars — or transactions — per labor hour worked. Small shifts in average ticket or transaction speed move it more than people expect.', ref: 'Playbook p.54' },
  { id: 'b5-cash', block: 5, track: 'ops', title: 'Cash Management',
    desc: 'The Change Fund must always total $4,500. Count every pouch the same way, every time, using the Cashmaster — no shortcuts.', ref: 'Playbook p.51' },
  { id: 'b5-inform', block: 5, track: 'ops', title: 'InFORM Daily Workflow',
    desc: 'Change Fund → Sales → Cashier Settlement → Deposits → Finalize Day. The goal is never more than +/– $3.00 variance.', ref: 'Playbook p.55' },

  { id: 'b6-dysfunctions', block: 6, track: 'leadership', title: '5 Dysfunctions of a Team Workshop',
    desc: 'Identify which of the five dysfunctions — absence of trust, fear of conflict, lack of commitment, avoidance of accountability, inattention to results — shows up most on your shifts.', ref: 'Playbook p.4' },
  { id: 'b6-pea-allzones', block: 6, track: 'ops', title: 'PEAs in All Zones + LX PEAs',
    desc: 'Be evaluated in every zone, not just your strongest one, plus a Leadership Experience PEA on how you lead — not just what you execute.', ref: 'Playbook p.4' },
  { id: 'b6-shiftcaptain', block: 6, track: 'ops', title: 'Shift Captain Rotations',
    desc: 'Lead a full Open/Breakfast, Afternoon, and Dinner/Close rotation independently — proving you can run any part of the day, not just your favorite one.', ref: 'Playbook p.4' },
  { id: 'b6-coaching-eval', block: 6, track: 'ops', title: 'Coaching Evaluation',
    desc: 'Sit down with senior leaders to review wins, identify gaps, and assess readiness for certification — the final checkpoint of the 90-day trial.', ref: 'Playbook p.4' },
  { id: 'b6-trust', block: 6, track: 'leadership', title: 'Trust vs. Suspicion / The Power of Teams',
    desc: 'Andy Stanley on trust vs. suspicion and the power of teams (Parts 1–3) — what it takes to lead a team that actually trusts you.', ref: 'Playbook p.57, 60' }
];

const TL_TOTAL_ITEMS = TL_CURRICULUM.length;

let teamLeadTrainees = []; // persisted: [{id, name, coach, startDate}]
let teamLeadProgress = {}; // persisted: {traineeId: {itemId: {status, notes}}}
let tlActiveId = null;
let tlView = 'dashboard'; // 'dashboard' | 'curriculum'
let tlBlockFilter = 'all';
let tlTrackFilter = 'all';
let tlOpenMenuId = null;
let tlOpenNotesIds = new Set();

function tlUid(){
  return 'tl' + Date.now() + Math.random().toString(36).slice(2, 8);
}

function tlDaysBetween(dateStr){
  if(!dateStr) return 0;
  const start = new Date(dateStr + 'T00:00:00');
  const now = new Date();
  const diff = Math.floor((now - start) / (1000 * 60 * 60 * 24));
  return Math.max(0, diff);
}

function tlExpectedWeek(dateStr){
  const d = tlDaysBetween(dateStr);
  return Math.min(12, Math.floor(d / 7) + 1);
}

function tlExpectedBlock(dateStr){
  const w = tlExpectedWeek(dateStr);
  return Math.min(6, Math.ceil(w / 2));
}

function tlOverallPct(progress){
  const done = TL_CURRICULUM.filter(i => {
    const st = progress[i.id] && progress[i.id].status;
    return st === 'mastered' || st === 'excelled';
  }).length;
  return Math.round((done / TL_TOTAL_ITEMS) * 100);
}

function tlComputeStats(progress){
  const counts = {not_started: 0, in_progress: 0, struggled: 0, excelled: 0, mastered: 0};
  let opsDone = 0, opsTotal = 0, leadershipDone = 0, leadershipTotal = 0;
  const struggles = [];
  const wins = [];
  TL_CURRICULUM.forEach(item => {
    const st = (progress[item.id] && progress[item.id].status) || 'not_started';
    counts[st]++;
    const done = st === 'mastered' || st === 'excelled';
    if(item.track === 'ops'){ opsTotal++; if(done) opsDone++; }
    else { leadershipTotal++; if(done) leadershipDone++; }
    if(st === 'struggled') struggles.push(item);
    if(st === 'excelled' || st === 'mastered') wins.push(item);
  });
  const overallDone = counts.mastered + counts.excelled;
  return {
    counts,
    overallPct: Math.round((overallDone / TL_TOTAL_ITEMS) * 100),
    opsPct: opsTotal ? Math.round((opsDone / opsTotal) * 100) : 0,
    leadershipPct: leadershipTotal ? Math.round((leadershipDone / leadershipTotal) * 100) : 0,
    struggles, wins
  };
}

function tlRenderDashboard(trainee, progress){
  const stats = tlComputeStats(progress);
  const eBlock = tlExpectedBlock(trainee.startDate);
  const eWeek = tlExpectedWeek(trainee.startDate);
  const daysIn = tlDaysBetween(trainee.startDate);
  const behind = TL_CURRICULUM.filter(item => {
    const st = (progress[item.id] && progress[item.id].status) || 'not_started';
    return item.block < eBlock && (st === 'not_started' || st === 'in_progress');
  });

  const ringPct = Math.min(100, Math.round((daysIn / 90) * 100));
  const r = 44, c = 2 * Math.PI * r;
  const ringOffset = (c - (ringPct / 100) * c).toFixed(1);

  return `
    <div class="trial-hero-row">
      <div class="trial-ring-card">
        <div class="trial-ring-wrap">
          <svg viewBox="0 0 104 104">
            <circle class="trial-ring-track" cx="52" cy="52" r="${r}"></circle>
            <circle class="trial-ring-fill" cx="52" cy="52" r="${r}" style="stroke-dasharray:${c.toFixed(1)};stroke-dashoffset:${ringOffset};"></circle>
          </svg>
          <div class="trial-ring-center">
            <span class="trial-ring-num">${daysIn}</span>
            <span class="trial-ring-denom">/ 90 DAYS</span>
          </div>
        </div>
        <p class="trial-ring-caption">Expected on Week ${eWeek} of 12 (Month ${TL_BLOCKS[eBlock-1].month})</p>
      </div>
      <div class="trial-chip-stack">
        <div class="trial-chip">
          <p class="trial-chip-label">Overall Progress</p>
          <p class="trial-chip-value">${stats.overallPct}%</p>
        </div>
        <div class="trial-chip">
          <p class="trial-chip-label">On Track?</p>
          <p class="trial-chip-value" style="color:${behind.length ? '#B23B1F' : '#2F7D4F'};">${behind.length ? behind.length + ' behind' : 'Yes'}</p>
          <p class="trial-chip-sub">${behind.length ? 'Items from earlier weeks still open' : 'No overdue items'}</p>
        </div>
      </div>
    </div>

    <div class="trial-gauge-grid">
      <div class="trial-gauge">
        <div class="trial-gauge-row"><span style="color:${TL_TRACKS.ops.ink};">Business & Execution</span><span class="trial-gauge-pct">${stats.opsPct}%</span></div>
        <div class="trial-gauge-track"><div class="trial-gauge-fill" style="width:${stats.opsPct}%;background:${TL_TRACKS.ops.bar};"></div></div>
      </div>
      <div class="trial-gauge">
        <div class="trial-gauge-row"><span style="color:${TL_TRACKS.leadership.ink};">Leadership Development</span><span class="trial-gauge-pct">${stats.leadershipPct}%</span></div>
        <div class="trial-gauge-track"><div class="trial-gauge-fill" style="width:${stats.leadershipPct}%;background:${TL_TRACKS.leadership.bar};"></div></div>
      </div>
    </div>

    ${behind.length > 0 ? `
      <div class="trial-alert-card">
        <div class="trial-alert-title" style="color:#B23B1F;">⚠️ Behind schedule</div>
        <ul class="trial-plain-list">
          ${behind.map(item => `<li>${escapeHtml(TL_BLOCKS[item.block-1].label)} — ${escapeHtml(item.title)}</li>`).join('')}
        </ul>
      </div>
    ` : ''}

    <div class="trial-panel-grid">
      <div class="trial-panel">
        <div class="trial-alert-title" style="color:#B23B1F;">⚠️ Struggled with (${stats.struggles.length})</div>
        ${stats.struggles.length === 0 ? '<p class="trial-empty-note">Nothing flagged yet.</p>' : `
          <ul class="trial-plain-list">
            ${stats.struggles.map(item => `<li><p style="margin:0;">${escapeHtml(item.title)}</p>${(progress[item.id] && progress[item.id].notes) ? `<p class="trial-note-text">${escapeHtml(progress[item.id].notes)}</p>` : ''}</li>`).join('')}
          </ul>
        `}
      </div>
      <div class="trial-panel">
        <div class="trial-alert-title" style="color:#2F7D4F;">✨ Excelled at (${stats.wins.length})</div>
        ${stats.wins.length === 0 ? '<p class="trial-empty-note">Nothing flagged yet.</p>' : `
          <ul class="trial-plain-list">
            ${stats.wins.map(item => `<li><p style="margin:0;">${escapeHtml(item.title)}</p>${(progress[item.id] && progress[item.id].notes) ? `<p class="trial-note-text">${escapeHtml(progress[item.id].notes)}</p>` : ''}</li>`).join('')}
          </ul>
        `}
      </div>
    </div>
  `;
}

function tlRenderCurriculumRow(item, entry){
  const status = (entry && entry.status) || 'not_started';
  const s = TT_STATUS[status];
  const menuOpen = tlOpenMenuId === item.id;
  const notesOpen = tlOpenNotesIds.has(item.id);
  const notes = (entry && entry.notes) || '';
  const track = TL_TRACKS[item.track];
  return `
    <div class="trial-row" style="--trial-row-ink:${track.ink};">
      <div class="trial-row-top">
        <div class="trial-row-main">
          <div class="trial-row-title-line">
            <span class="trial-row-title">${escapeHtml(item.title)}</span>
            <span class="trial-track-badge" style="background:${track.ink};">${track.label}</span>
          </div>
          <p class="trial-row-desc">${escapeHtml(item.desc)}</p>
          <p class="trial-row-ref">${escapeHtml(item.ref)}</p>
        </div>
        <div class="trial-status-wrap">
          <button class="trial-status-pill" style="color:${s.ink};background:${s.bg};border-color:${s.ink}55;" data-tl-status-toggle="${item.id}">${s.icon} ${s.label}</button>
          ${menuOpen ? `
            <div class="trial-status-menu">
              ${TT_STATUS_ORDER.map(key => {
                const opt = TT_STATUS[key];
                return `<button class="trial-status-option" style="color:${opt.ink};${status===key?`background:${opt.bg};`:''}" data-tl-status-set="${item.id}" data-status="${key}">${opt.icon} ${opt.label}${status===key?' ✓':''}</button>`;
              }).join('')}
            </div>
          ` : ''}
        </div>
      </div>
      <button class="trial-notes-toggle" data-tl-notes-toggle="${item.id}">${notesOpen ? '▾' : '▸'} ${notes ? 'Coaching note' : 'Add a coaching note'}</button>
      ${notesOpen ? `
        <div class="trial-notes-wrap">
          <textarea class="trial-notes-input" data-tl-notes-input="${item.id}" placeholder="What specifically did they struggle with, or excel at? Keep it behavior-based." rows="2">${escapeHtml(notes)}</textarea>
        </div>
      ` : ''}
    </div>
  `;
}

function renderTeamLeadTrial(){
  const root = document.getElementById('teamLeadTrialRoot');
  if(!root) return;

  if(teamLeadTrainees.length === 0){
    root.innerHTML = `
      <div class="trial-root" data-theme="teamlead">
        <div class="trial-masthead">
          <p class="trial-masthead-eyebrow">Trial Tracker</p>
          <h2 class="trial-masthead-title">🎟️ Team Lead 90-Day Trial</h2>
          <p class="trial-masthead-subtitle">90-day path from Team Member to certified Team Leader</p>
        </div>
        <div class="trial-empty-state">
          <p>No Team Lead trials started yet.</p>
          <button class="trial-cta" data-tl-open-add-modal>+ Start a Team Lead Trial</button>
        </div>
      </div>
    `;
    return;
  }

  if(!teamLeadTrainees.some(t => t.id === tlActiveId)) tlActiveId = teamLeadTrainees[0].id;
  const activeTrainee = teamLeadTrainees.find(t => t.id === tlActiveId);
  const progress = teamLeadProgress[tlActiveId] || {};

  let html = `
    <div class="trial-root" data-theme="teamlead">
      <div class="trial-masthead">
        <p class="trial-masthead-eyebrow">Trial Tracker</p>
        <h2 class="trial-masthead-title">🎟️ Team Lead 90-Day Trial</h2>
        <p class="trial-masthead-subtitle">90-day path from Team Member to certified Team Leader</p>
      </div>

      <div class="trial-trainee-tabs">
        ${teamLeadTrainees.map(t => `<button class="trial-trainee-tab ${t.id===tlActiveId?'active':''}" data-tl-select-trainee="${t.id}">👤 ${escapeHtml(t.name)}</button>`).join('')}
        <button class="trial-add-trainee-btn" data-tl-open-add-modal>+ Add trainee</button>
      </div>

      <div class="trial-info-bar">
        <div>
          <p class="trial-info-name">${escapeHtml(activeTrainee.name)}</p>
          <p class="trial-info-meta">${activeTrainee.coach ? `Coached by ${escapeHtml(activeTrainee.coach)} · ` : ''}Started ${escapeHtml(activeTrainee.startDate)}</p>
        </div>
        <div class="trial-info-right">
          <div style="text-align:right;">
            <p class="trial-info-overall-label">Overall</p>
            <p class="trial-info-overall-value">${tlOverallPct(progress)}%</p>
          </div>
          <button class="trial-remove-btn" data-tl-remove-trainee="${activeTrainee.id}" title="Remove trainee">🗑️</button>
        </div>
      </div>

      <div class="trial-view-toggle">
        <button class="trial-view-btn ${tlView==='dashboard'?'active':''}" data-tl-set-view="dashboard">Dashboard</button>
        <button class="trial-view-btn ${tlView==='curriculum'?'active':''}" data-tl-set-view="curriculum">Curriculum & Progress</button>
      </div>
  `;

  if(tlView === 'dashboard'){
    html += tlRenderDashboard(activeTrainee, progress);
  } else {
    html += `
      <div class="trial-filters">
        <select data-tl-block-filter>
          <option value="all" ${tlBlockFilter==='all'?'selected':''}>All weeks</option>
          ${TL_BLOCKS.map(b => `<option value="${b.id}" ${tlBlockFilter===b.id?'selected':''}>${TL_MONTHS[b.month].label} · ${b.label} — ${b.theme}</option>`).join('')}
        </select>
        <select data-tl-track-filter>
          <option value="all" ${tlTrackFilter==='all'?'selected':''}>Both tracks</option>
          <option value="ops" ${tlTrackFilter==='ops'?'selected':''}>Business & Execution only</option>
          <option value="leadership" ${tlTrackFilter==='leadership'?'selected':''}>Leadership Development only</option>
        </select>
      </div>
    `;
    const filtered = TL_CURRICULUM.filter(item =>
      (tlBlockFilter === 'all' || item.block === tlBlockFilter) &&
      (tlTrackFilter === 'all' || item.track === tlTrackFilter)
    );
    let lastMonth = null;
    TL_BLOCKS.filter(b => tlBlockFilter === 'all' || b.id === tlBlockFilter).forEach(block => {
      const items = filtered.filter(i => i.block === block.id);
      if(!items.length) return;
      if(block.month !== lastMonth){
        lastMonth = block.month;
        html += `<h3 class="trial-month-heading">${TL_MONTHS[block.month].label} — ${TL_MONTHS[block.month].theme}</h3>`;
      }
      html += `
        <div class="trial-week-block">
          <div class="trial-week-heading">
            <h3>${block.label}</h3><span class="trial-week-theme">— ${block.theme}</span>
          </div>
          <div class="trial-row-list">
            ${items.map(item => tlRenderCurriculumRow(item, progress[item.id])).join('')}
          </div>
        </div>
      `;
    });
  }

  html += `</div>`;
  root.innerHTML = html;
}

async function tlSetStatus(itemId, status){
  if(!teamLeadProgress[tlActiveId]) teamLeadProgress[tlActiveId] = {};
  const existing = teamLeadProgress[tlActiveId][itemId] || {};
  teamLeadProgress[tlActiveId][itemId] = Object.assign({}, existing, {status});
  tlOpenMenuId = null;
  await saveState();
  renderTeamLeadTrial();
}

async function tlRemoveTrainee(id){
  teamLeadTrainees = teamLeadTrainees.filter(t => t.id !== id);
  delete teamLeadProgress[id];
  if(tlActiveId === id) tlActiveId = teamLeadTrainees[0] ? teamLeadTrainees[0].id : null;
  await saveState();
  renderTeamLeadTrial();
}

document.getElementById('teamLeadTrialRoot').addEventListener('click', function(e){
  const statusToggle = e.target.closest('[data-tl-status-toggle]');
  if(statusToggle){
    const id = statusToggle.dataset.tlStatusToggle;
    tlOpenMenuId = (tlOpenMenuId === id) ? null : id;
    renderTeamLeadTrial();
    return;
  }
  const statusSet = e.target.closest('[data-tl-status-set]');
  if(statusSet){
    tlSetStatus(statusSet.dataset.tlStatusSet, statusSet.dataset.status);
    return;
  }
  const notesToggle = e.target.closest('[data-tl-notes-toggle]');
  if(notesToggle){
    const id = notesToggle.dataset.tlNotesToggle;
    if(tlOpenNotesIds.has(id)) tlOpenNotesIds.delete(id); else tlOpenNotesIds.add(id);
    renderTeamLeadTrial();
    return;
  }
  const openAdd = e.target.closest('[data-tl-open-add-modal]');
  if(openAdd){
    document.getElementById('tlAddName').value = '';
    document.getElementById('tlAddCoach').value = '';
    document.getElementById('tlAddStart').value = today;
    document.getElementById('tlAddModal').classList.add('active');
    return;
  }
  const selectTab = e.target.closest('[data-tl-select-trainee]');
  if(selectTab){
    tlActiveId = selectTab.dataset.tlSelectTrainee;
    renderTeamLeadTrial();
    return;
  }
  const removeBtn = e.target.closest('[data-tl-remove-trainee]');
  if(removeBtn){
    const id = removeBtn.dataset.tlRemoveTrainee;
    const trainee = teamLeadTrainees.find(t => t.id === id);
    if(confirm(`Remove ${trainee ? trainee.name : 'this trainee'} from Team Lead Trial tracking? This cannot be undone.`)){
      tlRemoveTrainee(id);
    }
    return;
  }
  const viewBtn = e.target.closest('[data-tl-set-view]');
  if(viewBtn){
    tlView = viewBtn.dataset.tlSetView;
    renderTeamLeadTrial();
    return;
  }
});

document.getElementById('teamLeadTrialRoot').addEventListener('change', function(e){
  if(e.target.matches('[data-tl-block-filter]')){
    const v = e.target.value;
    tlBlockFilter = v === 'all' ? 'all' : parseInt(v, 10);
    renderTeamLeadTrial();
  }
  if(e.target.matches('[data-tl-track-filter]')){
    tlTrackFilter = e.target.value;
    renderTeamLeadTrial();
  }
});

document.getElementById('teamLeadTrialRoot').addEventListener('focusout', async function(e){
  const ta = e.target.closest('[data-tl-notes-input]');
  if(!ta) return;
  const itemId = ta.dataset.tlNotesInput;
  if(!teamLeadProgress[tlActiveId]) teamLeadProgress[tlActiveId] = {};
  const existing = teamLeadProgress[tlActiveId][itemId] || {};
  teamLeadProgress[tlActiveId][itemId] = Object.assign({}, existing, {notes: ta.value});
  await saveState();
  renderTeamLeadTrial();
});

document.getElementById('btnTLCancelAdd').addEventListener('click', ()=>{
  document.getElementById('tlAddModal').classList.remove('active');
});
document.getElementById('tlAddModal').addEventListener('click', (e)=>{
  if(e.target === document.getElementById('tlAddModal')) document.getElementById('tlAddModal').classList.remove('active');
});
document.getElementById('btnTLConfirmAdd').addEventListener('click', async ()=>{
  const name = document.getElementById('tlAddName').value.trim();
  if(!name){ showToast('Enter a trainee name'); return; }
  const coach = document.getElementById('tlAddCoach').value.trim();
  const startDate = document.getElementById('tlAddStart').value || today;
  const trainee = {id: tlUid(), name, coach, startDate};
  teamLeadTrainees.push(trainee);
  teamLeadProgress[trainee.id] = {};
  tlActiveId = trainee.id;
  tlView = 'dashboard';
  await saveState();
  document.getElementById('tlAddModal').classList.remove('active');
  renderTeamLeadTrial();
  showToast('✓ Team Lead Trial Started!');
});
