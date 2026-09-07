function renderGXScoreboard(){
  const wigContainer = document.getElementById('gxWigMetrics');
  wigContainer.innerHTML = Object.entries(gxData.wig).map(([key, metric]) => `
    <div class="gx-metric-card">
      <div class="gx-metric-value">${metric.value}</div>
      <div class="gx-metric-label">${metric.label}</div>
    </div>
  `).join('');

  const dtContainer = document.getElementById('gxDtMetrics');
  dtContainer.innerHTML = Object.entries(gxData.dt).map(([key, metric]) => `
    <div class="gx-metric-card">
      <div class="gx-metric-value">${metric.value}</div>
      <div class="gx-metric-label">${metric.label}</div>
    </div>
  `).join('');

  const satisfactionContainer = document.getElementById('gxSatisfactionMetrics');
  const satPct = parseFloat(gxData.satisfaction.highlySatisfied.value) || 0;
  satisfactionContainer.innerHTML = `
    <div style="margin-bottom:8px;">
      <div class="gx-satisfaction-ring" style="background:conic-gradient(#7C4DFF ${satPct}%, #E8E4FF ${satPct}%);">
        <div class="gx-satisfaction-ring-inner">
          <div class="gx-satisfaction-ring-value">${gxData.satisfaction.highlySatisfied.value}</div>
          <div class="gx-satisfaction-ring-label">Highly Satisfied</div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">
        <div class="gx-metric-card">
          <div class="gx-metric-value">${gxData.satisfaction.top5Satisfied.value}</div>
          <div class="gx-metric-label">Top 5%</div>
        </div>
        <div class="gx-metric-card">
          <div class="gx-metric-value">${gxData.satisfaction.notSatisfied.value}</div>
          <div class="gx-metric-label">% Not Satisfied</div>
        </div>
        <div class="gx-metric-card">
          <div class="gx-metric-value">${gxData.satisfaction.foodSafety.value}</div>
          <div class="gx-metric-label">Food Safety</div>
        </div>
      </div>
    </div>
  `;

  const craveableContainer = document.getElementById('gxCraveableMetrics');
  craveableContainer.innerHTML = Object.entries(gxData.craveable).map(([key, metric]) => `
    <div class="gx-comparison-card">
      <div class="gx-comparison-value">
        <div class="gx-comparison-label">${metric.label}</div>
        <div class="gx-comparison-num">${metric.value}</div>
      </div>
      <div class="gx-comparison-value">
        <div class="gx-comparison-label">Top 5%</div>
        <div class="gx-comparison-num">${metric.top5}</div>
      </div>
    </div>
  `).join('');

  const serviceContainer = document.getElementById('gxServiceMetrics');
  serviceContainer.innerHTML = Object.entries(gxData.service).map(([key, metric]) => `
    <div class="gx-comparison-card">
      <div class="gx-comparison-value">
        <div class="gx-comparison-label">${metric.label}</div>
        <div class="gx-comparison-num">${metric.value}</div>
      </div>
      <div class="gx-comparison-value">
        <div class="gx-comparison-label">Top 5%</div>
        <div class="gx-comparison-num">${metric.top5}</div>
      </div>
    </div>
  `).join('');

  const welcomingContainer = document.getElementById('gxWelcomingMetrics');
  welcomingContainer.innerHTML = Object.entries(gxData.welcoming).map(([key, metric]) => `
    <div class="gx-comparison-card">
      <div class="gx-comparison-value">
        <div class="gx-comparison-label">${metric.label}</div>
        <div class="gx-comparison-num">${metric.value}</div>
      </div>
      <div class="gx-comparison-value">
        <div class="gx-comparison-label">Top 5%</div>
        <div class="gx-comparison-num">${metric.top5}</div>
      </div>
    </div>
  `).join('');

  const secondMileOppContainer = document.getElementById('gxSecondMileOpportunities');
  secondMileOppContainer.innerHTML = gxData.secondMile.opportunities.map(opp => `<li>${opp}</li>`).join('');

  const secondMileContainer = document.getElementById('gxSecondMileMetrics');
  secondMileContainer.innerHTML = `
    <div class="gx-metric-card">
      <div class="gx-metric-value">${gxData.secondMile.smartShopScore.value}</div>
      <div class="gx-metric-label">${gxData.secondMile.smartShopScore.label}</div>
    </div>
  `;

  const coachingContainer = document.getElementById('gxTeamCoachingFocus');
  coachingContainer.innerHTML = gxData.teamMembers.coachingFocus.map(focus => `<li>${focus}</li>`).join('');

  const teamContainer = document.getElementById('gxTeamMetrics');
  teamContainer.innerHTML = `
    <div class="gx-metric-card">
      <div class="gx-metric-value">${gxData.teamMembers.attentiveCourteous.value}</div>
      <div class="gx-metric-label">${gxData.teamMembers.attentiveCourteous.label}</div>
    </div>
    <div class="gx-metric-card">
      <div class="gx-metric-value">${gxData.teamMembers.smartShopScore.value}</div>
      <div class="gx-metric-label">${gxData.teamMembers.smartShopScore.label}</div>
    </div>
  `;

  if(gxData.lastUpdated){
    document.getElementById('gxUpdateTime').textContent = new Date(gxData.lastUpdated).toLocaleDateString('en-US', {month:'short', day:'numeric', year:'numeric'});
  }
}

function renderTXScoreboard(){
  renderEOI();
  const eventsContainer = document.getElementById('txEventsContainer');
  if(txData.events.length === 0){
    eventsContainer.innerHTML = '<div style="text-align:center;color:var(--text-secondary);padding:20px;">No upcoming events</div>';
  } else {
    eventsContainer.innerHTML = txData.events.map(evt => {
      const eventDate = new Date(evt.date);
      const dateStr = eventDate.toLocaleDateString('en-US', {month:'short', day:'numeric'});
      return `
        <div class="tx-event-card">
          <div class="tx-event-date">${dateStr}</div>
          <div class="tx-event-name">${evt.name}</div>
        </div>
      `;
    }).join('');
  }

  const trialContainer = document.getElementById('txTrialContainer');
  if(txData.trialTrainers.length === 0){
    trialContainer.innerHTML = '<div style="text-align:center;color:var(--text-secondary);padding:20px;font-size:12px;">No trainers in trial</div>';
  } else {
    trialContainer.innerHTML = txData.trialTrainers.map(trainer => {
      const startDate = new Date(trainer.startDate);
      const dateStr = startDate.toLocaleDateString('en-US', {month:'short', day:'numeric'});
      return `
        <div class="tx-trial-card">
          <div class="tx-trial-name">${trainer.name}</div>
          <div class="tx-trial-date">Started: ${dateStr}</div>
        </div>
      `;
    }).join('');
  }

  const certContainer = document.getElementById('txCertContainer');
  if(txData.certCompetitive.length === 0){
    certContainer.innerHTML = '<div style="text-align:center;color:var(--text-secondary);padding:20px;font-size:12px;">No one in progress</div>';
  } else {
    certContainer.innerHTML = txData.certCompetitive.map(cert => {
      const targetDate = new Date(cert.targetDate);
      const dateStr = targetDate.toLocaleDateString('en-US', {month:'short', day:'numeric'});
      return `
        <div class="tx-cert-card">
          <div class="tx-cert-name">${cert.name}</div>
          <div class="tx-cert-level">${cert.level}</div>
          <div class="tx-cert-target">Target: ${dateStr}</div>
        </div>
      `;
    }).join('');
  }

  const celebContainer = document.getElementById('txCelebrationContainer');
  if(txData.celebrations.length === 0){
    celebContainer.innerHTML = '<div class="celeb-empty">No celebrations this month — check back soon! 🎈</div>';
  } else {
    celebContainer.innerHTML = txData.celebrations.map(celeb => {
      const isBirthday = celeb.type === 'birthday';
      const icon = isBirthday ? '🎂' : '🎊';
      return `
        <div class="celeb-card ${isBirthday ? 'celeb-birthday' : 'celeb-anniversary'}">
          <div class="celeb-icon">${icon}</div>
          <div class="celeb-name">${celeb.name}</div>
          <div class="celeb-date">${celeb.date}</div>
        </div>
      `;
    }).join('');
  }
}

function renderEOI(){
  const track = document.getElementById('growthTrack');
  track.innerHTML = growthTrack.map((g,i)=>{
    const clickable = eoiRoles[g.role] ? `data-role="${g.role}"` : '';
    const active = (g.role === currentEOIRole) ? 'active' : '';
    const cursor = eoiRoles[g.role] ? 'cursor:pointer;' : 'cursor:default;opacity:0.85;';
    return `<div class="growth-pill ${active}" ${clickable} style="background:${g.color};${cursor}">
      <div class="role-name">${g.role}</div>
    </div>`;
  }).join('');

  renderEOIRequirements();
}

function renderEOIRequirements(){
  const roleInfo = eoiRoles[currentEOIRole];
  const reqBox = document.getElementById('eoiRequirements');
  if(!roleInfo){ reqBox.innerHTML = ''; return; }
  reqBox.innerHTML = `
    <div class="eoi-req-card">
      <div class="eoi-req-title">What it takes: ${roleInfo.from} → ${currentEOIRole}</div>
      <ul>${roleInfo.requirements.map(r=>`<li>${r}</li>`).join('')}</ul>
    </div>
  `;
  const checklist = document.getElementById('eoiReqChecklist');
  checklist.innerHTML = roleInfo.requirements.map((r,i)=>`
    <div class="checklist-item" data-reqidx="${i}">
      <input type="checkbox">
      <span>${r}</span>
    </div>
  `).join('');
}

function renderEOISubmissions(){
  const container = document.getElementById('eoiSubmissionsContainer');
  if(!container) return;
  if(eoiSubmissions.length === 0){
    container.innerHTML = '<div style="text-align:center;color:var(--text-secondary);padding:20px;font-size:12px;">No submissions yet</div>';
    return;
  }
  const sorted = [...eoiSubmissions].sort((a,b)=> b.timestamp - a.timestamp);
  container.innerHTML = sorted.map(sub => {
    const date = new Date(sub.timestamp).toLocaleDateString('en-US', {month:'short', day:'numeric', year:'numeric'});
    const metReqsHtml = sub.metRequirements && sub.metRequirements.length
      ? `<div class="eoi-sub-detail"><b>Meets:</b> ${sub.metRequirements.map(escapeHtml).join(', ')}</div>` : '';
    const extras = [
      sub.timeInRole ? `<b>Time in role:</b> ${escapeHtml(sub.timeInRole)}` : '',
      sub.growthArea ? `<b>Growth area:</b> ${escapeHtml(sub.growthArea)}` : '',
      sub.availability ? `<b>Availability:</b> ${escapeHtml(sub.availability)}` : '',
      sub.leader ? `<b>Wants to talk to:</b> ${escapeHtml(sub.leader)}` : '',
      sub.comments ? `<b>Comments:</b> ${escapeHtml(sub.comments)}` : ''
    ].filter(Boolean).map(t=>`<div class="eoi-sub-detail">${t}</div>`).join('');
    return `
      <div class="eoi-submission" data-id="${sub.id}">
        <div class="eoi-sub-top">
          <span class="eoi-sub-name">${escapeHtml(sub.name)} <span style="font-weight:400;color:var(--text-secondary);">(${escapeHtml(sub.section.toUpperCase())})</span></span>
          <span class="eoi-sub-date">${date} <button class="eoi-delete-btn" data-id="${sub.id}" style="background:none;border:none;color:var(--cfa-red);cursor:pointer;font-weight:700;margin-left:8px;">✕</button></span>
        </div>
        <div class="eoi-sub-role">${escapeHtml(sub.currentRole)} → ${escapeHtml(sub.targetRole)}</div>
        <div class="eoi-sub-detail"><b>Why:</b> ${escapeHtml(sub.why)}</div>
        ${metReqsHtml}
        ${extras}
      </div>
    `;
  }).join('');
}

document.getElementById('eoiSubmissionsContainer') && document.getElementById('eoiSubmissionsContainer').addEventListener('click', async (e)=>{
  const btn = e.target.closest('.eoi-delete-btn');
  if(!btn) return;
  eoiSubmissions = eoiSubmissions.filter(s => s.id !== btn.dataset.id);
  await saveState();
  renderEOISubmissions();
});

document.getElementById('growthTrack').addEventListener('click', (e)=>{
  const pill = e.target.closest('.growth-pill');
  if(!pill || !pill.dataset.role) return;
  currentEOIRole = pill.dataset.role;
  renderEOI();
  document.getElementById('eoiPanel').style.display = 'block';
  document.getElementById('eoiPanel').scrollIntoView({behavior:'smooth', block:'nearest'});
});

document.getElementById('btnCloseEOI').addEventListener('click', ()=>{
  document.getElementById('eoiPanel').style.display = 'none';
});

document.getElementById('eoiReqChecklist').addEventListener('click', (e)=>{
  const row = e.target.closest('.checklist-item');
  if(!row) return;
  row.classList.toggle('checked');
  const cb = row.querySelector('input[type="checkbox"]');
  cb.checked = !cb.checked;
});

document.getElementById('eoiForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const section = document.querySelector('input[name="eoiSection"]:checked').value;
  const metReqs = [...document.querySelectorAll('#eoiReqChecklist input:checked')].map(cb=>{
    return cb.closest('.checklist-item').querySelector('span').textContent;
  });
  const submission = {
    id: 'eoi' + Date.now(),
    timestamp: Date.now(),
    name: document.getElementById('eoiName').value,
    section,
    currentRole: document.getElementById('eoiCurrentRole').value,
    targetRole: currentEOIRole,
    timeInRole: document.getElementById('eoiTimeInRole').value,
    metRequirements: metReqs,
    why: document.getElementById('eoiWhy').value,
    growthArea: document.getElementById('eoiGrowthArea').value,
    availability: document.getElementById('eoiAvailability').value,
    leader: document.getElementById('eoiLeader').value,
    comments: document.getElementById('eoiComments').value
  };
  eoiSubmissions.push(submission);
  await saveState();
  document.getElementById('eoiForm').reset();
  renderEOIRequirements();
  document.getElementById('eoiPanel').style.display = 'none';
  showToast('✓ Expression of Interest Submitted!');
});

function renderHomeScoreboard(){
  const hour = new Date().getHours();
  let greeting = '';
  if(hour < 12) greeting = 'Good Morning';
  else if(hour < 17) greeting = 'Good Afternoon';
  else greeting = 'Good Evening';
  
  const allQuotes = [...truettQuotes, ...motivationalMessages];
  const quoteIndex = Math.floor(Math.random() * allQuotes.length);
  const quote = allQuotes[quoteIndex];
  
  document.getElementById('homeGreeting').textContent = greeting;
  document.getElementById('homeQuote').textContent = quote.text;
  document.getElementById('homeQuoteAuthor').textContent = '— ' + quote.author;
  
  const vmvContainer = document.getElementById('homeVMVContainer');
  
  const formatText = (text) => {
    return text
      .replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>')
      .replace(/\n/g, '<br>');
  };
  
  const vmvTitles = ['🎯 Vision', '❤️ Mission', '⭐ Values'];
  const vmvData = [homeData.vision, homeData.mission, homeData.values];
  
  vmvContainer.innerHTML = vmvData.map((content, idx) => `
    <div class="home-vmv-card">
      <div class="home-vmv-title">${vmvTitles[idx]}</div>
      <div class="home-vmv-content" style="white-space: pre-wrap; line-height: 1.8;">${formatText(content)}</div>
    </div>
  `).join('');
  
  const winsContainer = document.getElementById('homeWinsContainer');
  const winIcons = ['🏆', '🚀', '⚡'];
  
  winsContainer.innerHTML = homeData.wins.map((win, idx) => `
    <div class="home-win-card">
      <div style="font-size:24px;margin-bottom:12px;">${winIcons[idx]}</div>
      <div class="home-win-name">${win.name}</div>
      <div class="home-win-role">${win.role}</div>
      <div class="home-win-content">${win.content || '<em style="color:var(--text-secondary);">No update yet this month</em>'}</div>
    </div>
  `).join('');
}

