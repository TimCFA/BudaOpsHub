// ===== EVENTS: READ A CALENDAR IMAGE =====
// Manage → Events can read the month's marketing calendar from the image the
// store already has (the PNG of the calendar template; Tim, Oct 2026), so the
// events aren't typed in by hand. Nothing is added until a manager checks
// the list it found and taps Add.
//
// The template is the same every month: a Sunday-to-Saturday grid of day
// squares, the month in big coral type above it, each event written in its
// key color (Red = App, Blue = Food Distribution, Purple = Cow in Community,
// Orange = In-Store, Green = Drive Thru, Black = Social; heads-ups like "No
// School" in slate gray), events that run several days as a colored bar
// across the week, Monthly Goals in the first Sunday, and the Pre-Checklist
// and Notes beside the grid. So the reader:
//   1. finds the grid lines (each square is a date),
//   2. reads the month from the title,
//   3. takes out the bars (their color is the kind, their ends the dates),
//   4. reads each square line by line, each line's kind from its ink color,
//   5. reads Monthly Goals, the Pre-Checklist and the Notes (attached to the
//      events they're headed with).
// The words are read on the device with Tesseract.js (open source OCR),
// loaded only when a manager picks an image; nothing is sent anywhere.
// Reading isn't perfect, which is why every event can be fixed or left out
// before it's added.

const EVI_TESSERACT = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
const EVI_TESS_OPTS = {
  workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js',
  corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1',
  langPath: 'https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng@1.0.0/4.0.0_best_int',
};
const EVI_WIDTH = 2000;   // the template's width; other sizes are scaled to it

// The key's inks, as the template prints them.
const EVI_INKS = [
  {kind: 'app', rgb: [220, 0, 48]},
  {kind: 'food', rgb: [60, 176, 200]},
  {kind: 'cow', rgb: [152, 72, 120]},
  {kind: 'instore', rgb: [224, 80, 4]},
  {kind: 'drivethru', rgb: [36, 156, 104]},
  {kind: 'social', rgb: [0, 0, 0]},
  {kind: 'note', rgb: [88, 100, 112]},
];
const EVI_MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

// ----- Reading the words (no image needed: tests run these) -----

// The ink a pixel is written in, or null (paper, grid lines, day numbers).
function eviInkOf(r, g, b, tight){
  if(Math.min(r, g, b) > 200) return null;
  let best = null, bestD = tight ? 45 * 45 : 70 * 70;
  EVI_INKS.forEach(ink => {
    const d = (r - ink.rgb[0]) ** 2 + (g - ink.rgb[1]) ** 2 + (b - ink.rgb[2]) ** 2;
    if(d < bestD){ bestD = d; best = ink.kind; }
  });
  // The slate gray of heads-ups leans blue; the brownish grays of the grid
  // and the headings don't.
  if(best === 'note' && b - r < 10) return null;
  return best;
}

// "6-7 PM", "3pm-6pm", "11-12 PM & 6-7 PM", "6AM-4PM", "10:30AM-4PM",
// "11-8" (no am/pm: store hours, so a start of 5-11 is morning and an end
// of 1-10 evening) → {from, to, text} with 24-hour 'HH:MM', or null.
function eviParseTime(text){
  const re = /(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)?\s*[-–—]\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)?\b/i;
  const m = String(text || '').match(re);
  if(!m) return null;
  let [sh, sm, smer, eh, em, emer] = [+m[1], +(m[2] || 0), (m[3] || '').toLowerCase()[0], +m[4], +(m[5] || 0), (m[6] || '').toLowerCase()[0]];
  if(sh > 12 || eh > 12 || sm > 59 || em > 59 || sh === 0 || eh === 0) return null;
  const to24 = (h, mer) => mer === 'p' ? (h % 12) + 12 : mer === 'a' ? h % 12 : h;
  let end, start;
  if(emer) end = to24(eh, emer);
  else end = eh >= 1 && eh <= 10 ? eh + 12 : eh;              // store hours: an end of 1-10 is evening
  if(smer) start = to24(sh, smer);
  else if(emer){
    start = to24(sh, emer);
    if(start * 60 + sm >= end * 60 + em) start = to24(sh, 'a');   // "11-12 PM": 11 a.m.
  } else start = sh >= 5 && sh <= 11 ? sh : sh + 12;
  if(start * 60 + sm >= end * 60 + em) return null;
  const hhmm = (h, mm) => `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  return {from: hhmm(start, sm), to: hhmm(end, em), text: m[0]};
}

// OCR's usual slips on this template's type.
// `partial`: a piece of a longer text (a wrapped line), so an open quote
// may close further on.
function eviCleanText(s, partial){
  const q = (String(s || '').match(/["“”]/g) || []).length;
  if(q % 2 && !partial) s = String(s).replace(/["“”]/g, ' ');
  // "(both stores}": a brace closing a parenthesis is a misread ")".
  const open = (String(s || '').match(/\(/g) || []).length, close = (String(s || '').match(/\)/g) || []).length;
  if(open > close) s = String(s).replace(/\}/g, ')');
  return String(s || '')
    .replace(/[|]{2,}/g, ' ')
    .replace(/[‘’`]/g, '’').replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .replace(/^[^A-Za-z0-9"\[(]+|[\s'|,;]+$/g, '')
    .trim();
}

// One square's block of same-colored lines → an event (no date yet):
// "Cow Bingo / 6-7 PM" → title Cow Bingo, 18:00–19:00; "12 Days of
// Christmas: / Medium Waffle Fries" → title and detail; black "Thanksgiving
// CLOSED" or store hours read as a heads-up, not a social post.
function eviEventFromText(text, kind){
  let t = eviCleanText(text);
  if(!t || !/[a-z]/i.test(t)) return null;
  const ev = {kind};
  const time = eviParseTime(t);
  if(time){
    ev.from = time.from; ev.to = time.to;
    const rest = t.replace(time.text, '').replace(/\s*[&+]\s*\d{1,2}(:\d{2})?\s*(am|pm|a|p)?\s*[-–—]\s*\d{1,2}(:\d{2})?\s*(am|pm|a|p)?\b/i, extra => { ev.timeNote = (time.text + extra).replace(/\s+/g, ' ').trim(); return ''; });
    t = eviCleanText(rest);
    if(ev.timeNote) ev.timeNote = `${time.text.trim()}${ev.timeNote.slice(time.text.trim().length)}`;
  }
  const colon = t.indexOf(':');
  if(colon > 2 && colon < t.length - 2){
    ev.title = eviCleanText(t.slice(0, colon));
    ev.detail = eviCleanText(t.slice(colon + 1));
  } else ev.title = t;
  if(ev.timeNote) ev.detail = [ev.detail, ev.timeNote].filter(Boolean).join(' · ');
  delete ev.timeNote;
  if(kind === 'social' && /\bclosed\b|\beve\b|new year|christmas day|thanksgiving/i.test(ev.title)) ev.kind = 'note';
  if(!ev.title) return null;
  return ev;
}

// The OCR'd lines of the panel beside the grid → {checklist: [...], notes:
// [{heading, items}]}. Lines carry x0 (their left edge): in the Notes box a
// heading sits furthest left, a bullet a little in, its wrapped lines
// further in.
function eviPanelFromLines(lines){
  const clean = lines.map(l => ({x0: l.x0, text: eviCleanText(l.text, true)})).filter(l => l.text);
  const at = re => clean.findIndex(l => re.test(l.text));
  const iCheck = at(/^pre[\s-]*checklist/i), iNotes = at(/^notes\b/i);
  const checklist = [];
  if(iCheck >= 0){
    clean.slice(iCheck + 1, iNotes > iCheck ? iNotes : undefined).forEach(l => {
      const m = l.text.match(/^\s*\d{1,2}\s*[.)]\s*(.+)$/);
      if(m) checklist.push(eviCleanText(m[1]));
      else if(checklist.length) checklist[checklist.length - 1] += ' ' + l.text;
    });
  }
  const notes = [];
  if(iNotes >= 0){
    const body = clean.slice(iNotes + 1);
    const left = Math.min(...body.map(l => l.x0));
    const bullet = /^(?:[^A-Za-z0-9"(\[]{1,2}|[seoc])\s+/;
    body.forEach(l => {
      const off = l.x0 - left;
      const isBullet = bullet.test(l.text) || (off >= 6 && off < 20);
      if(off < 6 && !bullet.test(l.text)){ notes.push({heading: l.text.replace(/:$/, '').trim(), items: []}); return; }
      const n = notes[notes.length - 1];
      if(!n) return;
      const text = l.text.replace(bullet, '').trim();
      if(isBullet || !n.items.length) n.items.push(text);
      else n.items[n.items.length - 1] += ' ' + text;
    });
  }
  return {checklist: checklist.map(t => eviCleanText(t)), notes: notes.filter(n => n.heading && n.items.length).map(n => ({heading: eviCleanText(n.heading), items: n.items.map(t => eviCleanText(t))}))};
}

const eviKey = s => String(s || '').toLowerCase().replace(/^\[[^\]]*\]\s*/, '').replace(/[^a-z0-9]+/g, ' ').trim();

// Attach each Notes heading's items to the events it names ("Fall
// Festival" → "[TBD] Fall Festival", "Community Drive" → "Start Community
// Drive"). Returns the headings that matched nothing.
function eviAttachNotes(events, notes){
  const unmatched = [];
  notes.forEach(n => {
    const h = eviKey(n.heading);
    if(h.length < 4){ unmatched.push(n.heading); return; }
    const hits = events.filter(ev => { const t = eviKey(ev.title); return t && (t.includes(h) || (h.includes(t) && t.length >= 6)); });
    if(!hits.length){ unmatched.push(n.heading); return; }
    hits.forEach(ev => { ev.notes = (ev.notes || []).concat(n.items); });
  });
  return unmatched;
}

// Bars that run on into the next week ("Winter Break - No School" on two
// rows) become one event when the second starts within three days of the
// first's end.
function eviMergeBars(bars){
  const out = [];
  bars.slice().sort((a, b) => a.start - b.start).forEach(b => {
    const prev = out.find(p => p.kind === b.kind && eviKey(p.title) === eviKey(b.title) && b.start - p.end <= 3 && b.start > p.end);
    if(prev) prev.end = Math.max(prev.end, b.end);
    else out.push({...b});
  });
  return out;
}

// The Sunday on or before the 1st: the grid's first square.
function eviGridStart(ym){
  const d = new Date(ym + '-01T00:00:00');
  d.setDate(d.getDate() - d.getDay());
  return d;
}
function eviDateAt(ym, index){
  const d = eviGridStart(ym);
  d.setDate(d.getDate() + index);
  return toLocalISODate(d);
}

// "November 2026" (or a misread like "Novembor 2026") → '2026-11'.
function eviMonthFromText(text){
  const words = String(text || '').toLowerCase().match(/[a-z]{3,}|\d{4}/g) || [];
  for(let i = 0; i < words.length; i++){
    const w = words[i];
    const mi = EVI_MONTHS.findIndex(m => m === w || (w.length >= 5 && m.slice(0, 4) === w.slice(0, 4)));
    if(mi < 0) continue;
    const y = words.slice(i + 1, i + 3).find(x => /^20\d\d$/.test(x));
    if(y) return `${y}-${String(mi + 1).padStart(2, '0')}`;
  }
  return null;
}

// Found items (with grid indexes) → events with dates for month `ym`. One
// written on a grey day of the month either side ("Start Community Drive"
// on Nov 30 of December's page) is kept but marked `outside`, so it starts
// unticked: that month's own calendar may have it already.
function eviDatedEvents(found, ym){
  const first = ym + '-01', last = (() => { const d = new Date(ym + '-01T00:00:00'); d.setMonth(d.getMonth() + 1); d.setDate(0); return toLocalISODate(d); })();
  const out = [];
  found.forEach(f => {
    if(f.kind === 'goal' || f.kind === 'checklist'){ out.push({...f, date: first, end: last}); return; }
    let date = eviDateAt(ym, f.start), end = eviDateAt(ym, f.end == null ? f.start : f.end);
    const ev = {...f};
    delete ev.start;
    if(end < first || date > last) ev.outside = true;
    else { if(date < first) date = first; if(end > last) end = last; }
    ev.date = date;
    if(end !== date) ev.end = end; else delete ev.end;
    out.push(ev);
  });
  return out;
}

// A small misread of a name the calendar already uses ("Community
// Outreact") → that name: the store's own titles first, then the spelling
// found most often on this page. Only names of 8+ letters, at most 2 off.
function eviDistance(a, b){
  if(Math.abs(a.length - b.length) > 2) return 3;
  const prev = Array.from({length: b.length + 1}, (_, j) => j);
  for(let i = 1; i <= a.length; i++){
    let diag = prev[0];
    prev[0] = i;
    for(let j = 1; j <= b.length; j++){
      const keep = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = keep;
    }
  }
  return prev[b.length];
}
function eviSnapTitles(found, known){
  const counts = {};
  found.forEach(f => { counts[f.title] = (counts[f.title] || 0) + 1; });
  const pool = [...new Set(known)].concat(Object.keys(counts).sort((a, b) => counts[b] - counts[a]));
  found.forEach(f => {
    if(f.title.length < 8 || known.includes(f.title)) return;
    const better = pool.find(t => t !== f.title && t.length >= 8 && (known.includes(t) || counts[t] > counts[f.title]) && eviDistance(f.title.toLowerCase(), t.toLowerCase()) <= 2);
    if(better) f.title = better;
  });
  return found;
}

// Already on the calendar: same day and the same name.
function eviIsDuplicate(ev, list){
  return list.some(x => x.date === ev.date && eviKey(x.title) === eviKey(ev.title) && (x.end || x.date) === (ev.end || ev.date));
}

// ----- Reading the image (in the browser) -----

let eviTesseract = null;   // the loaded library's promise
function eviLoadTesseract(){
  if(window.Tesseract) return Promise.resolve(window.Tesseract);
  if(!eviTesseract){
    eviTesseract = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = EVI_TESSERACT;
      s.onload = () => window.Tesseract ? resolve(window.Tesseract) : reject(new Error('The reader didn’t load.'));
      s.onerror = () => { eviTesseract = null; reject(new Error('Couldn’t load the reader — check the connection and try again.')); };
      document.head.appendChild(s);
    });
  }
  return eviTesseract;
}

function eviLoadImage(file){
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file isn’t an image this device can open. Use the PNG or JPG of the calendar.')); };
    img.src = url;
  });
}

// The grid's lines: rows and columns of the template's gray rule.
function eviFindGrid(data, W, H){
  const px = (x, y) => { const i = (y * W + x) * 4; return [data[i], data[i + 1], data[i + 2]]; };
  const isRule = (r, g, b) => Math.abs(r - g) < 16 && Math.abs(g - b) < 16 && r > 85 && r < 175;
  const merge = list => list.reduce((acc, v) => { if(acc.length && v - acc[acc.length - 1].last <= 3){ acc[acc.length - 1].last = v; } else acc.push({first: v, last: v}); return acc; }, []).map(g => Math.round((g.first + g.last) / 2));
  const xs = [], ys = [];
  const xMax = Math.round(W * 0.82);
  for(let y = Math.round(H * 0.12); y < H - 10; y++){
    let n = 0, total = 0;
    for(let x = 20; x < xMax; x += 4){ total++; if(isRule(...px(x, y))) n++; }
    if(n > total * 0.7) ys.push(y);
  }
  const rows = merge(ys);
  if(rows.length < 2) return null;
  for(let x = 10; x < W - 10; x++){
    let n = 0, total = 0;
    for(let y = rows[0] + 6; y < rows[rows.length - 1] - 6; y += 4){ total++; if(isRule(...px(x, y))) n++; }
    if(n > total * 0.6) xs.push(x);
  }
  const cols = merge(xs);
  if(cols.length < 8) return null;
  // The seven columns: the run of eight lines with even spacing.
  let best = null;
  for(let i = 0; i + 7 < cols.length; i++){
    const run = cols.slice(i, i + 8), w = (run[7] - run[0]) / 7;
    if(run.every((c, k) => Math.abs(c - (run[0] + w * k)) < w * 0.12)){ best = run; break; }
  }
  if(!best) return null;
  const h = rows.length > 2 ? Math.min(...rows.slice(1).map((r, i) => r - rows[i])) : (best[1] - best[0]) * 0.85;
  // A bottom rule drawn lighter than the rest: add it when the last row is short.
  while(rows.length < 7 && rows[rows.length - 1] + h < H - 20){
    const next = rows[rows.length - 1] + h;
    if(rows.length >= 6) break;
    rows.push(Math.round(next));
  }
  return {cols: best, rows};
}

// A crop of the page as black type on white, ready to read: `keep(r,g,b)`
// says which pixels are type. Scaled up for small print.
function eviCrop(src, x0, y0, w, h, keep, scale, binary){
  const s = scale || 2;
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * s)); c.height = Math.max(1, Math.round(h * s));
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = true;
  g.drawImage(src, x0, y0, w, h, 0, 0, c.width, c.height);
  const img = g.getImageData(0, 0, c.width, c.height), d = img.data;
  // Type goes dark gray by how far it is from the paper (its soft edges
  // stay soft, which reads better than pure black and white); the rest white.
  for(let i = 0; i < d.length; i += 4){
    const lo = Math.min(d[i], d[i + 1], d[i + 2]);
    const on = keep(d[i], d[i + 1], d[i + 2]);
    const v = !on ? 255 : binary ? 0 : Math.max(0, 255 - Math.round((255 - lo) * 1.8));
    d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}

const EVI_SCALE = 3;   // squares are read at 3x: the times are small bold type

// Type, as opposed to paper, the grid's rule or a grey day number of the
// months either side (neutral light grays). Beige headings ("Monthly
// Goals") count.
function eviIsType(r, g, b){
  return Math.min(r, g, b) < 235 && !(Math.max(r, g, b) - Math.min(r, g, b) < 10 && r > 140);
}

// Blank the day number in a square's top-left corner: the first run of
// type there (digits sit 1-2 px apart; the next word is further off), no
// wider than two digits.
function eviBlankDayNumber(pg, data, W, x0, y0){
  // The number's color: its first dark pixel (coral on weekends, slate on
  // weekdays); a word touching it in another color is left alone.
  let tone = null;
  const near = (i, t) => (data[i] - t[0]) ** 2 + (data[i + 1] - t[1]) ** 2 + (data[i + 2] - t[2]) ** 2 < 70 * 70;
  const inkCol = x => {
    for(let y = y0 + 2; y < y0 + 26; y++){
      const i = (y * W + x) * 4;
      if(Math.min(data[i], data[i + 1], data[i + 2]) > 170) continue;
      if(!tone) tone = [data[i], data[i + 1], data[i + 2]];
      if(near(i, tone)) return true;
    }
    return false;
  };
  let start = -1, end = -1, gap = 0;
  for(let x = x0 + 1; x < x0 + 44; x++){
    if(inkCol(x) && (start >= 0 || x < x0 + 14)){ if(start < 0) start = x; end = x; gap = 0; }
    else if(start >= 0 && ++gap > 4) break;
  }
  if(start < 0 || !tone) return;
  end = Math.min(end, start + 22);   // two digits at most
  const img = pg.getImageData(start - 1, y0 + 1, end - start + 3, 26);
  for(let y = y0 + 1; y < y0 + 27; y++) for(let x = start - 1; x <= end + 1; x++){
    const i = (y * W + x) * 4;
    if(Math.min(data[i], data[i + 1], data[i + 2]) > 245 || !near(i, tone) && Math.min(data[i], data[i + 1], data[i + 2]) < 200) continue;
    data[i] = data[i + 1] = data[i + 2] = 255;
    const j = ((y - y0 - 1) * img.width + (x - start + 1)) * 4;
    img.data[j] = img.data[j + 1] = img.data[j + 2] = 255;
  }
  pg.putImageData(img, start - 1, y0 + 1);
}

async function eviRead(worker, canvas, psm){
  await worker.setParameters({tessedit_pageseg_mode: String(psm)});
  const {data} = await worker.recognize(canvas, {}, {blocks: true});
  const lines = [];
  (data.blocks || []).forEach(b => (b.paragraphs || []).forEach(p => (p.lines || []).forEach(l => lines.push({text: l.text, conf: l.confidence, ...l.bbox}))));
  return lines;
}

// Which ink a line of a square is written in: the most common close match
// among its pixels.
function eviLineInk(data, W, box){
  const counts = {};
  for(let y = Math.max(0, box.y0); y < box.y1; y++){
    for(let x = Math.max(0, box.x0); x < box.x1; x++){
      const i = (y * W + x) * 4;
      const k = eviInkOf(data[i], data[i + 1], data[i + 2], true);
      if(k) counts[k] = (counts[k] || 0) + 1;
    }
  }
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return best && best[1] >= 8 ? best[0] : null;
}

// The whole page → {month, found: [{kind, title, detail, from, to, notes,
// start, end (grid indexes)}], unmatchedNotes}.
async function eviReadCalendar(file, progress){
  const say = typeof progress === 'function' ? progress : () => {};
  say('Opening the image…');
  const img = await eviLoadImage(file);
  const scale = EVI_WIDTH / img.naturalWidth;
  const W = EVI_WIDTH, H = Math.round(img.naturalHeight * scale);
  const page = document.createElement('canvas');
  page.width = W; page.height = H;
  const pg = page.getContext('2d');
  pg.fillStyle = '#fff'; pg.fillRect(0, 0, W, H);
  pg.drawImage(img, 0, 0, W, H);
  let data = pg.getImageData(0, 0, W, H).data;
  const grid = eviFindGrid(data, W, H);
  if(!grid) throw new Error('Couldn’t find the calendar grid. Use the month’s calendar page (the PNG of the template), not the events page.');
  const {cols, rows} = grid;
  const colW = (cols[7] - cols[0]) / 7;

  say('Loading the reader…');
  const T = await eviLoadTesseract();
  const worker = await T.createWorker('eng', 1, EVI_TESS_OPTS);
  try{
    // 2. The month, from the big title above the grid.
    say('Reading the month…');
    const titleLines = await eviRead(worker, eviCrop(page, 0, Math.max(0, rows[0] - 220), cols[4], 200, (r, g, b) => r > 180 && g > 100 && g < 190 && b > 80 && b < 170 && r - b > 50, 1, true), 6);
    const month = eviMonthFromText(titleLines.map(l => l.text).join(' '));

    // 3. Bars across the week: a run of one ink wider than a square, a
    // band 14-50 px tall.
    say('Reading the bars…');
    const bars = [];
    for(let r = 0; r + 1 < rows.length; r++){
      const bandRuns = [];
      for(let y = rows[r] + 4; y < rows[r + 1] - 2; y++){
        let runInk = null, runStart = 0;
        const flush = x => { if(runInk && x - runStart > colW * 1.2) bandRuns.push({y, ink: runInk, x0: runStart, x1: x}); };
        for(let x = cols[0] + 2; x < cols[7] - 2; x++){
          const i = (y * W + x) * 4;
          const k = eviInkOf(data[i], data[i + 1], data[i + 2], true);
          if(k === runInk) continue;
          // The white type on a bar (and its soft edges) doesn't end it, as
          // long as the bar's color picks up again within 40 px.
          if(runInk){
            let resumes = false;
            for(let j = 1; j < 40 && x + j < cols[7]; j++){ const q = ((y * W) + x + j) * 4; if(eviInkOf(data[q], data[q + 1], data[q + 2], true) === runInk){ resumes = true; x += j - 1; break; } }
            if(resumes) continue;
          }
          flush(x);
          runInk = k; runStart = x;
        }
        flush(cols[7] - 2);
      }
      // Rows of runs → bars.
      bandRuns.forEach(run => {
        const bar = bars.find(b => b.row === r && b.ink === run.ink && run.y - b.y1 <= 2 && Math.abs(run.x0 - b.x0) < 30 && Math.abs(run.x1 - b.x1) < 30);
        if(bar){ bar.y1 = run.y; } else bars.push({row: r, ink: run.ink, x0: run.x0, x1: run.x1, y0: run.y, y1: run.y});
      });
    }
    const realBars = bars.filter(b => b.y1 - b.y0 >= 14 && b.y1 - b.y0 <= 50);
    const barItems = [];
    for(const b of realBars){
      const lines = await eviRead(worker, eviCrop(page, b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0 + 1, (r, g, bb) => Math.min(r, g, bb) > 200, 2, true), 7);
      const text = lines.map(l => l.text).join(' ');
      const col = x => Math.max(0, Math.min(6, Math.floor((x - cols[0]) / colW)));
      const ev = eviEventFromText(text, b.ink);
      if(ev) barItems.push({...ev, start: b.row * 7 + col(b.x0 + 4), end: b.row * 7 + col(b.x1 - 4)});
      // The bar is read: blank it so the square under it reads clean.
      pg.fillStyle = '#fff'; pg.fillRect(b.x0 - 2, b.y0 - 2, b.x1 - b.x0 + 4, b.y1 - b.y0 + 5);
    }
    data = pg.getImageData(0, 0, W, H).data;

    // 4. Each square, line by line (day numbers blanked first, so text
    // running into the next square doesn't pick one up).
    for(let r = 0; r + 1 < rows.length; r++) for(let c = 0; c < 7; c++) eviBlankDayNumber(pg, data, W, cols[c] + 1, rows[r] + 1);
    const found = [];
    let goals = null;
    const squares = (rows.length - 1) * 7;
    for(let r = 0; r + 1 < rows.length; r++){
      for(let c = 0; c < 7; c++){
        say(`Reading the days… ${r * 7 + c + 1} of ${squares}`);
        // The first column's text can run past the grid's left edge.
        // The Sunday column's text can run past the grid's lines on both sides.
        const x0 = c === 0 ? Math.max(0, cols[0] - 30) : cols[c] + 4, y0 = rows[r] + 4, w = (c === 0 ? cols[1] + 24 : cols[c + 1] - 4) - x0, h = rows[r + 1] - rows[r] - 8;
        // Skip a blank square fast.
        let ink = 0;
        for(let y = y0 + 26; y < y0 + h && ink < 30; y += 2) for(let x = x0; x < x0 + w; x += 2){ const i = (y * W + x) * 4; if(eviInkOf(data[i], data[i + 1], data[i + 2])) ink++; }
        if(ink < 30 && !(r === 0 && c === 0)) continue;
        const cell = eviCrop(page, x0, y0, w, h, eviIsType, EVI_SCALE);
        const rawLines = await eviRead(worker, cell, 6);
        // A line read with little confidence gets a second, closer look on
        // its own (small bold times like "3pm-6pm").
        for(const l of rawLines){
          if(l.conf >= 70 || l.x1 - l.x0 < 10) continue;
          const lx = x0 + l.x0 / EVI_SCALE - 3, ly = y0 + l.y0 / EVI_SCALE - 3, lw = (l.x1 - l.x0) / EVI_SCALE + 6, lh = (l.y1 - l.y0) / EVI_SCALE + 6;
          // A time ("Spm-6pm") is read again with only the characters a time has.
          const timeish = /\b(am|pm)\b|\d\s*[-–]\s*\d|[ap]m\s*[-–]/i.test(l.text);
          if(timeish) await worker.setParameters({tessedit_char_whitelist: '0123456789:-–apmAPM &.'});
          const again = (await eviRead(worker, eviCrop(page, lx, ly, lw, lh, eviIsType, 5), 7))[0];
          if(timeish) await worker.setParameters({tessedit_char_whitelist: ''});
          // A time line takes the second read only when it reads as a time
          // and the first didn't (or less surely).
          const better = again && (timeish
            ? eviParseTime(again.text) && (!eviParseTime(l.text) || again.conf > l.conf)
            : again.conf > l.conf);
          if(better){ l.text = again.text; l.conf = again.conf; }
        }
        const lines = rawLines
          .map(l => ({...l, x0: x0 + l.x0 / EVI_SCALE, x1: x0 + l.x1 / EVI_SCALE, y0: y0 + l.y0 / EVI_SCALE, y1: y0 + l.y1 / EVI_SCALE}))
          // Words, a time or a date range; a scrap like "ck" (a neighbor's
          // word running over the line) isn't.
          .filter(l => eviParseTime(l.text) || (l.conf >= 35 && /[a-z]{3,}|\d{1,2}\s*[-–.]\s*\d/i.test(l.text)));
        if(!lines.length) continue;
        // Monthly Goals: the first Sunday's box.
        if(r === 0 && c === 0 && lines.some(l => /monthly\s*goals/i.test(l.text))){
          const items = lines.filter(l => !/monthly\s*goals/i.test(l.text)).map(l => eviCleanText(l.text)).filter(Boolean);
          const joined = [];
          // A line goes on the one above when it starts lower case or the one
          // above left a parenthesis open ("Mobile DT (Bonus Points / All Month]").
          const openParen = t => (t.match(/\(/g) || []).length > (t.match(/[)\]]/g) || []).length;
          items.forEach(t => { if(joined.length && (/^[a-z(]/.test(t) || openParen(joined[joined.length - 1]))) joined[joined.length - 1] += ' ' + t; else joined.push(t); });
          goals = {kind: 'goal', title: 'Monthly Goals', detail: joined.join(' · ')};
          continue;
        }
        // Lines of one ink with no gap between them are one event.
        const blocks = [];
        lines.forEach(l => {
          const k = eviLineInk(data, W, {x0: Math.round(l.x0), y0: Math.round(l.y0), x1: Math.round(l.x1), y1: Math.round(l.y1)});
          if(!k) return;
          const last = blocks[blocks.length - 1];
          const lh = l.y1 - l.y0;
          // A time on its own line ("6AM-8PM") belongs to the name above it.
          const timeOnly = !/[a-z]{2,}/i.test(l.text.replace(/\b(am|pm)\b/gi, ''));
          if(last && last.kind === k && (l.y0 - last.y1 < lh * 0.9 || timeOnly)) { last.text += ' ' + l.text; last.y1 = l.y1; }
          else blocks.push({kind: k, text: l.text, y1: l.y1});
        });
        // A digit of the day number the corner blank missed ("3 Build-Your-Own" on the 23rd).
        const dd = month ? String(+eviDateAt(month, r * 7 + c).slice(8)) : '';
        if(dd.length === 2 && blocks.length) blocks[0].text = blocks[0].text.replace(new RegExp(`^\\s*${dd.slice(-1)}\\s+(?=[A-Z\\[])`), '');
        blocks.forEach(b => {
          const ev = eviEventFromText(b.text, b.kind);
          if(ev) found.push({...ev, start: r * 7 + c});
        });
      }
    }

    // 5. The panel beside the grid: Pre-Checklist and Notes.
    say('Reading the checklist and notes…');
    const panelX = cols[7] + 20;
    const panelLines = (await eviRead(worker, eviCrop(page, panelX, Math.max(0, rows[0] - 120), W - panelX - 4, rows[rows.length - 1] - rows[0] + 120, eviIsType, 2), 4))
      .filter(l => l.conf >= 30).map(l => ({text: l.text, x0: l.x0 / 2}));
    const panel = eviPanelFromLines(panelLines);

    const all = eviMergeBars(barItems).concat(found);
    const unmatchedNotes = eviAttachNotes(all, panel.notes);
    if(goals) all.unshift(goals);
    if(panel.checklist.length) all.unshift({kind: 'checklist', title: 'Pre-Checklist', notes: panel.checklist});
    return {month, found: all, unmatchedNotes};
  } finally {
    await worker.terminate();
  }
}

// ----- Manage → Events: pick an image, check what was read, add -----

let eviState = null;   // {status, month, found, list: [{ev, on}], unmatchedNotes, error}

function eviPanelHtml(){
  if(!eviState) return `
    <div class="evi-pick">
      <label class="btn btn-ghost evi-pick-btn">Read a calendar image<input type="file" accept="image/png,image/jpeg,image/webp" data-evi-file hidden></label>
      <span>The month's calendar page (PNG or JPG). You check every event before it's added.</span>
    </div>`;
  if(eviState.status === 'reading') return `<div class="evi-box" role="status" aria-live="polite"><b>Reading the calendar…</b><span>${escapeHtml(eviState.step || '')}</span></div>`;
  if(eviState.status === 'error') return `<div class="evi-box is-error" role="alert"><b>${escapeHtml(eviState.error)}</b><button type="button" class="btn btn-ghost" data-evi-cancel>OK</button></div>`;
  const kinds = Object.entries(EVENT_KINDS);
  const on = eviState.list.filter(x => x.on).length;
  const rows = eviState.list.map((x, i) => {
    const ev = x.ev;
    const month = EVENT_MONTH_KINDS.includes(ev.kind);
    return `
      <li class="evi-row ${x.on ? '' : 'is-off'}">
        <label class="evi-on"><input type="checkbox" data-evi-on="${i}" ${x.on ? 'checked' : ''} aria-label="Add ${escapeHtml(ev.title)}"></label>
        <div class="evi-fields">
          <div class="evi-line">
            <select data-evi-field="kind" data-evi-i="${i}" aria-label="Type">${kinds.map(([k, v]) => `<option value="${k}" ${k === ev.kind ? 'selected' : ''}>${escapeHtml(v.label)}</option>`).join('')}</select>
            <input type="text" data-evi-field="title" data-evi-i="${i}" value="${escapeHtml(ev.title)}" maxlength="120" aria-label="Event">
          </div>
          ${month ? '' : `<div class="evi-line evi-when">
            <input type="date" data-evi-field="date" data-evi-i="${i}" value="${escapeHtml(ev.date)}" aria-label="Date">
            <span>to</span><input type="date" data-evi-field="end" data-evi-i="${i}" value="${escapeHtml(ev.end || '')}" aria-label="Through">
            <input type="time" data-evi-field="from" data-evi-i="${i}" value="${escapeHtml(ev.from || '')}" aria-label="From">
            <span>–</span><input type="time" data-evi-field="to" data-evi-i="${i}" value="${escapeHtml(ev.to || '')}" aria-label="To">
          </div>`}
          <input type="text" class="evi-detail" data-evi-field="detail" data-evi-i="${i}" value="${escapeHtml(ev.detail || '')}" maxlength="240" placeholder="Detail (optional)" aria-label="Detail">
          ${Array.isArray(ev.notes) && ev.notes.length ? `<small class="evi-notes">${ev.notes.length} note${ev.notes.length === 1 ? '' : 's'}: ${escapeHtml(ev.notes.join(' · '))}</small>` : ''}
          ${x.dup ? '<small class="evi-dup">Already on the calendar</small>' : ''}
          ${x.outside ? '<small class="evi-dup">On a day of the month next to it — tick it if that month’s calendar doesn’t have it</small>' : ''}
        </div>
      </li>`;
  }).join('');
  return `
    <div class="evi-box evi-review">
      <div class="evi-head">
        <b>Found ${eviState.list.length} item${eviState.list.length === 1 ? '' : 's'}</b>
        <label class="evi-month">for <input type="month" data-evi-month value="${escapeHtml(eviState.month || '')}"></label>
      </div>
      ${eviState.month ? '' : '<p class="evi-warn">Couldn’t read the month from the title — pick it above.</p>'}
      <p class="evi-help">Check each one against the calendar: fix anything misread, untick what shouldn't go in. Nothing is added until you tap Add.</p>
      ${eviState.unmatchedNotes && eviState.unmatchedNotes.length ? `<p class="evi-help">Notes with no event on the grid (not added): ${escapeHtml(eviState.unmatchedNotes.join(', '))}</p>` : ''}
      <ul class="evi-list">${rows}</ul>
      <div class="ev-form-actions">
        <button type="button" class="btn btn-primary" data-evi-add ${on && eviState.month ? '' : 'disabled'}>Add ${on} event${on === 1 ? '' : 's'}</button>
        <button type="button" class="btn btn-ghost" data-evi-cancel>Cancel</button>
      </div>
    </div>`;
}

function eviRender(){
  const root = document.getElementById('eventsImportRoot');
  if(root) root.innerHTML = eviPanelHtml();
}

// The found items dated for the month on screen, ticked unless already there.
function eviBuildList(){
  const have = eventsList();
  eviSnapTitles(eviState.found, have.map(ev => ev.title));
  eviState.list = eviState.month ? eviDatedEvents(eviState.found, eviState.month).map(ev => {
    const dup = eviIsDuplicate(ev, have);
    const outside = !!ev.outside;
    delete ev.outside;
    return {ev, on: !dup && !outside, dup, outside};
  }) : [];
}

async function eviStart(file){
  eviState = {status: 'reading', step: ''};
  eviRender();
  try{
    const res = await eviReadCalendar(file, step => {
      eviState.step = step;
      const s = document.querySelector('#eventsImportRoot .evi-box span');
      if(s) s.textContent = step;
    });
    eviState = {status: 'review', month: res.month, found: res.found, unmatchedNotes: res.unmatchedNotes, list: []};
    eviBuildList();
  }catch(err){
    console.error('Calendar read failed:', err);
    eviState = {status: 'error', error: err && err.message ? err.message : 'Couldn’t read that image.'};
  }
  eviRender();
}

function eviAdd(){
  const picked = eviState.list.filter(x => x.on).map(x => x.ev);
  if(!picked.length) return;
  const bad = picked.find(ev => !String(ev.title || '').trim() || !/^\d{4}-\d{2}-\d{2}$/.test(ev.date || '') || (ev.end && ev.end < ev.date) || (!!ev.from !== !!ev.to) || (ev.from && ev.to <= ev.from));
  if(bad){ showToast(`Check "${bad.title || 'an event'}": it needs a name, a date, an end after its start, and both times or neither.`); return; }
  evEnsureOwnList();
  const stamp = Date.now().toString(36);
  picked.forEach((ev, i) => {
    const clean = {title: ev.title.trim(), kind: ev.kind, date: ev.date};
    if(ev.end && ev.end !== ev.date) clean.end = ev.end;
    if(ev.detail && ev.detail.trim()) clean.detail = ev.detail.trim();
    if(ev.from && ev.to){ clean.from = ev.from; clean.to = ev.to; }
    if(Array.isArray(ev.notes) && ev.notes.length) clean.notes = ev.notes.slice(0, 20);
    storeEvents.push({id: `evi-${stamp}-${i}`, ...clean});
  });
  const month = eviState.month;
  eviState = null;
  eviRender();
  evAfterChange(`${picked.length} event${picked.length === 1 ? '' : 's'} added`, month + '-01');
}

document.addEventListener('change', e => {
  const t = e.target;
  if(!t || !t.closest || !t.closest('#eventsImportRoot')) return;
  if(t.matches('[data-evi-file]')){ const f = t.files && t.files[0]; if(f) eviStart(f); return; }
  if(t.matches('[data-evi-month]')){ eviState.month = /^\d{4}-\d{2}$/.test(t.value) ? t.value : null; eviBuildList(); eviRender(); return; }
  if(t.matches('[data-evi-on]')){ const x = eviState.list[+t.dataset.eviOn]; if(x) x.on = t.checked; eviRender(); return; }
  if(t.matches('[data-evi-field]')){
    const x = eviState.list[+t.dataset.eviI];
    if(!x) return;
    const v = t.value.trim();
    if(v) x.ev[t.dataset.eviField] = v; else delete x.ev[t.dataset.eviField];
    if(t.dataset.eviField === 'kind') eviRender();
  }
});

document.addEventListener('click', e => {
  const t = e.target && e.target.closest ? e.target : null;
  if(!t || !t.closest('#eventsImportRoot')) return;
  if(t.closest('[data-evi-cancel]')){ eviState = null; eviRender(); return; }
  if(t.closest('[data-evi-add]')) eviAdd();
});
