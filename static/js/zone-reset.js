function getZoneItems(zoneName){
  return zoneName === 'Final Check' ? FINAL_CHECK_ITEMS : (ZONE_CHECKLISTS[zoneName] || []);
}

// Reuses the same major-daypart list as Set Ups, so leaders see one consistent
// set of transition points across the app instead of two different schemes
function getZoneDayparts(){
  return fohDayparts.map(dp => dp.name);
}

function getZoneCompletion(dateISO, daypart, zoneName){
  const items = getZoneItems(zoneName);
  const state = (zoneChecklistState[dateISO] && zoneChecklistState[dateISO][daypart] && zoneChecklistState[dateISO][daypart][zoneName]) || {};
  const checked = items.filter(item => state[item]).length;
  return {checked, total: items.length};
}

function getOverallCompletion(dateISO){
  let checked = 0, total = 0;
  getZoneDayparts().forEach(daypart=>{
    ALL_ZONE_NAMES.forEach(zone=>{
      const c = getZoneCompletion(dateISO, daypart, zone);
      checked += c.checked;
      total += c.total;
    });
  });
  return total > 0 ? Math.round((checked / total) * 100) : 0;
}

function recomputeChecklistHistory(dateISO){
  zoneChecklistHistory[dateISO] = {overall: getOverallCompletion(dateISO)};
}

// Zone checklists don't need long history (raw checkbox state prunes with everything
// else after 14 days), but the scoreboard needs the completion percentages to stick
// around longer to actually show a trend — keep those for 60 days instead
function pruneZoneChecklistData(){
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 60);
  const cutoffISO = toLocalISODate(cutoff);
  let pruned = false;
  Object.keys(zoneChecklistHistory).forEach(key=>{
    if(key < cutoffISO){
      delete zoneChecklistHistory[key];
      pruned = true;
    }
  });
  return pruned;
}

let currentChecklistZone = '';
let currentZoneDaypart = '';

function renderZoneDaypartPicker(){
  const dayparts = getZoneDayparts();
  const picker = document.getElementById('zoneDaypartPicker');
  picker.innerHTML = dayparts.map(dp=>`<div class="day-pill ${dp === currentZoneDaypart ? 'active' : ''}" data-daypart="${dp.replace(/"/g, '&quot;')}">${dp}</div>`).join('');
  
  picker.querySelectorAll('.day-pill').forEach(pill=>{
    pill.addEventListener('click', ()=>{
      picker.querySelectorAll('.day-pill').forEach(p=>p.classList.remove('active'));
      pill.classList.add('active');
      currentZoneDaypart = pill.dataset.daypart;
      renderZoneResetCard();
    });
  });
}

window.openZoneChecklistTasks = function(zoneName){
  currentChecklistZone = zoneName;
  renderZoneChecklistModal();
  document.getElementById('zoneChecklistTaskModal').classList.add('active');
};

function renderZoneChecklistModal(){
  const zoneName = currentChecklistZone;
  if(!zoneName || !currentZoneDaypart) return;
  const items = getZoneItems(zoneName);
  const state = (zoneChecklistState[today] && zoneChecklistState[today][currentZoneDaypart] && zoneChecklistState[today][currentZoneDaypart][zoneName]) || {};
  const {checked, total} = getZoneCompletion(today, currentZoneDaypart, zoneName);
  
  document.getElementById('zcTaskModalTitle').textContent = (ZONE_ICONS[zoneName] || '') + ' ' + zoneName;
  document.getElementById('zcTaskModalProgress').textContent = `${checked}/${total} complete • ${currentZoneDaypart} • ${formatVerboseDate(today)}`;
  document.getElementById('zcTaskModalList').innerHTML = items.map(item=>{
    const isChecked = !!state[item];
    const escapedItem = item.replace(/'/g, "\\'");
    const escapedZone = zoneName.replace(/'/g, "\\'");
    return `
      <label style="display:flex;align-items:center;gap:10px;padding:10px 4px;border-bottom:1px solid var(--border);cursor:pointer;">
        <input type="checkbox" ${isChecked ? 'checked' : ''} onchange="toggleChecklistItem('${escapedZone}','${escapedItem}')" style="width:18px;height:18px;flex-shrink:0;">
        <span style="${isChecked ? 'text-decoration:line-through;color:var(--text-tertiary);' : ''}font-size:13px;">${item}</span>
      </label>
    `;
  }).join('');
}

window.toggleChecklistItem = async function(zoneName, itemText){
  const daypart = currentZoneDaypart;
  if(!daypart) return;
  if(!zoneChecklistState[today]) zoneChecklistState[today] = {};
  if(!zoneChecklistState[today][daypart]) zoneChecklistState[today][daypart] = {};
  if(!zoneChecklistState[today][daypart][zoneName]) zoneChecklistState[today][daypart][zoneName] = {};
  zoneChecklistState[today][daypart][zoneName][itemText] = !zoneChecklistState[today][daypart][zoneName][itemText];
  recomputeChecklistHistory(today);
  await saveState();
  renderZoneChecklistModal();
  renderZoneResetCard();
};

function renderZoneResetCard(){
  const buttonRow = document.getElementById('zoneButtonRow');
  
  if(!currentZoneDaypart){
    buttonRow.innerHTML = '<div class="pos-option-empty" style="width:100%;">Pick a daypart above to see its reset lists</div>';
  } else {
    buttonRow.innerHTML = ALL_ZONE_NAMES.map(zone=>{
      const {checked, total} = getZoneCompletion(today, currentZoneDaypart, zone);
      const done = total > 0 && checked === total;
      const escapedZone = zone.replace(/'/g, "\\'");
      return `
        <button class="zone-btn ${done ? 'zone-btn-done' : ''}" onclick="openZoneChecklistTasks('${escapedZone}')">
          ${ZONE_ICONS[zone] || ''} ${zone}<span class="zone-btn-count">${checked}/${total}</span>
        </button>
      `;
    }).join('');
  }
  
  const overall = getOverallCompletion(today);
  const pctEl = document.getElementById('zoneOverallPct');
  pctEl.textContent = overall + '%';
  pctEl.classList.toggle('high', overall >= 95);
}

function renderZoneResetScoreboard(){
  const container = document.getElementById('zoneResetScoreboard');
  const days = [];
  for(let i = 6; i >= 0; i--){
    const d = new Date();
    d.setDate(d.getDate() - i);
    const iso = toLocalISODate(d);
    const pct = zoneChecklistHistory[iso] ? zoneChecklistHistory[iso].overall : null;
    days.push({label: d.toLocaleDateString('en-US', {weekday: 'short'}).slice(0, 1), pct});
  }
  container.innerHTML = days.map(d=>`
    <div class="scoreboard-day ${d.pct !== null && d.pct >= 95 ? 'star' : ''}">
      ${d.pct !== null && d.pct >= 95 ? '<div class="scoreboard-star">⭐</div>' : ''}
      <div class="scoreboard-day-bar-wrap"><div class="scoreboard-day-bar" style="height:${d.pct || 0}%"></div></div>
      <div class="scoreboard-day-pct">${d.pct !== null ? d.pct + '%' : '—'}</div>
      <div class="scoreboard-day-label">${d.label}</div>
    </div>
  `).join('');
}

function renderDailyTasksTab(){
  renderZoneDaypartPicker();
  renderZoneResetCard();
  renderZoneResetScoreboard();
}

document.querySelectorAll('#dailyTasksToggle .toggle-btn').forEach(t=>{
  t.addEventListener('click', ()=>{
    document.querySelectorAll('#dailyTasksToggle .toggle-btn').forEach(x=>{x.classList.remove('active'); x.setAttribute('aria-pressed', 'false');});
    t.classList.add('active');
    t.setAttribute('aria-pressed', 'true');
    const sub = t.dataset.subview;
    document.getElementById('wasteSubpanel').style.display = sub === 'waste' ? 'block' : 'none';
    document.getElementById('zoneResetSubpanel').style.display = sub === 'zonereset' ? 'block' : 'none';
  });
});

document.getElementById('zcTaskModalClose').addEventListener('click', ()=>{
  document.getElementById('zoneChecklistTaskModal').classList.remove('active');
});
document.getElementById('zoneChecklistTaskModal').addEventListener('click', (e)=>{
  if(e.target === document.getElementById('zoneChecklistTaskModal')) document.getElementById('zoneChecklistTaskModal').classList.remove('active');
});

const fohLeads = ['Carlos', 'Nestor', 'Aurora', 'Kaiya', 'Jacob', 'Dom', 'Luke', 'Vanessa'];
const bohLeads = ['Doris', 'Nansi', 'Bessie', 'Jason', 'Angeles', 'Alex', 'Jenny', 'Grecia'];

const fohProducts = [
  {id:'foh1', section:'foh', cat:'Beverages', name:'Lemonade (Quart)', es:'Limonada (Cuarto)', unit:'each', cost:0},
  {id:'foh2', section:'foh', cat:'Sandwiches', name:'Chicken Sandwich', es:'Sándwich de Pollo', unit:'each', cost:0},
  {id:'foh3', section:'foh', cat:'Sandwiches', name:'Spicy Sandwich', es:'Sándwich Picante', unit:'each', cost:0},
  {id:'foh4', section:'foh', cat:'Nuggets', name:'8 ct Nugget', es:'Pepitas (8 piezas)', unit:'each', cost:0},
  {id:'foh5', section:'foh', cat:'Nuggets', name:'12 ct Nugget', es:'Pepitas (12 piezas)', unit:'each', cost:0},
  {id:'foh25', section:'foh', cat:'Nuggets', name:'5 ct Nugget', es:'Pepitas (5 piezas)', unit:'each', cost:0},
  {id:'foh26', section:'foh', cat:'Grilled', name:'5 ct Grilled Nugget', es:'Pepitas Asadas (5 piezas)', unit:'each', cost:0},
  {id:'foh27', section:'foh', cat:'Grilled', name:'8 ct Grilled Nugget', es:'Pepitas Asadas (8 piezas)', unit:'each', cost:0},
  {id:'foh28', section:'foh', cat:'Grilled', name:'12 ct Grilled Nugget', es:'Pepitas Asadas (12 piezas)', unit:'each', cost:0},
  {id:'foh6', section:'foh', cat:'Fries', name:'Waffle Fries (Small)', es:'Papas Onduladas (Pequeño)', unit:'each', cost:0},
  {id:'foh7', section:'foh', cat:'Fries', name:'Waffle Fries (Medium)', es:'Papas Onduladas (Mediano)', unit:'each', cost:0},
  {id:'foh8', section:'foh', cat:'Fries', name:'Waffle Fries (Large)', es:'Papas Onduladas (Grande)', unit:'each', cost:0},
  {id:'foh9', section:'foh', cat:'Mac & Cheese', name:'Mac & Cheese (Small)', es:'Pasta con Queso (Pequeño)', unit:'each', cost:0},
  {id:'foh10', section:'foh', cat:'Mac & Cheese', name:'Mac & Cheese (Medium)', es:'Pasta con Queso (Mediano)', unit:'each', cost:0},
  {id:'foh11', section:'foh', cat:'Mac & Cheese', name:'Mac & Cheese (Large)', es:'Pasta con Queso (Grande)', unit:'each', cost:0},
  {id:'foh12', section:'foh', cat:'Salads', name:'Market Salad', es:'Ensalada Market', unit:'each', cost:0},
  {id:'foh13', section:'foh', cat:'Salads', name:'Cobb Salad', es:'Ensalada Cobb', unit:'each', cost:0},
  {id:'foh14', section:'foh', cat:'Salads', name:'Southwest Salad', es:'Ensalada Suroeste', unit:'each', cost:0},
  {id:'foh15', section:'foh', cat:'Salads', name:'Side Salads', es:'Ensaladas de Lado', unit:'each', cost:0},
  {id:'foh16', section:'foh', cat:'Wraps', name:'Grilled Wrap', es:'Envoltorio Asado', unit:'each', cost:0},
  {id:'foh17', section:'foh', cat:'Wraps', name:'Spicy Wrap', es:'Envoltorio Picante', unit:'each', cost:0},
  {id:'foh18', section:'foh', cat:'Fruit Cups', name:'Fruit Cups (Small)', es:'Vasos de Fruta (Pequeño)', unit:'each', cost:0},
  {id:'foh19', section:'foh', cat:'Fruit Cups', name:'Fruit Cups (Medium)', es:'Vasos de Fruta (Mediano)', unit:'each', cost:0},
  {id:'foh20', section:'foh', cat:'Fruit Cups', name:'Fruit Cups (Large)', es:'Vasos de Fruta (Grande)', unit:'each', cost:0},
  {id:'foh21', section:'foh', cat:'Ice Dream', name:'Ice Dream (Cone)', es:'Helado CFA (Cono)', unit:'each', cost:0},
  {id:'foh22', section:'foh', cat:'Ice Dream', name:'Ice Dream (Shake)', es:'Helado CFA (Batido)', unit:'each', cost:0},
  {id:'foh23', section:'foh', cat:'Ice Dream', name:'Ice Dream (Cup)', es:'Helado CFA (Vaso)', unit:'each', cost:0},
  {id:'foh24', section:'foh', cat:'Ice Dream', name:'Ice Dream (Quart)', es:'Helado CFA (Cuarto)', unit:'each', cost:0},
];

const bohProducts = [
  {id:'boh1', section:'boh', cat:'Raw Filets', name:'Raw Breakfast Filet', es:'Filete Desayuno Crudo', unit:'each', cost:0},
  {id:'boh2', section:'boh', cat:'Raw Filets', name:'Raw Spicy Breakfast Filet', es:'Filete Picante Desayuno Crudo', unit:'each', cost:0},
  {id:'boh3', section:'boh', cat:'Raw Filets', name:'Raw Filet', es:'Filete Crudo', unit:'each', cost:0},
  {id:'boh4', section:'boh', cat:'Raw Filets', name:'Raw Spicy Filet', es:'Filete Picante Crudo', unit:'each', cost:0},
  {id:'boh5', section:'boh', cat:'Cooked Filets', name:'CFA Filet', es:'Filete CFA', unit:'each', cost:0},
  {id:'boh6', section:'boh', cat:'Cooked Filets', name:'Spicy Filet', es:'Filete Picante', unit:'each', cost:0},
  {id:'boh7', section:'boh', cat:'Tenders', name:'Chicken Tenders', es:'Tiras de Pollo', unit:'each', cost:0},
  {id:'boh8', section:'boh', cat:'Tenders', name:'Grilled Chicken Strips', es:'Tiras Asadas', unit:'each', cost:0},
  {id:'boh9', section:'boh', cat:'Prepared', name:'Breaded Filet', es:'Filete Empanizado', unit:'each', cost:0},
  {id:'boh10', section:'boh', cat:'Prepared', name:'Breaded Spicy Filet', es:'Filete Picante Empanizado', unit:'each', cost:0},
  {id:'boh11', section:'boh', cat:'Components', name:'Buttered Bun', es:'Bollo Mantequillado', unit:'each', cost:0},
  {id:'boh12', section:'boh', cat:'Components', name:'Toasted Bun', es:'Bollo Tostado', unit:'each', cost:0},
  {id:'boh13', section:'boh', cat:'Sauce Prep', name:'Sauce Container', es:'Recipiente de Salsa', unit:'each', cost:0},
  {id:'boh14', section:'boh', cat:'Sides Prep', name:'Waffle Fries Batch', es:'Lote de Papas Onduladas', unit:'each', cost:0},
  {id:'boh15', section:'boh', cat:'Sides Prep', name:'Mac & Cheese Batch', es:'Lote de Pasta con Queso', unit:'each', cost:0},
  {id:'boh16', section:'boh', cat:'Cooling/Holding', name:'Cooler Discard', es:'Descarte de Enfriador', unit:'each', cost:0},
  {id:'boh17', section:'boh', cat:'Cooling/Holding', name:'Warmer Discard', es:'Descarte de Calentador', unit:'each', cost:0},
];

products = [...fohProducts, ...bohProducts];
teamMembers = [...fohLeads, ...bohLeads];

// POSITIONS & BREAKS DATA
const fohDayparts = [
  {name: 'Early Breakfast (6:00-8:00)', time: '6:00'},
  {name: 'Breakfast (8:00-11:00)', time: '8:00'},
  {name: 'Lunch (11:00-2:00)', time: '11:00'},
  {name: 'Transition (1:00-2:00)', time: '13:00'},
  {name: 'Afternoon (2:00-5:00)', time: '14:00'},
  {name: 'Dinner (5:00-8:00)', time: '17:00'},
  {name: 'Close (8:00-10:00)', time: '20:00'},
];

const bohDayparts = [
  {name: 'Early Breakfast (6:00-8:00)', time: '6:00'},
  {name: 'Breakfast (8:00-10:30)', time: '8:00'},
  {name: 'Mid (10:30-2:00)', time: '10:30'},
  {name: 'Afternoon (2:00-5:00)', time: '14:00'},
  {name: 'Dinner (5:00-8:00)', time: '17:00'},
  {name: 'Close (8:00-10:00)', time: '20:00'},
];

const fohPositions = {
  'Early Breakfast (6:00-8:00)': ['iPOS 1 LANE 1', 'iPOS 2 LANE 2', 'DT Bagger 1', 'Drinks 1', 'OMD 1', 'Drinks 3 / Runner', 'Host 1'],
  'Breakfast (8:00-11:00)': ['iPOS 1 (Captain)', 'iPOS 2 LANE 2', 'DT Bagger 1', 'Drinks 1', 'OMD 1', 'Host 1', 'FC Bagger', 'Drinks 3', 'DT Bagger 2', 'iPOS 3 LANE 3', 'Runner', 'Host 2', 'Drinks 2', 'iPOS 4 LANE 1'],
  'Lunch (11:00-2:00)': ['iPOS 1 (Captain)', 'iPOS 2 LANE 1', 'iPOS 3 LANE 2', 'iPOS 4 LANE 1', 'iPOS 5 LANE 2', 'DT Bagger 1 (Cockpit Cap)', 'DT Bagger 2', 'Drinks 1', 'Drinks 2/Sample Prep', 'OMD 1', 'OMD 2', 'FC Bagger', 'Drinks 3', 'Host 1 (Captain)', 'Host 2', 'Runner', 'Surfer', 'iPOS 6 LANE 1', 'OMD 3', 'Host 3', 'Host 4', 'iPOS 7 LANE 2', 'Traffic Lane 1', 'iPOS 8 LANE 2', 'DT Bagger 4'],
  'Transition (1:00-2:00)': ['iPOS 1 (Captain)', 'iPOS 2 LANE 2', 'iPOS 3 LANE 1', 'DT Bagger 1 (Cockpit Cap)', 'FC Bagger', 'OMD 1', 'Host 1 (Captain)', 'Drinks 1', 'Drink 3', 'Drinks Zone', 'Bagging Zone', 'Front Counter Zone', 'Dinning Room', 'Restroom Zone', 'Lemonades', 'Pouches'],
  'Afternoon (2:00-5:00)': ['iPOS 1 (Captain)', 'iPOS 2 LANE 2', 'iPOS 3 LANE 1', 'Drinks 1', 'OMD 1', 'Host 1', 'FC Bagger', 'Drink 3', 'Host 2', 'Runner', 'iPOS 4 LANE 2', 'DT Bagger 2', 'Drinks 2', 'Shift Lead: Jacob/Nestor', 'Breaks', 'iPOS 5 LANE 1', 'DT Bagger 3', 'Host 3', 'iPOS 6 LANE 3', 'iPOS 7 LANE 1', 'Traffic Lane 1', 'Desserts'],
  'Dinner (5:00-8:00)': ['iPOS 1 (Captain)', 'iPOS 2 LANE 2', 'iPOS 3 LANE 2', 'iPOS 4 LANE 1', 'iPOS 5 LANE 2', 'DT Bagger 1 (Captain)', 'DT Bagger 2', 'Drinks 1', 'Drinks 2', 'OMD 1', 'OMD 2', 'FC Bagger', 'Drinks 3', 'Host 1', 'Host 2', 'Runner', 'DT Bagger 3', 'Host 3', 'iPOS 6 LANE 3', 'OMD 3', 'iPOS 7 LANE 1', 'Traffic Lane 1', 'iPOS 8 LANE 2', 'DT Bagger 4'],
  'Close (8:00-10:00)': ['iPOS 1 LANE 1', 'iPOS 2 LANE 2', 'DT Bagger 1', 'Drinks 1', 'OMD', 'Host 1', 'FC Bagger', 'Drinks 3', 'Runner', 'Lemonades', 'Drinks Zone', 'Bagging Zone', 'Front Counter Zone', 'Outside Zone', 'Dinning Room', 'Restroom Zone', 'Floors'],
};

const bohPositions = {
  'Early Breakfast (6:00-8:00)': ['Breader', 'Primary/Machines', 'Secondary', 'Prep', 'Filters'],
  'Breakfast (8:00-10:30)': ['Breader', 'Primary/Machines', 'Secondary', 'Prep', 'Biscuit/Eggs', 'Prep 2', 'Breaks'],
  'Mid (10:30-2:00)': ['Breader1', 'Breader 2', 'Machines', 'Primary 1', 'Fries', 'Secondari 1', 'Primary 2', 'Secondari 2', 'Prep', 'Primari 3'],
  'Afternoon (2:00-5:00)': ['Breader 1', 'Machines', 'Primary 1', 'Fries', 'Secondary 1', 'Breader 2', 'Prep'],
  'Dinner (5:00-8:00)': ['Breader 1', 'Breader 2', 'Machines', 'Primary 1', 'Fries', 'Secondary 1', 'Primary 2', 'Secondary 2', 'Prep'],
  'Close (8:00-10:00)': ['Breader 1', 'Breader 2', 'Machines', 'Primary 1', 'Fries', 'Secondary 1', 'Primary 2', 'Secondary 2', 'Prep', 'Floors', 'Prep/dishes'],
};

const fohOEChecklistData = [
  {cat: 'Guest Experience', items: [
    'Dining room tables & floors clean',
    'Restrooms clean and stocked',
    'Drive-thru timing on pace with target',
    'Order accuracy spot-checked at handoff',
    'Digital/curbside orders staged correctly'
  ]},
  {cat: 'Team & Positioning', items: [
    'Team properly positioned per set-up chart',
    'Breaks on schedule, coverage confirmed',
    'Uniform and grooming standards met'
  ]},
  {cat: 'Safety & Compliance', items: [
    'Handwashing observed at proper intervals',
    'Walkways and exits clear',
    'Equipment in working order'
  ]}
];

const fohLeaderTransitionItems = [
  'Review labor vs. guest count for next daypart',
  'Update communication board',
  'Confirm break coverage plan',
  'Walk drive-thru and confirm timer target',
  'Check dining room + restrooms',
  'Hand off open action items to incoming leader',
  'Confirm cash drawers / safe counts',
  'Review upcoming reservations / large orders'
];

const fohPositionTransitionItems = {
  'Front Counter': ['Register balanced', 'Counter area clean and stocked', 'Guest queue clear', 'Handoff open orders to next FC'],
  'Drive Thru': ['Headset handed off', 'Timer reset', 'Bagging station stocked', 'Lane clear of trash'],
  'Kitchen Support / OMD': ['Expo station clean', 'Order marker area stocked', 'Handoff open tickets'],
  'Drinks / Beverage': ['Beverage station stocked', 'Ice bins full', 'Lemonade fresh and stocked'],
  'Dining Room / Host': ['Tables wiped', 'Trash emptied', 'High chairs cleaned', 'Condiments restocked'],
  'Bagging': ['Bagging station stocked', 'Sauces stocked', 'Bags/trays refilled']
};

let fohOEDays = [];
let fohOEStreak = 0;
let fohOEChecked = {};
let fohOECheckedDate = null;
let fohLeaderTransitionChecked = {};
let fohLeaderTransitionDate = null;
let currentFOHPosition = Object.keys(fohPositionTransitionItems)[0];
let fohPositionTransitionChecked = {};
let fohPositionTransitionDate = null;

// REMARKable Opportunities Growth Track & EOI Forms
const growthTrack = [
  {role: 'Team Member', color: '#E31C23', desc: "Lives out our mission of being the most caring brand by winning the hearts of our guests everyday."},
  {role: 'Trainer', color: '#1B3A57', desc: "Develops New Hires. Foundation of leading self. Proven in 5 Key Areas — FOH/BOH. Models the 3-step D.I.R. method. Committed to developing self & others."},
  {role: 'Team Lead', color: '#2E9BC7', desc: "Develops Team Members. Foundation of leading operations. Executes systems, policies, and procedures. Organizes shifts. Supports Directors in departments."},
  {role: 'Director', color: '#8C8C8C', desc: "Develops Supervisors. Foundation of leading a department. Has an ownership mindset. Supports the Executive team in driving culture through vision, values & execution."},
  {role: 'Executive', color: '#6E2C5A', desc: "Develops leaders. Foundation of leading the organization through vision, results & culture. Maximizes profits. Protects the Chick-fil-A brand. Models ownership mindset."}
];

const eoiRoles = {
  'Trainer': {
    from: 'Team Member',
    requirements: [
      'Certified Team Member — FOH or BOH (Pathways complete)',
      "Crushing it on all PEA roles in your section",
      'Models the 3-step D.I.R. (Demonstrate, Involve, Review) training method',
      'Shows commitment to developing self and others',
      'Lives out hospitality, hustle, and humility daily'
    ]
  },
  'Team Lead': {
    from: 'Trainer',
    requirements: [
      'Trainer Certified',
      'Completed 30-Day Trainer trial successfully',
      'Comfortable executing systems, policies, and procedures',
      'Able to organize and run a shift with minimal oversight',
      'Demonstrates readiness to develop other Team Members'
    ]
  },
  'Director': {
    from: 'Team Lead',
    requirements: [
      'Team Lead Certified',
      'Completed 1-Quarter Team Lead trial successfully',
      'Demonstrates an ownership mindset over shift outcomes',
      'Ready to develop Supervisors and lead a full department',
      'Aligned with vision, values, and execution standards'
    ]
  },
  'Executive': {
    from: 'Director',
    requirements: [
      'Director Certified',
      'Completed 2-Quarter Director trial successfully',
      'Demonstrates ability to lead through vision, results & culture',
      'Focused on maximizing profits and protecting the brand',
      'Models ownership mindset at an organizational level'
    ]
  }
};

let currentEOIRole = 'Trainer';
let eoiSubmissions = [];

const fohRoster = {
  Monday: [], Tuesday: [], Wednesday: [], Thursday: [], Friday: [], Saturday: []
};
const bohRoster = {
  Monday: [], Tuesday: [], Wednesday: [], Thursday: [], Friday: [], Saturday: []
};

let currentPosSection = 'foh';
let breakCountdowns = {};
let completedBreaks = {}; // persisted: marks a break as done, whether by timer expiry or manual completion
let activeCountdownTimers = {}; // runtime-only: interval IDs, never persisted
let zoneChecklistState = {}; // persisted: zoneChecklistState[dateISO][zoneName][itemText] = true (only today's date is ever written to)
let zoneChecklistHistory = {}; // persisted: zoneChecklistHistory[dateISO] = {overall: pct, zones: {zoneName: pct}} — kept longer than the raw state, for the scoreboard
let numbersData = {}; // persisted: numbersData[dateISO][daypartName] = {projectedSales, productivityGoal, specialEvents}
let lastUpdated = {}; // persisted: lastUpdated[dateISO] = timestamp (ms) of last roster/positions/numbers edit
let posAssignments = {};

// LX SCOREBOARD DATA
const defaultPillars = [
  {
    id: 'pillar1',
    title: 'Develop Exceptional Leaders',
    focus: 'Huddles that make it to the TM, Shift scorecarding, Zone captain rotations / execution',
    goal: '50 Leadership PEAs/QTR, PEA submissions daily',
    initiatives: 'Casey day logging, Director weekly reflection report'
  },
  {
    id: 'pillar2',
    title: 'Build and Retain A High Performing Team',
    focus: 'Leverage CARES Cash, EVP - where are we missing?, Training Guide mastery',
    goal: '15 Daily PEA Submissions, TMs love their job',
    initiatives: 'Dual submissions count as 1 (3H PEA)'
  },
  {
    id: 'pillar3',
    title: 'Deliver Operational Excellence Every Day',
    focus: 'Sub 3-minute SOS, Make speed visible to TMs',
    goal: 'Maintain Top 5% OSAT - Pursuit of 90s Club',
    initiatives: ''
  },
  {
    id: 'pillar4',
    title: 'Steward Resources with Excellence',
    focus: 'Smart Scheduling, Stewardship role, List completion - cleanliness',
    goal: 'Stay visit-ready, 90+ productivity',
    initiatives: ''
  },
  {
    id: 'pillar5',
    title: 'Grow Sales Through Care',
    focus: 'Mobile SOS down to 1:30, Convert scans - TMS, Mobile SBBA events',
    goal: '10% increase Mobile Thru by EOQ, 30% transactions',
    initiatives: 'Share remarkable moments stories'
  },
  {
    id: 'pillar6',
    title: 'Create Meaningful Guest Connections',
    focus: 'OMD hospitality - 5 seconds, Surprise & Delight moments, Daily samples',
    goal: '95% on SmartShop ACE + 2nd Mile',
    initiatives: 'Disney - guest ends interaction'
  }
];

const defaultMetrics = [
  { id: 'metric1', name: 'OSAT +2pt ≤ 20%', standard: '≤ 20%', value: '', rating: 2 },
  { id: 'metric2', name: 'Food Safety Score', standard: '≥ 2', value: '', rating: 2 },
  { id: 'metric3', name: 'Drive-Thru Ranking', standard: 'Top 100', value: '', rating: 2 },
  { id: 'metric4', name: 'Food Cost Gap', standard: '0.50%', value: '', rating: 2 },
  { id: 'metric5', name: 'Productivity', standard: '$90+', value: '', rating: 2 }
];

let lxPillars = [];
let lxMetrics = [];
let lxLastUpdated = null;

// GX SCOREBOARD DATA
const defaultGXData = {
  wig: {
    mtdSales: {value: '$402,555', label: 'MTD Sales $'},
    mtdSalesChange: {value: '3.49%', label: 'MTD Sales Change %'},
    ytdSales: {value: '', label: 'YTD Sales $'},
    ytdSalesChange: {value: '', label: 'YTD Sales Change %'}
  },
  dt: {
    market: {value: '9', label: 'Market'},
    state: {value: '57', label: 'State'},
    chain: {value: '305', label: 'Chain'}
  },
  satisfaction: {
    highlySatisfied: {value: '82%', label: '% Highly Satisfied'},
    top5Satisfied: {value: '86%', label: 'Top 5% Highly Satisfied'},
    notSatisfied: {value: '18%', label: '% Not Satisfied'},
    foodSafety: {value: '5', label: 'Food Safety Score'}
  },
  craveable: {
    overallTaste: {value: '81%', top5: '85%', label: 'Overall Taste'},
    tasteFries: {value: '82%', top5: '85%', label: 'Taste - Fries'},
    tasteCFA: {value: '83%', top5: '85%', label: 'Taste - CFA'},
    tasteSpicy: {value: '81%', top5: '84%', label: 'Taste - Spicy'},
    tasteNuggets: {value: '87%', top5: '89%', label: 'Taste - Nuggets'},
    mostRecentQIV: {value: '97.4%', top5: '98%', label: 'Most Recent QIV'},
    temperature: {value: '80%', top5: '85%', label: 'Temperature'},
    portionSize: {value: '70%', top5: '80%', label: 'Portion Size'},
    smartShopScore: {value: '91%', top5: '93%', label: 'Smart Shop Score'}
  },
  service: {
    fastService: {value: '80%', top5: '85%', label: 'Fast Service'},
    speedOfService: {value: '2:59', top5: '2:45', label: 'Speed of Service'},
    orderAccuracy: {value: '95%', top5: '97%', label: 'Order Accuracy'},
    smartShopScore: {value: '92%', top5: '94%', label: 'Smart Shop Score'}
  },
  welcoming: {
    cleanliness: {value: '82%', top5: '90%', label: 'Cleanliness'},
    smartShopScore: {value: '98%', top5: '99%', label: 'Smart Shop Score'}
  },
  secondMile: {
    opportunities: [
      'Slow down to confirm orders',
      'Use guest names consistently',
      'Provide clear, confident directions to guests'
    ],
    smartShopScore: {value: '87%', label: 'Smart Shop Score'}
  },
  teamMembers: {
    coachingFocus: [
      'Respond with "My Pleasure" when thanked by guests.',
      'Consistently share a smile during interactions.'
    ],
    attentiveCourteous: {value: '84%', label: 'Attentive + Courteous Employees'},
    smartShopScore: {value: '93%', label: 'Smart Shop Score'}
  },
  lastUpdated: null
};

let gxData = JSON.parse(JSON.stringify(defaultGXData));

// TX SCOREBOARD DATA
const defaultTXData = {
  events: [
    {id: 'evt1', name: 'Trainer Trials Begin', date: '2026-09-05'},
    {id: 'evt2', name: '90 Day Engagement', date: '2026-09-15'},
    {id: 'evt3', name: 'Team Leader Evaluations', date: '2026-09-22'},
    {id: 'evt4', name: 'Certification Exam Window', date: '2026-10-01'}
  ],
  trialTrainers: [
    {id: 'trial1', name: 'Jacob Martinez', startDate: '2026-08-15'},
    {id: 'trial2', name: 'Aurora Silva', startDate: '2026-08-18'}
  ],
  certCompetitive: [
    {id: 'cert1', name: 'Carlos Reyes', level: 'Team Leader', targetDate: '2026-09-30'},
    {id: 'cert2', name: 'Nestor Campos', level: 'Trainer', targetDate: '2026-10-15'}
  ],
  celebrations: [
    {id: 'celeb1', name: 'Ki Rodriguez', date: '08-15', type: 'birthday'},
    {id: 'celeb2', name: 'Traci Danmeyer', date: '08-22', type: 'anniversary'},
    {id: 'celeb3', name: 'Ashley Ramirez', date: '08-28', type: 'birthday'}
  ],
  lastUpdated: null
};

let txData = JSON.parse(JSON.stringify(defaultTXData));

// HOME PAGE DATA
const truettQuotes = [
  {text: "Pressurized jobs create pressurized people. That's not what we want to be.", author: "Truett Cathy"},
  {text: "Be a servant leader. It's not about being the boss. It's about serving others.", author: "Truett Cathy"},
  {text: "Opportunity doesn't come to those who wait. It comes to those who go out and find it.", author: "Truett Cathy"},
  {text: "Make a difference in the lives of those around you. That's what it's all about.", author: "Truett Cathy"},
  {text: "Keep the main thing, the main thing.", author: "Truett Cathy"},
  {text: "My decision to operate on Sunday was perhaps the toughest thing I've ever had to do.", author: "Truett Cathy"},
  {text: "Great businesses are built on relationships, not transactions.", author: "Truett Cathy"},
  {text: "If you don't have time to do it right, when will you have time to do it over?", author: "Truett Cathy"},
  {text: "We are not in the chicken business; we're in the people business.", author: "Truett Cathy"},
  {text: "The greatest legacy we can leave is not money, but people who have been transformed by our investment in them.", author: "Truett Cathy"}
];

const motivationalMessages = [
  {text: "Today is a new opportunity to win hearts.", author: "— Team"},
  {text: "Excellence is not a destination; it's a journey.", author: "— Team"},
  {text: "Every guest interaction is a chance to create a moment that matters.", author: "— Team"},
  {text: "We rise by lifting others.", author: "— Team"},
  {text: "Your effort today is the stepping stone to tomorrow's success.", author: "— Team"}
];

const defaultHomeData = {
  vision: "***To be the most caring brand in Buda!***\n\nTo give back more, we are focused on growing our influence within our team, business and community through caring!",
  mission: "***WINNING HEARTS EVERY DAY***\n\nWe want to create and foster a culture of connecting every team member's everyday to the shared mission of winning hearts every day.",
  values: "• ***Hospitality*** — Serving with warmth, care, and an others-first mindset. Making everyone feel seen, valued, and welcomed.\n• ***Hustle*** — Working with urgency, energy, and focus. Moving fast without rushing, and striving for excellence.\n• ***Humility*** — Being receptive to feedback with a team-first mindset. Eager to grow while choosing integrity and putting others before self.",
  wins: [
    {id: 'win1', name: 'Casey', role: 'Executive', content: ''},
    {id: 'win2', name: 'Ki', role: 'BOH Director', content: ''},
    {id: 'win3', name: 'Tim', role: 'FOH Director', content: ''}
  ],
  lastUpdated: null
};

let homeData = JSON.parse(JSON.stringify(defaultHomeData));

