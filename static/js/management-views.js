function renderLXScoreboard(){
  const pillarsContainer = document.getElementById('pillarsContainer');
  pillarsContainer.innerHTML = lxPillars.map((pillar, idx) => {
    const style = pillarStyles[pillar.id] || {color: 'var(--cfa-red)', tint: 'var(--cfa-light)', icon: '📌'};
    return `
    <div class="pillar-card" style="--pillar-color:${style.color};--pillar-tint:${style.tint};">
      <div class="pillar-header" onclick="togglePillar(${idx})">
        <div class="pillar-title"><span class="pillar-icon">${style.icon}</span>${pillar.title}</div>
        <div class="pillar-toggle" id="toggle-${idx}">▼</div>
      </div>
      <div class="pillar-content" id="content-${idx}">
        <div class="pillar-section">
          <div class="pillar-label">Focus</div>
          <div class="pillar-text">${pillar.focus}</div>
        </div>
        <div class="pillar-section">
          <div class="pillar-label">Goal</div>
          <div class="pillar-text">${pillar.goal}</div>
        </div>
        ${pillar.initiatives ? `
        <div class="pillar-section">
          <div class="pillar-label">Initiatives</div>
          <div class="pillar-text">${pillar.initiatives}</div>
        </div>
        ` : ''}
      </div>
    </div>
  `;
  }).join('');

  const metricsTable = document.getElementById('metricsTable');
  const headerHtml = `
    <thead>
      <tr>
        <th>Business Metrics</th>
        <th>Standard</th>
        <th>Current Value</th>
        <th>Status</th>
      </tr>
    </thead>
  `;
  const bodyHtml = `
    <tbody>
      ${lxMetrics.map(m => `
        <tr>
          <td class="metric-name">${m.name}</td>
          <td>${m.standard}</td>
          <td><span class="metric-value">${m.value || '—'}</span></td>
          <td><span class="rating-badge rating-${m.rating}">${ratingIcons[m.rating]} ${['Below', 'Meets', 'Exceeding'][m.rating - 1]}</span></td>
        </tr>
      `).join('')}
    </tbody>
  `;
  metricsTable.innerHTML = headerHtml + bodyHtml;

  if(lxLastUpdated){
    document.getElementById('lxUpdateTime').textContent = new Date(lxLastUpdated).toLocaleDateString('en-US', {month:'short', day:'numeric', year:'numeric'});
  }
}

window.togglePillar = function(idx){
  const content = document.getElementById('content-' + idx);
  const toggle = document.getElementById('toggle-' + idx);
  content.classList.toggle('open');
  toggle.classList.toggle('open');
};

function renderLXManage(){
  const pillarsManageList = document.getElementById('pillarsManageList');
  pillarsManageList.innerHTML = `
    <div style="background:var(--cfa-light);border:1px solid var(--border);border-radius:var(--radius);padding:16px;margin-bottom:20px;">
      <h4 style="font-family:'Outfit';font-weight:600;margin:0 0 16px;font-size:13px;color:var(--text-primary);">How We Build Momentum - Edit Pillars</h4>
      ${lxPillars.map((p, idx) => `
        <div style="background:var(--cfa-white);border:1px solid var(--border);border-radius:var(--radius);padding:14px;margin-bottom:12px;">
          <div style="font-weight:600;font-size:12px;color:var(--text-primary);margin-bottom:10px;">Pillar ${idx + 1}: ${p.title}</div>
          
          <div style="margin-bottom:10px;">
            <label style="display:block;font-size:10px;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-secondary);margin-bottom:4px;font-weight:600;">Focus</label>
            <textarea id="pillar-focus-${idx}" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;font-family:'Inter';font-size:12px;resize:vertical;min-height:50px;">${p.focus}</textarea>
          </div>
          
          <div style="margin-bottom:10px;">
            <label style="display:block;font-size:10px;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-secondary);margin-bottom:4px;font-weight:600;">Goal</label>
            <textarea id="pillar-goal-${idx}" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;font-family:'Inter';font-size:12px;resize:vertical;min-height:50px;">${p.goal}</textarea>
          </div>
          
          <div>
            <label style="display:block;font-size:10px;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-secondary);margin-bottom:4px;font-weight:600;">Initiatives</label>
            <textarea id="pillar-initiatives-${idx}" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;font-family:'Inter';font-size:12px;resize:vertical;min-height:50px;">${p.initiatives}</textarea>
          </div>
        </div>
      `).join('')}
      <button id="btnSavePillars" class="btn btn-primary" style="margin-top:12px;">Save Pillars</button>
    </div>
  `;

  const metricsManageList = document.getElementById('metricsManageList');
  metricsManageList.innerHTML = lxMetrics.map((m, idx) => `
    <div style="background:var(--cfa-light);border:1px solid var(--border);border-radius:var(--radius);padding:12px;margin-bottom:8px;">
      <div style="font-weight:600;font-size:12px;color:var(--text-primary);margin-bottom:8px;">${m.name}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
        <input type="text" id="metric-val-${idx}" value="${m.value}" placeholder="Current value" style="flex:1;min-width:100px;padding:8px;border:1px solid var(--border);border-radius:6px;font-family:'Inter';font-size:12px;">
        <select id="metric-rating-${idx}" style="padding:8px;border:1px solid var(--border);border-radius:6px;font-family:'Inter';font-size:12px;">
          <option value="1" ${m.rating === 1 ? 'selected' : ''}>1 - Below Standard</option>
          <option value="2" ${m.rating === 2 ? 'selected' : ''}>2 - Meets Standard</option>
          <option value="3" ${m.rating === 3 ? 'selected' : ''}>3 - Exceeding Standard</option>
        </select>
      </div>
    </div>
  `).join('');
}

function renderGXManage(){
  const gxManageList = document.getElementById('gxManageList');
  gxManageList.innerHTML = `
    <div style="background:var(--cfa-light);border:1px solid var(--border);border-radius:var(--radius);padding:14px;margin-bottom:12px;">
      <div style="font-weight:600;font-size:12px;color:var(--text-primary);margin-bottom:10px;">WIG: $12M Revenue</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;">
        <div>
          <label style="display:block;font-size:9px;text-transform:uppercase;color:var(--text-secondary);margin-bottom:2px;font-weight:600;">MTD Sales $</label>
          <input type="text" id="gx-mtd-sales" value="${gxData.wig.mtdSales.value}" style="width:100%;padding:6px;border:1px solid var(--border);border-radius:6px;font-family:'Inter';font-size:11px;">
        </div>
        <div>
          <label style="display:block;font-size:9px;text-transform:uppercase;color:var(--text-secondary);margin-bottom:2px;font-weight:600;">MTD % Change</label>
          <input type="text" id="gx-mtd-change" value="${gxData.wig.mtdSalesChange.value}" style="width:100%;padding:6px;border:1px solid var(--border);border-radius:6px;font-family:'Inter';font-size:11px;">
        </div>
        <div>
          <label style="display:block;font-size:9px;text-transform:uppercase;color:var(--text-secondary);margin-bottom:2px;font-weight:600;">YTD Sales $</label>
          <input type="text" id="gx-ytd-sales" value="${gxData.wig.ytdSales.value}" style="width:100%;padding:6px;border:1px solid var(--border);border-radius:6px;font-family:'Inter';font-size:11px;">
        </div>
        <div>
          <label style="display:block;font-size:9px;text-transform:uppercase;color:var(--text-secondary);margin-bottom:2px;font-weight:600;">YTD % Change</label>
          <input type="text" id="gx-ytd-change" value="${gxData.wig.ytdSalesChange.value}" style="width:100%;padding:6px;border:1px solid var(--border);border-radius:6px;font-family:'Inter';font-size:11px;">
        </div>
      </div>
    </div>

    <div style="background:var(--cfa-light);border:1px solid var(--border);border-radius:var(--radius);padding:14px;margin-bottom:12px;">
      <div style="font-weight:600;font-size:12px;color:var(--text-primary);margin-bottom:10px;">DT Rankings</div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">
        <div>
          <label style="display:block;font-size:9px;text-transform:uppercase;color:var(--text-secondary);margin-bottom:2px;font-weight:600;">Market</label>
          <input type="text" id="gx-dt-market" value="${gxData.dt.market.value}" style="width:100%;padding:6px;border:1px solid var(--border);border-radius:6px;font-family:'Inter';font-size:11px;">
        </div>
        <div>
          <label style="display:block;font-size:9px;text-transform:uppercase;color:var(--text-secondary);margin-bottom:2px;font-weight:600;">State</label>
          <input type="text" id="gx-dt-state" value="${gxData.dt.state.value}" style="width:100%;padding:6px;border:1px solid var(--border);border-radius:6px;font-family:'Inter';font-size:11px;">
        </div>
        <div>
          <label style="display:block;font-size:9px;text-transform:uppercase;color:var(--text-secondary);margin-bottom:2px;font-weight:600;">Chain</label>
          <input type="text" id="gx-dt-chain" value="${gxData.dt.chain.value}" style="width:100%;padding:6px;border:1px solid var(--border);border-radius:6px;font-family:'Inter';font-size:11px;">
        </div>
      </div>
    </div>

    <div style="background:var(--cfa-light);border:1px solid var(--border);border-radius:var(--radius);padding:14px;margin-bottom:12px;">
      <div style="font-weight:600;font-size:12px;color:var(--text-primary);margin-bottom:10px;">Guest Satisfaction</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
        <div>
          <label style="display:block;font-size:9px;text-transform:uppercase;color:var(--text-secondary);margin-bottom:2px;font-weight:600;">% Highly Satisfied</label>
          <input type="text" id="gx-satisfaction" value="${gxData.satisfaction.highlySatisfied.value}" style="width:100%;padding:6px;border:1px solid var(--border);border-radius:6px;font-family:'Inter';font-size:11px;">
        </div>
        <div>
          <label style="display:block;font-size:9px;text-transform:uppercase;color:var(--text-secondary);margin-bottom:2px;font-weight:600;">Food Safety</label>
          <input type="text" id="gx-food-safety" value="${gxData.satisfaction.foodSafety.value}" style="width:100%;padding:6px;border:1px solid var(--border);border-radius:6px;font-family:'Inter';font-size:11px;">
        </div>
      </div>
    </div>

    <div style="background:var(--cfa-light);border:1px solid var(--border);border-radius:var(--radius);padding:14px;">
      <div style="font-weight:600;font-size:12px;color:var(--text-primary);margin-bottom:10px;">Operational Excellence - Craveable Food</div>
      <div style="display:grid;gap:8px;">
        ${Object.entries(gxData.craveable).map(([key, metric]) => `
          <div style="background:white;padding:8px;border-radius:6px;border:1px solid var(--border);display:flex;gap:8px;align-items:flex-end;">
            <div style="flex:1;">
              <label style="display:block;font-size:8px;text-transform:uppercase;color:var(--text-secondary);margin-bottom:2px;font-weight:600;">${metric.label}</label>
              <input type="text" id="gx-craveable-${key}" value="${metric.value}" style="width:100%;padding:5px;border:1px solid var(--border);border-radius:4px;font-family:'Inter';font-size:11px;">
            </div>
            <div style="flex:1;">
              <label style="display:block;font-size:8px;text-transform:uppercase;color:var(--text-secondary);margin-bottom:2px;font-weight:600;">Top 5%</label>
              <input type="text" id="gx-craveable-${key}-top5" value="${metric.top5}" style="width:100%;padding:5px;border:1px solid var(--border);border-radius:4px;font-family:'Inter';font-size:11px;">
            </div>
          </div>
        `).join('')}
      </div>
      
      <div style="font-weight:600;font-size:12px;color:var(--text-primary);margin:12px 0 10px;">Fast & Accurate Service</div>
      <div style="display:grid;gap:8px;">
        ${Object.entries(gxData.service).map(([key, metric]) => `
          <div style="background:white;padding:8px;border-radius:6px;border:1px solid var(--border);display:flex;gap:8px;align-items:flex-end;">
            <div style="flex:1;">
              <label style="display:block;font-size:8px;text-transform:uppercase;color:var(--text-secondary);margin-bottom:2px;font-weight:600;">${metric.label}</label>
              <input type="text" id="gx-service-${key}" value="${metric.value}" style="width:100%;padding:5px;border:1px solid var(--border);border-radius:4px;font-family:'Inter';font-size:11px;">
            </div>
            <div style="flex:1;">
              <label style="display:block;font-size:8px;text-transform:uppercase;color:var(--text-secondary);margin-bottom:2px;font-weight:600;">Top 5%</label>
              <input type="text" id="gx-service-${key}-top5" value="${metric.top5}" style="width:100%;padding:5px;border:1px solid var(--border);border-radius:4px;font-family:'Inter';font-size:11px;">
            </div>
          </div>
        `).join('')}
      </div>

      <div style="font-weight:600;font-size:12px;color:var(--text-primary);margin:12px 0 10px;">Welcoming Environment</div>
      <div style="display:grid;gap:8px;">
        ${Object.entries(gxData.welcoming).map(([key, metric]) => `
          <div style="background:white;padding:8px;border-radius:6px;border:1px solid var(--border);display:flex;gap:8px;align-items:flex-end;">
            <div style="flex:1;">
              <label style="display:block;font-size:8px;text-transform:uppercase;color:var(--text-secondary);margin-bottom:2px;font-weight:600;">${metric.label}</label>
              <input type="text" id="gx-welcoming-${key}" value="${metric.value}" style="width:100%;padding:5px;border:1px solid var(--border);border-radius:4px;font-family:'Inter';font-size:11px;">
            </div>
            <div style="flex:1;">
              <label style="display:block;font-size:8px;text-transform:uppercase;color:var(--text-secondary);margin-bottom:2px;font-weight:600;">Top 5%</label>
              <input type="text" id="gx-welcoming-${key}-top5" value="${metric.top5}" style="width:100%;padding:5px;border:1px solid var(--border);border-radius:4px;font-family:'Inter';font-size:11px;">
            </div>
          </div>
        `).join('')}
      </div>

      <div style="font-weight:600;font-size:12px;color:var(--text-primary);margin:12px 0 10px;">Team Members</div>
      <div style="background:white;padding:8px;border-radius:6px;border:1px solid var(--border);">
        <label style="display:block;font-size:8px;text-transform:uppercase;color:var(--text-secondary);margin-bottom:2px;font-weight:600;">${gxData.teamMembers.attentiveCourteous.label}</label>
        <input type="text" id="gx-team-attentive" value="${gxData.teamMembers.attentiveCourteous.value}" style="width:100%;padding:5px;border:1px solid var(--border);border-radius:4px;font-family:'Inter';font-size:11px;">
      </div>
    </div>
  `;
}

function renderTXManage(){
  const txManageList = document.getElementById('txManageList');
  txManageList.innerHTML = `
    <div style="background:var(--cfa-light);border:1px solid var(--border);border-radius:var(--radius);padding:14px;margin-bottom:12px;">
      <div style="font-weight:600;font-size:12px;color:var(--text-primary);margin-bottom:10px;">📅 Upcoming Talent Events</div>
      <div id="txEventsManageList" style="display:grid;gap:8px;margin-bottom:12px;"></div>
      <button id="btnAddTXEvent" class="btn btn-secondary" style="width:auto;padding:8px 12px;font-size:11px;">+ Add Event</button>
    </div>

    <div style="background:var(--cfa-light);border:1px solid var(--border);border-radius:var(--radius);padding:14px;margin-bottom:12px;">
      <div style="font-weight:600;font-size:12px;color:var(--text-primary);margin-bottom:10px;">🎓 Trainers in Trial</div>
      <div id="txTrialManageList" style="display:grid;gap:8px;margin-bottom:12px;"></div>
      <button id="btnAddTXTrial" class="btn btn-secondary" style="width:auto;padding:8px 12px;font-size:11px;">+ Add Trainer</button>
    </div>

    <div style="background:var(--cfa-light);border:1px solid var(--border);border-radius:var(--radius);padding:14px;margin-bottom:12px;">
      <div style="font-weight:600;font-size:12px;color:var(--text-primary);margin-bottom:10px;">✨ Competitive for Certification</div>
      <div id="txCertManageList" style="display:grid;gap:8px;margin-bottom:12px;"></div>
      <button id="btnAddTXCert" class="btn btn-secondary" style="width:auto;padding:8px 12px;font-size:11px;">+ Add Person</button>
    </div>

    <div style="background:var(--cfa-light);border:1px solid var(--border);border-radius:var(--radius);padding:14px;">
      <div style="font-weight:600;font-size:12px;color:var(--text-primary);margin-bottom:10px;">🎉 Celebrations This Month</div>
      <div id="txCelebManageList" style="display:grid;gap:8px;margin-bottom:12px;"></div>
      <button id="btnAddTXCeleb" class="btn btn-secondary" style="width:auto;padding:8px 12px;font-size:11px;">+ Add Celebration</button>
    </div>
  `;

  const eventsListEl = document.getElementById('txEventsManageList');
  eventsListEl.innerHTML = txData.events.map((evt, i) => `
    <div style="background:white;padding:8px;border-radius:6px;border:1px solid var(--border);display:flex;gap:8px;align-items:center;">
      <input type="text" value="${evt.name}" placeholder="Event name" style="flex:1;padding:5px;border:1px solid var(--border);border-radius:4px;font-family:'Inter';font-size:11px;" onchange="txData.events[${i}].name=this.value;">
      <input type="date" value="${evt.date}" style="padding:5px;border:1px solid var(--border);border-radius:4px;font-family:'Inter';font-size:11px;" onchange="txData.events[${i}].date=this.value;">
      <button onclick="txData.events.splice(${i},1);renderTXManage();" style="background:none;border:none;color:var(--cfa-red);cursor:pointer;font-weight:bold;">✕</button>
    </div>
  `).join('');

  const trialListEl = document.getElementById('txTrialManageList');
  trialListEl.innerHTML = txData.trialTrainers.map((trainer, i) => `
    <div style="background:white;padding:8px;border-radius:6px;border:1px solid var(--border);display:flex;gap:8px;align-items:center;">
      <input type="text" value="${trainer.name}" placeholder="Trainer name" style="flex:1;padding:5px;border:1px solid var(--border);border-radius:4px;font-family:'Inter';font-size:11px;" onchange="txData.trialTrainers[${i}].name=this.value;">
      <input type="date" value="${trainer.startDate}" style="padding:5px;border:1px solid var(--border);border-radius:4px;font-family:'Inter';font-size:11px;" onchange="txData.trialTrainers[${i}].startDate=this.value;">
      <button onclick="txData.trialTrainers.splice(${i},1);renderTXManage();" style="background:none;border:none;color:var(--cfa-red);cursor:pointer;font-weight:bold;">✕</button>
    </div>
  `).join('');

  const certListEl = document.getElementById('txCertManageList');
  certListEl.innerHTML = txData.certCompetitive.map((cert, i) => `
    <div style="background:white;padding:8px;border-radius:6px;border:1px solid var(--border);display:grid;grid-template-columns:1fr 1fr 1fr 40px;gap:6px;align-items:center;">
      <input type="text" value="${cert.name}" placeholder="Name" style="padding:5px;border:1px solid var(--border);border-radius:4px;font-family:'Inter';font-size:11px;" onchange="txData.certCompetitive[${i}].name=this.value;">
      <select style="padding:5px;border:1px solid var(--border);border-radius:4px;font-family:'Inter';font-size:11px;" onchange="txData.certCompetitive[${i}].level=this.value;">
        <option ${cert.level==='Trainer'?'selected':''}>Trainer</option>
        <option ${cert.level==='Team Leader'?'selected':''}>Team Leader</option>
      </select>
      <input type="date" value="${cert.targetDate}" style="padding:5px;border:1px solid var(--border);border-radius:4px;font-family:'Inter';font-size:11px;" onchange="txData.certCompetitive[${i}].targetDate=this.value;">
      <button onclick="txData.certCompetitive.splice(${i},1);renderTXManage();" style="background:none;border:none;color:var(--cfa-red);cursor:pointer;font-weight:bold;">✕</button>
    </div>
  `).join('');

  const celebListEl = document.getElementById('txCelebManageList');
  celebListEl.innerHTML = txData.celebrations.map((celeb, i) => `
    <div style="background:white;padding:8px;border-radius:6px;border:1px solid var(--border);display:flex;gap:8px;align-items:center;">
      <input type="text" value="${celeb.name}" placeholder="Name" style="flex:1;padding:5px;border:1px solid var(--border);border-radius:4px;font-family:'Inter';font-size:11px;" onchange="txData.celebrations[${i}].name=this.value;">
      <input type="text" value="${celeb.date}" placeholder="MM-DD" style="width:60px;padding:5px;border:1px solid var(--border);border-radius:4px;font-family:'Inter';font-size:11px;" onchange="txData.celebrations[${i}].date=this.value;">
      <select style="padding:5px;border:1px solid var(--border);border-radius:4px;font-family:'Inter';font-size:11px;" onchange="txData.celebrations[${i}].type=this.value;">
        <option ${celeb.type==='birthday'?'selected':''}>Birthday</option>
        <option ${celeb.type==='anniversary'?'selected':''}>Anniversary</option>
      </select>
      <button onclick="txData.celebrations.splice(${i},1);renderTXManage();" style="background:none;border:none;color:var(--cfa-red);cursor:pointer;font-weight:bold;">✕</button>
    </div>
  `).join('');
}

async function saveTXScoreboard(){
  txData.lastUpdated = new Date().toISOString();
  await saveState();
  renderTXScoreboard();
  showToast('✓ TX Scoreboard Updated');
}

function renderHomeManage(){
  const homeManageList = document.getElementById('homeManageList');
  homeManageList.innerHTML = `
    <div style="background:var(--cfa-light);border:1px solid var(--border);border-radius:var(--radius);padding:14px;margin-bottom:12px;">
      <div style="font-weight:600;font-size:12px;color:var(--text-primary);margin-bottom:10px;">Vision</div>
      <textarea id="home-vision" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:6px;font-family:'Inter';font-size:12px;resize:vertical;min-height:80px;">${homeData.vision}</textarea>
    </div>

    <div style="background:var(--cfa-light);border:1px solid var(--border);border-radius:var(--radius);padding:14px;margin-bottom:12px;">
      <div style="font-weight:600;font-size:12px;color:var(--text-primary);margin-bottom:10px;">Mission</div>
      <textarea id="home-mission" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:6px;font-family:'Inter';font-size:12px;resize:vertical;min-height:80px;">${homeData.mission}</textarea>
    </div>

    <div style="background:var(--cfa-light);border:1px solid var(--border);border-radius:var(--radius);padding:14px;margin-bottom:12px;">
      <div style="font-weight:600;font-size:12px;color:var(--text-primary);margin-bottom:10px;">Values</div>
      <textarea id="home-values" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:6px;font-family:'Inter';font-size:12px;resize:vertical;min-height:100px;">${homeData.values}</textarea>
    </div>

    <div style="background:var(--cfa-light);border:1px solid var(--border);border-radius:var(--radius);padding:14px;">
      <div style="font-weight:600;font-size:12px;color:var(--text-primary);margin-bottom:12px;">Monthly Leadership Wins</div>
      ${homeData.wins.map((win, i) => `
        <div style="background:white;padding:10px;border-radius:6px;border:1px solid var(--border);margin-bottom:8px;">
          <div style="font-weight:600;font-size:11px;color:var(--text-secondary);margin-bottom:6px;">${win.name} (${win.role})</div>
          <textarea id="home-win-${i}" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:4px;font-family:'Inter';font-size:11px;resize:vertical;min-height:60px;">${win.content}</textarea>
        </div>
      `).join('')}
    </div>
  `;
}

async function saveHomeScoreboard(){
  homeData.vision = document.getElementById('home-vision').value;
  homeData.mission = document.getElementById('home-mission').value;
  homeData.values = document.getElementById('home-values').value;
  homeData.wins.forEach((win, i) => {
    win.content = document.getElementById('home-win-' + i).value;
  });
  homeData.lastUpdated = new Date().toISOString();
  await saveState();
  renderHomeScoreboard();
  showToast('✓ Home Page Updated');
}

async function saveLXScoreboard(){
  lxMetrics.forEach((m, idx) => {
    m.value = document.getElementById('metric-val-' + idx).value;
    m.rating = parseInt(document.getElementById('metric-rating-' + idx).value);
  });
  lxLastUpdated = new Date().toISOString();
  await saveState();
  renderLXScoreboard();
  showToast('✓ LX Scoreboard Updated');
}

async function saveGXScoreboard(){
  gxData.wig.mtdSales.value = document.getElementById('gx-mtd-sales').value;
  gxData.wig.mtdSalesChange.value = document.getElementById('gx-mtd-change').value;
  gxData.wig.ytdSales.value = document.getElementById('gx-ytd-sales').value;
  gxData.wig.ytdSalesChange.value = document.getElementById('gx-ytd-change').value;
  gxData.dt.market.value = document.getElementById('gx-dt-market').value;
  gxData.dt.state.value = document.getElementById('gx-dt-state').value;
  gxData.dt.chain.value = document.getElementById('gx-dt-chain').value;
  gxData.satisfaction.highlySatisfied.value = document.getElementById('gx-satisfaction').value;
  gxData.satisfaction.foodSafety.value = document.getElementById('gx-food-safety').value;
  
  Object.keys(gxData.craveable).forEach(key => {
    const valEl = document.getElementById('gx-craveable-' + key);
    const top5El = document.getElementById('gx-craveable-' + key + '-top5');
    if(valEl) gxData.craveable[key].value = valEl.value;
    if(top5El) gxData.craveable[key].top5 = top5El.value;
  });
  
  Object.keys(gxData.service).forEach(key => {
    const valEl = document.getElementById('gx-service-' + key);
    const top5El = document.getElementById('gx-service-' + key + '-top5');
    if(valEl) gxData.service[key].value = valEl.value;
    if(top5El) gxData.service[key].top5 = top5El.value;
  });
  
  Object.keys(gxData.welcoming).forEach(key => {
    const valEl = document.getElementById('gx-welcoming-' + key);
    const top5El = document.getElementById('gx-welcoming-' + key + '-top5');
    if(valEl) gxData.welcoming[key].value = valEl.value;
    if(top5El) gxData.welcoming[key].top5 = top5El.value;
  });

  gxData.teamMembers.attentiveCourteous.value = document.getElementById('gx-team-attentive').value;

  gxData.lastUpdated = new Date().toISOString();
  await saveState();
  renderGXScoreboard();
  showToast('✓ Guest Obsession Scoreboard Updated');
}

async function savePillars(){
  lxPillars.forEach((p, idx) => {
    p.focus = document.getElementById('pillar-focus-' + idx).value;
    p.goal = document.getElementById('pillar-goal-' + idx).value;
    p.initiatives = document.getElementById('pillar-initiatives-' + idx).value;
  });
  await saveState();
  renderLXManage();
  renderLXScoreboard();
  showToast('✓ Pillars Updated');
}

// ===== CEM COMPARISON REPORT IMPORT =====
// Parses the CEM "Comparison Report" export (CSV or Excel) and fills in the
// corresponding Guest Obsession Scoreboard input fields with the store's
// score for each measure plus the "Top 5%" benchmark row for it. Deliberately
// does NOT touch gxData directly or save anything — it only populates the
// existing manage-form inputs so the normal review-then-"Save Guest Obsession
// Scoreboard" flow still applies before anything persists.
//
// Per-daypart CEM breakdowns are intentionally out of scope here — deferred to
// the future Operational Intelligence work.

const CEM_FIELD_MAP = [
  {cemName: 'Overall Satisfaction', valueInputId: 'gx-satisfaction', top5InputId: null},
  {cemName: 'Taste of Food', valueInputId: 'gx-craveable-overallTaste', top5InputId: 'gx-craveable-overallTaste-top5'},
  {cemName: 'Fast Service', valueInputId: 'gx-service-fastService', top5InputId: 'gx-service-fastService-top5'},
  {cemName: 'Cleanliness', valueInputId: 'gx-welcoming-cleanliness', top5InputId: 'gx-welcoming-cleanliness-top5'},
  {cemName: 'Order Accuracy Y/N', valueInputId: 'gx-service-orderAccuracy', top5InputId: 'gx-service-orderAccuracy-top5'},
  {cemName: 'Attentive/Friendly', valueInputId: 'gx-team-attentive', top5InputId: null}
];

// Generic CSV tokenizer (handles quoted fields with embedded commas). Reused
// by weekly-roster-import.js too — declared as a plain function so it's safe
// to call regardless of script load order, since by the time either file's
// button handler actually fires, every script has already finished loading.
function parseCsv(text){
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for(let i = 0; i < text.length; i++){
    const c = text[i];
    if(inQuotes){
      if(c === '"'){
        if(text[i+1] === '"'){ field += '"'; i++; }
        else { inQuotes = false; }
      } else {
        field += c;
      }
    } else {
      if(c === '"') inQuotes = true;
      else if(c === ',') { row.push(field); field = ''; }
      else if(c === '\r') { /* skip, handled by \n below */ }
      else if(c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else field += c;
    }
  }
  if(field.length > 0 || row.length > 0){ row.push(field); rows.push(row); }
  return rows.filter(r => r.some(cell => cell.trim() !== ''));
}

function parseCemCsv(text){
  return extractCemMetricsFromRows(parseCsv(text));
}

// Reads the first sheet of an uploaded CEM Comparison Report workbook (.xlsx/.xls)
// into the same row-of-strings shape parseCsv() produces, via SheetJS (loaded in
// the page head), so it can run through the same extraction logic as the CSV path.
function parseCemXlsx(arrayBuffer){
  const workbook = XLSX.read(arrayBuffer, {type: 'array'});
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, {header: 1, raw: false, defval: ''})
    .map(row => row.map(cell => String(cell ?? '')))
    .filter(row => row.some(cell => cell.trim() !== ''));
  return extractCemMetricsFromRows(rows);
}

// A "Current" cell is a percentage — sometimes already rendered as "82%" (an
// Excel cell with a %-format read with raw:false, or a CSV export that bakes
// in the % sign), sometimes a bare fraction like "0.81516" (a raw decimal,
// no formatting applied). Normalize both to a whole-number percent string.
function formatCemScore(raw){
  const s = String(raw ?? '').trim();
  if(s === '' || s.toLowerCase() === 'n/a') return null;
  if(s.endsWith('%')) return s;
  const num = parseFloat(s);
  if(isNaN(num)) return null;
  return Math.round(num * 100) + '%';
}

// The real CEM Comparison Report export is a long/narrow table, not a wide
// one: a header row with "Store" and "Measure" columns (plus two separate
// "Current" columns — the first, right after Measure, is the score; the
// second is just a repeat of the response Count), followed by one row pair
// per metric — a "Top 5%" benchmark row, then a row named for the store
// itself (e.g. "04066 - Buda FSU").
function extractCemMetricsFromRows(rows){
  const metrics = {};

  let headerIdx = -1, storeCol = -1, measureCol = -1, currentCol = -1;
  for(let i = 0; i < rows.length; i++){
    const row = rows[i];
    const sc = row.findIndex(cell => (cell||'').trim() === 'Store');
    const mc = row.findIndex(cell => (cell||'').trim() === 'Measure');
    if(sc !== -1 && mc !== -1){
      headerIdx = i;
      storeCol = sc;
      measureCol = mc;
      currentCol = row.findIndex((cell, idx) => idx > mc && (cell||'').trim() === 'Current');
      break;
    }
  }
  if(headerIdx === -1 || currentCol === -1) return metrics;

  for(let i = headerIdx + 1; i < rows.length; i++){
    const row = rows[i];
    const storeLabel = (row[storeCol]||'').trim();
    const measure = (row[measureCol]||'').trim();
    if(!storeLabel || !measure) continue;
    const score = formatCemScore(row[currentCol]);
    if(score === null) continue;
    if(!metrics[measure]) metrics[measure] = {value: null, top5: null};
    if(storeLabel === 'Top 5%') metrics[measure].top5 = score;
    else metrics[measure].value = score;
  }
  return metrics;
}

document.getElementById('btnImportCem').addEventListener('click', ()=>{
  const file = document.getElementById('cemUpload').files[0];
  const status = document.getElementById('cemImportStatus');
  if(!file){
    status.textContent = '❌ Choose a CSV or Excel file first';
    status.style.color = 'var(--cfa-red)';
    return;
  }
  const isExcel = /\.(xlsx|xls)$/i.test(file.name);
  const applyMetrics = (metrics)=>{
    if(Object.keys(metrics).length === 0){
      throw new Error('No "Store, Time of Day Extended, Count..." block found — is this the CEM Comparison Report export?');
    }
    let applied = 0;
    const skipped = [];
    Object.keys(metrics).forEach(name=>{
      const mapping = CEM_FIELD_MAP.find(m => m.cemName === name);
      if(!mapping){ skipped.push(name); return; }
      const valueEl = document.getElementById(mapping.valueInputId);
      if(valueEl && metrics[name].value){ valueEl.value = metrics[name].value; applied++; }
      if(mapping.top5InputId){
        const top5El = document.getElementById(mapping.top5InputId);
        if(top5El && metrics[name].top5) top5El.value = metrics[name].top5;
      }
    });
    status.textContent = `✓ Imported ${applied} metric(s) into the form below — review, then click Save Guest Obsession Scoreboard.` +
      (skipped.length ? ` (Skipped: ${skipped.join(', ')} — no field yet for this metric)` : '');
    status.style.color = 'var(--success)';
  };
  const reader = new FileReader();
  reader.onload = (e)=>{
    try{
      const metrics = isExcel ? parseCemXlsx(e.target.result) : parseCemCsv(e.target.result);
      applyMetrics(metrics);
    }catch(err){
      status.textContent = '❌ ' + err.message;
      status.style.color = 'var(--cfa-red)';
      console.error(err);
    }
  };
  if(isExcel) reader.readAsArrayBuffer(file);
  else reader.readAsText(file);
});
