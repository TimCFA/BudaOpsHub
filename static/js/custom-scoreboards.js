// ===== CUSTOM SCOREBOARDS (admin-configurable trackers) =====
// Generic dashboard builder: each item is a title + optional notes + a flexible
// list of label/value metric pairs, all admin-entered from Manage. Not tied to
// waste, safe counts, or any other hardcoded feature — for one-off trackers
// that don't (yet) warrant dedicated code. Reuses existing .gx-metric-card
// styling so no new CSS is needed.
let scoreboardItems = []; // persisted: [{icon, title, notes, metrics: [{label, value}]}]

function renderCustomScoreboards(){
  const container = document.getElementById('customScoreboardContainer');
  if(!container) return;
  if(scoreboardItems.length === 0){
    container.innerHTML = '<div style="text-align:center;color:var(--text-secondary);padding:16px;font-size:12px;">No custom scoreboards yet — add one from Manage.</div>';
    return;
  }
  container.innerHTML = scoreboardItems.map(item => `
    <div class="standup-card">
      <h3>${escapeHtml(item.icon || '📊')} ${escapeHtml(item.title || 'Untitled')}</h3>
      ${(item.metrics && item.metrics.length) ? `
        <div class="gx-metrics-grid">
          ${item.metrics.map(m => `
            <div class="gx-metric-card">
              <div class="gx-metric-value">${escapeHtml(m.value || '—')}</div>
              <div class="gx-metric-label">${escapeHtml(m.label || '')}</div>
            </div>
          `).join('')}
        </div>
      ` : ''}
      ${item.notes ? `<p style="font-size:13px;color:var(--text-primary);line-height:1.6;white-space:pre-wrap;margin:${(item.metrics && item.metrics.length) ? '14px' : '0'} 0 0;">${escapeHtml(item.notes)}</p>` : ''}
    </div>
  `).join('');
}

function renderScoreboardManage(){
  const list = document.getElementById('scoreboardManageList');
  if(!list) return;
  if(scoreboardItems.length === 0){
    list.innerHTML = '<div style="text-align:center;color:var(--text-secondary);padding:16px;font-size:12px;">No scoreboards yet — add one below</div>';
    return;
  }
  list.innerHTML = scoreboardItems.map((item, i) => `
    <div style="background:var(--cfa-light);border:1px solid var(--border);border-radius:var(--radius);padding:14px;margin-bottom:12px;">
      <div style="display:flex;gap:8px;margin-bottom:8px;">
        <input type="text" value="${escapeHtml(item.icon || '')}" placeholder="🔤" style="width:50px;padding:8px;border:1px solid var(--border);border-radius:6px;text-align:center;font-family:'Inter';" data-sb-field="icon" data-idx="${i}">
        <input type="text" value="${escapeHtml(item.title || '')}" placeholder="Title" style="flex:1;padding:8px;border:1px solid var(--border);border-radius:6px;font-family:'Inter';font-size:12px;" data-sb-field="title" data-idx="${i}">
        <button data-sb-delete-item="${i}" style="background:none;border:none;color:var(--cfa-red);cursor:pointer;font-weight:bold;">✕</button>
      </div>
      <textarea placeholder="Notes / description (optional)" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;font-family:'Inter';font-size:12px;resize:vertical;min-height:50px;margin-bottom:10px;" data-sb-field="notes" data-idx="${i}">${escapeHtml(item.notes || '')}</textarea>
      <div style="font-size:10px;text-transform:uppercase;color:var(--text-secondary);font-weight:600;margin-bottom:6px;letter-spacing:0.04em;">Metrics</div>
      <div>
        ${(item.metrics || []).map((m, mi) => `
          <div style="display:flex;gap:6px;margin-bottom:6px;">
            <input type="text" value="${escapeHtml(m.label || '')}" placeholder="Label" style="flex:1;padding:6px;border:1px solid var(--border);border-radius:4px;font-family:'Inter';font-size:11px;" data-sb-metric-field="label" data-idx="${i}" data-midx="${mi}">
            <input type="text" value="${escapeHtml(m.value || '')}" placeholder="Value" style="flex:1;padding:6px;border:1px solid var(--border);border-radius:4px;font-family:'Inter';font-size:11px;" data-sb-metric-field="value" data-idx="${i}" data-midx="${mi}">
            <button data-sb-delete-metric="${i}" data-midx="${mi}" style="background:none;border:none;color:var(--cfa-red);cursor:pointer;font-weight:bold;">✕</button>
          </div>
        `).join('')}
      </div>
      <button data-sb-add-metric="${i}" class="btn btn-secondary" style="width:auto;padding:6px 10px;font-size:10px;margin-top:4px;">+ Add Metric</button>
    </div>
  `).join('');
}

// Typing into a field just mutates the array in place — no re-render on every
// keystroke, so focus never gets lost mid-edit (unlike a full re-render pattern).
document.getElementById('scoreboardManageList').addEventListener('input', (e)=>{
  const idx = e.target.dataset.idx;
  if(e.target.matches('[data-sb-field]')){
    scoreboardItems[idx][e.target.dataset.sbField] = e.target.value;
  }
  if(e.target.matches('[data-sb-metric-field]')){
    const midx = e.target.dataset.midx;
    scoreboardItems[idx].metrics[midx][e.target.dataset.sbMetricField] = e.target.value;
  }
});

document.getElementById('scoreboardManageList').addEventListener('click', (e)=>{
  const delItem = e.target.closest('[data-sb-delete-item]');
  if(delItem){
    scoreboardItems.splice(delItem.dataset.sbDeleteItem, 1);
    renderScoreboardManage();
    return;
  }
  const delMetric = e.target.closest('[data-sb-delete-metric]');
  if(delMetric){
    const idx = delMetric.dataset.sbDeleteMetric;
    const midx = delMetric.dataset.midx;
    scoreboardItems[idx].metrics.splice(midx, 1);
    renderScoreboardManage();
    return;
  }
  const addMetric = e.target.closest('[data-sb-add-metric]');
  if(addMetric){
    const idx = addMetric.dataset.sbAddMetric;
    if(!scoreboardItems[idx].metrics) scoreboardItems[idx].metrics = [];
    scoreboardItems[idx].metrics.push({label: '', value: ''});
    renderScoreboardManage();
    return;
  }
});

document.getElementById('btnAddScoreboardItem').addEventListener('click', ()=>{
  scoreboardItems.push({icon: '📊', title: 'New Scoreboard', notes: '', metrics: []});
  renderScoreboardManage();
});

document.getElementById('btnSaveScoreboard').addEventListener('click', async ()=>{
  await saveState();
  renderCustomScoreboards();
  showToast('✓ Scoreboard Updated');
});
