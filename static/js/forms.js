// ===== FORMS (Tim, Oct 21 2026) =====
// The store's Connecteam forms, rebuilt: the Forms tab is for everyone;
// whoever reads the submissions (directors, the manager PIN, the Admin Team)
// gets a Submissions switch at the top; directors and managers add their own
// forms in Manage → Forms. The engine (static/forms/forms-engine.js) draws
// every form from its definition (static/forms/form-definitions.js, plus the
// added ones from the server) and talks to forms_api.py. Leader-only forms
// and choices show once a leader signs in; the server checks again.

const FM_ENDPOINT = `${typeof API_BASE !== 'undefined' ? API_BASE : ''}/api/forms`;
// Buda only (Tim, Oct 23 2026): the forms don't ask which store, and the
// submissions don't split by store.
const FM_STORES = [{v: 'buda', l: 'Buda'}];
let fmApp = null;            // the engine's form library, once mounted
let fmInbox = null;          // the engine's inbox, once mounted
let fmMode = 'fill';         // 'fill' | 'inbox'
let fmCustom = [];           // forms added in Manage (hidden ones too, for a manager)
let fmCustomLoaded = false;
let fmBuilder = null;        // the form open in the builder
let fmBuilderNote = '';

function fmIsLeader(){
  if(typeof launchManager !== 'undefined' && launchManager) return true;
  return typeof acUser !== 'undefined' && !!acUser && ['lead', 'admin', 'director'].includes(acUser.role);
}
function fmCanInbox(){
  if(typeof launchManager !== 'undefined' && launchManager) return true;
  return typeof acUser !== 'undefined' && !!acUser && acUser.role === 'admin';
}
function fmDefs(){
  return [...(window.OPS_FORM_DEFINITIONS || []), ...fmCustom.filter(d => !d.hidden)];
}
// Names on the schedule around today, for the name boxes' suggestions.
function fmRoster(){
  const names = new Set();
  [fohRoster, bohRoster].forEach(r => Object.keys(r || {}).forEach(iso => {
    if(iso >= fcAddDaysSafe(today, -14) && iso <= fcAddDaysSafe(today, 7)) (r[iso] || []).forEach(p => { if(p && p.name) names.add(p.name); });
  }));
  return [...names].sort();
}

async function fmLoadCustom(){
  try{
    const res = await fetch(`${FM_ENDPOINT}/definitions`, {cache: 'no-store'});
    if(!res.ok) return;
    const data = await res.json();
    fmCustom = Array.isArray(data.forms) ? data.forms : [];
    fmCustomLoaded = true;
  }catch(e){ /* offline: the built-in forms still work */ }
}

async function renderForms(){
  const root = document.getElementById('formsRoot');
  if(!root || typeof OpsForms === 'undefined') return;
  if(!fmCustomLoaded) await fmLoadCustom();
  if(!fmCanInbox()) fmMode = 'fill';
  const sw = document.getElementById('formsSwitch');
  sw.innerHTML = fmCanInbox() ? `
    <div class="fm-switch" role="tablist" aria-label="Forms">
      <button type="button" role="tab" aria-selected="${fmMode === 'fill'}" class="${fmMode === 'fill' ? 'is-on' : ''}" data-fm-mode="fill">Fill out a form</button>
      <button type="button" role="tab" aria-selected="${fmMode === 'inbox'}" class="${fmMode === 'inbox' ? 'is-on' : ''}" data-fm-mode="inbox">Submissions</button>
    </div>` : '';
  const fill = document.getElementById('formsFill'), inbox = document.getElementById('formsInbox');
  fill.hidden = fmMode !== 'fill';
  inbox.hidden = fmMode !== 'inbox';
  if(fmMode === 'fill'){
    if(!fmApp) fmApp = OpsForms.mount(fill, {endpoint: FM_ENDPOINT, definitions: fmDefs(), isLeader: fmIsLeader(), roster: fmRoster(), stores: FM_STORES});
    else fmApp.setLeader(fmIsLeader());
  } else {
    if(!fmInbox) fmInbox = OpsForms.mountInbox(inbox, {endpoint: FM_ENDPOINT, definitions: fmDefs(), stores: FM_STORES});
    else fmInbox.refresh();
  }
}

// After a sign-in change: leader forms in or out, the Submissions switch.
function fmSync(){
  if(fmApp) fmApp.setLeader(fmIsLeader());
  if(!fmCanInbox() && fmInbox){ fmInbox = null; document.getElementById('formsInbox').innerHTML = ''; }
  if(document.getElementById('formsView').classList.contains('active')) renderForms();
}

// Start over with the latest forms (after one is added or changed).
function fmRemount(){
  fmApp = null; fmInbox = null;
  ['formsFill', 'formsInbox'].forEach(id => { const el = document.getElementById(id); if(el){ el.innerHTML = ''; el.className = ''; } });
}

document.getElementById('formsSwitch').addEventListener('click', e => {
  const b = e.target.closest('[data-fm-mode]');
  if(!b) return;
  fmMode = b.dataset.fmMode;
  renderForms();
});

// ===== Manage → Forms: the forms directors and managers add =====
const FM_TYPES = [
  ['text', 'Short answer'], ['textarea', 'Paragraph'], ['person', 'A name'], ['number', 'Number'], ['currency', 'Dollar amount'],
  ['date', 'Date'], ['time', 'Time'], ['choice', 'Pick one'], ['multi', 'Pick any'], ['yesno', 'Yes / No'],
  ['photo', 'Photos'], ['signature', 'Signature']
];
const FM_CATEGORIES = [['ops', 'Around the restaurant'], ['people', 'Team & HR'], ['money', 'Money & receipts'], ['safety', 'Report an incident']];

function fmNewQuestion(){ return {type: 'text', label: '', label_es: '', required: true, options: []}; }
function fmBlankForm(){ return {title: '', title_es: '', blurb: '', category: 'ops', audience: 'all', sensitive: false, askStore: true, hidden: false, fields: [{...fmNewQuestion(), type: 'person', label: 'Your name', label_es: 'Tu nombre'}, fmNewQuestion()]}; }
// A saved form back into the builder (its store question is the builder's checkbox).
function fmEditable(d){
  return {...d, fields: (d.fields || []).filter(f => f.type !== 'store').map(f => ({...f, options: (f.options || []).map(o => ({l: o.l, l_es: o.l_es || ''}))}))};
}

async function renderFormsManage(){
  const root = document.getElementById('formsManageRoot');
  if(!root) return;
  await fmLoadCustom();
  if(fmBuilder){ root.innerHTML = fmBuilderHtml(); return; }
  root.innerHTML = `
    <p class="fm-note">The store's ${(window.OPS_FORM_DEFINITIONS || []).length} forms are built in. Add your own here: they show on the Forms tab right away, and what's sent comes to Submissions there.</p>
    ${fmCustom.length ? `<ul class="fm-list">${fmCustom.map(d => `
      <li class="${d.hidden ? 'is-hidden' : ''}">
        <span class="fm-list-t"><b>${escapeHtml(d.title)}</b><small>${(d.fields || []).filter(f => f.type !== 'store').length} questions · ${d.audience === 'leaders' ? 'leaders only' : 'everyone'}${d.sensitive ? ' · directors read it' : ''}${d.hidden ? ' · hidden' : ''}</small></span>
        <button type="button" class="btn btn-ghost fm-sm" data-fm-edit="${escapeHtml(d.id)}">Edit</button>
        <button type="button" class="btn btn-ghost fm-sm" data-fm-hide="${escapeHtml(d.id)}">${d.hidden ? 'Show' : 'Hide'}</button>
      </li>`).join('')}</ul>` : '<p class="fm-note">No forms added yet.</p>'}
    <button type="button" class="btn btn-primary fm-add" data-fm-new>Add a form</button>`;
}

function fmBuilderHtml(){
  const d = fmBuilder;
  const opt = (list, cur) => list.map(([v, l]) => `<option value="${v}"${v === cur ? ' selected' : ''}>${l}</option>`).join('');
  return `
    <div class="fm-b">
      <div class="fm-b-row"><label>Title<input data-fm-f="title" value="${escapeHtml(d.title)}" maxlength="80" placeholder="e.g. Catering Order Check"></label>
        <label>Title in Spanish <small>optional</small><input data-fm-f="title_es" value="${escapeHtml(d.title_es || '')}" maxlength="80"></label></div>
      <label>One line about it <small>optional</small><input data-fm-f="blurb" value="${escapeHtml(d.blurb || '')}" maxlength="140"></label>
      <div class="fm-b-row">
        <label>Section<select data-fm-f="category">${opt(FM_CATEGORIES, d.category)}</select></label>
        <label>Who fills it out<select data-fm-f="audience">${opt([['all', 'Everyone'], ['leaders', 'Leaders only']], d.audience)}</select></label>
      </div>
      <label class="fm-check"><input type="checkbox" data-fm-f="askStore"${d.askStore ? ' checked' : ''}> Ask which store</label>
      <label class="fm-check"><input type="checkbox" data-fm-f="sensitive"${d.sensitive ? ' checked' : ''}> Sensitive: only directors read what's sent</label>
      <div class="fm-b-qs">${d.fields.map((f, i) => `
        <div class="fm-q" data-fm-q="${i}">
          <div class="fm-q-head"><b>${i + 1}</b>
            <select data-fm-qf="type" aria-label="Kind of answer">${opt(FM_TYPES, f.type)}</select>
            <label class="fm-check"><input type="checkbox" data-fm-qf="required"${f.required ? ' checked' : ''}> Required</label>
            <span class="fm-q-move">
              <button type="button" class="fm-icon" data-fm-move="-1" aria-label="Move up"${i === 0 ? ' disabled' : ''}>↑</button>
              <button type="button" class="fm-icon" data-fm-move="1" aria-label="Move down"${i === d.fields.length - 1 ? ' disabled' : ''}>↓</button>
              <button type="button" class="fm-icon" data-fm-remove aria-label="Remove question">×</button>
            </span>
          </div>
          <input data-fm-qf="label" value="${escapeHtml(f.label)}" maxlength="200" placeholder="The question">
          <input data-fm-qf="label_es" value="${escapeHtml(f.label_es || '')}" maxlength="200" placeholder="In Spanish (optional)">
          ${f.type === 'choice' || f.type === 'multi' ? `<textarea data-fm-qf="options" rows="3" placeholder="One choice per line (at least two)">${escapeHtml((f.options || []).map(o => o.l).join('\n'))}</textarea>` : ''}
        </div>`).join('')}</div>
      <button type="button" class="btn btn-ghost fm-sm" data-fm-addq>+ Add a question</button>
      ${fmBuilderNote ? `<p class="fm-err" role="alert">${escapeHtml(fmBuilderNote)}</p>` : ''}
      <div class="fm-b-bar">
        <button type="button" class="btn btn-ghost" data-fm-cancel>Cancel</button>
        <button type="button" class="btn btn-primary" data-fm-save>${d.id ? 'Save changes' : 'Add the form'}</button>
      </div>
    </div>`;
}

// What's typed in the builder back into fmBuilder (before any redraw).
function fmReadBuilder(){
  const root = document.getElementById('formsManageRoot');
  root.querySelectorAll('[data-fm-f]').forEach(el => { fmBuilder[el.dataset.fmF] = el.type === 'checkbox' ? el.checked : el.value; });
  root.querySelectorAll('[data-fm-q]').forEach(q => {
    const f = fmBuilder.fields[+q.dataset.fmQ];
    q.querySelectorAll('[data-fm-qf]').forEach(el => {
      const k = el.dataset.fmQf;
      if(k === 'required') f.required = el.checked;
      else if(k === 'options') f.options = el.value.split('\n').map(l => l.trim()).filter(Boolean).map(l => ({l}));
      else f[k] = el.value;
    });
  });
}

async function fmSaveForm(form){
  const res = await fetch(`${FM_ENDPOINT}/definitions`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(form)});
  const data = await res.json().catch(() => ({}));
  if(!res.ok) throw new Error(data.error || 'Could not save the form');
  fmCustomLoaded = false;
  fmRemount();
  return data.form;
}

document.getElementById('formsManageRoot').addEventListener('click', async e => {
  if(e.target.closest('[data-fm-new]')){ fmBuilder = fmBlankForm(); fmBuilderNote = ''; renderFormsManage(); return; }
  const edit = e.target.closest('[data-fm-edit]');
  if(edit){ const d = fmCustom.find(x => x.id === edit.dataset.fmEdit); if(d){ fmBuilder = fmEditable(d); fmBuilderNote = ''; renderFormsManage(); } return; }
  const hide = e.target.closest('[data-fm-hide]');
  if(hide){
    const d = fmCustom.find(x => x.id === hide.dataset.fmHide);
    if(!d) return;
    try{ await fmSaveForm({...fmEditable(d), hidden: !d.hidden}); showToast(d.hidden ? 'Shown on the Forms tab' : 'Hidden from the Forms tab'); }
    catch(err){ showToast(err.message); }
    renderFormsManage();
    return;
  }
  if(!fmBuilder) return;
  fmReadBuilder();
  if(e.target.closest('[data-fm-cancel]')){ fmBuilder = null; renderFormsManage(); return; }
  if(e.target.closest('[data-fm-addq]')){ fmBuilder.fields.push(fmNewQuestion()); renderFormsManage(); return; }
  const q = e.target.closest('[data-fm-q]');
  const move = e.target.closest('[data-fm-move]');
  if(q && move){
    const i = +q.dataset.fmQ, j = i + (+move.dataset.fmMove);
    if(j >= 0 && j < fmBuilder.fields.length) [fmBuilder.fields[i], fmBuilder.fields[j]] = [fmBuilder.fields[j], fmBuilder.fields[i]];
    renderFormsManage();
    return;
  }
  if(q && e.target.closest('[data-fm-remove]')){ fmBuilder.fields.splice(+q.dataset.fmQ, 1); renderFormsManage(); return; }
  if(e.target.closest('[data-fm-save]')){
    const btn = e.target.closest('[data-fm-save]');
    btn.disabled = true;
    try{
      const saved = await fmSaveForm(fmBuilder);
      fmBuilder = null; fmBuilderNote = '';
      showToast(`✓ "${saved.title}" is on the Forms tab`);
    }catch(err){ fmBuilderNote = err.message; }
    renderFormsManage();
  }
});
// A new kind of answer may add or drop the choices box.
document.getElementById('formsManageRoot').addEventListener('change', e => {
  if(fmBuilder && e.target.matches('[data-fm-qf="type"]')){ fmReadBuilder(); renderFormsManage(); }
});
