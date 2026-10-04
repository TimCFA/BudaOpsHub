function renderDayPicker(pickerId, selectId, offsetWeeks, onSelect){
  const days = getWeekDays(offsetWeeks);
  const picker = document.getElementById(pickerId);
  const select = document.getElementById(selectId);
  const previousValue = select.value;
  const stillValid = days.some(d => d.date === previousValue);
  
  let targetValue = stillValid ? previousValue : '';
  if(!targetValue && offsetWeeks === 0 && days.some(d => d.date === today)){
    targetValue = today;
  }
  
  picker.innerHTML = days.map(d=>`<div class="day-pill ${d.date === targetValue ? 'active' : ''}" data-date="${d.date}">${d.label}</div>`).join('');
  select.innerHTML = '<option value="">Choose a day</option>' + days.map(d=>`<option value="${d.date}">${d.weekday}</option>`).join('');
  select.value = targetValue;
  
  picker.querySelectorAll('.day-pill').forEach(pill=>{
    pill.addEventListener('click', ()=>{
      picker.querySelectorAll('.day-pill').forEach(p=>p.classList.remove('active'));
      pill.classList.add('active');
      select.value = pill.dataset.date;
      onSelect();
    });
  });
}

function updateSelectedDayInfo(selectId, infoContainerId, skipDate){
  const dateISO = document.getElementById(selectId).value;
  const el = document.getElementById(infoContainerId);
  if(!dateISO){ el.innerHTML = ''; return; }
  const stamp = lastUpdated[dateISO] ? formatLastUpdated(lastUpdated[dateISO]) : '';
  const dateHtml = skipDate ? '' : `<span class="day-info-date">${formatVerboseDate(dateISO)}</span>`;
  el.innerHTML = `${dateHtml}${stamp ? `<span class="day-info-updated">Updated ${stamp}</span>` : ''}`;
}

function setWeekOffset(offset){
  currentWeekOffset = offset;
  document.querySelectorAll('.week-toggle-btn').forEach(b=>{
    const isActive = parseInt(b.dataset.offset, 10) === offset;
    b.classList.toggle('active', isActive);
    b.setAttribute('aria-pressed', String(isActive));
  });
  renderDayPicker('numbersDayPicker', 'numbersDaySelect', offset, ()=>{ renderNumbersContent(); updateSelectedDayInfo('numbersDaySelect', 'numbersSelectedInfo'); });
  renderNumbersContent();
  updateSelectedDayInfo('numbersDaySelect', 'numbersSelectedInfo');
}

document.querySelectorAll('.week-toggle-btn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    setWeekOffset(parseInt(btn.dataset.offset, 10));
  });
});

// ===== SET UPS WEEK NAVIGATION =====
let setupsWeekOffset = 0;

function getSetupsWeekStartDate(offsetWeeks){
  const now = new Date();
  const dow = now.getDay();
  const diffToMonday = (dow === 0) ? 1 : (1 - dow);
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + diffToMonday + offsetWeeks * 7);
}

function getSetupsWeekDays(offsetWeeks){
  const monday = getSetupsWeekStartDate(offsetWeeks);
  return WEEKDAY_NAMES.map((name, i)=>{
    const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
    const iso = toLocalISODate(d);
    const shortDate = d.toLocaleDateString('en-US', {month: 'numeric', day: 'numeric'});
    return {weekday: name, date: iso, label: name.slice(0, 3) + ' ' + shortDate};
  });
}

function pickDefaultSetupsDay(days, previousValue){
  if(days.some(d => d.date === previousValue)) return previousValue;
  if(setupsWeekOffset !== 0) return days.length ? days[0].date : '';
  if(days.some(d => d.date === today)) return today;
  return days.length ? days[0].date : '';
}

function formatWeekRangeLabel(days){
  const fmt = iso => {
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('en-US', {month: 'numeric', day: 'numeric'});
  };
  return fmt(days[0].date) + '-' + fmt(days[days.length - 1].date);
}

function updateSetupsPrevBtn(days){
  const btn = document.getElementById('setupsPrevWeekBtn');
  if(setupsWeekOffset === 0 || setupsWeekOffset === 1){
    btn.className = 'rolling-arrow';
    btn.textContent = '‹';
    btn.title = 'Previous week';
  } else {
    btn.className = 'rolling-arrow-expanded';
    btn.textContent = '‹ ' + formatWeekRangeLabel(days);
    btn.title = 'Go back another week';
  }
}

function renderSetupsDayPicker(onSelect){
  const days = getSetupsWeekDays(setupsWeekOffset);
  const picker = document.getElementById('dayPicker');
  const select = document.getElementById('daySelect');
  const targetValue = pickDefaultSetupsDay(days, select.value);
  
  updateSetupsPrevBtn(days);
  
  picker.innerHTML = days.map(d=>`<div class="day-pill ${d.date === targetValue ? 'active' : ''}" data-date="${d.date}">${d.label}</div>`).join('');
  select.innerHTML = '<option value="">Choose a day</option>' + days.map(d=>`<option value="${d.date}">${d.weekday}</option>`).join('');
  select.value = targetValue;
  
  picker.querySelectorAll('.day-pill').forEach(pill=>{
    pill.addEventListener('click', ()=>{
      picker.querySelectorAll('.day-pill').forEach(p=>p.classList.remove('active'));
      pill.classList.add('active');
      select.value = pill.dataset.date;
      onSelect();
    });
  });
}

function setSetupsWeekOffset(offset){
  setupsWeekOffset = offset;
  document.querySelectorAll('#setupsWeekToggle .su-week-toggle-btn').forEach(b=>{
    const isActive = parseInt(b.dataset.offset, 10) === offset;
    b.classList.toggle('active', isActive);
    b.setAttribute('aria-pressed', String(isActive));
  });
  renderSetupsDayPicker(()=>{ renderAllDayparts(); updateSelectedDayInfo('daySelect', 'daySelectedInfo'); });
  renderAllDayparts();
  updateSelectedDayInfo('daySelect', 'daySelectedInfo');
}

document.querySelectorAll('#setupsWeekToggle .su-week-toggle-btn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    setSetupsWeekOffset(parseInt(btn.dataset.offset, 10));
  });
});

document.getElementById('setupsPrevWeekBtn').addEventListener('click', ()=>{
  setSetupsWeekOffset(setupsWeekOffset - 1);
});

function parseShiftTimeToMinutes(str){
  if(!str) return null;
  const m = String(str).trim().toLowerCase().match(/^(\d{1,2}):(\d{2})\s*([ap])/);
  if(!m) return null;
  let hour = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if(m[3] === 'a'){
    if(hour === 12) hour = 0;
  } else {
    if(hour !== 12) hour += 12;
  }
  return hour * 60 + min;
}

function parseDaypartTimeToMinutes(str){
  const parts = String(str).split(':').map(Number);
  return parts[0] * 60 + (parts[1] || 0);
}

function daypartTimeWindow(dayparts, index){
  const startMin = parseDaypartTimeToMinutes(dayparts[index].time);
  const endMin = (index + 1 < dayparts.length)
    ? parseDaypartTimeToMinutes(dayparts[index + 1].time)
    : startMin + 120;
  return {startMin, endMin};
}

// "5:30a - 1:30p", or each block of a split shift.
function rosterTimeText(p){
  return (p.blocks && p.blocks.length > 1 ? p.blocks : [p]).map(b => `${b.start} - ${b.end}`).join(', ');
}

// Does this roster entry work any part of [startMin, endMin)? A split shift
// counts only its on-floor blocks.
function rosterOverlaps(p, startMin, endMin){
  return (p.blocks && p.blocks.length ? p.blocks : [p]).some(b=>{
    const s = parseShiftTimeToMinutes(b.start);
    const e = parseShiftTimeToMinutes(b.end);
    if(s === null || e === null) return true;
    return s < endMin && e > startMin;
  });
}

// People on the roster whose shift overlaps this daypart — the people
// available to be assigned a position.
function availableForDaypart(dayName, dpIndex, dayparts){
  const roster = currentPosSection === 'foh' ? fohRoster : bohRoster;
  const dayRoster = roster[dayName] || [];
  const {startMin, endMin} = daypartTimeWindow(dayparts, dpIndex);
  return dayRoster.filter(p => rosterOverlaps(p, startMin, endMin));
}

// Everyone holding a position in this daypart, including both names of a
// split ("John/Bill") handoff, lowercased for matching against the roster.
function assignedNamesForDaypart(dayName, dpName){
  const prefix = currentPosSection + '||' + dayName + '||' + dpName + '||';
  const names = new Set();
  Object.keys(posAssignments).forEach(k=>{
    if(k.startsWith(prefix) && posAssignments[k]){
      posAssignments[k].split('/').map(n => n.trim().toLowerCase()).filter(Boolean).forEach(n => names.add(n));
    }
  });
  return names;
}

function renderPositionsTab(){
  renderSetupsDayPicker(()=>{ renderAllDayparts(); updateSelectedDayInfo('daySelect', 'daySelectedInfo'); });
  renderAllDayparts();
  updateSelectedDayInfo('daySelect', 'daySelectedInfo');
}

function renderAllDayparts(){
  const dayName = document.getElementById('daySelect').value;
  if(!dayName){
    document.getElementById('daypartContainer').style.display = 'none';
    document.getElementById('rosterContainer').style.display = 'none';
    return;
  }
  
  document.getElementById('daypartContainer').style.display = 'block';
  document.getElementById('rosterContainer').style.display = 'block';
  // One daypart at a time: chips, game plan, zones, toolbar (setups-board.js).
  document.getElementById('allDayparts').innerHTML = renderSetupsBoard(dayName);
  renderRoster();
}

let currentPosKey = '';
let currentPosName = '';

// The picker: one bottom sheet for a spot. Names come best fit first for
// the spot's position (PEA tier dot and average beside each), with the
// people still free above anyone already working elsewhere. Picking an
// open spot moves straight on to the next open one, so a daypart fills in
// one pass; "Change person" on a filled spot just picks and closes.
let suPickNext = [];        // open spots after this one, in priority order
let suPickPrev = null;      // the spot before this one in priority order (filled or not), for stepping back
let suPickWasOpen = false;  // the spot was empty when the picker opened
window.openPosModal = function(key, pos, daypart, note){
  currentPosKey = key;
  currentPosName = pos;
  const slotRank = (setupsSlotsFor(daypart).indexOf(pos) + 1) || null;
  document.getElementById('posModalTitle').textContent = `${suShortDaypart(daypart)}${slotRank ? ` · #${slotRank}` : ''}`;
  document.getElementById('posModalPos').textContent = pos;
  const search = document.getElementById('posModalSearch');
  search.value = '';
  const noteEl = document.getElementById('posModalNote');
  noteEl.textContent = note || '';
  noteEl.hidden = !note;
  suPickWasOpen = !posAssignments[key];
  
  const dayName = document.getElementById('daySelect').value;
  const roster = currentPosSection === 'foh' ? fohRoster : bohRoster;
  const dayRoster = roster[dayName] || [];
  
  const dayparts = currentPosSection === 'foh' ? fohDayparts : bohDayparts;
  const dpIndex = dayparts.findIndex(d => d.name === daypart);
  
  let eligible = dayRoster;
  if(dpIndex !== -1){
    const {startMin, endMin} = daypartTimeWindow(dayparts, dpIndex);
    eligible = dayRoster.filter(p => rosterOverlaps(p, startMin, endMin));
  }
  
  // Exclusive assignment: exclude anyone already placed in a DIFFERENT position
  // within this same daypart. (The "Find Coverage" split flow deliberately does
  // NOT apply this filter — see openVacancyModal below.)
  // Only the LAST name in a split assignment counts as "still working" this
  // position — the first name has handed off and becomes eligible for a
  // different position again (e.g. John hands Drinks 1 to Bill at 11:30,
  // John is now free to be assigned to OMD 1).
  const daypartPrefix = currentPosSection + '||' + dayName + '||' + daypart + '||';
  const takenElsewhere = new Set();
  Object.keys(posAssignments).forEach(k=>{
    // The Lead Captain also works a spot, so that key doesn't count.
    if(k !== key && k.startsWith(daypartPrefix) && posAssignments[k] && !k.endsWith('||' + SU_LEAD_CAPTAIN)){
      const names = posAssignments[k].split('/').map(n => n.trim());
      takenElsewhere.add(names[names.length - 1]);
    }
  });
  eligible = eligible.filter(p => !takenElsewhere.has(p.name));
  
  const currentlyAssigned = posAssignments[key];
  if(currentlyAssigned && !eligible.some(p=>p.name === currentlyAssigned)){
    eligible = [{name: currentlyAssigned, offShift: true}, ...eligible];
  }

  // When each person is actually here during this daypart: "arrives at
  // 11:30" for a shift that starts after it does, "leaves at 1:30" for one
  // that ends before it's over.
  const timing = dpIndex !== -1 ? suDaypartTiming(currentPosSection, dayName, dpIndex) : null;
  const whenParts = name => {
    const t = timing ? suTimingFor(timing, name) : null;
    if(!t) return [];
    const parts = [];
    if(t.arrives !== null) parts.push({kind: 'arrives', text: `arrives at ${suClock(t.arrives)}`});
    if(t.leaves !== null) parts.push({kind: 'leaves', text: `leaves at ${suClock(t.leaves)}`});
    return parts;
  };
  // Fit for this spot: the PEA tier on the spot's position(s), best first;
  // unrated after rated; an off-shift current holder stays on top.
  const positions = peaPositionsForSlot(currentPosSection, pos);
  const strength = peaStrengthByPerson();
  const peaNames = Object.keys(strength);
  const order = {crushing: 0, rise: 1, notyet: 2, unrated: 3, na: 4};
  eligible = eligible.map(p => {
    const peaName = peaNames.length ? peaMatchName(p.name, peaNames) : null;
    const person = peaName ? strength[peaName] : null;
    const cell = person ? positions.map(x => person.positions[x]).filter(Boolean).sort((a, b) => b.avg - a.avg)[0] || null : null;
    const tier = !positions.length ? 'na' : cell ? cell.tier.key : 'unrated';
    return {...p, tier, avg: cell ? cell.avg : null, tierLabel: cell ? cell.tier.label : (positions.length ? 'Not rated here' : ''), current: p.name === currentlyAssigned, when: p.offShift ? [] : whenParts(p.name)};
  }).sort((a, b) => (b.offShift ? 1 : 0) - (a.offShift ? 1 : 0) || order[a.tier] - order[b.tier] || (b.avg || 0) - (a.avg || 0) || a.name.localeCompare(b.name));

  // The open spots after this one, for "next".
  const dpIndex2 = dayparts.findIndex(d => d.name === daypart);
  const dpObj = dayparts[dpIndex2];
  let m = null;
  try{ m = dpObj ? suDaypartModel(currentPosSection, dayName, dpObj, dpIndex2) : null; }catch(e){ m = null; }
  const openSlots = m ? m.tiles.filter(t => t.needed && t.slot !== pos).map(t => t.slot) : [];
  const after = openSlots.filter(s => setupsSlotsFor(daypart).indexOf(s) > setupsSlotsFor(daypart).indexOf(pos));
  suPickNext = after.length ? after : openSlots;
  const left = document.getElementById('posModalLeft');
  const nextBtn = document.getElementById('posModalNext');
  const stillOpen = openSlots.length + (suPickWasOpen ? 1 : 0);
  left.textContent = stillOpen ? `${stillOpen} left` : 'All filled';
  left.title = stillOpen ? `${stillOpen} spot${stillOpen === 1 ? '' : 's'} left in ${suShortDaypart(daypart)}` : `Every spot in ${suShortDaypart(daypart)} is filled`;
  nextBtn.hidden = !suPickNext.length;
  nextBtn.dataset.daypart = daypart;
  // Step back to the spot before this one (filled or not), e.g. to split
  // the spot just filled.
  const slots = setupsSlotsFor(daypart);
  const here = slots.indexOf(pos);
  suPickPrev = here > 0 ? slots[here - 1] : null;
  const prevBtn = document.getElementById('posModalPrev');
  prevBtn.hidden = !suPickPrev;
  prevBtn.title = suPickPrev ? `Back to ${suPickPrev}` : '';

  window.currentPosModalEligible = eligible;
  renderPosOptionList(eligible);
  const modal = document.getElementById('posModal');
  modal.classList.add('active');
  modal.querySelector('.pos-option-list').scrollTop = 0;
  if(window.matchMedia && window.matchMedia('(pointer: fine)').matches) search.focus();
};

function renderPosOptionList(eligible, filterText){
  const container = document.getElementById('posModalOptions');
  const q = (filterText || '').trim().toLowerCase();
  const filtered = q ? eligible.filter(p => p.name.toLowerCase().includes(q)) : eligible;
  const hasPea = peaRatings.rows.length > 0;
  let html = '';
  if(!filtered.length){
    html += `<div class="pos-option-empty">${q ? 'No one by that name on this shift' : 'Nobody on the roster is free for this daypart'}</div>`;
  } else {
    html += filtered.map(p => {
      const dot = hasPea && p.tier !== 'na' ? `<span class="su-tier-dot is-${p.tier}" aria-hidden="true"></span>` : '';
      const fit = p.offShift ? 'off shift now' : hasPea && p.tierLabel ? `${p.tierLabel}${p.avg != null ? ` · ${p.avg.toFixed(2)}` : ''}` : '';
      const sub = [fit, p.current ? 'here now' : ''].filter(Boolean).join(' · ');
      const when = (p.when || []).map(w => `<span class="pos-option-when is-${w.kind}">${escapeHtml(w.text)}</span>`).join('');
      return `<button type="button" class="pos-option ${p.current ? 'is-current' : ''} ${when ? 'has-when' : ''}" data-pos-pick="${escapeHtml(p.name)}">
          <span class="pos-option-who">${dot}<span class="pos-option-name">${escapeHtml(p.name)}</span>${when ? `<span class="pos-option-whens">${when}</span>` : ''}</span>
          ${sub ? `<span class="pos-option-tag">${escapeHtml(sub)}</span>` : ''}
        </button>`;
    }).join('');
  }
  if(posAssignments[currentPosKey]){
    html += `<button type="button" class="pos-option split-option" data-pos-split="1">Hand off / split this spot →</button>`;
    html += `<button type="button" class="pos-option unassign-option" data-pos-pick="">Clear this spot</button>`;
  }
  container.innerHTML = html;
}

// One tap = done. No confirm step, no "selected" state to track — picking a
// name (or Unassign) commits immediately and closes the modal. The board
// updates first; the save to the server runs behind it (it takes a second or
// two, and the header's sync status reports how it went).
// The set up fills in priority order: placing someone lower on the list
// while a spot above is open puts them in that open spot instead (FOH and
// BOH lists are in the Google Sheet's priority order).
function suFirstOpenAbove(posKey){
  const [section, date, dpName, slot] = posKey.split('||');
  const slots = ((section === 'foh' ? fohPositions : bohPositions)[dpName]) || [];
  const at = slots.indexOf(slot);
  if(at <= 0) return null;
  return slots.slice(0, at).find(s => !posAssignments[[section, date, dpName, s].join('||')]) || null;
}

window.commitPosAssignment = function(name){
  const above = name && !posAssignments[currentPosKey] ? suFirstOpenAbove(currentPosKey) : null;
  if(above){
    const parts = currentPosKey.split('||');
    if(!confirm(`${above} is still open above ${parts[3]}. Spots fill in priority order, so ${name.split(/\s+/)[0]} goes in ${above}. OK?`)) return;
    parts[3] = above;
    currentPosKey = parts.join('||');
  }
  if(name){
    posAssignments[currentPosKey] = name;
    delete posVacancyFlags[currentPosKey];
  } else {
    delete posAssignments[currentPosKey];
    delete posVacancyFlags[currentPosKey];
  }
  const [, keyDate, keyDp, keySlot] = currentPosKey.split('||');
  touchLastUpdated(keyDate);
  const modal = document.getElementById('posModal');
  const next = name && suPickWasOpen ? suPickNext.find(s => !posAssignments[[currentPosSection, keyDate, keyDp, s].join('||')]) : null;
  if(next){
    // Filling a daypart: straight on to the next open spot.
    openPosModal([currentPosSection, keyDate, keyDp, next].join('||'), next, keyDp, `${name.split(/\s+/)[0]} → ${keySlot}`);
  } else {
    modal.classList.remove('active');
    showToast(name ? `${name.split(/\s+/)[0]} → ${keySlot}` : `${keySlot} cleared`);
  }
  renderAllDayparts();
  updateSelectedDayInfo('daySelect', 'daySelectedInfo');
  saveState();
};

document.getElementById('posModalOptions').addEventListener('click', e => {
  const split = e.target.closest('[data-pos-split]');
  if(split){
    // A filled spot: on to the hand-off / coverage sheet for it.
    const [, , dpName, slot] = currentPosKey.split('||');
    document.getElementById('posModal').classList.remove('active');
    openVacancyModal(currentPosKey, slot, dpName);
    return;
  }
  const opt = e.target.closest('[data-pos-pick]');
  if(opt) commitPosAssignment(opt.dataset.posPick);
});
document.getElementById('posModalPrev').addEventListener('click', () => {
  if(!suPickPrev) return;
  const [section, date, dpName] = currentPosKey.split('||');
  openPosModal([section, date, dpName, suPickPrev].join('||'), suPickPrev, dpName);
});
document.getElementById('posModalNext').addEventListener('click', () => {
  const [section, date, dpName] = currentPosKey.split('||');
  const next = suPickNext.find(s => !posAssignments[[section, date, dpName, s].join('||')]);
  if(next) openPosModal([section, date, dpName, next].join('||'), next, dpName);
  else document.getElementById('posModal').classList.remove('active');
});

document.getElementById('posModalSearch').addEventListener('input', (e)=>{
  renderPosOptionList(window.currentPosModalEligible || [], e.target.value);
});

document.getElementById('posModal').addEventListener('click',(e)=>{
  if(e.target===document.getElementById('posModal')) document.getElementById('posModal').classList.remove('active');
});

document.getElementById('btnCancelPos').addEventListener('click',()=>document.getElementById('posModal').classList.remove('active'));

// ===== FIND COVERAGE (split assignment) =====

// Distinct from the standard assign flow above: this list is NOT restricted to
// people who aren't already assigned elsewhere this daypart — someone covering
// a gap may well already be working another position. Picking a name appends
// it to the current assignment as "ExistingName/NewName" rather than replacing it.
let currentVacancyKey = '';
let currentVacancyPos = '';
let currentVacancyDaypart = '';
let pendingVacancySelection = '';

window.openVacancyModal = function(key, pos, daypart){
  currentVacancyKey = key;
  currentVacancyPos = pos;
  currentVacancyDaypart = daypart;
  pendingVacancySelection = '';

  document.getElementById('vacancyModalTitle').textContent = daypart;
  document.getElementById('vacancyModalPos').textContent = pos;
  document.getElementById('vacancyModalCurrent').textContent = 'Currently assigned: ' + (posAssignments[key] || '—');
  document.getElementById('vacancyModalSearch').value = '';

  const isFlagged = !!posVacancyFlags[key];
  document.getElementById('btnResolveNoSplit').style.display = isFlagged ? 'block' : 'none';
  document.getElementById('btnFlagOnly').textContent = isFlagged ? 'Keep Flagged (Still Looking)' : 'Flag Only — Find Coverage Later';

  const dayName = document.getElementById('daySelect').value;
  const roster = currentPosSection === 'foh' ? fohRoster : bohRoster;
  const dayRoster = roster[dayName] || [];

  const dayparts = currentPosSection === 'foh' ? fohDayparts : bohDayparts;
  const dpIndex = dayparts.findIndex(d => d.name === daypart);

  let eligible = dayRoster;
  if(dpIndex !== -1){
    const {startMin, endMin} = daypartTimeWindow(dayparts, dpIndex);
    eligible = dayRoster.filter(p => rosterOverlaps(p, startMin, endMin));
  }

  // No exclusivity filter here on purpose — someone already working another
  // position is a perfectly valid person to split coverage with.
  const currentNames = (posAssignments[key] || '').split('/').map(n => n.trim().toLowerCase()).filter(Boolean);
  eligible = eligible.filter(p => !currentNames.includes(p.name.toLowerCase()));

  window.currentVacancyEligible = eligible;
  renderVacancyOptionList(eligible);

  document.getElementById('vacancyModal').classList.add('active');
};

function renderVacancyOptionList(eligible, filterText){
  const container = document.getElementById('vacancyModalOptions');
  const filtered = filterText
    ? eligible.filter(p => p.name.toLowerCase().includes(filterText.toLowerCase()))
    : eligible;

  if(filtered.length === 0){
    container.innerHTML = filterText
      ? '<div class="pos-option-empty">No matches</div>'
      : '<div class="pos-option-empty">No one else is on the roster for this daypart</div>';
    return;
  }

  container.innerHTML = filtered.map(p=>{
    const isSelected = pendingVacancySelection === p.name;
    return `
      <div class="pos-option ${isSelected ? 'selected' : ''}" onclick="selectVacancyOption(${jsArg(p.name)})">
        <span>${escapeHtml(p.name)}</span>
        <span class="pos-option-check">✓</span>
      </div>
    `;
  }).join('');
}

window.selectVacancyOption = function(name){
  pendingVacancySelection = name;
  renderVacancyOptionList(window.currentVacancyEligible || [], document.getElementById('vacancyModalSearch').value);
};

document.getElementById('vacancyModalSearch').addEventListener('input', (e)=>{
  renderVacancyOptionList(window.currentVacancyEligible || [], e.target.value);
});

document.getElementById('vacancyModal').addEventListener('click', (e)=>{
  if(e.target === document.getElementById('vacancyModal')) document.getElementById('vacancyModal').classList.remove('active');
});

document.getElementById('btnCancelVacancy').addEventListener('click', ()=>{
  document.getElementById('vacancyModal').classList.remove('active');
});

document.getElementById('btnConfirmVacancy').addEventListener('click', async ()=>{
  if(!pendingVacancySelection){
    showToast('Select a team member first');
    return;
  }
  const current = posAssignments[currentVacancyKey] || '';
  posAssignments[currentVacancyKey] = current ? current + '/' + pendingVacancySelection : pendingVacancySelection;
  delete posVacancyFlags[currentVacancyKey];
  const keyDate = currentVacancyKey.split('||')[1];
  touchLastUpdated(keyDate);
  document.getElementById('vacancyModal').classList.remove('active');
  renderAllDayparts();
  updateSelectedDayInfo('daySelect', 'daySelectedInfo');
  showToast('✓ Coverage Added!');
  saveState();
});

document.getElementById('btnFlagOnly').addEventListener('click', async ()=>{
  const initials = getInitials();
  if(!initials){ showToast('Set your initials first (top right)'); beginEditInitials(); return; }
  posVacancyFlags[currentVacancyKey] = {flaggedBy: initials, flaggedAt: Date.now()};
  document.getElementById('vacancyModal').classList.remove('active');
  renderAllDayparts();
  showToast('🚨 Flagged — needs coverage');
  saveState();
});

document.getElementById('btnResolveNoSplit').addEventListener('click', async ()=>{
  delete posVacancyFlags[currentVacancyKey];
  document.getElementById('vacancyModal').classList.remove('active');
  renderAllDayparts();
  showToast('✓ Marked as resolved');
  saveState();
});

// The roster for the day: who's in, their shift, and each person's break
// timer (Start break → a 30-minute countdown → Break done). The planned
// break time (break-planner.js) shows only on the full site; the simplified
// site gets the timer alone until the plan is ready for the team.
const SU_ICON_CUP = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 8h1a4 4 0 0 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4z"/><path d="M6 2v2M10 2v2M14 2v2"/></svg>';
const SU_ICON_CHECK = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg>';
const SU_ICON_X = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

function breakKeyFor(name){ return name + today; }
function breakClockText(secs){ return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`; }
function breakBackAt(endMs){ return new Date(endMs).toLocaleTimeString('en-US', {hour: 'numeric', minute: '2-digit'}); }

function renderRoster(){
  const dayName = document.getElementById('daySelect').value;
  breakPlanReset();
  const panel = document.getElementById('rosterPanel');
  if(!dayName){
    panel.innerHTML = '<div class="su-roster-empty">Select a day to view roster</div>';
    return;
  }

  const roster = currentPosSection === 'foh' ? (fohRoster[dayName] || []) : (bohRoster[dayName] || []);
  let expiredSomething = false;
  const simplified = typeof launchIsOn === 'function' && launchIsOn();

  const sortedRoster = [...roster].sort((a, b)=>{
    const aStart = parseShiftTimeToMinutes(a.start);
    const bStart = parseShiftTimeToMinutes(b.start);
    if(aStart === null && bStart === null) return 0;
    if(aStart === null) return 1;
    if(bStart === null) return -1;
    return aStart - bStart;
  });

  const html = sortedRoster.map(person=>{
    const key = breakKeyFor(person.name);
    let remaining = 0;
    if(breakCountdowns[key]){
      remaining = Math.round((breakCountdowns[key] - Date.now()) / 1000);
      if(remaining <= 0){
        delete breakCountdowns[key];
        completedBreaks[key] = true;
        expiredSomething = true;
        remaining = 0;
      }
    }
    const onBreak = remaining > 0;
    const isCompleted = !!completedBreaks[key] && !onBreak;
    const name = escapeHtml(person.name);
    const tags = [
      person.leader ? '<span class="roster-leader-badge">Team Leader</span>' : '',
      person.source === 'manual' ? `<span class="su-roster-tag" title="Added by hand">Added${person.addedBy ? ` · ${escapeHtml(person.addedBy)}` : ''}</span>` : ''
    ].join('');
    const plan = !simplified && !isCompleted && !onBreak ? breakFor(currentPosSection, dayName, person.name) : null;
    const planNote = plan && plan.start !== null ? ` <span class="roster-break-plan">· break ${suClock(plan.start)}–${suClock(plan.end)}</span>` : '';
    const control = onBreak ? `
          <div class="su-break-live" role="timer" aria-live="off">
            <span class="su-break-k">On break</span>
            <b class="su-break-clock" data-break-timer="${name}">${breakClockText(remaining)}</b>
            <span class="su-break-back">back at ${escapeHtml(breakBackAt(breakCountdowns[key]))}</span>
            <button type="button" class="su-break-done" data-break-done="${name}">Done</button>
          </div>`
      : isCompleted ? `
          <button type="button" class="su-break-complete" data-break-undo="${name}" title="Tap to undo">${SU_ICON_CHECK}<span>Break done</span><em>undo</em></button>`
      : `
          <button type="button" class="su-break-start" data-break-start="${name}">${SU_ICON_CUP}<span>Start break</span></button>`;
    return `
      <div class="su-roster-row ${onBreak ? 'is-break' : ''} ${isCompleted ? 'is-done' : ''}">
        <div class="su-roster-main">
          <div class="su-roster-name">${name}${tags}</div>
          <div class="su-roster-time">${escapeHtml(rosterTimeText(person))}${planNote}</div>
        </div>
        <button type="button" class="su-roster-remove" data-roster-remove="${name}" aria-label="Remove ${name} from today's roster" title="Remove from today's roster">${SU_ICON_X}</button>
        <div class="su-roster-break">${control}</div>
      </div>`;
  }).join('');

  if(roster.length === 0){
    panel.innerHTML = '<div class="su-roster-empty">No roster for ' + escapeHtml(formatVerboseDate(dayName)) + ' yet. Import the weekly HotSchedules CSV in Manage to populate.</div>';
  } else {
    panel.innerHTML = html;
    breakTickStart();
  }

  if(expiredSomething) saveState();
}

// One tick a second for every running break timer on the page.
let breakTicker = null;
function breakTickStart(){
  if(breakTicker) return;
  breakTicker = setInterval(breakTick, 1000);
}
async function breakTick(){
  const clocks = [...document.querySelectorAll('[data-break-timer]')];
  if(!clocks.length){ clearInterval(breakTicker); breakTicker = null; return; }
  let expired = false;
  clocks.forEach(el=>{
    const key = breakKeyFor(el.dataset.breakTimer);
    if(!breakCountdowns[key]){ expired = true; return; }
    const remaining = Math.round((breakCountdowns[key] - Date.now()) / 1000);
    if(remaining <= 0){
      delete breakCountdowns[key];
      completedBreaks[key] = true;
      expired = true;
      return;
    }
    el.textContent = breakClockText(remaining);
  });
  if(expired){
    await saveState();
    renderRoster();
    showToast('Break time is up');
  }
}

document.getElementById('rosterPanel').addEventListener('click', e=>{
  const start = e.target.closest('[data-break-start]');
  if(start) return toggleBreak(start.dataset.breakStart);
  const done = e.target.closest('[data-break-done]');
  if(done) return completeBreakNow(done.dataset.breakDone);
  const undo = e.target.closest('[data-break-undo]');
  if(undo) return undoBreakComplete(undo.dataset.breakUndo);
  const remove = e.target.closest('[data-roster-remove]');
  if(remove) return removeFromRoster(remove.dataset.rosterRemove);
});

window.removeFromRoster = async function(name){
  const dayName = document.getElementById('daySelect').value;
  if(!dayName) return;
  if(!confirm(`Remove ${name} from ${formatVerboseDate(dayName)}'s roster?`)) return;
  
  const roster = currentPosSection === 'foh' ? fohRoster : bohRoster;
  if(roster[dayName]){
    roster[dayName] = roster[dayName].filter(p => p.name !== name);
  }
  const breakKey = breakKeyFor(name);
  delete breakCountdowns[breakKey];
  delete completedBreaks[breakKey];
  Object.keys(posAssignments).forEach(k=>{
    if(k.startsWith(currentPosSection + '||' + dayName + '||')){
      const names = posAssignments[k].split('/').map(n => n.trim());
      if(names.includes(name)){
        const remaining = names.filter(n => n !== name);
        if(remaining.length > 0){
          posAssignments[k] = remaining.join('/');
        } else {
          delete posAssignments[k];
          delete posVacancyFlags[k];
        }
      }
    }
  });
  touchLastUpdated(dayName);
  
  await saveState();
  renderRoster();
  renderAllDayparts();
  updateSelectedDayInfo('daySelect', 'daySelectedInfo');
  showToast(`${name} removed from roster`);
};

document.getElementById('btnAddTeamMember').addEventListener('click', ()=>{
  const dayName = document.getElementById('daySelect').value;
  if(!dayName){
    showToast('Select a day first');
    return;
  }
  document.getElementById('addTMContext').textContent = `Adding to ${formatVerboseDate(dayName)} • ${currentPosSection === 'foh' ? 'FOH' : 'BOH'}`;
  document.getElementById('addTMName').value = '';
  document.getElementById('addTMStart').value = '';
  document.getElementById('addTMEnd').value = '';
  document.getElementById('addTMModal').classList.add('active');
});

document.getElementById('btnCancelAddTM').addEventListener('click', ()=>{
  document.getElementById('addTMModal').classList.remove('active');
});

document.getElementById('addTMModal').addEventListener('click', (e)=>{
  if(e.target === document.getElementById('addTMModal')) document.getElementById('addTMModal').classList.remove('active');
});

document.getElementById('btnConfirmAddTM').addEventListener('click', async ()=>{
  const dayName = document.getElementById('daySelect').value;
  const name = document.getElementById('addTMName').value.trim();
  const start = document.getElementById('addTMStart').value.trim();
  const end = document.getElementById('addTMEnd').value.trim();
  
  if(!name || !start || !end){
    showToast('Fill in name, start, and end time');
    return;
  }
  if(parseShiftTimeToMinutes(start) === null || parseShiftTimeToMinutes(end) === null){
    showToast('Times should look like 5:30a or 1:30p');
    return;
  }

  const initials = getInitials();
  if(!initials){
    showToast('Set your initials first (top right)');
    beginEditInitials();
    return;
  }
  
  const roster = currentPosSection === 'foh' ? fohRoster : bohRoster;
  if(!roster[dayName]) roster[dayName] = [];
  
  const entry = {name, start, end, source: 'manual', addedBy: initials, addedAt: Date.now()};
  const existingIndex = roster[dayName].findIndex(p => p.name.toLowerCase() === name.toLowerCase());
  if(existingIndex !== -1){
    roster[dayName][existingIndex] = entry;
  } else {
    roster[dayName].push(entry);
  }
  
  touchLastUpdated(dayName);
  await saveState();
  renderRoster();
  renderAllDayparts();
  updateSelectedDayInfo('daySelect', 'daySelectedInfo');
  document.getElementById('addTMModal').classList.remove('active');
  showToast(`✓ ${name} added to ${formatVerboseDate(dayName)}'s roster`);
});

window.toggleBreak = async function(name){
  const key = breakKeyFor(name);
  if(breakCountdowns[key]) delete breakCountdowns[key];
  else breakCountdowns[key] = Date.now() + BREAK_LEN * 60 * 1000;
  await saveState();
  renderRoster();
};

window.completeBreakNow = async function(name){
  const key = breakKeyFor(name);
  delete breakCountdowns[key];
  completedBreaks[key] = true;
  await saveState();
  renderRoster();
  showToast('Break marked done');
};

window.undoBreakComplete = async function(name){
  delete completedBreaks[breakKeyFor(name)];
  await saveState();
  renderRoster();
  showToast('Break status reset');
};

// KNOW THE NUMBERS
function renderNumbersTab(){
  renderDayPicker('numbersDayPicker', 'numbersDaySelect', currentWeekOffset, ()=>{ renderNumbersContent(); updateSelectedDayInfo('numbersDaySelect', 'numbersSelectedInfo'); });
  renderNumbersContent();
  updateSelectedDayInfo('numbersDaySelect', 'numbersSelectedInfo');
}

function renderNumbersContent(){
  const dayName = document.getElementById('numbersDaySelect').value;
  const container = document.getElementById('numbersContent');
  if(!dayName){
    container.innerHTML = '<div style="text-align:center;color:var(--text-secondary);padding:40px 0;">Select a day to view or edit numbers</div>';
    return;
  }
  if(!numbersData[dayName]) numbersData[dayName] = {};
  knNormalizeDay(numbersData[dayName]);

  container.innerHTML = numbersDayparts.map(dp=>{
    const entry = numbersData[dayName][dp.name] || {};
    const dayArg = jsArg(dayName), dpArg = jsArg(dp.name);
    return `
      <div class="standup-card" style="margin-bottom:14px;">
        <h3 style="margin-bottom:12px;">${escapeHtml(dp.name)}</h3>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
          <div class="field">
            <label>Projected Sales</label>
            <input type="text" inputmode="decimal" value="${escapeHtml(entry.projectedSales || '')}" placeholder="$0.00" onchange="formatAndUpdateCurrency(this,${dayArg},${dpArg},'projectedSales')" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:var(--radius);font-family:'Inter';">
          </div>
          <div class="field">
            <label>Productivity Goal</label>
            <input type="text" inputmode="decimal" value="${escapeHtml(entry.productivityGoal || '')}" placeholder="$0.00" onchange="formatAndUpdateCurrency(this,${dayArg},${dpArg},'productivityGoal')" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:var(--radius);font-family:'Inter';">
          </div>
        </div>
        <div class="field">
          <label>Special Events</label>
          <input type="text" value="${escapeHtml(entry.specialEvents || '')}" placeholder="e.g. Football watch party, large catering pickup at 2pm" onchange="updateNumbersField(${dayArg},${dpArg},'specialEvents',this.value)" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:var(--radius);font-family:'Inter';">
        </div>
      </div>
    `;
  }).join('');
}

window.updateNumbersField = async function(dayName, dpName, field, value){
  if(!numbersData[dayName]) numbersData[dayName] = {};
  if(!numbersData[dayName][dpName]) numbersData[dayName][dpName] = {};
  numbersData[dayName][dpName][field] = value.trim();
  touchLastUpdated(dayName);
  await saveState();
  updateSelectedDayInfo('numbersDaySelect', 'numbersSelectedInfo');
};

function formatAsCurrency(raw){
  if(!raw) return '';
  const cleaned = String(raw).replace(/[^0-9.]/g, '');
  if(cleaned === '' || cleaned === '.') return '';
  const num = parseFloat(cleaned);
  if(isNaN(num)) return '';
  return num.toLocaleString('en-US', {style: 'currency', currency: 'USD'});
}

window.formatAndUpdateCurrency = async function(inputEl, dayName, dpName, field){
  const formatted = formatAsCurrency(inputEl.value);
  inputEl.value = formatted;
  await updateNumbersField(dayName, dpName, field, formatted);
};

