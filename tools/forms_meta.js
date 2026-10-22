// The server's view of the built-in forms (forms_api.py): who may submit
// each, which are sensitive, its stages, which fields take photos, files or a
// signature, and the leader-only choices. Read from static/forms/
// form-definitions.js so the two never drift; tests/test_forms.py fails while
// forms_meta.json is out of date.
//   node tools/forms_meta.js > forms_meta.json
const fs = require('fs'), path = require('path'), vm = require('vm');
const ctx = {};
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'static', 'forms', 'form-definitions.js'), 'utf8'), ctx);
const flat = (fields, out = []) => { (fields || []).forEach(f => { out.push(f); if(f.fields) flat(f.fields, out); }); return out; };
const out = {};
ctx.OPS_FORM_DEFINITIONS.forEach(d => {
  const stages = d.stages || [{id: null, fields: d.fields}];
  const m = {audience: d.audience || 'all', sensitive: !!d.sensitive};
  if(d.stages){ m.stages = d.stages.map(s => s.id); m.open_summary = d.openSummary || []; }
  m.files = {};
  stages.forEach(s => {
    const ids = flat(s.fields).filter(f => ['photo', 'file', 'signature'].includes(f.type)).map(f => [f.id, f.type, f.max || (f.type === 'signature' ? 1 : f.type === 'file' ? 3 : 4)]);
    if(ids.length) m.files[s.id || ''] = ids;
  });
  const lo = {};
  stages.forEach(s => flat(s.fields).forEach(f => { if(f.options && f.options.some(o => o.leaderOnly)) lo[f.id] = f.options.filter(o => o.leaderOnly).map(o => o.v); }));
  if(Object.keys(lo).length) m.leader_options = lo;
  const anon = flat(stages.flatMap(s => s.fields)).find(f => f.role === 'anonymous');
  if(anon) m.anonymous = anon.id;
  out[d.id] = m;
});
process.stdout.write(JSON.stringify(out, null, 1) + '\n');
