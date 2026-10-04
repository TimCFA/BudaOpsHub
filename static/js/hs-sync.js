// ===== HOTSCHEDULES SYNC (bookmarklet) =====
// "Ops Hub Sync" is a bookmark a manager clicks on the HotSchedules
// Scheduling page (week view). It reads the week straight off the screen,
// builds the same CSV the Weekly Roster export gives, and hands it to an Ops
// Hub tab, which opens the usual roster preview to Confirm & Save.
//
// What it reads, and nothing else: each person's name and, per shift, the
// job, the in/out times and the schedule. Never the employee records
// HotSchedules keeps (phones, addresses, birthdates, emails), and never the
// hours or pay totals on the row. Shifts at other stores and "Unavailable"
// notes (.extra-details) are skipped.
//
// Hand-off: the bookmark opens Ops Hub at #hs-sync. Ops Hub says "ready" to
// the HotSchedules tab that opened it, the bookmark answers with the week,
// and Ops Hub only accepts it from that tab and that origin. If the two tabs
// can't talk (a browser that cuts the link between them), the bookmark
// offers a button that opens Ops Hub with the week in the address's # part,
// which never goes to a server and is cleared the moment the page reads it.
//
// Nothing is saved until a manager is signed in and confirms the preview.

const HS_SYNC_ORIGIN = 'https://app.hotschedules.com';
const HS_SYNC_MAX_CSV = 1000000;

// Runs on the HotSchedules page, not here: it's turned into the bookmark's
// code with toString(), so it can't use anything outside itself.
function hsSyncBookmarklet(HUB){
  var HS = 'https://app.hotschedules.com';
  if(location.origin !== HS){ alert('Ops Hub Sync works on HotSchedules. Open Scheduling (week view) there, then click the bookmark.'); return; }
  var old = document.getElementById('opshub-hs-sync');
  if(old) old.remove();
  var box = document.createElement('div');
  box.id = 'opshub-hs-sync';
  box.style.cssText = 'position:fixed;top:16px;right:16px;z-index:2147483647;max-width:340px;background:#fff;color:#222;border:2px solid #E31C23;border-radius:10px;padding:12px 14px;font:14px/1.4 system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.25)';
  var msg = document.createElement('div');
  box.appendChild(msg);
  var close = document.createElement('button');
  close.textContent = 'Close';
  close.style.cssText = 'margin-top:8px;border:1px solid #ccc;background:#fff;border-radius:6px;padding:4px 10px;cursor:pointer;font:inherit';
  close.onclick = function(){ box.remove(); };
  var say = function(t){ msg.textContent = t; };
  document.body.appendChild(box);

  var table = Array.prototype.find.call(document.querySelectorAll('table'), function(t){ return t.tHead && /Name/.test(t.tHead.textContent) && t.querySelector('tr[data-schedule-id]'); });
  if(!table){ say('No schedule found. Open Scheduling in week view, then click Ops Hub Sync again.'); box.appendChild(close); return; }
  var wk = (document.body.innerText || '').match(/Sun,?\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s*-\s*Sat,?\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  var pad = function(n){ return ('0' + n).slice(-2); };
  var yr = function(y){ return y.length === 2 ? '20' + y : y; };
  var start = wk ? pad(wk[1]) + pad(wk[2]) + yr(wk[3]) : '';
  var end = wk ? pad(wk[4]) + pad(wk[5]) + yr(wk[6]) : '';

  // Open the Ops Hub tab now, while the click still counts (pop-up blockers).
  var hub = window.open(HUB + '/#hs-sync', '_blank');
  var DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var dayAt = {};
  Array.prototype.forEach.call(table.tHead.rows[0].cells, function(c, i){
    var m = c.textContent.trim().match(/^(Sun|Mon|Tue|Wed|Thu|Fri|Sat)/);
    if(m && m[1] !== 'Sun') dayAt[i] = m[1];
  });
  var time = function(s){
    var m = String(s).replace(/^[\s\-–]+/, '').trim().match(/^(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m?\.?$/i);
    return m ? m[1] + ':' + (m[2] || '00') + ' ' + m[3].toUpperCase() + 'M' : null;
  };
  var text = function(el, sel){ var x = el.querySelector(sel); return x ? x.textContent.replace(/\s+/g, ' ').trim() : ''; };
  var people = {}, order = [], seen = {}, skipped = 0;
  var read = function(r){
    var nameEl = r.querySelector('.employee-name');
    var name = nameEl ? nameEl.textContent.replace(/\s+/g, ' ').trim() : '';
    if(!name) return;
    Array.prototype.forEach.call(r.cells, function(td){
      var day = dayAt[td.cellIndex];
      if(!day) return;
      td.querySelectorAll('.cell-content > .shift').forEach(function(s){
        var key = s.getAttribute('data-id') || [name, day, s.textContent].join('|');
        if(seen[key]) return;
        seen[key] = 1;
        var a = time(text(s, '.inTime')), b = time(text(s, '.outTime'));
        if(!a || !b){ skipped++; return; }
        if(!people[name]){ people[name] = {}; order.push(name); }
        (people[name][day] = people[name][day] || []).push([a + ' - ' + b, text(s, '.schedule-title'), text(s, '.job')]);
      });
    });
  };
  var sleep = function(ms){ return new Promise(function(res){ setTimeout(res, ms); }); };

  var payload = null, ready = false, sent = false;
  var send = function(){
    if(!payload || !ready || sent || !hub || hub.closed) return;
    sent = true;
    hub.postMessage(payload, HUB);
  };
  window.addEventListener('message', function(e){
    if(e.origin !== HUB || e.source !== hub || !e.data) return;
    if(e.data.type === 'opshub-hs-ready'){ ready = true; send(); }
    if(e.data.type === 'opshub-hs-ack'){ say('Sent to Ops Hub. Finish in the Ops Hub tab: review the week, then Confirm & Save.'); box.appendChild(close); }
  });

  (async function(){
    var rows = Array.prototype.slice.call(table.querySelectorAll('tr[data-schedule-id]'));
    var x = window.scrollX, y = window.scrollY, lazy = 0, misses = 0;
    for(var i = 0; i < rows.length; i++){
      var r = rows[i];
      say('Reading the schedule… ' + (i + 1) + ' of ' + rows.length + ' rows');
      if(r.classList.contains('subheader-row')) continue;
      // HotSchedules fills a row in only once it has been on screen.
      if(!r.classList.contains('rendered') && (lazy || misses < 3)){
        r.scrollIntoView({block: 'center'});
        for(var k = 0; k < 60 && !r.classList.contains('rendered'); k++) await sleep(25);
        if(r.classList.contains('rendered')) lazy = 1; else misses++;
      }
      read(r);
    }
    window.scrollTo(x, y);
    if(!order.length){ say('No shifts found on this page. Open Scheduling in week view for the week you want, then try again.'); box.appendChild(close); return; }
    var q = function(v){ return '"' + String(v).replace(/"/g, '""') + '"'; };
    var head = ['Employee'];
    DAYS.forEach(function(d){ head.push(d + ' Shift', d + ' Schedule', d + ' Job'); });
    var lines = [head.map(q).join(',')], shifts = 0;
    order.forEach(function(name){
      var p = people[name];
      var n = Math.max.apply(null, DAYS.map(function(d){ return (p[d] || []).length; }));
      for(var j = 0; j < n; j++){
        var row = [name];
        DAYS.forEach(function(d){ var s = (p[d] || [])[j]; if(s) shifts++; row.push(s ? s[0] : '', s ? s[1] : '', s ? s[2] : ''); });
        lines.push(row.map(q).join(','));
      }
    });
    payload = {type: 'opshub-hs-roster', v: 1, csv: lines.join('\n') + '\n', start: start, end: end, people: order.length, shifts: shifts};
    var week = wk ? wk[1] + '/' + wk[2] + ' – ' + wk[4] + '/' + wk[5] : 'this week';
    say('Read ' + order.length + ' people, ' + shifts + ' shifts (' + week + ')' + (skipped ? ', ' + skipped + ' shifts skipped (times unreadable)' : '') + '. Sending to Ops Hub…');
    send();
    // No answer from the Ops Hub tab: offer to open it with the week in the
    // address instead (pop-up blocked, or the browser cut the tabs apart).
    setTimeout(function(){
      if(sent) return;
      say('Ops Hub didn’t answer. Open it with the week instead:');
      var go = document.createElement('button');
      go.textContent = 'Open in Ops Hub';
      go.style.cssText = 'display:block;margin-top:8px;border:0;background:#E31C23;color:#fff;border-radius:6px;padding:8px 14px;font:inherit;font-weight:700;cursor:pointer';
      go.onclick = function(){
        sent = true;
        window.open(HUB + '/#hs-sync=' + encodeURIComponent(JSON.stringify(payload)), '_blank');
        say('Opened Ops Hub. Finish there: review the week, then Confirm & Save.');
        box.appendChild(close);
      };
      box.appendChild(go);
      box.appendChild(close);
    }, hub ? 8000 : 0);
  })();
}

function hsSyncBookmarkletHref(){
  return 'javascript:' + encodeURIComponent('(' + hsSyncBookmarklet.toString() + ')(' + JSON.stringify(location.origin) + ')');
}

// --- Ops Hub side -----------------------------------------------------------

let hsSyncPending = null;   // the week from HotSchedules, waiting for a manager
let hsSyncWaitTimer = null;

function hsSyncValid(d){
  return d && d.type === 'opshub-hs-roster' && typeof d.csv === 'string' && d.csv.length < HS_SYNC_MAX_CSV
    && /^"?Employee"?,/.test(d.csv) && (!d.start || /^\d{8}$/.test(d.start)) && (!d.end || /^\d{8}$/.test(d.end));
}

function hsSyncBar(text){
  let bar = document.getElementById('hsSyncBar');
  if(!text){ if(bar) bar.remove(); return; }
  if(!bar){
    bar = document.createElement('div');
    bar.id = 'hsSyncBar';
    bar.className = 'hs-sync-bar';
    bar.setAttribute('role', 'status');
    bar.innerHTML = '<span></span><button type="button" aria-label="Dismiss">✕</button>';
    bar.querySelector('button').addEventListener('click', ()=>{ bar.remove(); });
    document.body.appendChild(bar);
  }
  bar.querySelector('span').textContent = text;
}

function hsSyncReceive(d){
  if(!hsSyncValid(d)) return false;
  clearInterval(hsSyncWaitTimer);
  hsSyncPending = d;
  if(typeof launchShowTab === 'function') launchShowTab('manage');
  if(typeof launchManager !== 'undefined' && launchManager) hsSyncManagerReady();
  else hsSyncBar(`Week from HotSchedules received (${Number(d.people) || 0} people). Enter the manager PIN to review it.`);
  return true;
}

// Called once a manager session is confirmed (launchSetManager).
function hsSyncManagerReady(){
  const d = hsSyncPending;
  if(!d) return;
  hsSyncPending = null;
  hsSyncBar('');
  const name = d.start && d.end ? `HotSchedules_Sync_${d.start}_${d.end}.csv` : 'HotSchedules_Sync.csv';
  try{
    duImportRoster({name}, d.csv);
    showToast('Week loaded from HotSchedules');
  }catch(err){
    hsSyncBar('Couldn’t read the week from HotSchedules: ' + err.message);
  }
}

function hsSyncStart(){
  const hash = location.hash;
  if(!/^#hs-sync(=|$)/.test(hash)) return;
  // Take the week (if it came in the address) and clear it from the address
  // and history right away.
  history.replaceState(null, '', location.pathname + location.search);
  if(hash.startsWith('#hs-sync=')){
    let d = null;
    try{ d = JSON.parse(decodeURIComponent(hash.slice('#hs-sync='.length))); }catch(err){ /* fall through */ }
    if(!hsSyncReceive(d)) hsSyncBar('That HotSchedules link didn’t carry a readable week. Click Ops Hub Sync on the Scheduling page again.');
    return;
  }
  const hs = window.opener;
  if(!hs){ hsSyncBar('Open HotSchedules → Scheduling and click the Ops Hub Sync bookmark there.'); return; }
  hsSyncBar('Waiting for the week from HotSchedules…');
  let tries = 0;
  const ping = ()=>{
    try{ hs.postMessage({type: 'opshub-hs-ready'}, HS_SYNC_ORIGIN); }catch(err){ /* tab closed */ }
    if(++tries > 120){ clearInterval(hsSyncWaitTimer); hsSyncBar('Nothing came from HotSchedules. Click Ops Hub Sync on the Scheduling page again.'); }
  };
  hsSyncWaitTimer = setInterval(ping, 1000);
  ping();
}

window.addEventListener('message', e=>{
  if(e.origin !== HS_SYNC_ORIGIN || !window.opener || e.source !== window.opener) return;
  if(hsSyncReceive(e.data)) e.source.postMessage({type: 'opshub-hs-ack'}, HS_SYNC_ORIGIN);
});
window.addEventListener('hashchange', hsSyncStart);
// After every script has run (Manage, launch mode and the roster preview).
if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hsSyncStart);
else hsSyncStart();

// --- Install box in Data Uploads (roster row) --------------------------------

function hsSyncInstallHtml(){
  return `<div class="du-sync hs-sync-install">
    <a class="du-sync-btn hs-sync-link" href="${escapeHtml(hsSyncBookmarkletHref())}" data-hs-sync-link draggable="true" title="Drag to your bookmarks bar">Ops Hub Sync</a>
    <button type="button" class="hs-sync-copy" data-hs-sync-copy>Copy bookmark code</button>
    <span class="du-sync-note">On a computer, drag the red button to your bookmarks bar. Then open HotSchedules → Scheduling (week view) and click the bookmark: the week opens here to review. It reads names and shift times only — never phone numbers, hours or pay.</span>
  </div>`;
}

document.getElementById('dataUploadsRoot').addEventListener('click', async e=>{
  if(e.target.closest('[data-hs-sync-link]')){
    e.preventDefault();
    showToast('Drag it to your bookmarks bar, then click it on HotSchedules');
  }
  if(e.target.closest('[data-hs-sync-copy]')){
    try{
      await navigator.clipboard.writeText(hsSyncBookmarkletHref());
      showToast('Copied — make a new bookmark and paste it as the address');
    }catch(err){
      showToast('Couldn’t copy here — drag the red button to your bookmarks bar instead');
    }
  }
});
