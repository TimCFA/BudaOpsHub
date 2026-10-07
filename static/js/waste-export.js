// ===== WASTE EXPORT =====
// Export the waste log for the days you need (Tim, Oct 2026): usually today,
// last week or the month, as a CSV and/or a PDF. On the Waste page itself
// (the Export button over Recent Entries) and in Manage → Backup & Data;
// both show the same panel and choices. Exporting a whole month also saves
// that month's summary (wasteMonthlyHistory), as the old monthly export did.

const WX_PRESETS = [['today', 'Today'], ['lastweek', 'Last week'], ['month', 'This month'], ['lastmonth', 'Last month'], ['custom', 'Pick days']];
let wxPreset = 'today', wxFrom = null, wxTo = null, wxLoc = 'all';

// [from, to] as ISO days. Last week is Monday to Saturday of the week before
// this one (the store's closed Sunday left off); the rest as the Waste
// Dashboard reads them (wdRange).
function wxRange(preset, from, to, now){
  if(preset === 'lastweek'){
    const t = toLocalISODate(now || new Date());
    const monday = isoAddDays(t, -((new Date(t + 'T00:00:00').getDay() + 6) % 7));
    return [isoAddDays(monday, -7), isoAddDays(monday, -2)];
  }
  return wdRange(preset, from, to, now);
}

// "Wednesday, Oct 7", "Sep 28 – Oct 3, 2026", "October 2026", "October 2026 to date".
function wxLabel(range, now){
  const t = toLocalISODate(now || new Date());
  const [a, b] = range;
  const d = (iso, o) => new Date(iso + 'T00:00:00').toLocaleDateString('en-US', o);
  if(a === b) return d(a, {weekday: 'long', month: 'short', day: 'numeric', year: 'numeric'});
  const first = a.slice(8) === '01' && a.slice(0, 7) === b.slice(0, 7);
  const monthEnd = toLocalISODate(new Date(+a.slice(0, 4), +a.slice(5, 7), 0));
  if(first && b === monthEnd) return d(a, {month: 'long', year: 'numeric'});
  if(first && b === t) return d(a, {month: 'long', year: 'numeric'}) + ' to date';
  return `${d(a, {month: 'short', day: 'numeric'})} – ${d(b, {month: 'short', day: 'numeric', year: 'numeric'})}`;
}

// The month a range covers whole (or to date, for this month), else null.
function wxWholeMonth(range, now){
  const t = toLocalISODate(now || new Date());
  const [a, b] = range;
  if(a.slice(8) !== '01' || a.slice(0, 7) !== b.slice(0, 7)) return null;
  const monthEnd = toLocalISODate(new Date(+a.slice(0, 4), +a.slice(5, 7), 0));
  return b === monthEnd || b === t ? a.slice(0, 7) : null;
}

function wxSum(list){ return list.reduce((s, e) => s + (Number(e.cost) || 0), 0); }

// The panel. `es`: Spanish beside the English (the Waste page; Manage is
// English only).
function wxPanelHtml(es){
  const S = (en, ...a) => es ? esHtml(en, ...a) : '';
  const range = wxRange(wxPreset, wxFrom, wxTo);
  const list = wdEntriesIn(range, wxLoc);
  const foh = wxSum(list.filter(e => e.section === 'foh')), boh = wxSum(list.filter(e => e.section === 'boh'));
  return `<div class="wx">
      <div class="wx-chips" role="group" aria-label="Days">${WX_PRESETS.map(([k, label]) => `<button type="button" class="wx-chip ${wxPreset === k ? 'active' : ''}" data-wx-preset="${k}" aria-pressed="${wxPreset === k}">${escapeHtml(label)}${S(label)}</button>`).join('')}</div>
      ${wxPreset === 'custom' ? `<div class="wx-dates">
        <label>From${S('From')}<input type="date" data-wx-from value="${escapeHtml(range[0])}" max="${escapeHtml(today)}"></label>
        <label>To${S('To')}<input type="date" data-wx-to value="${escapeHtml(range[1])}" max="${escapeHtml(today)}"></label>
      </div>` : ''}
      <div class="wx-loc" role="group" aria-label="Location">${[['all', 'FOH + BOH'], ['foh', 'FOH'], ['boh', 'BOH']].map(([k, label]) => `<button type="button" class="wx-loc-btn ${wxLoc === k ? 'active' : ''}" data-wx-loc="${k}" aria-pressed="${wxLoc === k}">${label}</button>`).join('')}</div>
      <div class="wx-sum">
        <div class="wx-when">${escapeHtml(wxLabel(range))}</div>
        ${list.length ? `<div class="wx-total"><b>${escapeHtml('$' + wxSum(list).toFixed(2))}</b><span>${list.length} ${list.length === 1 ? 'entry' : 'entries'}${S('N entries', list.length)}</span></div>
          ${wxLoc === 'all' ? `<div class="wx-split">FOH ${escapeHtml('$' + foh.toFixed(2))} · BOH ${escapeHtml('$' + boh.toFixed(2))}</div>` : ''}`
          : `<div class="wx-none">No waste logged for those days${S('No waste logged for those days')}</div>`}
      </div>
      <div class="wx-actions">
        <button type="button" class="btn btn-primary" data-wx-export="csv" ${list.length ? '' : 'disabled'}>Download CSV${S('Download CSV')}</button>
        <button type="button" class="btn btn-secondary" data-wx-export="pdf" ${list.length ? '' : 'disabled'}>Download PDF${S('Download PDF')}</button>
      </div>
    </div>`;
}

function renderWasteExport(){
  const page = document.getElementById('wasteExportRoot');
  if(page) page.innerHTML = wxPanelHtml(true);
  const manage = document.getElementById('wasteExportManageRoot');
  if(manage) manage.innerHTML = wxPanelHtml(false);
}

function wxDownload(text, name, type){
  const blob = new Blob([text], {type});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

async function wxExport(kind){
  const range = wxRange(wxPreset, wxFrom, wxTo);
  const list = wdEntriesIn(range, wxLoc);
  if(!list.length){ showToast('No waste logged for those days'); return; }
  const label = wxLabel(range) + (wxLoc === 'all' ? '' : ` · ${wxLoc.toUpperCase()} only`);
  const name = `cfa-buda-waste_${range[0] === range[1] ? range[0] : range[0] + '_to_' + range[1]}${wxLoc === 'all' ? '' : '_' + wxLoc}`;
  if(kind === 'pdf'){
    if(!window.jspdf){ showToast('The PDF maker didn’t load; try the CSV, or reload the page'); return; }
    generateWastePdf(list, label, name + '.pdf');
  } else {
    wxDownload(wdCsv(list), name + '.csv', 'text/csv');
  }
  // A whole month (both sides): keep its summary for month-over-month
  // comparisons that outlive the 90 days of entries.
  const month = wxLoc === 'all' ? wxWholeMonth(range) : null;
  if(month){
    const byProduct = {};
    list.forEach(e => { const n = wasteItemFor(e).name; byProduct[n] = (byProduct[n] || 0) + (Number(e.cost) || 0); });
    wasteMonthlyHistory[month] = {
      total: wxSum(list),
      fohTotal: wxSum(list.filter(e => e.section === 'foh')),
      bohTotal: wxSum(list.filter(e => e.section === 'boh')),
      entryCount: list.length,
      topProducts: Object.entries(byProduct).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, cost]) => ({name, cost})),
      closedOutAt: Date.now()
    };
  }
  wasteLogLastClosedOut = Date.now();
  if(typeof wasteExportStatus === 'function') wasteExportStatus();
  showToast(`✓ ${label} · ${kind.toUpperCase()} downloaded`);
  await saveState();
}

document.addEventListener('click', e => {
  const t = e.target && e.target.closest ? e.target : null;
  if(!t) return;
  if(t.closest('#btnWasteExport')){
    renderWasteExport();
    document.getElementById('wasteExportModal').classList.add('active');
    return;
  }
  if(t.id === 'wasteExportModal' || t.closest('#btnWasteExportDone')){ document.getElementById('wasteExportModal').classList.remove('active'); return; }
  if(!t.closest('.wx')) return;
  const p = t.closest('[data-wx-preset]');
  if(p){ wxPreset = p.dataset.wxPreset; if(wxPreset === 'custom' && !wxFrom){ wxFrom = isoAddDays(today, -6); wxTo = today; } renderWasteExport(); return; }
  const l = t.closest('[data-wx-loc]');
  if(l){ wxLoc = l.dataset.wxLoc; renderWasteExport(); return; }
  const x = t.closest('[data-wx-export]');
  if(x && !x.disabled) wxExport(x.dataset.wxExport);
});

document.addEventListener('change', e => {
  const t = e.target;
  if(!t || !t.closest || !t.closest('.wx')) return;
  if(t.matches('[data-wx-from]')) wxFrom = t.value;
  else if(t.matches('[data-wx-to]')) wxTo = t.value;
  else return;
  renderWasteExport();
});
