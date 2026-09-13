function activateView(view){
  document.querySelectorAll('.view').forEach(x=>x.classList.remove('active'));
  document.getElementById(view+'View').classList.add('active');
  if(view === 'positions') renderPositionsTab();
  if(view === 'wastelog'){ renderGrid(); renderTape(); }
  if(view === 'zonereset') renderZoneResetView();
  if(view === 'walkthroughs') renderWalkthroughsPage();
  if(view === 'safecount') renderSafeCount();
  if(view === 'scoreboard'){ renderScoreboardView(); renderCustomScoreboards(); }
  if(view === 'lx') renderLXScoreboard();
  if(view === 'gx') renderGXScoreboard();
  if(view === 'tx'){ renderTXScoreboard(); renderTrainerTrial(); }
  if(view === 'home') renderHomeScoreboard();
}

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

document.querySelectorAll('#logToggle .toggle-btn, #posToggle .toggle-btn').forEach(()=>{}); // reserved — Log Waste toggle wired separately below

document.querySelectorAll('#logToggle .toggle-btn').forEach(t=>{
  t.addEventListener('click',()=>{
    document.querySelectorAll('#logToggle .toggle-btn').forEach(x=>{x.classList.remove('active'); x.setAttribute('aria-pressed', 'false');});
    t.classList.add('active');
    t.setAttribute('aria-pressed', 'true');
    currentSection = t.dataset.section;
    renderGrid();
    renderTape();
    renderScoreboardView();
  });
});
