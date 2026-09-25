function activateView(view){
  document.querySelectorAll('.view').forEach(x=>x.classList.remove('active'));
  document.getElementById(view+'View').classList.add('active');
  if(view === 'positions') renderPositionsTab();
  if(view === 'wastelog'){ renderGrid(); renderTape(); }
  if(view === 'zonereset'){ renderZoneResetView(); renderWalkthroughsPage(); }
  if(view === 'safecount') renderSafeCount();
  if(view === 'foodsafety') renderFoodSafety();
  if(view === 'prepboard') renderPrepBoard();
  if(view === 'scoreboard'){
    renderScoreboardView(); renderOperationalIntelligence(); renderCustomScoreboards();
    renderGXScoreboard(); renderCemTrends(); renderTXScoreboard(); renderTrainerTrial(); renderTeamLeadTrial(); renderLXScoreboard();
  }
  if(view === 'tx') renderTXScoreboard();
  if(view === 'lx') renderLXScoreboard();
  if(view === 'home') renderHomeScoreboard();
}

document.querySelector('.sb-subtabs').addEventListener('click', function(e){
  const btn = e.target.closest('[data-sb-subtab]');
  if(!btn) return;
  const key = btn.dataset.sbSubtab;
  document.querySelectorAll('.sb-subtab-btn').forEach(b => b.classList.toggle('active', b === btn));
  document.querySelectorAll('.sb-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('sbPanel' + key.charAt(0).toUpperCase() + key.slice(1)).classList.add('active');
});

function clearActiveTabs(){
  document.querySelectorAll('.tab, .tab-group').forEach(x=>x.classList.remove('active'));
  document.querySelectorAll('.tab[role="tab"]').forEach(x=>x.setAttribute('aria-selected', 'false'));
}

function closeAllTabDropdowns(){
  document.querySelectorAll('.tab-group').forEach(g=>{
    g.classList.remove('open');
    const label = g.querySelector('.tab-group-label');
    if(label) label.setAttribute('aria-expanded', 'false');
  });
}

document.querySelector('.tabs').addEventListener('click', (e)=>{
  const dropdownItem = e.target.closest('.tab-dropdown-item');
  if(dropdownItem){
    closeAllTabDropdowns();
    clearActiveTabs();
    dropdownItem.closest('.tab-group').classList.add('active');
    activateView(dropdownItem.dataset.view);
    return;
  }

  const groupLabel = e.target.closest('.tab-group-label');
  if(groupLabel){
    const group = groupLabel.closest('.tab-group');
    const wasOpen = group.classList.contains('open');
    closeAllTabDropdowns();
    if(!wasOpen){
      const rect = groupLabel.getBoundingClientRect();
      const menu = group.querySelector('.tab-dropdown');
      menu.style.top = (rect.bottom + 4) + 'px';
      menu.style.left = rect.left + 'px';
      group.classList.add('open');
      groupLabel.setAttribute('aria-expanded', 'true');
    }
    return;
  }

  const plainTab = e.target.closest('.tab');
  if(plainTab){
    closeAllTabDropdowns();
    clearActiveTabs();
    plainTab.classList.add('active');
    plainTab.setAttribute('aria-selected', 'true');
    activateView(plainTab.dataset.view);
  }
});

document.addEventListener('click', (e)=>{
  if(!e.target.closest('.tab-group')) closeAllTabDropdowns();
});

window.addEventListener('scroll', closeAllTabDropdowns, true);

document.querySelectorAll('.toggle-btn').forEach(t=>{
  t.addEventListener('click',()=>{
    document.querySelectorAll('.toggle-btn').forEach(x=>{x.classList.remove('active'); x.setAttribute('aria-pressed', 'false');});
    t.classList.add('active');
    t.setAttribute('aria-pressed', 'true');
    currentSection = t.dataset.section;
    renderGrid();
    renderTape();
    renderScoreboardView();
  });
});
