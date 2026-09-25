// ===== PREP BOARD =====
// Ported from a standalone artifact Tim built (cold-side prep station: salads, wraps,
// fruit cups, parfaits). Same bucket-mapping/build-to math as the original, reimplemented
// as plain JS/DOM template rendering to match this app's pattern (see trainer-trial.js),
// and persisted through this app's real Firebase-backed saveState()/loadState() instead of
// the artifact's own window.claude db. Scope stays cold-side-only for this pass — see TIM-10.

const PB_DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const PB_DEFAULT_BUFFERS = { Monday:10, Tuesday:10, Wednesday:10, Thursday:10, Friday:10, Saturday:0 };
const PB_WASTE_RATIO_HIGH = 0.20;
const PB_WASTE_RATIO_LOW = 0.02;

// Real sold-count history from the board's original paper trail (two weeks per day,
// Aug 31 - Sept 12 2026). Seeded once into prepSoldEntries the first time this app loads
// with no prep data on file, so build-to numbers aren't starting from zero.
const PB_SEED_HISTORY = {
  Monday: [
    { label:'Sept 7', items:{ "Salad, Cobb w/ Nuggets":59,"Fruit Cup, Medium":51,"Berry Parfait, Granola":45,"Fruit Cup, Small":41,"Wrap, Grilled Chicken Cool":32,"Kale Crunch Side, Large":31,"Salad, Spicy SW w/ Spcy Grld Filet (Cold)":21,"CFA Side Salad":18,"Salad, Mkt w/ Grilled Filet (Cold)":13,"Spicy Cool Wrap (Spicy Southwest Chicken)":10,"Wrap, Veggie":10,"Salad, Cobb w/ Grld Nuggets":8,"Berry Parfait, Cookie":7,"Salad, Cobb w/Spicy Filet":7,"Salad, Spicy SW w/ Nuggets":5,"Fruit Cup, Large":4,"Salad, Spicy SW w/Spicy Filet":4,"Salad, Cobb w/ Grilled Filet (Warm)":3,"Salad, Cobb w/ Spicy Grld Filet (Cold)":2,"Salad, Mkt Base":1,"Salad, Mkt w/ Nuggets":1,"Salad, Mkt w/ Spicy Filet":1,"Salad, Spicy SW Base":1,"Salad, Spicy SW w/ Grld Nuggets":1 } },
    { label:'Aug 31', items:{ "Salad, Cobb w/ Nuggets":70,"Fruit Cup, Medium":48,"Fruit Cup, Small":40,"Berry Parfait, Granola":38,"Wrap, Grilled Chicken Cool":35,"Kale Crunch Side, Large":30,"Salad, Spicy SW w/ Spcy Grld Filet (Cold)":29,"CFA Side Salad":20,"Salad, Mkt w/ Grilled Filet (Cold)":20,"Berry Parfait, Cookie":14,"Spicy Cool Wrap (Spicy Southwest Chicken)":14,"Fruit Cup, Large":7,"Salad, Cobb w/Spicy Filet":7,"Salad, Cobb w/ Grld Nuggets":4,"Salad, Spicy SW w/Spicy Filet":3,"Wrap, Veggie":3,"Salad, Cobb w/ Grilled Filet (Cold)":2,"Salad, Mkt w/ Spicy Grld Filet (Cold)":2,"Salad, Spicy SW w/ Nuggets":2,"Salad, Cobb w/ Grilled Filet (Warm)":1,"Salad, Cobb w/ Spicy Grld Filet (Cold)":1,"Salad, Cobb w/ Strips":1,"Salad, Mkt w/ CFA Filet":1,"Salad, Mkt w/ Grld Nuggets":1,"Salad, Mkt w/ Nuggets":1,"Salad, Mkt w/ Spicy Filet":1,"Salad, Spicy SW Base":1,"Salad, Spicy SW w/ CFA Filet":1 } }
  ],
  Tuesday: [
    { label:'Sept 8', items:{ "Salad, Cobb w/ Nuggets":67,"Fruit Cup, Medium":51,"Berry Parfait, Granola":43,"Fruit Cup, Small":29,"Salad, Spicy SW w/ Spcy Grld Filet (Cold)":27,"Wrap, Grilled Chicken Cool":22,"Spicy Cool Wrap (Spicy Southwest Chicken)":21,"Kale Crunch Side, Large":20,"CFA Side Salad":19,"Salad, Mkt w/ Grilled Filet (Cold)":15,"Salad, Cobb w/ Grld Nuggets":8,"Salad, Cobb w/Spicy Filet":6,"Fruit Cup, Large":5,"Berry Parfait, Cookie":3,"Salad, Mkt w/ Nuggets":3,"Salad, Spicy SW w/Spicy Filet":3,"Salad, Cobb w/ Grilled Filet (Warm)":2,"Salad, Cobb w/ Spicy Grld Filet (Cold)":2,"Salad, Mkt w/ Grld Nuggets":2,"Salad, Spicy SW w/ Nuggets":2,"Salad, Cobb w/ CFA Filet":1,"Salad, Cobb w/ Grilled Filet (Cold)":1,"Salad, Cobb w/ Strips":1,"Salad, Spicy SW w/ CFA Filet":1,"Salad, Spicy SW w/ Grilled Filet (Warm)":1,"Salad, Spicy SW w/ Grld Nuggets":1,"Wrap, Veggie":1 } },
    { label:'Sept 1', items:{ "Fruit Cup, Medium":58,"Salad, Cobb w/ Nuggets":52,"Berry Parfait, Granola":47,"Wrap, Grilled Chicken Cool":37,"Fruit Cup, Small":30,"CFA Side Salad":28,"Kale Crunch Side, Large":28,"Salad, Spicy SW w/ Spcy Grld Filet (Cold)":24,"Salad, Mkt w/ Grilled Filet (Cold)":23,"Spicy Cool Wrap (Spicy Southwest Chicken)":13,"Salad, Cobb w/ Grld Nuggets":10,"Berry Parfait, Cookie":8,"Fruit Cup, Large":7,"Salad, Cobb w/Spicy Filet":4,"Salad, Cobb w/ Spicy Grld Filet (Cold)":3,"Salad, Spicy SW w/Spicy Filet":3,"Salad, Cobb w/ CFA Filet":2,"Salad, Cobb w/ Grilled Filet (Cold)":2,"Salad, Mkt w/ Grld Nuggets":2,"Salad, Spicy SW w/ Grilled Filet (Warm)":2,"Salad, Cobb w/ Strips":1,"Salad, Mkt w/ CFA Filet":1,"Salad, Mkt w/ Nuggets":1,"Salad, Mkt w/ Spicy Grld Filet (Cold)":1,"Salad, Spicy SW Base":1,"Salad, Spicy SW w/ Grilled Filet (Cold)":1,"Salad, Spicy SW w/ Strips":1,"Wrap, Veggie":1 } }
  ],
  Wednesday: [
    { label:'Sept 9', items:{ "Salad, Cobb w/ Nuggets":68,"Fruit Cup, Medium":52,"Fruit Cup, Small":40,"Berry Parfait, Granola":38,"Salad, Spicy SW w/ Spcy Grld Filet (Cold)":36,"Wrap, Grilled Chicken Cool":32,"Kale Crunch Side, Large":23,"CFA Side Salad":15,"Salad, Mkt w/ Grilled Filet (Cold)":15,"Fruit Cup, Large":11,"Salad, Cobb w/ Grld Nuggets":11,"Spicy Cool Wrap (Spicy Southwest Chicken)":10,"Berry Parfait, Cookie":9,"Salad, Cobb w/Spicy Filet":9,"Salad, Cobb w/ Grilled Filet (Cold)":4,"Salad, Mkt w/ Nuggets":4,"Salad, Spicy SW w/ Grilled Filet (Warm)":4,"Salad, Cobb w/ Spicy Grld Filet (Cold)":3,"Salad, Mkt w/ Grld Nuggets":3,"Salad, Spicy SW w/Spicy Filet":3,"Wrap, Veggie":2,"Salad, Cobb w/ Grilled Filet (Warm)":1,"Salad, Mkt Base":1,"Salad, Mkt w/ Spicy Filet":1,"Salad, Spicy SW Base":1,"Salad, Spicy SW w/ Grld Nuggets":1,"Salad, Spicy SW w/ Strips":1 } },
    { label:'Sept 2', items:{ "Salad, Cobb w/ Nuggets":68,"Berry Parfait, Granola":61,"Fruit Cup, Medium":46,"Fruit Cup, Small":41,"Kale Crunch Side, Large":35,"Wrap, Grilled Chicken Cool":35,"Salad, Mkt w/ Grilled Filet (Cold)":19,"Salad, Spicy SW w/ Spcy Grld Filet (Cold)":18,"Spicy Cool Wrap (Spicy Southwest Chicken)":18,"CFA Side Salad":15,"Berry Parfait, Cookie":12,"Salad, Cobb w/ Grld Nuggets":8,"Salad, Cobb w/Spicy Filet":5,"Salad, Spicy SW w/ Nuggets":5,"Wrap, Veggie":4,"Fruit Cup, Large":2,"Salad, Cobb w/ Grilled Filet (Cold)":2,"Salad, Cobb w/ Grilled Filet (Warm)":2,"Salad, Mkt w/ Nuggets":2,"Salad, Cobb w/ Strips":1,"Salad, Mkt w/ Spicy Grld Filet (Cold)":1,"Salad, Mkt w/ Strips":1,"Salad, Spicy SW w/ Strips":1,"Salad, Spicy SW w/Spicy Filet":1 } }
  ],
  Thursday: [
    { label:'Sept 10', items:{ "Fruit Cup, Medium":54,"Salad, Cobb w/ Nuggets":53,"Fruit Cup, Small":49,"Berry Parfait, Granola":44,"Kale Crunch Side, Large":40,"Salad, Spicy SW w/ Spcy Grld Filet (Cold)":34,"Wrap, Grilled Chicken Cool":34,"Spicy Cool Wrap (Spicy Southwest Chicken)":22,"CFA Side Salad":19,"Salad, Mkt w/ Grilled Filet (Cold)":18,"Berry Parfait, Cookie":11,"Fruit Cup, Large":9,"Salad, Cobb w/ Grld Nuggets":5,"Salad, Cobb w/ Spicy Grld Filet (Cold)":5,"Salad, Cobb w/Spicy Filet":4,"Salad, Mkt w/ Grilled Filet (Warm)":4,"Salad, Spicy SW w/Spicy Filet":4,"Salad, Cobb w/ Grilled Filet (Cold)":2,"Salad, Mkt w/ CFA Filet":2,"Salad, Mkt w/ Nuggets":2,"Salad, Spicy SW w/ Grilled Filet (Warm)":2,"Salad, Spicy SW w/ Nuggets":2,"Salad, Cobb w/ CFA Filet":1,"Salad, Mkt w/ Grld Nuggets":1,"Salad, Spicy SW w/ Grilled Filet (Cold)":1 } },
    { label:'Sept 3', items:{ "Salad, Cobb w/ Nuggets":82,"Berry Parfait, Granola":63,"Fruit Cup, Medium":60,"Fruit Cup, Small":53,"Kale Crunch Side, Large":41,"Salad, Spicy SW w/ Spcy Grld Filet (Cold)":40,"Wrap, Grilled Chicken Cool":27,"CFA Side Salad":19,"Salad, Mkt w/ Grilled Filet (Cold)":15,"Spicy Cool Wrap (Spicy Southwest Chicken)":15,"Salad, Cobb w/Spicy Filet":12,"Berry Parfait, Cookie":10,"Fruit Cup, Large":7,"Salad, Cobb w/ Grld Nuggets":6,"Salad, Mkt w/ CFA Filet":3,"Salad, Mkt w/ Grld Nuggets":3,"Salad, Mkt w/ Strips":2,"Salad, Spicy SW w/ Nuggets":2,"Wrap, Veggie":2,"Salad, Cobb w/ Grilled Filet (Cold)":1,"Salad, Cobb w/ Grilled Filet (Warm)":1,"Salad, Cobb w/ Spicy Grld Filet (Cold)":1,"Salad, Mkt w/ Grilled Filet (Warm)":1,"Salad, Mkt w/ Nuggets":1,"Salad, Mkt w/ Spicy Filet":1,"Salad, Spicy SW w/ Grld Nuggets":1,"Salad, Spicy SW w/ Strips":1,"Salad, Spicy SW w/Spicy Filet":1 } }
  ],
  Friday: [
    { label:'Sept 11', items:{ "Salad, Cobb w/ Nuggets":78,"Fruit Cup, Medium":73,"Fruit Cup, Small":68,"Berry Parfait, Granola":54,"Wrap, Grilled Chicken Cool":47,"Salad, Spicy SW w/ Spcy Grld Filet (Cold)":30,"Kale Crunch Side, Large":22,"Salad, Mkt w/ Grilled Filet (Cold)":16,"Spicy Cool Wrap (Spicy Southwest Chicken)":15,"CFA Side Salad":14,"Berry Parfait, Cookie":12,"Fruit Cup, Large":11,"Salad, Cobb w/ Grld Nuggets":5,"Salad, Spicy SW w/Spicy Filet":5,"Wrap, Veggie":5,"Salad, Cobb w/ Grilled Filet (Warm)":4,"Salad, Cobb Base":3,"Salad, Cobb w/ Grilled Filet (Cold)":3,"Salad, Cobb w/Spicy Filet":3,"Salad, Mkt w/ Nuggets":2,"Salad, Spicy SW w/ Strips":2,"Salad, Mkt Base":1,"Salad, Mkt w/ CFA Filet":1,"Salad, Mkt w/ Grld Nuggets":1,"Salad, Mkt w/ Spicy Filet":1,"Salad, Mkt w/ Spicy Grld Filet (Cold)":1,"Salad, Mkt w/ Strips":1,"Salad, Spicy SW w/ Grilled Filet (Warm)":1,"Salad, Spicy SW w/ Grld Nuggets":1 } },
    { label:'Sept 4', items:{ "Salad, Cobb w/ Nuggets":89,"Berry Parfait, Granola":66,"Fruit Cup, Medium":61,"Fruit Cup, Small":48,"Salad, Spicy SW w/ Spcy Grld Filet (Cold)":39,"Kale Crunch Side, Large":38,"Wrap, Grilled Chicken Cool":34,"CFA Side Salad":24,"Spicy Cool Wrap (Spicy Southwest Chicken)":18,"Salad, Mkt w/ Grilled Filet (Cold)":16,"Berry Parfait, Cookie":13,"Fruit Cup, Large":13,"Salad, Cobb w/ Grld Nuggets":8,"Salad, Cobb w/Spicy Filet":5,"Salad, Cobb w/ Grilled Filet (Cold)":4,"Salad, Spicy SW w/ Strips":3,"Salad, Spicy SW w/Spicy Filet":3,"Salad, Cobb w/ Spicy Grld Filet (Cold)":2,"Salad, Mkt w/ CFA Filet":2,"Salad, Mkt w/ Nuggets":2,"Salad, Spicy SW w/ CFA Filet":2,"Salad, Cobb w/ CFA Filet":1,"Salad, Mkt Base":1,"Salad, Mkt w/ Grld Nuggets":1,"Salad, Mkt w/ Spicy Grld Filet (Cold)":1,"Salad, Mkt w/ Strips":1,"Salad, Spicy SW Base":1,"Salad, Spicy SW w/ Grilled Filet (Cold)":1,"Salad, Spicy SW w/ Nuggets":1 } }
  ],
  Saturday: [
    { label:'Sept 12', items:{ "Salad, Cobb w/ Nuggets":62,"Fruit Cup, Small":52,"Berry Parfait, Granola":47,"Wrap, Grilled Chicken Cool":44,"Fruit Cup, Medium":39,"Salad, Spicy SW w/ Spcy Grld Filet (Cold)":23,"Spicy Cool Wrap (Spicy Southwest Chicken)":19,"Kale Crunch Side, Large":17,"Fruit Cup, Large":11,"Berry Parfait, Cookie":9,"CFA Side Salad":9,"Salad, Cobb w/ Grld Nuggets":7,"Salad, Mkt w/ Grilled Filet (Cold)":6,"Salad, Spicy SW w/ Grilled Filet (Warm)":3,"Salad, Spicy SW w/ Nuggets":3,"Salad, Mkt Base":2,"Salad, Spicy SW w/ CFA Filet":2,"Salad, Spicy SW w/ Grilled Filet (Cold)":2,"Salad, Spicy SW w/ Grld Nuggets":2,"Wrap, Veggie":2,"Salad, Cobb w/ Grilled Filet (Cold)":1,"Salad, Cobb w/ Grilled Filet (Warm)":1,"Salad, Cobb w/ Spicy Grld Filet (Cold)":1,"Salad, Mkt w/ Grilled Filet (Warm)":1,"Salad, Mkt w/ Grld Nuggets":1,"Salad, Mkt w/ Nuggets":1 } },
    { label:'Sept 5', items:{ "Fruit Cup, Medium":64,"Fruit Cup, Small":54,"Berry Parfait, Granola":49,"Salad, Cobb w/ Nuggets":48,"Wrap, Grilled Chicken Cool":37,"Salad, Spicy SW w/ Spcy Grld Filet (Cold)":25,"CFA Side Salad":18,"Salad, Mkt w/ Grilled Filet (Cold)":16,"Kale Crunch Side, Large":15,"Berry Parfait, Cookie":14,"Spicy Cool Wrap (Spicy Southwest Chicken)":8,"Fruit Cup, Large":7,"Salad, Cobb w/ Grld Nuggets":6,"Salad, Cobb w/Spicy Filet":6,"Salad, Spicy SW w/ Nuggets":4,"Salad, Cobb w/ Grilled Filet (Warm)":3,"Salad, Spicy SW w/Spicy Filet":3,"Salad, Mkt w/ Nuggets":2,"Salad, Cobb w/ Spicy Grld Filet (Cold)":1,"Salad, Mkt w/ Spicy Filet":1,"Salad, Spicy SW w/ Grld Nuggets":1,"Salad, Spicy SW w/ Strips":1 } }
  ]
};

const PB_CATEGORY_OF_BUCKET = {
  'Cobb Salad': 'Salads',
  'Mkt Salad — Grilled Filet (Cold)': 'Salads',
  'Mkt Salad — Other Chicken': 'Salads',
  'Spicy SW Salad — Spicy Grilled Filet (Cold)': 'Salads',
  'Spicy SW Salad — Other Chicken': 'Salads',
  'Side Salad': 'Salads',
  'Kale Salad': 'Salads',
  'Regular Cool Wrap': 'Wraps',
  'Spicy Wrap': 'Wraps',
  'Veggie Wrap': 'Wraps',
  'Fruit Cup, Small': 'Sides',
  'Fruit Cup, Medium': 'Sides',
  'Fruit Cup, Large': 'Sides',
  'Fruit Cup, Other Size': 'Sides',
  'Parfait': 'Sides'
};

// persisted
let prepBuffers = Object.assign({}, PB_DEFAULT_BUFFERS);
let prepSoldEntries = [];
let prepWasteEntries = [];
let prepStockoutEvents = [];
let prepHistorySeeded = false;

// session-only
let pbCurrentDay = 'Monday';
let pbCurrentDate = null;      // Build-To target date (ISO); defaults to the next open day
let pbTrendItem = null;        // item picked in Insights → Sales over time
let pbDatesMigrated = false;
let pbCurrentPage = 'buildto';
let pbDismissedSuggestions = {};
let pbInsightItem = null;
let pbAddPanelOpen = false;
let pbWastePanelOpen = false;

function pbUid(){
  return 'pb' + Date.now() + Math.random().toString(36).slice(2, 8);
}

async function pbSeedHistoryIfNeeded(){
  if(prepHistorySeeded) return;
  PB_DAYS.forEach(day => {
    (PB_SEED_HISTORY[day] || []).forEach(entry => {
      prepSoldEntries.push({ id: pbUid(), day, label: entry.label, items: entry.items, source: 'manual' });
    });
  });
  prepHistorySeeded = true;
  await saveState();
}

function pbMapToTrackedItem(rawName){
  const l = rawName.trim().toLowerCase();
  if(l.startsWith('fruit cup')){
    if(l.includes('small')) return 'Fruit Cup, Small';
    if(l.includes('medium')) return 'Fruit Cup, Medium';
    if(l.includes('large')) return 'Fruit Cup, Large';
    return 'Fruit Cup, Other Size';
  }
  if(l.includes('parfait')) return 'Parfait';
  if(l.includes('kale')) return 'Kale Salad';
  if(l.includes('side salad')) return 'Side Salad';
  if(l.includes('wrap')){
    if(l.includes('spicy')) return 'Spicy Wrap';
    if(l.includes('veggie')) return 'Veggie Wrap';
    return 'Regular Cool Wrap';
  }
  if(l.includes('cobb')) return 'Cobb Salad';
  if(l.includes('mkt')){
    if(l.includes('grilled filet (cold)')) return 'Mkt Salad — Grilled Filet (Cold)';
    return 'Mkt Salad — Other Chicken';
  }
  if(l.includes('spicy sw')){
    if(l.includes('spcy grld filet (cold)') || l.includes('spicy grilled filet (cold)') || l.includes('spcy grilled filet (cold)')){
      return 'Spicy SW Salad — Spicy Grilled Filet (Cold)';
    }
    return 'Spicy SW Salad — Other Chicken';
  }
  return 'Unmapped: ' + rawName;
}
function pbCategoryOf(bucket){ return PB_CATEGORY_OF_BUCKET[bucket] || 'Other'; }

function pbBucketTotals(entry){
  const out = {};
  Object.keys(entry.items || {}).forEach(rawName => {
    const bucket = pbMapToTrackedItem(rawName);
    out[bucket] = (out[bucket] || 0) + (entry.items[rawName] || 0);
  });
  return out;
}

function pbEntriesFor(list, day){ return list.filter(e => e.day === day); }

// ---------- dates ----------
// Every sold/waste entry carries a real calendar date (ISO "YYYY-MM-DD"), so
// build-to numbers can follow the season instead of treating every Monday of
// the year the same. `day` (weekday name) is kept alongside for the per-weekday
// buffers and history lists.

const PB_WEEKDAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const PB_MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function pbDateFromISO(iso){ const p = iso.split('-').map(Number); return new Date(p[0], p[1]-1, p[2]); }
function pbAddDays(iso, n){ const d = pbDateFromISO(iso); d.setDate(d.getDate() + n); return toLocalISODate(d); }
function pbDaysBetween(aISO, bISO){ return Math.round((pbDateFromISO(bISO) - pbDateFromISO(aISO)) / 86400000); }
function pbWeekdayOf(iso){ return PB_WEEKDAY_NAMES[pbDateFromISO(iso).getDay()]; }
function pbFormatDate(iso, opts){
  const d = pbDateFromISO(iso);
  const base = (opts && opts.weekday === false ? '' : PB_WEEKDAY_NAMES[d.getDay()].slice(0,3) + ', ') + PB_MONTHS_SHORT[d.getMonth()] + ' ' + d.getDate();
  return (opts && opts.year) ? base + ', ' + d.getFullYear() : base;
}
// Sold/waste uploads default to yesterday (skipping Sunday — the store is closed).
function pbDefaultEntryDate(){
  let iso = pbAddDays(today, -1);
  if(pbWeekdayOf(iso) === 'Sunday') iso = pbAddDays(iso, -1);
  return iso;
}
// Build-To defaults to today, or Monday when today is Sunday.
function pbDefaultPrepDate(){
  return pbWeekdayOf(today) === 'Sunday' ? pbAddDays(today, 1) : today;
}

// Older entries only had a weekday and a free-text label like "Sept 7". Give
// them a real date when the label parses to that weekday this year or last.
function pbInferDateFromLabel(label, day){
  if(!label || !day) return null;
  const year = pbDateFromISO(today).getFullYear();
  for(const y of [year, year - 1]){
    const d = new Date(String(label).replace(/\bSept\b/i, 'Sep') + ' ' + y);
    if(isNaN(d.getTime())) continue;
    const iso = toLocalISODate(d);
    if(iso <= today && PB_WEEKDAY_NAMES[d.getDay()] === day) return iso;
  }
  return null;
}

function pbMigrateEntryDates(){
  let changed = false;
  [prepSoldEntries, prepWasteEntries].forEach(list => list.forEach(e => {
    if(e.date) return;
    const iso = pbInferDateFromLabel(e.label, e.day);
    if(iso){ e.date = iso; changed = true; }
  }));
  return changed;
}

// Newest first, undated entries last.
function pbSortByDateDesc(list){
  return list.slice().sort((a,b) => (b.date || '').localeCompare(a.date || ''));
}

// ---------- forecasting ----------
// Build-to for a specific date = recent level × seasonal factor × (1 + buffer).
//  • Recent level: the last PB_RECENT_COUNT same-weekday days before the date,
//    newer weeks weighted more (half-life PB_HALF_LIFE_WEEKS).
//  • Seasonal factor: how sales moved LAST YEAR from those same recent weeks to
//    the weeks around this date (±PB_SEASON_WINDOW_DAYS). Needs a year of dated
//    history; until then the factor is 1 and the sheet says so.
const PB_RECENT_COUNT = 6;
const PB_HALF_LIFE_WEEKS = 4;
const PB_SEASON_WINDOW_DAYS = 21;
const PB_SEASON_MIN_DAYS = 2;
const PB_SEASON_CLAMP = [0.5, 2];

function pbAvgFor(entries, bucket){
  if(entries.length === 0) return null;
  return entries.reduce((sum, e) => sum + (pbBucketTotals(e)[bucket] || 0), 0) / entries.length;
}

function pbForecast(targetISO){
  const weekday = pbWeekdayOf(targetISO);
  const bufferPct = prepBuffers[weekday] != null ? prepBuffers[weekday] : 10;
  const sameDay = prepSoldEntries.filter(e => e.day === weekday);
  const dated = pbSortByDateDesc(sameDay.filter(e => e.date && e.date < targetISO));
  const recent = dated.slice(0, PB_RECENT_COUNT);
  // With no dated history yet, fall back to a plain average of whatever is on file.
  const basis = recent.length ? recent : sameDay;
  const weights = basis.map(e => recent.length ? Math.pow(0.5, (pbDaysBetween(e.date, targetISO) / 7) / PB_HALF_LIFE_WEEKS) : 1);
  const weightSum = weights.reduce((a,b) => a+b, 0);

  // Last year's matching windows (364 days = 52 weeks, so weekdays line up).
  const allDated = sameDay.filter(e => e.date);
  const lyTarget = pbAddDays(targetISO, -364);
  const seasonEntries = allDated.filter(e => Math.abs(pbDaysBetween(e.date, lyTarget)) <= PB_SEASON_WINDOW_DAYS);
  let refEntries = [];
  if(recent.length){
    const refFrom = pbAddDays(recent[recent.length-1].date, -364 - 3);
    const refTo = pbAddDays(recent[0].date, -364 + 3);
    refEntries = allDated.filter(e => e.date >= refFrom && e.date <= refTo);
  }
  const seasonal = seasonEntries.length >= PB_SEASON_MIN_DAYS && refEntries.length >= PB_SEASON_MIN_DAYS;
  const lastYearDay = allDated.find(e => Math.abs(pbDaysBetween(e.date, lyTarget)) <= 3) || null;

  const buckets = {};
  basis.forEach(e => Object.keys(pbBucketTotals(e)).forEach(b => { buckets[b] = true; }));
  const wasteForDay = pbEntriesFor(prepWasteEntries, weekday);

  const stats = Object.keys(buckets).map(bucket => {
    const level = weightSum ? basis.reduce((sum, e, i) => sum + weights[i] * (pbBucketTotals(e)[bucket] || 0), 0) / weightSum : 0;
    let factor = 1;
    if(seasonal){
      const aSeason = pbAvgFor(seasonEntries, bucket), aRef = pbAvgFor(refEntries, bucket);
      if(aRef > 0) factor = Math.min(PB_SEASON_CLAMP[1], Math.max(PB_SEASON_CLAMP[0], aSeason / aRef));
    }
    const forecast = level * factor;
    const wasteAvg = wasteForDay.length ? pbAvgFor(wasteForDay, bucket) : null;
    return {
      name: bucket, category: pbCategoryOf(bucket), level, factor, forecast,
      buildTo: Math.ceil(forecast * (1 + bufferPct / 100)),
      n: basis.length, wasteAvg,
      lastYear: lastYearDay ? (pbBucketTotals(lastYearDay)[bucket] || 0) : null
    };
  }).sort((a,b) => b.buildTo - a.buildTo);

  return {
    stats, weekday, bufferPct, n: basis.length, usingDated: recent.length > 0,
    seasonal, seasonDays: seasonEntries.length, lyTarget,
    lastYearDate: lastYearDay ? lastYearDay.date : null
  };
}

function pbConfidenceClass(n){
  if(n >= 3) return 'n3plus';
  if(n === 2) return 'n2';
  return 'n1';
}

function pbComputeSuggestion(day){
  const sold = pbEntriesFor(prepSoldEntries, day);
  const waste = pbEntriesFor(prepWasteEntries, day);
  if(waste.length < 3) return null;
  function sumAll(list){
    let total = 0;
    list.forEach(e => Object.keys(e.items || {}).forEach(k => { total += (e.items[k] || 0); }));
    return total;
  }
  const soldTotal = sumAll(sold);
  const wasteTotal = sumAll(waste);
  if(soldTotal <= 0) return null;
  const ratio = wasteTotal / soldTotal;
  const current = prepBuffers[day] != null ? prepBuffers[day] : 10;
  let suggested = null, reason = '';
  if(ratio >= PB_WASTE_RATIO_HIGH){
    suggested = Math.max(0, current - 5);
    reason = 'Waste is running about ' + Math.round(ratio*100) + '% of what you sold — consider trimming the buffer.';
  } else if(ratio <= PB_WASTE_RATIO_LOW && current < 15){
    suggested = Math.min(100, current + 5);
    reason = 'Waste is very low (about ' + Math.round(ratio*100) + '%) — if you’re running short, a slightly higher buffer may help.';
  }
  if(suggested === null || suggested === current) return null;
  return { suggested, current, reason, ratio, wasteEntries: waste.length };
}

function pbParsePaste(text){
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const counts = {};
  let skipped = 0;
  lines.forEach(line => {
    const cells = line.split('\t');
    if(cells.length < 2) return;
    const name = cells[0].trim();
    const count = parseFloat(cells[1]);
    if(!name || isNaN(count)) return;
    if(name.toLowerCase() === 'menu level') return;
    const l = name.toLowerCase();
    if((l.includes('salad') || l.includes('wrap') || l.includes('fruit cup') || l.includes('kale crunch') || l.includes('parfait')) && !l.includes('add-on') && !l.includes('tray')){
      counts[name] = count;
    } else {
      skipped++;
    }
  });
  return { counts, skipped };
}

function pbIsTrackedName(name){
  const l = String(name).trim().toLowerCase();
  return (l.includes('salad') || l.includes('wrap') || l.includes('fruit cup') || l.includes('kale crunch') || l.includes('parfait'))
    && !l.includes('add-on') && !l.includes('tray');
}

const PB_IMPORT_NAME_HINTS = /(item|product|menu|name)/;
const PB_IMPORT_COUNT_HINTS = /(qty|quantity|count|sold|units|waste|thrown|amount)/;
const PB_IMPORT_DAY_HINTS = /(day|date)/;
const PB_DAY_NAME_MAP = { sun:'Sunday', mon:'Monday', tue:'Tuesday', wed:'Wednesday', thu:'Thursday', fri:'Friday', sat:'Saturday' };

// A date cell → ISO date. Full dates are used as-is (a year-less "Sep 14" is
// taken as its most recent occurrence); a bare weekday ("Mon") becomes that
// weekday on or before `anchorISO` — the date picked for the upload.
function pbResolveDateFromValue(val, anchorISO){
  if(val == null || val === '') return null;
  const s = String(val).trim();
  const abbr = s.slice(0,3).toLowerCase();
  if(PB_DAY_NAME_MAP[abbr] && /^[a-z]+\.?$/i.test(s)){
    const target = PB_DAY_NAME_MAP[abbr];
    let iso = anchorISO;
    for(let i = 0; i < 7 && pbWeekdayOf(iso) !== target; i++) iso = pbAddDays(iso, -1);
    return iso;
  }
  const hasYear = /\b\d{4}\b|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/.test(s);
  if(hasYear){
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : toLocalISODate(d);
  }
  const year = pbDateFromISO(anchorISO).getFullYear();
  for(const y of [year, year - 1]){
    const d = new Date(s.replace(/\bSept\b/i, 'Sep') + ' ' + y);
    if(!isNaN(d.getTime()) && toLocalISODate(d) <= pbAddDays(anchorISO, 1)) return toLocalISODate(d);
  }
  return null;
}

function pbDetectColumns(rows){
  if(rows.length === 0) return null;
  const header = rows[0].map(c => String(c == null ? '' : c).toLowerCase().trim());
  let nameCol = -1, countCol = -1, dayCol = -1;
  header.forEach((h, i) => {
    if(nameCol < 0 && PB_IMPORT_NAME_HINTS.test(h)) nameCol = i;
    if(countCol < 0 && PB_IMPORT_COUNT_HINTS.test(h)) countCol = i;
    if(dayCol < 0 && PB_IMPORT_DAY_HINTS.test(h)) dayCol = i;
  });
  const headerLooksLikeData = nameCol < 0 && countCol < 0 && dayCol < 0;
  const dataStart = headerLooksLikeData ? 0 : 1;
  if(nameCol < 0) nameCol = 0;
  if(countCol < 0){
    const width = Math.max.apply(null, rows.map(r => r.length));
    let best = -1, bestScore = -1;
    for(let c = 0; c < width; c++){
      if(c === nameCol || c === dayCol) continue;
      let score = 0;
      for(let r = dataStart; r < rows.length; r++){
        const v = rows[r][c];
        if(v !== '' && v != null && !isNaN(parseFloat(v))) score++;
      }
      if(score > bestScore){ bestScore = score; best = c; }
    }
    countCol = best;
  }
  return { nameCol, countCol, dayCol, dataStart };
}

// Groups a sheet's rows by calendar date. Rows without a usable date column
// fall back to `fallbackISO` (the date picked in the panel). Sunday rows are
// skipped — the store is closed.
function pbRowsToDateEntries(rows, fallbackISO){
  const cols = pbDetectColumns(rows);
  const byDate = {};
  if(!cols || cols.countCol < 0) return { byDate, skipped: rows.length };
  let skipped = 0;
  for(let r = cols.dataStart; r < rows.length; r++){
    const row = rows[r];
    if(!row) continue;
    const rawName = row[cols.nameCol];
    const name = rawName == null ? '' : String(rawName).trim();
    const count = parseFloat(row[cols.countCol]);
    if(!name || isNaN(count) || !pbIsTrackedName(name)){ skipped++; continue; }
    let iso = fallbackISO;
    if(cols.dayCol >= 0){
      const resolved = pbResolveDateFromValue(row[cols.dayCol], fallbackISO);
      if(resolved) iso = resolved;
    }
    if(!iso || pbWeekdayOf(iso) === 'Sunday'){ skipped++; continue; }
    if(!byDate[iso]) byDate[iso] = {};
    byDate[iso][name] = (byDate[iso][name] || 0) + count;
  }
  return { byDate, skipped };
}

// Adds one dated entry per date, replacing any entry already on file for that
// date so re-uploading a day never double-counts it. Returns counts for the toast.
function pbAddDatedEntries(list, byDate, source){
  let replaced = 0, items = 0;
  Object.keys(byDate).forEach(iso => {
    const existing = list.findIndex(e => e.date === iso);
    if(existing !== -1){ list.splice(existing, 1); replaced++; }
    list.push({ id: pbUid(), date: iso, day: pbWeekdayOf(iso), label: pbFormatDate(iso, {year: true}), items: byDate[iso], source });
    items += Object.keys(byDate[iso]).length;
  });
  return { dates: Object.keys(byDate).length, replaced, items };
}

function pbReadWorkbookRows(file, cb){
  const reader = new FileReader();
  const isCSV = /\.csv$/i.test(file.name);
  reader.onload = function(e){
    try{
      let wb;
      if(isCSV){
        const text = e.target.result;
        const firstLine = text.split(/\r?\n/)[0] || '';
        const opts = { type: 'string' };
        if((firstLine.match(/\t/g) || []).length > (firstLine.match(/,/g) || []).length) opts.FS = '\t';
        wb = XLSX.read(text, opts);
      } else {
        wb = XLSX.read(e.target.result, { type: 'array' });
      }
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, blankrows: false });
      cb(null, rows);
    }catch(err){ cb(err, null); }
  };
  reader.onerror = function(){ cb(reader.error || new Error('read failed'), null); };
  if(isCSV) reader.readAsText(file); else reader.readAsArrayBuffer(file);
}

// ---------- insights math ----------

function pbStddev(arr){
  const n = arr.length;
  if(n === 0) return 0;
  const mean = arr.reduce((a,b) => a+b, 0) / n;
  const variance = arr.reduce((a,b) => a + (b-mean)*(b-mean), 0) / n;
  return Math.sqrt(variance);
}

function pbComputeVolatility(){
  const byBucket = {};
  prepSoldEntries.forEach(entry => {
    const totals = pbBucketTotals(entry);
    Object.keys(totals).forEach(b => { (byBucket[b] = byBucket[b] || []).push(totals[b]); });
  });
  const rows = [];
  Object.keys(byBucket).forEach(b => {
    const arr = byBucket[b];
    if(arr.length < 2) return;
    const mean = arr.reduce((a,c) => a+c, 0) / arr.length;
    if(mean <= 0) return;
    rows.push({ name: b, cv: pbStddev(arr) / mean, n: arr.length, mean });
  });
  rows.sort((a,b) => b.cv - a.cv);
  return rows;
}

function pbComputeWasteRatios(){
  const soldTotals = {}, wasteTotals = {};
  prepSoldEntries.forEach(e => { const t = pbBucketTotals(e); Object.keys(t).forEach(b => { soldTotals[b] = (soldTotals[b]||0) + t[b]; }); });
  prepWasteEntries.forEach(e => { const t = pbBucketTotals(e); Object.keys(t).forEach(b => { wasteTotals[b] = (wasteTotals[b]||0) + t[b]; }); });
  const rows = [];
  Object.keys(wasteTotals).forEach(b => {
    const sold = soldTotals[b] || 0;
    const waste = wasteTotals[b];
    if(sold <= 0 || waste <= 0) return;
    rows.push({ name: b, ratio: waste / sold, waste, sold });
  });
  rows.sort((a,b) => b.ratio - a.ratio);
  return rows;
}

function pbRatioStatus(ratio){
  if(ratio >= PB_WASTE_RATIO_HIGH) return { cls: 'high', label: 'high waste' };
  if(ratio <= PB_WASTE_RATIO_LOW) return { cls: 'good', label: 'low waste' };
  return { cls: 'watch', label: 'watch' };
}

function pbAllBucketNames(){
  const set = {};
  prepSoldEntries.forEach(e => Object.keys(pbBucketTotals(e)).forEach(b => { set[b] = true; }));
  prepWasteEntries.forEach(e => Object.keys(pbBucketTotals(e)).forEach(b => { set[b] = true; }));
  return Object.keys(set).sort();
}

function pbWasteTrendForBucket(bucket){
  const rows = [];
  prepWasteEntries.forEach(e => {
    const totals = pbBucketTotals(e);
    if(!(bucket in totals)) return;
    rows.push({ label: e.date ? pbFormatDate(e.date, {weekday: false}) : (e.label || e.day), value: totals[bucket], date: e.date || '' });
  });
  rows.sort((a,b) => (a.date || '9999').localeCompare(b.date || '9999'));
  return rows;
}

// Weekly sold totals for one item (weeks start Monday), oldest first.
function pbWeeklySoldForBucket(bucket){
  const weeks = {};
  prepSoldEntries.forEach(e => {
    if(!e.date) return;
    const d = pbDateFromISO(e.date);
    const monday = pbAddDays(e.date, -((d.getDay() + 6) % 7));
    if(!weeks[monday]) weeks[monday] = { value: 0, days: 0 };
    weeks[monday].value += pbBucketTotals(e)[bucket] || 0;
    weeks[monday].days++;
  });
  return Object.keys(weeks).sort().map(w => ({ label: 'wk of ' + pbFormatDate(w, {weekday: false}), value: weeks[w].value, days: weeks[w].days }));
}

const PB_SEASON_OF_MONTH = ['Winter','Winter','Spring','Spring','Spring','Summer','Summer','Summer','Fall','Fall','Fall','Winter'];

// Average sold per open day for one item, by month and by season.
function pbPeriodAveragesForBucket(bucket){
  const months = {}, seasons = {};
  prepSoldEntries.forEach(e => {
    if(!e.date) return;
    const d = pbDateFromISO(e.date);
    const v = pbBucketTotals(e)[bucket] || 0;
    const mKey = e.date.slice(0, 7);
    const sName = PB_SEASON_OF_MONTH[d.getMonth()];
    const sYear = d.getMonth() === 11 ? d.getFullYear() + 1 : d.getFullYear();
    const sKey = sYear + '-' + ['Winter','Spring','Summer','Fall'].indexOf(sName);
    (months[mKey] = months[mKey] || { total: 0, days: 0, label: PB_MONTHS_SHORT[d.getMonth()] + ' ' + d.getFullYear() });
    (seasons[sKey] = seasons[sKey] || { total: 0, days: 0, label: sName + ' ' + sYear });
    months[mKey].total += v; months[mKey].days++;
    seasons[sKey].total += v; seasons[sKey].days++;
  });
  const toRows = obj => Object.keys(obj).sort().reverse().map(k => ({ label: obj[k].label, avg: obj[k].total / obj[k].days, days: obj[k].days }));
  return { months: toRows(months), seasons: toRows(seasons) };
}

// ---------- rendering ----------

function pbTrendSvg(rows, opts){
  opts = opts || {};
  const unit = opts.unit || 'wasted';
  if(rows.length === 0) return `<div class="pb-empty">${opts.emptyText || 'No waste logged yet for this item.'}</div>`;
  const W = 600, H = 160, padL = 8, padR = 8, padT = 14, padB = 22;
  const maxV = Math.max.apply(null, rows.map(r => r.value)) || 1;
  const stepX = rows.length > 1 ? (W - padL - padR) / (rows.length - 1) : 0;
  const xAt = i => padL + stepX * i;
  const yAt = v => padT + (H - padT - padB) * (1 - v / maxV);
  const linePts = rows.map((r,i) => xAt(i) + ',' + yAt(r.value).toFixed(1)).join(' ');
  const areaPath = 'M' + xAt(0) + ',' + (H-padB) + ' L' + rows.map((r,i) => xAt(i) + ',' + yAt(r.value).toFixed(1)).join(' L') + ' L' + xAt(rows.length-1) + ',' + (H-padB) + ' Z';
  const labelIdxs = [0, Math.floor((rows.length-1)/2), rows.length-1].filter((v,i,a) => a.indexOf(v) === i);
  return `
    <svg viewBox="0 0 ${W} ${H}" class="pb-trend-svg" preserveAspectRatio="none">
      <line x1="${padL}" x2="${W-padR}" y1="${H-padB}" y2="${H-padB}" stroke="var(--border)" stroke-width="1"></line>
      <path d="${areaPath}" fill="rgba(227,28,35,0.12)" stroke="none"></path>
      <polyline points="${linePts}" fill="none" stroke="var(--cfa-red)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"></polyline>
      ${rows.map((r,i) => `<circle cx="${xAt(i)}" cy="${yAt(r.value).toFixed(1)}" r="3.5" fill="var(--cfa-white)" stroke="var(--cfa-red)" stroke-width="2"><title>${escapeHtml(r.label || r.day)} · ${r.value} ${unit}</title></circle>`).join('')}
      ${labelIdxs.map(i => `<text x="${xAt(i)}" y="${H-6}" font-size="9" fill="var(--text-tertiary)" text-anchor="${i===0?'start':(i===rows.length-1?'end':'middle')}">${escapeHtml(rows[i].label || rows[i].day)}</text>`).join('')}
    </svg>
  `;
}

function pbHbarChart(rows, opts){
  if(rows.length === 0) return `<div class="pb-empty">${opts.emptyText}</div>`;
  const maxValue = Math.max.apply(null, rows.map(opts.valueFn));
  return `<div class="pb-hbar-list">${rows.map(row => {
    const value = opts.valueFn(row);
    const pct = maxValue > 0 ? Math.max(3, (value / maxValue) * 100) : 0;
    return `
      <div class="pb-hbar-row">
        <div class="pb-hbar-label" title="${escapeHtml(row.name)}">${escapeHtml(row.name)}</div>
        <div class="pb-hbar-track"><div class="pb-hbar-fill" style="width:${pct}%;background:${opts.fillColor(row, value, maxValue)};"></div></div>
        <div class="pb-hbar-sub">${opts.subHtml(row)}</div>
        <div class="pb-hbar-value">${opts.valueLabel(row, value)}</div>
      </div>
    `;
  }).join('')}</div>`;
}

function pbDayNavHtml(){
  return `<nav class="pb-days">${PB_DAYS.map(d => {
    const buf = prepBuffers[d] != null ? prepBuffers[d] : 10;
    return `<button class="pb-day-btn ${d===pbCurrentDay?'active':''}" data-pb-select-day="${d}">${d.slice(0,3)}<span class="pb-buf-tag">${buf}%</span></button>`;
  }).join('')}</nav>`;
}

// Build-To picks a calendar date: the next six open days, or any date via the picker.
function pbDateNavHtml(){
  const days = [];
  let iso = pbDefaultPrepDate();
  while(days.length < 6){
    if(pbWeekdayOf(iso) !== 'Sunday') days.push(iso);
    iso = pbAddDays(iso, 1);
  }
  return `<nav class="pb-days">${days.map(d => {
    const wd = pbWeekdayOf(d);
    const buf = prepBuffers[wd] != null ? prepBuffers[wd] : 10;
    const md = pbDateFromISO(d);
    return `<button class="pb-day-btn ${d===pbCurrentDate?'active':''}" data-pb-select-date="${d}">${wd.slice(0,3)} ${md.getMonth()+1}/${md.getDate()}<span class="pb-buf-tag">${buf}%</span></button>`;
  }).join('')}
  <label class="pb-date-jump">or <input type="date" data-pb-prep-date value="${pbCurrentDate}"></label></nav>`;
}

function pbSuggestBannerHtml(){
  if(pbCurrentPage !== 'buildto') return '';
  const s = pbComputeSuggestion(pbCurrentDay);
  if(!s) return '';
  if(pbDismissedSuggestions[pbCurrentDay] === s.suggested) return '';
  return `
    <div class="pb-banner">
      <div><strong>Buffer suggestion for ${pbCurrentDay}:</strong> ${s.reason} (${s.current}% → ${s.suggested}%, based on ${s.wasteEntries} waste ${s.wasteEntries===1?'entry':'entries'})</div>
      <div class="pb-banner-actions">
        <button class="btn btn-primary" style="width:auto;padding:6px 14px;font-size:12px;" data-pb-apply-suggestion="${pbCurrentDay}" data-suggested="${s.suggested}">Apply ${s.suggested}%</button>
        <button class="btn btn-ghost" style="width:auto;padding:6px 14px;font-size:12px;" data-pb-dismiss-suggestion="${pbCurrentDay}" data-suggested="${s.suggested}">Dismiss</button>
      </div>
    </div>
  `;
}

function pbRenderBuildTo(){
  const f = pbForecast(pbCurrentDate);
  const plural = f.weekday + 's';
  const basisText = f.n === 0 ? 'no data yet' : `${f.n} ${f.n === 1 ? f.weekday : plural} on record`;
  let html = `<p class="pb-subline">${pbFormatDate(pbCurrentDate, {year: true})} · ${basisText} · ${f.bufferPct}% buffer</p>`;
  if(f.stats.length === 0){
    return html + `<div class="pb-empty-day">No sold counts on file for ${plural} yet — switch to Sold Counts to add some.</div>`;
  }
  let note;
  if(f.seasonal){
    note = `<b>Seasonal adjustment on.</b> Recent ${plural} are adjusted by how sales moved last year from those weeks into the weeks around ${pbFormatDate(f.lyTarget, {year: true})}.`;
  } else if(f.usingDated){
    note = `Based on the last ${f.n} ${f.n === 1 ? f.weekday : plural}, newest weighted most. <b>Seasonal adjustment</b> starts once there are sold counts from around ${pbFormatDate(f.lyTarget, {year: true})} (same time last year).`;
  } else {
    note = `Based on a plain average of ${plural} on file — these entries have no dates yet. Give them dates on Sold Counts to weight recent weeks.`;
  }
  html += `<div class="pb-forecast-note">${note}</div>`;
  ['Salads','Wraps','Sides','Other'].forEach(cat => {
    const items = f.stats.filter(it => it.category === cat);
    if(items.length === 0) return;
    html += `
      <section class="pb-category">
        <div class="pb-category-head"><h3>${cat}</h3><span class="pb-count">${items.length} items</span></div>
        ${items.map(it => {
          const seasonPct = Math.round((it.factor - 1) * 100);
          const how = f.seasonal && seasonPct !== 0
            ? `forecast ${it.forecast.toFixed(1)} = recent ${it.level.toFixed(1)} × <span class="pb-season-tag ${seasonPct > 0 ? 'up' : 'down'}">${seasonPct > 0 ? '+' : ''}${seasonPct}% season</span>`
            : `forecast ${it.forecast.toFixed(1)} · ${f.usingDated ? 'recent' : 'avg'} ${it.n} ${it.n === 1 ? f.weekday : plural}`;
          const lastYear = it.lastYear !== null ? ` · last year ${it.lastYear}` : '';
          const waste = it.wasteAvg !== null ? ` · <span class="pb-waste-flag">avg ${it.wasteAvg.toFixed(1)} wasted</span>` : '';
          return `
            <div class="pb-item-row">
              <div class="pb-item-left">
                <div class="pb-item-name">${escapeHtml(it.name)}</div>
                <div class="pb-item-meta"><span class="pb-confidence ${pbConfidenceClass(it.n)}"></span>${how}${lastYear}${waste}</div>
              </div>
              <div class="pb-item-buildto">${it.buildTo}</div>
            </div>
          `;
        }).join('')}
      </section>
    `;
  });
  return html;
}

function pbRenderEntryCards(list, day, removeAttr, kind){
  if(list.length === 0) return `<div class="pb-empty-day">Nothing recorded yet for ${day}.</div>`;
  return pbSortByDateDesc(list).map(entry => {
    const itemNames = Object.keys(entry.items || {}).sort((a,b) => entry.items[b] - entry.items[a]);
    const title = entry.date
      ? escapeHtml(pbFormatDate(entry.date, {year: true}))
      : `<span class="pb-undated">Undated${entry.label ? ' — ' + escapeHtml(entry.label) : ''}</span>`;
    const dateFix = entry.date ? '' : `
      <div class="pb-date-fix">
        <label>Set the date for this entry</label>
        <input type="date" max="${today}" data-pb-set-date="${entry.id}" data-kind="${kind}">
      </div>`;
    return `
      <div class="pb-entry-card">
        <div class="pb-entry-head">
          <span class="pb-entry-title">${title} <span class="pb-src-tag">${escapeHtml(entry.source || 'manual')}</span></span>
          <button class="pb-entry-remove" data-${removeAttr}="${entry.id}">Remove</button>
        </div>
        ${dateFix}
        <div class="pb-entry-items">
          ${itemNames.map(name => `<div class="pb-en">${escapeHtml(name)}</div><div class="pb-ec">${entry.items[name]}</div>`).join('')}
        </div>
      </div>
    `;
  }).join('');
}

// Shared date field for the Sold Counts / Waste Log panels.
function pbDateFieldHtml(attr, question){
  const iso = pbDefaultEntryDate();
  return `
    <div class="pb-field">
      <label>${question}</label>
      <div class="pb-date-row">
        <input type="date" ${attr} value="${iso}" max="${today}">
        <span class="pb-date-weekday" data-pb-weekday-for="${attr}">${pbWeekdayOf(iso)}</span>
      </div>
      <div class="pb-field-hint">Files with a date column use each row's own date; this date is used for rows without one.</div>
    </div>`;
}

function pbRenderRecorded(){
  const entries = pbEntriesFor(prepSoldEntries, pbCurrentDay);
  let html = `<p class="pb-subline">${pbCurrentDay} · ${entries.length} ${entries.length===1?'entry':'entries'} recorded</p>`;
  html += `
    <div class="pb-panel">
      <button class="pb-panel-toggle" data-pb-toggle-panel="add">${pbAddPanelOpen?'−':'+'} Add sold counts</button>
      ${pbAddPanelOpen ? `
        <div class="pb-panel-body">
          ${pbDateFieldHtml('data-pb-sold-date', 'What date are these sales from?')}
          <div class="pb-field">
            <label>Paste item name + sold count (tab-separated)</label>
            <textarea data-pb-paste-area rows="5" placeholder="Salad, Cobb w/ Nuggets&#9;61.0"></textarea>
          </div>
          <div class="pb-field">
            <label>...or upload a CSV / Excel file</label>
            <input type="file" data-pb-sold-file accept=".csv,.xlsx,.xls">
          </div>
          <div class="pb-panel-actions">
            <button class="btn btn-primary" style="width:auto;padding:9px 18px;" data-pb-add-day>Add this day</button>
          </div>
          <div class="pb-feedback" data-pb-feedback></div>
        </div>
      ` : ''}
    </div>
  `;
  html += pbRenderEntryCards(entries, pbCurrentDay, 'pb-remove-sold', 'sold');
  return html;
}

function pbRenderWaste(){
  const entries = pbEntriesFor(prepWasteEntries, pbCurrentDay);
  let html = `<p class="pb-subline">${pbCurrentDay} · ${entries.length} ${entries.length===1?'waste entry':'waste entries'} recorded</p>`;
  html += `
    <div class="pb-panel">
      <button class="pb-panel-toggle" data-pb-toggle-panel="waste">${pbWastePanelOpen?'−':'+'} Log waste</button>
      ${pbWastePanelOpen ? `
        <div class="pb-panel-body">
          ${pbDateFieldHtml('data-pb-waste-date', 'What date is this waste from?')}
          <div class="pb-field">
            <label>Paste item name + count thrown away (tab-separated)</label>
            <textarea data-pb-waste-paste-area rows="5" placeholder="Salad, Cobb w/ Nuggets&#9;4"></textarea>
          </div>
          <div class="pb-field">
            <label>...or upload a CSV / Excel file</label>
            <input type="file" data-pb-waste-file accept=".csv,.xlsx,.xls">
          </div>
          <div class="pb-panel-actions">
            <button class="btn btn-primary" style="width:auto;padding:9px 18px;" data-pb-add-waste>Add this day's waste</button>
          </div>
          <div class="pb-feedback" data-pb-waste-feedback></div>
        </div>
      ` : ''}
    </div>
  `;
  html += pbRenderEntryCards(entries, pbCurrentDay, 'pb-remove-waste', 'waste');
  return html;
}

function pbRenderBuffers(){
  let html = `<p class="pb-subline">Per-day prep buffers · applied on top of the average sold</p>`;
  html += `<p class="pb-buffers-intro">Each day builds to its own buffer on top of the average sold count. Saturday defaults to 0% since sales are less predictable to over-build for; every other day defaults to 10%. Once a day has at least 3 waste-log entries, a suggested adjustment shows up here and on the Build-To Sheet — nothing changes automatically until you tap Apply.</p>`;
  html += '<div class="pb-buffer-table">';
  PB_DAYS.forEach(day => {
    const current = prepBuffers[day] != null ? prepBuffers[day] : 10;
    const s = pbComputeSuggestion(day);
    const showSuggest = s && pbDismissedSuggestions[day] !== s.suggested;
    html += `
      <div class="pb-buffer-row">
        <div class="pb-bd-name">${day}</div>
        <div class="pb-stepper">
          <button data-pb-buffer-step="${day}" data-delta="-5">−</button>
          <div class="pb-step-value">${current}%</div>
          <button data-pb-buffer-step="${day}" data-delta="5">+</button>
        </div>
        <div class="pb-preset-chips">
          ${[0,5,10,15,20].map(val => `<button class="pb-preset-chip ${current===val?'active':''}" data-pb-buffer-set="${day}" data-value="${val}">${val}%</button>`).join('')}
        </div>
        ${showSuggest ? `<div class="pb-bd-suggest"><span>suggest ${s.suggested}% — ${s.reason}</span><button data-pb-apply-suggestion="${day}" data-suggested="${s.suggested}">Apply</button></div>` : ''}
      </div>
    `;
  });
  html += '</div>';
  return html;
}

function pbRenderInsights(){
  let html = `<p class="pb-subline">Cross-day trends · pulled from every Sold Counts and Waste Log entry on file</p>`;

  // Sales over time: weekly totals + month / season averages for one item.
  const soldNames = {};
  prepSoldEntries.forEach(e => { if(e.date) Object.keys(pbBucketTotals(e)).forEach(b => { soldNames[b] = true; }); });
  const trendNames = Object.keys(soldNames).sort();
  if(!pbTrendItem || trendNames.indexOf(pbTrendItem) === -1) pbTrendItem = trendNames[0] || null;
  html += `<section class="pb-category"><div class="pb-category-head"><h3>Sales over time</h3><span class="pb-count">weeks, months &amp; seasons</span></div>`;
  if(!pbTrendItem){
    html += `<div class="pb-empty">Add dated Sold Counts to see sales trends.</div>`;
  } else {
    html += `<div class="pb-insight-controls"><label>Item</label><select data-pb-trend-item>${trendNames.map(n => `<option value="${escapeHtml(n)}" ${n===pbTrendItem?'selected':''}>${escapeHtml(n)}</option>`).join('')}</select></div>`;
    html += `<div class="pb-trend-wrap">${pbTrendSvg(pbWeeklySoldForBucket(pbTrendItem), {unit: 'sold that week', emptyText: 'No dated sales for this item yet.'})}</div>`;
    const periods = pbPeriodAveragesForBucket(pbTrendItem);
    const periodTable = (title, rows) => `
      <div class="pb-period">
        <div class="pb-period-title">${title}</div>
        ${rows.map(r => `<div class="pb-period-row"><span>${escapeHtml(r.label)}</span><span class="pb-period-avg">${r.avg.toFixed(1)}<small>/day</small></span><span class="pb-period-days">${r.days} ${r.days === 1 ? 'day' : 'days'}</span></div>`).join('')}
      </div>`;
    html += `<div class="pb-period-grid">${periodTable('By month', periods.months)}${periodTable('By season', periods.seasons)}</div>`;
    html += `<p class="pb-period-note">Average sold per open day. Build-To starts adjusting for the season automatically once a year of dated sales is on file.</p>`;
  }
  html += '</section>';

  html += `<section class="pb-category"><div class="pb-category-head"><h3>Highest volatility</h3><span class="pb-count">day-to-day swing in sold counts</span></div>`;
  html += pbHbarChart(pbComputeVolatility().slice(0, 10), {
    emptyText: 'Add at least two days of Sold Counts for the same item to see volatility.',
    valueFn: r => r.cv,
    valueLabel: (r,v) => Math.round(v*100) + '%',
    subHtml: r => r.n + ' days',
    fillColor: (r, v, max) => `color-mix(in srgb, var(--cfa-red) ${Math.round(30 + 70*(v/max))}%, transparent)`
  });
  html += '</section>';

  html += `<section class="pb-category"><div class="pb-category-head"><h3>Waste vs. sold</h3><span class="pb-count">share of build thrown away</span></div>`;
  html += pbHbarChart(pbComputeWasteRatios().slice(0, 10), {
    emptyText: 'Log some Waste entries to see which items run heaviest.',
    valueFn: r => r.ratio,
    valueLabel: (r,v) => Math.round(v*100) + '%',
    subHtml: r => { const st = pbRatioStatus(r.ratio); return `<span class="pb-status-pill ${st.cls}">${st.label}</span>`; },
    fillColor: (r) => {
      const s = pbRatioStatus(r.ratio).cls;
      const tok = s === 'high' ? '--cfa-red' : (s === 'good' ? '--success' : '#C97A1E');
      return tok.startsWith('--') ? `color-mix(in srgb, var(${tok}) 70%, transparent)` : `color-mix(in srgb, ${tok} 70%, transparent)`;
    }
  });
  html += '</section>';

  const names = pbAllBucketNames();
  if(!pbInsightItem || names.indexOf(pbInsightItem) === -1){
    pbInsightItem = (pbComputeWasteRatios()[0] || {}).name || names[0] || null;
  }
  html += `<section class="pb-category"><div class="pb-category-head"><h3>Waste over time</h3><span class="pb-count">per item</span></div>`;
  if(names.length){
    html += `<div class="pb-insight-controls"><label>Item</label><select data-pb-insight-item>${names.map(n => `<option value="${escapeHtml(n)}" ${n===pbInsightItem?'selected':''}>${escapeHtml(n)}</option>`).join('')}</select></div>`;
  }
  html += `<div class="pb-trend-wrap">${pbInsightItem ? pbTrendSvg(pbWasteTrendForBucket(pbInsightItem)) : '<div class="pb-empty">No items logged yet.</div>'}</div>`;
  html += '</section>';

  html += `<section class="pb-category"><div class="pb-category-head"><h3>Stockouts</h3><span class="pb-count">what ran out, and when</span></div>`;
  const knownNames = names.length ? names : Object.keys(PB_CATEGORY_OF_BUCKET);
  const now = new Date();
  const nowVal = String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');
  html += `
    <div class="pb-stockout-add">
      <div class="pb-field"><label>Item</label><select data-pb-stockout-item>${knownNames.map(n => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('')}</select></div>
      <div class="pb-field"><label>Day</label><select data-pb-stockout-day>${PB_DAYS.map(d => `<option value="${d}" ${d===pbCurrentDay?'selected':''}>${d}</option>`).join('')}</select></div>
      <div class="pb-field"><label>Time</label><input type="time" data-pb-stockout-time value="${nowVal}"></div>
      <button class="btn btn-primary" style="width:auto;padding:9px 16px;" data-pb-log-stockout>Log stockout</button>
    </div>
  `;
  if(stockoutEventsIsEmpty()){
    html += `<div class="pb-empty-day">No stockouts logged yet — add one above when an item runs out mid-shift.</div>`;
  } else {
    const byItem = {};
    prepStockoutEvents.forEach(ev => { (byItem[ev.item] = byItem[ev.item] || []).push(ev); });
    const ranked = Object.keys(byItem).map(name => ({ name, events: byItem[name] })).sort((a,b) => b.events.length - a.events.length);
    ranked.forEach(row => {
      const times = row.events.map(e => e.time).filter(Boolean).sort();
      html += `
        <div class="pb-entry-card">
          <div class="pb-stockout-item">
            <div><div class="pb-stockout-name">${escapeHtml(row.name)}</div><div class="pb-stockout-meta">${row.events.length} ${row.events.length===1?'time':'times'}${times.length ? ' · most recent ' + times[times.length-1] : ''}</div></div>
            <div class="pb-stockout-count">${row.events.length}</div>
          </div>
          <div class="pb-time-strip-wrap">
            <div class="pb-time-strip">
              ${row.events.filter(ev => ev.time).map(ev => {
                const parts = ev.time.split(':');
                const mins = (parseInt(parts[0],10) || 0) * 60 + (parseInt(parts[1],10) || 0);
                const pct = Math.max(0, Math.min(100, ((mins - 6*60) / (16*60)) * 100));
                return `<div class="pb-dot" style="left:${pct}%;" title="${escapeHtml(ev.day)} · ${escapeHtml(ev.time)}"></div>`;
              }).join('')}
            </div>
            <div class="pb-time-axis"><span>6am</span><span>2pm</span><span>10pm</span></div>
          </div>
        </div>
      `;
    });
  }
  html += '</section>';
  return html;
}
function stockoutEventsIsEmpty(){ return prepStockoutEvents.length === 0; }

function renderPrepBoard(){
  const root = document.getElementById('prepBoardRoot');
  if(!root) return;
  if(!prepHistorySeeded){
    pbSeedHistoryIfNeeded().then(renderPrepBoard);
    return;
  }
  if(!pbDatesMigrated){
    pbDatesMigrated = true;
    if(pbMigrateEntryDates()) saveState();
  }
  if(!pbCurrentDate) pbCurrentDate = pbDefaultPrepDate();
  if(pbCurrentPage === 'buildto') pbCurrentDay = pbWeekdayOf(pbCurrentDate);

  const pages = [
    { id: 'buildto', label: 'Build-To Sheet' },
    { id: 'recorded', label: 'Sold Counts' },
    { id: 'waste', label: 'Waste Log' },
    { id: 'insights', label: 'Insights' },
    { id: 'buffers', label: 'Buffers' }
  ];

  let html = `
    <div class="pb-header-row"><h2 class="pb-title">🥗 Prep Board</h2></div>
    <p class="pb-subtitle">Cold-side build-to numbers — salads, wraps, fruit cups, parfaits</p>
    <nav class="pb-pages">
      ${pages.map(p => `<button class="pb-page-btn ${pbCurrentPage===p.id?'active':''}" data-pb-set-page="${p.id}">${p.label}</button>`).join('')}
    </nav>
  `;

  if(pbCurrentPage === 'buildto') html += pbDateNavHtml();
  else if(pbCurrentPage !== 'buffers' && pbCurrentPage !== 'insights') html += pbDayNavHtml();
  html += pbSuggestBannerHtml();

  if(pbCurrentPage === 'buildto') html += pbRenderBuildTo();
  else if(pbCurrentPage === 'recorded') html += pbRenderRecorded();
  else if(pbCurrentPage === 'waste') html += pbRenderWaste();
  else if(pbCurrentPage === 'buffers') html += pbRenderBuffers();
  else if(pbCurrentPage === 'insights') html += pbRenderInsights();

  root.innerHTML = html;
}

async function pbSaveBuffers(){ await saveState(); }

async function pbApplySuggestion(day, suggested){
  prepBuffers[day] = suggested;
  delete pbDismissedSuggestions[day];
  await saveState();
  renderPrepBoard();
}

async function pbRemoveEntry(list, id){
  const idx = list.findIndex(e => e.id === id);
  if(idx === -1) return;
  list.splice(idx, 1);
  await saveState();
  renderPrepBoard();
}

// ---------- adding dated entries ----------

const PB_KIND = {
  sold:  { list: () => prepSoldEntries,  dateAttr: 'data-pb-sold-date',  paste: '[data-pb-paste-area]',       feedback: '[data-pb-feedback]',       noun: 'sold' },
  waste: { list: () => prepWasteEntries, dateAttr: 'data-pb-waste-date', paste: '[data-pb-waste-paste-area]', feedback: '[data-pb-waste-feedback]', noun: 'wasted' }
};

function pbPanelDate(kind){
  const input = document.querySelector('[' + PB_KIND[kind].dateAttr + ']');
  return input && input.value ? input.value : null;
}

function pbFeedback(kind, msg){
  const el = document.querySelector(PB_KIND[kind].feedback);
  if(el){ el.className = 'pb-feedback warn'; el.textContent = msg; }
}

async function pbFinishAdd(kind, result, skipped){
  // New waste data changes the buffer suggestions, so show them again.
  if(kind === 'waste') pbDismissedSuggestions = {};
  await saveState();
  const newest = pbSortByDateDesc(PB_KIND[kind].list())[0];
  if(newest) pbCurrentDay = newest.day;
  renderPrepBoard();
  const parts = [`✓ ${result.items} item${result.items===1?'':'s'} ${PB_KIND[kind].noun} across ${result.dates} date${result.dates===1?'':'s'}`];
  if(result.replaced) parts.push(`replaced ${result.replaced} existing date${result.replaced===1?'':'s'}`);
  if(skipped) parts.push(`${skipped} skipped`);
  showToast(parts.join(' · '));
}

function pbAddPasted(kind){
  const iso = pbPanelDate(kind);
  if(!iso){ pbFeedback(kind, 'Pick the date this data is from.'); return; }
  if(pbWeekdayOf(iso) === 'Sunday'){ pbFeedback(kind, 'That date is a Sunday — the store is closed. Double-check the date.'); return; }
  const { counts, skipped } = pbParsePaste(document.querySelector(PB_KIND[kind].paste).value);
  if(Object.keys(counts).length === 0){ pbFeedback(kind, 'Nothing added — check that the pasted text has item names and counts separated by tabs.'); return; }
  const result = pbAddDatedEntries(PB_KIND[kind].list(), { [iso]: counts }, 'manual');
  pbFinishAdd(kind, result, skipped);
}

function pbImportFile(kind, input){
  const file = input.files[0];
  const iso = pbPanelDate(kind);
  if(!iso){ pbFeedback(kind, 'Pick a date first — it’s used for any rows without their own date.'); input.value = ''; return; }
  pbReadWorkbookRows(file, (err, rows) => {
    if(err || !rows || rows.length === 0){ pbFeedback(kind, 'Couldn’t read that file — make sure it’s a CSV or Excel export.'); input.value = ''; return; }
    const parsed = pbRowsToDateEntries(rows, iso);
    if(Object.keys(parsed.byDate).length === 0){ pbFeedback(kind, 'Nothing usable in that file — check it has an item-name column and a count column.'); input.value = ''; return; }
    const result = pbAddDatedEntries(PB_KIND[kind].list(), parsed.byDate, 'import');
    pbFinishAdd(kind, result, parsed.skipped);
  });
}

// ---------- events ----------

document.getElementById('prepBoardRoot').addEventListener('click', function(e){
  const pageBtn = e.target.closest('[data-pb-set-page]');
  if(pageBtn){ pbCurrentPage = pageBtn.dataset.pbSetPage; renderPrepBoard(); return; }

  const dayBtn = e.target.closest('[data-pb-select-day]');
  if(dayBtn){ pbCurrentDay = dayBtn.dataset.pbSelectDay; renderPrepBoard(); return; }

  const dateBtn = e.target.closest('[data-pb-select-date]');
  if(dateBtn){ pbCurrentDate = dateBtn.dataset.pbSelectDate; renderPrepBoard(); return; }

  const togglePanel = e.target.closest('[data-pb-toggle-panel]');
  if(togglePanel){
    if(togglePanel.dataset.pbTogglePanel === 'add') pbAddPanelOpen = !pbAddPanelOpen;
    else pbWastePanelOpen = !pbWastePanelOpen;
    renderPrepBoard();
    return;
  }

  const applySugg = e.target.closest('[data-pb-apply-suggestion]');
  if(applySugg){ pbApplySuggestion(applySugg.dataset.pbApplySuggestion, parseInt(applySugg.dataset.suggested, 10)); return; }

  const dismissSugg = e.target.closest('[data-pb-dismiss-suggestion]');
  if(dismissSugg){ pbDismissedSuggestions[dismissSugg.dataset.pbDismissSuggestion] = parseInt(dismissSugg.dataset.suggested, 10); renderPrepBoard(); return; }

  const bufferStep = e.target.closest('[data-pb-buffer-step]');
  if(bufferStep){
    const day = bufferStep.dataset.pbBufferStep;
    const delta = parseInt(bufferStep.dataset.delta, 10);
    const current = prepBuffers[day] != null ? prepBuffers[day] : 10;
    prepBuffers[day] = Math.max(0, Math.min(100, current + delta));
    delete pbDismissedSuggestions[day];
    pbSaveBuffers().then(renderPrepBoard);
    return;
  }
  const bufferSet = e.target.closest('[data-pb-buffer-set]');
  if(bufferSet){
    const day = bufferSet.dataset.pbBufferSet;
    prepBuffers[day] = parseInt(bufferSet.dataset.value, 10);
    delete pbDismissedSuggestions[day];
    pbSaveBuffers().then(renderPrepBoard);
    return;
  }

  const removeSold = e.target.closest('[data-pb-remove-sold]');
  if(removeSold){ pbRemoveEntry(prepSoldEntries, removeSold.dataset.pbRemoveSold); return; }
  const removeWaste = e.target.closest('[data-pb-remove-waste]');
  if(removeWaste){ pbRemoveEntry(prepWasteEntries, removeWaste.dataset.pbRemoveWaste); return; }

  const addDayBtn = e.target.closest('[data-pb-add-day]');
  if(addDayBtn){ pbAddPasted('sold'); return; }

  const addWasteBtn = e.target.closest('[data-pb-add-waste]');
  if(addWasteBtn){ pbAddPasted('waste'); return; }

  const logStockout = e.target.closest('[data-pb-log-stockout]');
  if(logStockout){
    const item = document.querySelector('[data-pb-stockout-item]').value;
    const day = document.querySelector('[data-pb-stockout-day]').value;
    const time = document.querySelector('[data-pb-stockout-time]').value;
    prepStockoutEvents.push({ id: pbUid(), day, item, time });
    saveState().then(() => { renderPrepBoard(); showToast('✓ Stockout logged'); });
    return;
  }
});

document.getElementById('prepBoardRoot').addEventListener('change', function(e){
  if(e.target.matches('[data-pb-insight-item]')){
    pbInsightItem = e.target.value;
    renderPrepBoard();
    return;
  }
  if(e.target.matches('[data-pb-trend-item]')){
    pbTrendItem = e.target.value;
    renderPrepBoard();
    return;
  }
  if(e.target.matches('[data-pb-prep-date]')){
    if(!e.target.value) return;
    let iso = e.target.value;
    if(pbWeekdayOf(iso) === 'Sunday'){ iso = pbAddDays(iso, 1); showToast('Closed Sundays — showing Monday'); }
    pbCurrentDate = iso;
    renderPrepBoard();
    return;
  }
  if(e.target.matches('[data-pb-sold-date], [data-pb-waste-date]')){
    const attr = e.target.hasAttribute('data-pb-sold-date') ? 'data-pb-sold-date' : 'data-pb-waste-date';
    const label = document.querySelector(`[data-pb-weekday-for="${attr}"]`);
    if(label) label.textContent = e.target.value ? pbWeekdayOf(e.target.value) : '';
    return;
  }
  if(e.target.matches('[data-pb-set-date]')){
    const iso = e.target.value;
    if(!iso) return;
    if(pbWeekdayOf(iso) === 'Sunday'){ showToast('That’s a Sunday — the store is closed'); e.target.value = ''; return; }
    const list = e.target.dataset.kind === 'waste' ? prepWasteEntries : prepSoldEntries;
    const entry = list.find(x => x.id === e.target.dataset.pbSetDate);
    if(!entry) return;
    const clash = list.find(x => x.date === iso && x.id !== entry.id);
    if(clash && !confirm(`There's already an entry for ${pbFormatDate(iso, {year: true})}. Replace it with this one?`)){ e.target.value = ''; return; }
    if(clash) list.splice(list.indexOf(clash), 1);
    entry.date = iso;
    entry.day = pbWeekdayOf(iso);
    entry.label = pbFormatDate(iso, {year: true});
    pbCurrentDay = entry.day;
    saveState().then(() => { renderPrepBoard(); showToast('✓ Date set'); });
    return;
  }
  const soldFile = e.target.closest('[data-pb-sold-file]');
  if(soldFile && soldFile.files && soldFile.files[0]){ pbImportFile('sold', soldFile); return; }
  const wasteFile = e.target.closest('[data-pb-waste-file]');
  if(wasteFile && wasteFile.files && wasteFile.files[0]){ pbImportFile('waste', wasteFile); return; }
});
