// ===== EARLY PAINT (Tim, Nov 11 2026) =====
// A first load on a phone took 8 s before Home showed: the page waited for
// every script (the managers' tools included) before it drew anything. Now
// the scripts are deferred and the ones Home and Set Ups need come first (the
// HTML's script list); this file is the last of those. The saved data was
// asked for in the page's first lines (window.stateEarlyLoad), so the moment
// it's here, what Home and Set Ups read is put in place and the page on
// screen is drawn, while the rest of the scripts are still coming down.
//
// It's a look, not a start. Until every script has run and the saved data is
// loaded for real (storage.js loadState, which overwrites all of this),
// nothing but the Home and Set Ups tabs can be tapped (body.hub-warming,
// theme-cfa.css) and nothing is saved (storage.js saveState). If anything
// here goes wrong the page simply starts the way it always did.
(function(){
  const early = window.stateEarlyLoad;
  if(!early || typeof early.then !== 'function') return;
  const obj = v => (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
  early.then(got => {
    // The real load has begun (a slow answer): it draws everything itself.
    if(hubStarted || !got || !got.reply || !got.reply.sections) return;
    const data = {};
    try{
      // Set Ups and the rosters, and from the managers' settings the three
      // things these two pages read: launch mode, the store's events and
      // the positions directors arranged.
      ['setups', 'rosters', 'manager'].forEach(name => { const str = got.reply.sections[name]; if(str) Object.assign(data, JSON.parse(str)); });
    }catch(e){ return; }
    if(!Object.keys(data).length) return;
    hubWarming = true;
    document.body.classList.add('hub-warming');
    try{
      // The same lines as applyStateData (storage.js), for these keys only.
      launchMode = data.launchMode === false ? false : undefined;
      launchApply();
      if(data.fohRoster) Object.assign(fohRoster, data.fohRoster);
      if(data.bohRoster) Object.assign(bohRoster, data.bohRoster);
      rosterPosted = obj(data.rosterPosted);
      truckShifts = obj(data.truckShifts);
      adminShifts = obj(data.adminShifts);
      posAssignments = data.posAssignments || {};
      posVacancyFlags = data.posVacancyFlags || {};
      breakCountdowns = data.breakCountdowns || {};
      completedBreaks = data.completedBreaks || {};
      lastUpdated = data.lastUpdated || {};
      zoneOwners = obj(data.zoneOwners);
      posNotes = obj(data.posNotes);
      callIns = obj(data.callIns);
      setupDayTypes = (data.setupDayTypes && typeof data.setupDayTypes === 'object') ? data.setupDayTypes : {};
      storeEvents = Array.isArray(data.storeEvents) ? data.storeEvents : null;
      positionLists = obj(data.positionLists);
      posApplyLists();
      suMigrateDaypartNames();
      const view = document.querySelector('.view.active');
      const name = view ? view.id.replace(/View$/, '') : '';
      if(name === 'home' || name === 'positions') activateView(name);
    }catch(e){
      console.warn('Early paint skipped:', e);
    }
  }).catch(() => {});
})();
