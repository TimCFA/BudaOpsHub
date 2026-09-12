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

let expandedDayparts = new Set();

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

function countEligibleForDaypart(dayName, dpIndex, dayparts){
  const roster = currentPosSection === 'foh' ? fohRoster : bohRoster;
  const dayRoster = roster[dayName] || [];
  const {startMin, endMin} = daypartTimeWindow(dayparts, dpIndex);
  return dayRoster.filter(p=>{
    const s = parseShiftTimeToMinutes(p.start);
    const e = parseShiftTimeToMinutes(p.end);
    if(s === null || e === null) return true;
    return s < endMin && e > startMin;
  }).length;
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
  
  const dayparts = currentPosSection === 'foh' ? fohDayparts : bohDayparts;
  const posMap = currentPosSection === 'foh' ? fohPositions : bohPositions;
  
  let html = '';
  dayparts.forEach((dp, dpIndex)=>{
    const positions = posMap[dp.name] || [];
    const isExpanded = expandedDayparts.has(dp.name);
    const filledCount = positions.filter(pos=>{
      const key = currentPosSection + '||' + dayName + '||' + dp.name + '||' + pos;
      return !!posAssignments[key];
    }).length;
    const eligibleCount = countEligibleForDaypart(dayName, dpIndex, dayparts);
    
    html += `
      <div class="daypart-card ${isExpanded ? 'expanded' : ''}">
        <div class="daypart-header" onclick="toggleDaypart('${dp.name.replace(/'/g, "\\'")}')">
          <div class="daypart-title">
            <span class="daypart-name">${dp.name}</span>
            <span class="daypart-fill ${filledCount === positions.length ? 'full' : ''}">${filledCount}/${positions.length} filled</span>
            <span class="daypart-eligible">${eligibleCount} eligible</span>
          </div>
          <span class="chevron">▾</span>
        </div>
        <div class="daypart-body">
          ${(()=>{
            const nums = getNumbersForDaypart(dayName, dp);
            if(!nums || (!nums.projectedSales && !nums.productivityGoal && !nums.specialEvents)) return '';
            return `
              <div class="daypart-numbers">
                ${nums.projectedSales ? `<div class="num-chip"><span class="num-label">Projected Sales</span><span class="num-value">${nums.projectedSales}</span></div>` : ''}
                ${nums.productivityGoal ? `<div class="num-chip"><span class="num-label">Productivity Goal</span><span class="num-value">${nums.productivityGoal}</span></div>` : ''}
                ${nums.specialEvents ? `<div class="num-chip num-event"><span class="num-label">📅 Event</span><span class="num-value">${nums.specialEvents}</span></div>` : ''}
              </div>
            `;
          })()}
          <div class="pos-grid">
            ${positions.map(pos=>{
              const key = currentPosSection + '||' + dayName + '||' + dp.name + '||' + pos;
              const assigned = posAssignments[key] || '';
              const flag = posVacancyFlags[key];
              const escapedKey = key.replace(/'/g, "\\'");
              const escapedPos = pos.replace(/'/g, "\\'");
              const escapedDp = dp.name.replace(/'/g, "\\'");
              return `
                <div class="pos-tile ${assigned ? 'assigned' : ''} ${flag ? 'vacancy-flagged' : ''}" onclick="openPosModal('${key}', '${escapedPos}', '${escapedDp}')">
                  ${assigned ? `<button class="pos-flag-btn ${flag ? 'flagged' : ''}" onclick="event.stopPropagation(); openVacancyModal('${escapedKey}', '${escapedPos}', '${escapedDp}')" title="${flag ? 'Needs coverage — tap to resolve' : 'Flag: find coverage'}">${flag ? '⚠️' : '🚩'}</button>` : ''}
                  <div>
                    <div class="pos-name">${pos}</div>
                    ${assigned ? `<div class="pos-assigned-name">${assigned}</div>` : '<div class="pos-empty">Tap to assign</div>'}
                    ${flag ? `<div class="pos-vacancy-badge">🚨 Needs Coverage</div>` : ''}
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </div>
    `;
  });
  
  document.getElementById('allDayparts').innerHTML = html;
  renderRoster();
}

window.toggleDaypart = function(dpName){
  if(expandedDayparts.has(dpName)) expandedDayparts.delete(dpName);
  else expandedDayparts.add(dpName);
  renderAllDayparts();
};

let currentPosKey = '';
let currentPosName = '';

let pendingPosSelection = '';

window.openPosModal = function(key, pos, daypart){
  currentPosKey = key;
  currentPosName = pos;
  document.getElementById('posModalTitle').textContent = daypart;
  document.getElementById('posModalPos').textContent = pos;
  document.getElementById('posModalSearch').value = '';
  
  const dayName = document.getElementById('daySelect').value;
  const roster = currentPosSection === 'foh' ? fohRoster : bohRoster;
  const dayRoster = roster[dayName] || [];
  
  const dayparts = currentPosSection === 'foh' ? fohDayparts : bohDayparts;
  const dpIndex = dayparts.findIndex(d => d.name === daypart);
  
  let eligible = dayRoster;
  if(dpIndex !== -1){
    const {startMin, endMin} = daypartTimeWindow(dayparts, dpIndex);
    eligible = dayRoster.filter(p=>{
      const s = parseShiftTimeToMinutes(p.start);
      const e = parseShiftTimeToMinutes(p.end);
      if(s === null || e === null) return true;
      return s < endMin && e > startMin;
    });
  }
  
  // Exclusive assignment: exclude anyone already placed in a DIFFERENT position
  // within this same daypart. (The "Find Coverage" split flow deliberately does
  // NOT apply this filter — see openVacancyModal below.)
  const daypartPrefix = currentPosSection + '||' + dayName + '||' + daypart + '||';
  const takenElsewhere = new Set();
  Object.keys(posAssignments).forEach(k=>{
    if(k !== key && k.startsWith(daypartPrefix) && posAssignments[k]){
      posAssignments[k].split('/').forEach(n => takenElsewhere.add(n.trim()));
    }
  });
  eligible = eligible.filter(p => !takenElsewhere.has(p.name));
  
  const currentlyAssigned = posAssignments[key];
  if(currentlyAssigned && !eligible.some(p=>p.name === currentlyAssigned)){
    eligible = [{name: currentlyAssigned, offShift: true}, ...eligible];
  }
  
  pendingPosSelection = currentlyAssigned || '';
  window.currentPosModalEligible = eligible;
  renderPosOptionList(eligible);
  
  document.getElementById('posModal').classList.add('active');
};

function renderPosOptionList(eligible, filterText){
  const container = document.getElementById('posModalOptions');
  const filtered = filterText
    ? eligible.filter(p => p.name.toLowerCase().includes(filterText.toLowerCase()))
    : eligible;
  
  let html = `
    <div class="pos-option unassign-option ${pendingPosSelection === '' ? 'selected' : ''}" onclick="selectPosOption('')">
      <span>Unassign</span><span class="pos-option-check">✓</span>
    </div>
  `;
  
  if(filtered.length === 0 && filterText){
    html += '<div class="pos-option-empty">No matches</div>';
  } else {
    html += filtered.map(p=>{
      const escapedName = p.name.replace(/'/g, "\\'");
      const isSelected = pendingPosSelection === p.name;
      return `
        <div class="pos-option ${isSelected ? 'selected' : ''}" onclick="selectPosOption('${escapedName}')">
          <span>${p.name}</span>
          <span style="display:flex;align-items:center;gap:8px;">
            ${p.offShift ? '<span class="pos-option-tag">off shift</span>' : ''}
            <span class="pos-option-check">✓</span>
          </span>
        </div>
      `;
    }).join('');
  }
  
  container.innerHTML = html;
}

window.selectPosOption = function(name){
  pendingPosSelection = name;
  renderPosOptionList(window.currentPosModalEligible || [], document.getElementById('posModalSearch').value);
};

document.getElementById('posModalSearch').addEventListener('input', (e)=>{
  renderPosOptionList(window.currentPosModalEligible || [], e.target.value);
});

document.getElementById('posModal').addEventListener('click',(e)=>{
  if(e.target===document.getElementById('posModal')) document.getElementById('posModal').classList.remove('active');
});

document.getElementById('btnCancelPos').addEventListener('click',()=>document.getElementById('posModal').classList.remove('active'));

document.getElementById('btnAssignPos').addEventListener('click', async ()=>{
  const selected = pendingPosSelection;
  if(selected){
    posAssignments[currentPosKey] = selected;
    delete posVacancyFlags[currentPosKey];
  } else {
    delete posAssignments[currentPosKey];
    delete posVacancyFlags[currentPosKey];
  }
  const keyDate = currentPosKey.split('||')[1];
  touchLastUpdated(keyDate);
  await saveState();
  renderAllDayparts();
  updateSelectedDayInfo('daySelect', 'daySelectedInfo');
  document.getElementById('posModal').classList.remove('active');
  showToast('✓ Assignment Saved!');
});

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
    eligible = dayRoster.filter(p=>{
      const s = parseShiftTimeToMinutes(p.start);
      const e = parseShiftTimeToMinutes(p.end);
      if(s === null || e === null) return true;
      return s < endMin && e > startMin;
    });
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
    const escapedName = p.name.replace(/'/g, "\\'");
    const isSelected = pendingVacancySelection === p.name;
    return `
      <div class="pos-option ${isSelected ? 'selected' : ''}" onclick="selectVacancyOption('${escapedName}')">
        <span>${p.name}</span>
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
  await saveState();
  renderAllDayparts();
  updateSelectedDayInfo('daySelect', 'daySelectedInfo');
  document.getElementById('vacancyModal').classList.remove('active');
  showToast('✓ Coverage Added!');
});

document.getElementById('btnFlagOnly').addEventListener('click', async ()=>{
  const initials = getInitials();
  if(!initials){ showToast('Set your initials first (top right)'); beginEditInitials(); return; }
  posVacancyFlags[currentVacancyKey] = {flaggedBy: initials, flaggedAt: Date.now()};
  await saveState();
  renderAllDayparts();
  document.getElementById('vacancyModal').classList.remove('active');
  showToast('🚨 Flagged — needs coverage');
});

document.getElementById('btnResolveNoSplit').addEventListener('click', async ()=>{
  delete posVacancyFlags[currentVacancyKey];
  await saveState();
  renderAllDayparts();
  document.getElementById('vacancyModal').classList.remove('active');
  showToast('✓ Marked as resolved');
});

function renderRoster(){
  const dayName = document.getElementById('daySelect').value;
  if(!dayName){
    document.getElementById('rosterPanel').innerHTML = '<div style="text-align:center;color:var(--text-secondary);">Select a day to view roster</div>';
    return;
  }
  
  const roster = currentPosSection === 'foh' ? (fohRoster[dayName] || []) : (bohRoster[dayName] || []);
  let expiredSomething = false;
  
  const html = roster.map(person=>{
    const key = person.name + today;
    const escapedName = person.name.replace(/'/g, "\\'");
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
    const mins = Math.floor(remaining / 60);
    const secs = remaining % 60;
    const isCompleted = !!completedBreaks[key];
    const customBadge = person.source === 'manual' ? `<span class="roster-custom-badge">✏️ Custom${person.addedBy ? ' · ' + escapeHtml(person.addedBy) : ''}</span>` : '';
    return `
      <div class="roster-item">
        <button class="roster-remove" onclick="removeFromRoster('${escapedName}')" title="Remove from today's roster">✕</button>
        <div class="roster-name">${person.name}${customBadge}${(isCompleted && !onBreak) ? `<button class="break-complete-badge" onclick="undoBreakComplete('${escapedName}')" title="Tap to undo">✓ Break Complete ↺</button>` : ''}</div>
        <div class="roster-time">${person.start} - ${person.end}</div>
        ${onBreak ? `
          <div class="countdown" id="timer-${person.name}">${mins}:${secs<10?'0':''}${secs}</div>
          <button class="break-btn onbreak" disabled>On Break</button>
          <button class="btn-complete-break" onclick="completeBreakNow('${escapedName}')">Mark Break Complete</button>
        ` : `
          <button class="break-btn" onclick="toggleBreak('${escapedName}')">Start Break</button>
        `}
      </div>
    `;
  }).join('');
  
  if(roster.length === 0){
    document.getElementById('rosterPanel').innerHTML = '<div style="text-align:center;color:var(--text-secondary);padding:20px;">No roster for ' + formatVerboseDate(dayName) + ' yet. Import a screenshot to populate.</div>';
  } else {
    document.getElementById('rosterPanel').innerHTML = html;
    
    roster.forEach(person=>{
      const key = person.name + today;
      if(breakCountdowns[key]){
        startCountdown(person.name);
      }
    });
  }
  
  if(expiredSomething) saveState();
}

window.removeFromRoster = async function(name){
  const dayName = document.getElementById('daySelect').value;
  if(!dayName) return;
  if(!confirm(`Remove ${name} from ${formatVerboseDate(dayName)}'s roster?`)) return;
  
  const roster = currentPosSection === 'foh' ? fohRoster : bohRoster;
  if(roster[dayName]){
    roster[dayName] = roster[dayName].filter(p => p.name !== name);
  }
  const breakKey = name + today;
  if(breakCountdowns[breakKey]){
    delete breakCountdowns[breakKey];
    if(activeCountdownTimers[name]){
      clearInterval(activeCountdownTimers[name]);
      delete activeCountdownTimers[name];
    }
  }
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
  showToast(`✓ ${name} removed from roster`);
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
  const key = name + today;
  if(breakCountdowns[key]){
    delete breakCountdowns[key];
    if(activeCountdownTimers[name]){
      clearInterval(activeCountdownTimers[name]);
      delete activeCountdownTimers[name];
    }
  } else {
    breakCountdowns[key] = Date.now() + (30 * 60 * 1000);
  }
  await saveState();
  renderRoster();
};

window.completeBreakNow = async function(name){
  const key = name + today;
  delete breakCountdowns[key];
  completedBreaks[key] = true;
  if(activeCountdownTimers[name]){
    clearInterval(activeCountdownTimers[name]);
    delete activeCountdownTimers[name];
  }
  await saveState();
  renderRoster();
  showToast('✓ Break marked complete');
};

window.undoBreakComplete = async function(name){
  const key = name + today;
  delete completedBreaks[key];
  await saveState();
  renderRoster();
  showToast('✓ Break status reset');
};

function startCountdown(name){
  if(activeCountdownTimers[name]){
    clearInterval(activeCountdownTimers[name]);
  }
  
  const timer = setInterval(async ()=>{
    const key = name + today;
    if(!breakCountdowns[key]){
      clearInterval(timer);
      delete activeCountdownTimers[name];
      return;
    }
    const remaining = Math.round((breakCountdowns[key] - Date.now()) / 1000);
    const el = document.getElementById('timer-'+name);
    if(remaining <= 0){
      delete breakCountdowns[key];
      completedBreaks[key] = true;
      clearInterval(timer);
      delete activeCountdownTimers[name];
      await saveState();
      renderRoster();
      showToast('✓ Break time expired!');
      return;
    }
    if(el){
      const mins = Math.floor(remaining / 60);
      const secs = remaining % 60;
      el.textContent = `${mins}:${secs<10?'0':''}${secs}`;
    }
  }, 1000);
  
  activeCountdownTimers[name] = timer;
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
  
  container.innerHTML = fohDayparts.map(dp=>{
    const entry = numbersData[dayName][dp.name] || {};
    const escapedDp = dp.name.replace(/'/g, "\\'");
    return `
      <div class="standup-card" style="margin-bottom:14px;">
        <h3 style="margin-bottom:12px;">${dp.name}</h3>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
          <div class="field">
            <label>Projected Sales</label>
            <input type="text" inputmode="decimal" value="${entry.projectedSales || ''}" placeholder="$0.00" onchange="formatAndUpdateCurrency(this,'${dayName}','${escapedDp}','projectedSales')" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:var(--radius);font-family:'Inter';">
          </div>
          <div class="field">
            <label>Productivity Goal</label>
            <input type="text" inputmode="decimal" value="${entry.productivityGoal || ''}" placeholder="$0.00" onchange="formatAndUpdateCurrency(this,'${dayName}','${escapedDp}','productivityGoal')" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:var(--radius);font-family:'Inter';">
          </div>
        </div>
        <div class="field">
          <label>Special Events</label>
          <input type="text" value="${entry.specialEvents || ''}" placeholder="e.g. Football watch party, large catering pickup at 2pm" onchange="updateNumbersField('${dayName}','${escapedDp}','specialEvents',this.value)" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:var(--radius);font-family:'Inter';">
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

function getNumbersForDaypart(dayName, dp){
  const dayNums = numbersData[dayName];
  if(!dayNums) return null;
  if(dayNums[dp.name]) return dayNums[dp.name];
  
  const targetMin = parseDaypartTimeToMinutes(dp.time);
  let match = null;
  fohDayparts.forEach((ndp, i)=>{
    const {startMin, endMin} = daypartTimeWindow(fohDayparts, i);
    if(targetMin >= startMin && targetMin < endMin) match = ndp.name;
  });
  return match ? (dayNums[match] || null) : null;
}
