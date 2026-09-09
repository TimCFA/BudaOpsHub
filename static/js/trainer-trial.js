// ===== TRAINER TRIAL TRACKER =====
// Ported from a standalone React/JSX component the user provided. This site has no
// React, JSX, or build step anywhere else, so this is reimplemented in plain JS/DOM
// to match the rest of the codebase — same structure, same 30-day curriculum content.
// Persistence goes through this app's existing Firebase-backed saveState()/loadState().
// All user-typed fields (name, coach, notes) go through escapeHtml before rendering.

const TT_TRACKS = {
  managerial: { label: 'Managerial Skills & Tasks', ink: '#8A5A00', bg: '#FFF6E6', bar: '#C48A1F' },
  leadership: { label: 'Leadership & Coaching', ink: '#8A1F1F', bg: '#FDECEC', bar: '#DD0000' }
};

const TT_WEEKS = [
  { id: 1, label: 'Week 1', theme: 'Foundation & Mindset', subtitle: 'Lead self first' },
  { id: 2, label: 'Week 2', theme: 'Skill Practice & Zone Ownership', subtitle: 'Model the standard' },
  { id: 3, label: 'Week 3', theme: 'Coaching & Mentorship', subtitle: 'Lead others with influence' },
  { id: 4, label: 'Week 4', theme: 'Ownership & Execution', subtitle: 'Multiply the mission' }
];

const TT_CURRICULUM = [
  { id: 'w1-purpose', week: 1, track: 'managerial', title: 'Vision, Mission & Corporate Purpose',
    desc: "Know WHED (Winning Hearts Every Day) and the Operational Excellence / 2nd Mile / Attentive & Friendly framework behind it.", ref: 'Playbook p.5–6' },
  { id: 'w1-3h', week: 1, track: 'leadership', title: '3H Values — Hospitality, Hustle, Humility',
    desc: 'Can define all three and give a real example of modeling each one on shift.', ref: 'Playbook p.7' },
  { id: 'w1-role', week: 1, track: 'managerial', title: 'Role of a Trainer',
    desc: 'Understands the 5 pillars: Engage with Energy, Model Excellence, Train with Clarity, Celebrate & Challenge, Grow the Future.', ref: 'Playbook p.8–9' },
  { id: 'w1-dir', week: 1, track: 'leadership', title: 'DIR Method — Demonstrate, Imitate, Repeat',
    desc: "Practices a full DIR cycle on a low-stakes task, including explaining the 'why' during Demonstrate.", ref: 'Playbook p.11' },
  { id: 'w1-requirements', week: 1, track: 'managerial', title: 'Trainer Requirements & Quarterly Goals',
    desc: 'Can restate their own quarterly numbers: 80+ PEAs, 50+ CARES Cash, 90% of new hires in good standing.', ref: 'Playbook p.20' },
  { id: 'w1-mentee', week: 1, track: 'leadership', title: 'Building the Mentee Relationship',
    desc: 'Meets their assigned 3H\u2019er and sets the tone as their first friend, mentor, and coach.', ref: 'Playbook p.4' },

  { id: 'w2-feedback', week: 2, track: 'leadership', title: 'Feedback Framework — What / So What / Now What',
    desc: 'Delivers feedback that names the behavior, the impact, and the clear next step — short, specific, actionable.', ref: 'Playbook p.12–13' },
  { id: 'w2-oreo', week: 2, track: 'leadership', title: 'Oreo Feedback Method',
    desc: 'Structures feedback as Encouragement → Constructive Feedback → Support, without softening the middle.', ref: 'Playbook p.14' },
  { id: 'w2-pec', week: 2, track: 'managerial', title: 'Positional Excellence Cards (PECs)',
    desc: "Knows the Big 5 behaviors for key positions and can read the 'you're winning when / ask for boost when' triggers.", ref: 'Playbook p.24' },
  { id: 'w2-pea-scale', week: 2, track: 'managerial', title: 'PEA Grading Scale',
    desc: 'Grades consistently: Not Yet (1), On the Rise (2), Crushing It (3) — behavior-based, not opinion-based.', ref: 'Playbook p.18, 24' },
  { id: 'w2-realtime', week: 2, track: 'leadership', title: 'Real-Time Coaching',
    desc: 'Celebrates wins and coaches misses in the moment, not saved up for later.', ref: 'Playbook p.9' },
  { id: 'w2-zone', week: 2, track: 'managerial', title: 'Zone Execution Ownership',
    desc: 'Co-leads a zone, closing execution gaps and making staffing calls alongside a certified leader.', ref: 'Playbook p.9' },

  { id: 'w3-esrc', week: 3, track: 'leadership', title: 'ESRC Framework',
    desc: 'Can walk through Expectations, Skills, Resources, and Consequences for a real team member situation.', ref: 'Playbook p.15' },
  { id: 'w3-glec', week: 3, track: 'leadership', title: 'GLEC — Team Member Care Strategy',
    desc: "Understands Genuine Engagement, Love Tough, Expect the Best, Celebrate the Wins as the 'how' behind coaching.", ref: 'Playbook p.16' },
  { id: 'w3-independent', week: 3, track: 'managerial', title: 'Independent Zone Leadership',
    desc: 'Fully leads a zone with only light oversight — huddle, staffing, and coaching all owned by the trainer.', ref: 'Playbook p.25' },
  { id: 'w3-pea-reps', week: 3, track: 'managerial', title: 'PEA Submission Reps',
    desc: 'Completes 3 PEAs with specific, actionable examples attached to each score.', ref: 'Playbook p.25' },
  { id: 'w3-checkpoint', week: 3, track: 'leadership', title: 'Mid-Trial Checkpoint',
    desc: 'Sits down with a Director for Oreo Feedback on coaching quality, PEA quality, and 3H modeling so far.', ref: 'Playbook p.25' },

  { id: 'w4-teach', week: 4, track: 'leadership', title: 'Leading Full Training Moments',
    desc: 'Owns teaching a new skill start to finish with their New Hire, not just coaching an existing one.', ref: 'Playbook p.25' },
  { id: 'w4-peak', week: 4, track: 'managerial', title: 'Peak-Period Partnership',
    desc: 'Stays present, calm, and hospitable with the team during rush dayparts.', ref: 'Playbook p.25' },
  { id: 'w4-pea-fluency', week: 4, track: 'managerial', title: 'PEA Fluency Across Positions',
    desc: 'Practices PEAs across multiple roles so scoring stays consistent no matter the position.', ref: 'Playbook p.25' },
  { id: 'w4-guest', week: 4, track: 'leadership', title: 'Guest Experience Modeling',
    desc: 'Models Core 4 and 2nd Mile moments directly, including at least one guest-recovery example.', ref: 'Playbook p.6, 25' },
  { id: 'w4-3hweek', week: 4, track: 'managerial', title: '3H Week Readiness',
    desc: 'Can run a 3H Week for a new hire: document observations, grade honestly, and recommend to proceed (or not) with reasons why.', ref: 'Playbook p.17–18' },
  { id: 'w4-360', week: 4, track: 'managerial', title: '360 Process & Certification',
    desc: 'Understands all 4 certification steps and what\u2019s required to reach Certified Pay.', ref: 'Playbook p.22' }
];

const TT_TOTAL_ITEMS = TT_CURRICULUM.length;

const TT_STATUS = {
  not_started: { label: 'Not Started', ink: '#8A8580', bg: '#F1EFEA', icon: '○' },
  in_progress: { label: 'In Progress', ink: '#1F5FA8', bg: '#E8F1FB', icon: '🕐' },
  struggled:   { label: 'Struggled',   ink: '#B23B1F', bg: '#FBEAE4', icon: '⚠️' },
  excelled:    { label: 'Excelled',    ink: '#2F7D4F', bg: '#E9F5EE', icon: '✨' },
  mastered:    { label: 'Mastered',    ink: '#1E6B3A', bg: '#E1F0E6', icon: '✅' }
};
const TT_STATUS_ORDER = ['not_started', 'in_progress', 'struggled', 'excelled', 'mastered'];

let trainerTrainees = []; // persisted: [{id, name, coach, startDate}]
let trainerProgress = {}; // persisted: {traineeId: {itemId: {status, notes}}}
let ttActiveId = null;
let ttView = 'dashboard'; // 'dashboard' | 'curriculum'
let ttWeekFilter = 'all';
let ttTrackFilter = 'all';
let ttOpenMenuId = null;
let ttOpenNotesIds = new Set();

function ttUid(){
  return 'tt' + Date.now() + Math.random().toString(36).slice(2, 8);
}

function ttDaysBetween(dateStr){
  if(!dateStr) return 0;
  const start = new Date(dateStr + 'T00:00:00');
  const now = new Date();
  const diff = Math.floor((now - start) / (1000 * 60 * 60 * 24));
  return Math.max(0, diff);
}

function ttExpectedWeek(dateStr){
  const d = ttDaysBetween(dateStr);
  return Math.min(4, Math.floor(d / 7) + 1);
}

function ttOverallPct(progress){
  const done = TT_CURRICULUM.filter(i => {
    const st = progress[i.id] && progress[i.id].status;
    return st === 'mastered' || st === 'excelled';
  }).length;
  return Math.round((done / TT_TOTAL_ITEMS) * 100);
}

function ttComputeStats(progress){
  const counts = {not_started: 0, in_progress: 0, struggled: 0, excelled: 0, mastered: 0};
  let managerialDone = 0, managerialTotal = 0, leadershipDone = 0, leadershipTotal = 0;
  const struggles = [];
  const wins = [];
  TT_CURRICULUM.forEach(item => {
    const st = (progress[item.id] && progress[item.id].status) || 'not_started';
    counts[st]++;
    const done = st === 'mastered' || st === 'excelled';
    if(item.track === 'managerial'){ managerialTotal++; if(done) managerialDone++; }
    else { leadershipTotal++; if(done) leadershipDone++; }
    if(st === 'struggled') struggles.push(item);
    if(st === 'excelled' || st === 'mastered') wins.push(item);
  });
  const overallDone = counts.mastered + counts.excelled;
  return {
    counts,
    overallPct: Math.round((overallDone / TT_TOTAL_ITEMS) * 100),
    managerialPct: managerialTotal ? Math.round((managerialDone / managerialTotal) * 100) : 0,
    leadershipPct: leadershipTotal ? Math.round((leadershipDone / leadershipTotal) * 100) : 0,
    struggles, wins
  };
}

function ttRenderDashboard(trainee, progress){
  const stats = ttComputeStats(progress);
  const eWeek = ttExpectedWeek(trainee.startDate);
  const daysIn = ttDaysBetween(trainee.startDate);
  const behind = TT_CURRICULUM.filter(item => {
    const st = (progress[item.id] && progress[item.id].status) || 'not_started';
    return item.week < eWeek && (st === 'not_started' || st === 'in_progress');
  });

  return `
    <div class="tt-stat-grid">
      <div class="tt-stat-card">
        <div class="tt-stat-label">Day of Trial</div>
        <div class="tt-stat-value">${daysIn} <span class="tt-stat-unit">/ 30</span></div>
        <div class="tt-stat-sub">Expected on Week ${eWeek} of 4</div>
      </div>
      <div class="tt-stat-card">
        <div class="tt-stat-label">Overall Progress</div>
        <div class="tt-stat-value">${stats.overallPct}%</div>
        <div class="tt-progress-track"><div class="tt-progress-fill" style="width:${stats.overallPct}%;background:var(--cfa-red);"></div></div>
      </div>
      <div class="tt-stat-card">
        <div class="tt-stat-label">On Track?</div>
        <div class="tt-stat-value" style="color:${behind.length ? '#B23B1F' : '#2F7D4F'};font-size:20px;">${behind.length ? behind.length + ' behind' : 'Yes'}</div>
        <div class="tt-stat-sub">${behind.length ? 'Items from earlier weeks still open' : 'No overdue items'}</div>
      </div>
    </div>

    <div class="tt-track-grid">
      <div class="tt-track-card">
        <div class="tt-track-row"><span style="color:${TT_TRACKS.managerial.ink};font-weight:600;">Managerial Skills & Tasks</span><span>${stats.managerialPct}%</span></div>
        <div class="tt-progress-track"><div class="tt-progress-fill" style="width:${stats.managerialPct}%;background:${TT_TRACKS.managerial.bar};"></div></div>
      </div>
      <div class="tt-track-card">
        <div class="tt-track-row"><span style="color:${TT_TRACKS.leadership.ink};font-weight:600;">Leadership & Coaching</span><span>${stats.leadershipPct}%</span></div>
        <div class="tt-progress-track"><div class="tt-progress-fill" style="width:${stats.leadershipPct}%;background:${TT_TRACKS.leadership.bar};"></div></div>
      </div>
    </div>

    ${behind.length > 0 ? `
      <div class="tt-alert-card">
        <div class="tt-alert-title" style="color:#B23B1F;">⚠️ Behind schedule</div>
        <ul class="tt-plain-list">
          ${behind.map(item => `<li>Week ${item.week} — ${escapeHtml(item.title)}</li>`).join('')}
        </ul>
      </div>
    ` : ''}

    <div class="tt-track-grid">
      <div class="tt-track-card">
        <div class="tt-alert-title" style="color:#B23B1F;">⚠️ Struggled with (${stats.struggles.length})</div>
        ${stats.struggles.length === 0 ? '<p class="tt-empty-note">Nothing flagged yet.</p>' : `
          <ul class="tt-plain-list">
            ${stats.struggles.map(item => `<li><p style="margin:0;">${escapeHtml(item.title)}</p>${(progress[item.id] && progress[item.id].notes) ? `<p class="tt-note-text">${escapeHtml(progress[item.id].notes)}</p>` : ''}</li>`).join('')}
          </ul>
        `}
      </div>
      <div class="tt-track-card">
        <div class="tt-alert-title" style="color:#2F7D4F;">✨ Excelled at (${stats.wins.length})</div>
        ${stats.wins.length === 0 ? '<p class="tt-empty-note">Nothing flagged yet.</p>' : `
          <ul class="tt-plain-list">
            ${stats.wins.map(item => `<li><p style="margin:0;">${escapeHtml(item.title)}</p>${(progress[item.id] && progress[item.id].notes) ? `<p class="tt-note-text">${escapeHtml(progress[item.id].notes)}</p>` : ''}</li>`).join('')}
          </ul>
        `}
      </div>
    </div>
  `;
}

function ttRenderCurriculumRow(item, entry){
  const status = (entry && entry.status) || 'not_started';
  const s = TT_STATUS[status];
  const menuOpen = ttOpenMenuId === item.id;
  const notesOpen = ttOpenNotesIds.has(item.id);
  const notes = (entry && entry.notes) || '';
  const track = TT_TRACKS[item.track];
  return `
    <div class="tt-row">
      <div class="tt-row-top">
        <div class="tt-row-main">
          <div class="tt-row-title-line">
            <span class="tt-row-title">${escapeHtml(item.title)}</span>
            <span class="tt-track-badge" style="color:${track.ink};background:${track.bg};">${item.track === 'managerial' ? 'Managerial' : 'Leadership'}</span>
          </div>
          <p class="tt-row-desc">${escapeHtml(item.desc)}</p>
          <p class="tt-row-ref">${escapeHtml(item.ref)}</p>
        </div>
        <div class="tt-status-wrap">
          <button class="tt-status-pill" style="color:${s.ink};background:${s.bg};border-color:${s.ink}55;" data-tt-status-toggle="${item.id}">${s.icon} ${s.label}</button>
          ${menuOpen ? `
            <div class="tt-status-menu">
              ${TT_STATUS_ORDER.map(key => {
                const opt = TT_STATUS[key];
                return `<button class="tt-status-option" style="color:${opt.ink};${status===key?`background:${opt.bg};`:''}" data-tt-status-set="${item.id}" data-status="${key}">${opt.icon} ${opt.label}${status===key?' ✓':''}</button>`;
              }).join('')}
            </div>
          ` : ''}
        </div>
      </div>
      <button class="tt-notes-toggle" data-tt-notes-toggle="${item.id}">${notesOpen ? '▾' : '▸'} ${notes ? 'Coaching note' : 'Add a coaching note'}</button>
      ${notesOpen ? `
        <div class="tt-notes-wrap">
          <textarea class="tt-notes-input" data-tt-notes-input="${item.id}" placeholder="What specifically did they struggle with, or excel at? Keep it behavior-based." rows="2">${escapeHtml(notes)}</textarea>
        </div>
      ` : ''}
    </div>
  `;
}

function renderTrainerTrial(){
  const root = document.getElementById('trainerTrialRoot');
  if(!root) return;

  if(trainerTrainees.length === 0){
    root.innerHTML = `
      <div class="tt-header-row"><h2 class="tt-title">🧭 Trainer Trial Tracker</h2></div>
      <p class="tt-subtitle">30-day path from Certified Team Member to certified Trainer</p>
      <div class="tt-empty-state">
        <p>No trainer trials started yet.</p>
        <button class="btn btn-primary" style="width:auto;padding:10px 20px;" data-tt-open-add-modal>+ Start a Trainer Trial</button>
      </div>
    `;
    return;
  }

  if(!trainerTrainees.some(t => t.id === ttActiveId)) ttActiveId = trainerTrainees[0].id;
  const activeTrainee = trainerTrainees.find(t => t.id === ttActiveId);
  const progress = trainerProgress[ttActiveId] || {};

  let html = `
    <div class="tt-header-row"><h2 class="tt-title">🧭 Trainer Trial Tracker</h2></div>
    <p class="tt-subtitle">30-day path from Certified Team Member to certified Trainer</p>

    <div class="tt-trainee-tabs">
      ${trainerTrainees.map(t => `<button class="tt-trainee-tab ${t.id===ttActiveId?'active':''}" data-tt-select-trainee="${t.id}">👤 ${escapeHtml(t.name)}</button>`).join('')}
      <button class="tt-add-trainee-btn" data-tt-open-add-modal>+ Add trainee</button>
    </div>

    <div class="tt-info-bar">
      <div>
        <p class="tt-info-name">${escapeHtml(activeTrainee.name)}</p>
        <p class="tt-info-meta">${activeTrainee.coach ? `Coached by ${escapeHtml(activeTrainee.coach)} · ` : ''}Started ${escapeHtml(activeTrainee.startDate)}</p>
      </div>
      <div class="tt-info-right">
        <div style="text-align:right;">
          <p class="tt-info-overall-label">Overall</p>
          <p class="tt-info-overall-value">${ttOverallPct(progress)}%</p>
        </div>
        <button class="tt-remove-btn" data-tt-remove-trainee="${activeTrainee.id}" title="Remove trainee">🗑️</button>
      </div>
    </div>

    <div class="tt-view-toggle">
      <button class="tt-view-btn ${ttView==='dashboard'?'active':''}" data-tt-set-view="dashboard">Dashboard</button>
      <button class="tt-view-btn ${ttView==='curriculum'?'active':''}" data-tt-set-view="curriculum">Curriculum & Progress</button>
    </div>
  `;

  if(ttView === 'dashboard'){
    html += ttRenderDashboard(activeTrainee, progress);
  } else {
    html += `
      <div class="tt-filters">
        <select data-tt-week-filter>
          <option value="all" ${ttWeekFilter==='all'?'selected':''}>All weeks</option>
          ${TT_WEEKS.map(w => `<option value="${w.id}" ${ttWeekFilter===w.id?'selected':''}>${w.label} — ${w.theme}</option>`).join('')}
        </select>
        <select data-tt-track-filter>
          <option value="all" ${ttTrackFilter==='all'?'selected':''}>Both tracks</option>
          <option value="managerial" ${ttTrackFilter==='managerial'?'selected':''}>Managerial only</option>
          <option value="leadership" ${ttTrackFilter==='leadership'?'selected':''}>Leadership only</option>
        </select>
      </div>
    `;
    const filtered = TT_CURRICULUM.filter(item =>
      (ttWeekFilter === 'all' || item.week === ttWeekFilter) &&
      (ttTrackFilter === 'all' || item.track === ttTrackFilter)
    );
    TT_WEEKS.filter(w => ttWeekFilter === 'all' || w.id === ttWeekFilter).forEach(week => {
      const items = filtered.filter(i => i.week === week.id);
      if(!items.length) return;
      html += `
        <div class="tt-week-block">
          <div class="tt-week-heading">
            <h3>${week.label}</h3><span class="tt-week-theme">— ${week.theme}</span><span class="tt-week-subtitle">"${week.subtitle}"</span>
          </div>
          <div class="tt-row-list">
            ${items.map(item => ttRenderCurriculumRow(item, progress[item.id])).join('')}
          </div>
        </div>
      `;
    });
  }

  root.innerHTML = html;
}

async function ttSetStatus(itemId, status){
  if(!trainerProgress[ttActiveId]) trainerProgress[ttActiveId] = {};
  const existing = trainerProgress[ttActiveId][itemId] || {};
  trainerProgress[ttActiveId][itemId] = Object.assign({}, existing, {status});
  ttOpenMenuId = null;
  await saveState();
  renderTrainerTrial();
}

async function ttRemoveTrainee(id){
  trainerTrainees = trainerTrainees.filter(t => t.id !== id);
  delete trainerProgress[id];
  if(ttActiveId === id) ttActiveId = trainerTrainees[0] ? trainerTrainees[0].id : null;
  await saveState();
  renderTrainerTrial();
}

document.getElementById('trainerTrialRoot').addEventListener('click', function(e){
  const statusToggle = e.target.closest('[data-tt-status-toggle]');
  if(statusToggle){
    const id = statusToggle.dataset.ttStatusToggle;
    ttOpenMenuId = (ttOpenMenuId === id) ? null : id;
    renderTrainerTrial();
    return;
  }
  const statusSet = e.target.closest('[data-tt-status-set]');
  if(statusSet){
    ttSetStatus(statusSet.dataset.ttStatusSet, statusSet.dataset.status);
    return;
  }
  const notesToggle = e.target.closest('[data-tt-notes-toggle]');
  if(notesToggle){
    const id = notesToggle.dataset.ttNotesToggle;
    if(ttOpenNotesIds.has(id)) ttOpenNotesIds.delete(id); else ttOpenNotesIds.add(id);
    renderTrainerTrial();
    return;
  }
  const openAdd = e.target.closest('[data-tt-open-add-modal]');
  if(openAdd){
    document.getElementById('ttAddName').value = '';
    document.getElementById('ttAddCoach').value = '';
    document.getElementById('ttAddStart').value = today;
    document.getElementById('ttAddModal').classList.add('active');
    return;
  }
  const selectTab = e.target.closest('[data-tt-select-trainee]');
  if(selectTab){
    ttActiveId = selectTab.dataset.ttSelectTrainee;
    renderTrainerTrial();
    return;
  }
  const removeBtn = e.target.closest('[data-tt-remove-trainee]');
  if(removeBtn){
    const id = removeBtn.dataset.ttRemoveTrainee;
    const trainee = trainerTrainees.find(t => t.id === id);
    if(confirm(`Remove ${trainee ? trainee.name : 'this trainee'} from Trainer Trial tracking? This cannot be undone.`)){
      ttRemoveTrainee(id);
    }
    return;
  }
  const viewBtn = e.target.closest('[data-tt-set-view]');
  if(viewBtn){
    ttView = viewBtn.dataset.ttSetView;
    renderTrainerTrial();
    return;
  }
});

document.getElementById('trainerTrialRoot').addEventListener('change', function(e){
  if(e.target.matches('[data-tt-week-filter]')){
    const v = e.target.value;
    ttWeekFilter = v === 'all' ? 'all' : parseInt(v, 10);
    renderTrainerTrial();
  }
  if(e.target.matches('[data-tt-track-filter]')){
    ttTrackFilter = e.target.value;
    renderTrainerTrial();
  }
});

document.getElementById('trainerTrialRoot').addEventListener('focusout', async function(e){
  const ta = e.target.closest('[data-tt-notes-input]');
  if(!ta) return;
  const itemId = ta.dataset.ttNotesInput;
  if(!trainerProgress[ttActiveId]) trainerProgress[ttActiveId] = {};
  const existing = trainerProgress[ttActiveId][itemId] || {};
  trainerProgress[ttActiveId][itemId] = Object.assign({}, existing, {notes: ta.value});
  await saveState();
  renderTrainerTrial();
});

document.getElementById('btnTTCancelAdd').addEventListener('click', ()=>{
  document.getElementById('ttAddModal').classList.remove('active');
});
document.getElementById('ttAddModal').addEventListener('click', (e)=>{
  if(e.target === document.getElementById('ttAddModal')) document.getElementById('ttAddModal').classList.remove('active');
});
document.getElementById('btnTTConfirmAdd').addEventListener('click', async ()=>{
  const name = document.getElementById('ttAddName').value.trim();
  if(!name){ showToast('Enter a trainee name'); return; }
  const coach = document.getElementById('ttAddCoach').value.trim();
  const startDate = document.getElementById('ttAddStart').value || today;
  const trainee = {id: ttUid(), name, coach, startDate};
  trainerTrainees.push(trainee);
  trainerProgress[trainee.id] = {};
  ttActiveId = trainee.id;
  ttView = 'dashboard';
  await saveState();
  document.getElementById('ttAddModal').classList.remove('active');
  renderTrainerTrial();
  showToast('✓ Trainer Trial Started!');
});
