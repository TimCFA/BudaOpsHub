// Runs tasks.js on cases from tests/test_tasks.py: reads {cases: [{op, ...}]}
// on stdin. Today is Tue Oct 27 2026; `role` and `name` set who's signed in
// (Ana Ruiz, a Team Member, unless a case says otherwise). The page draws
// into a stand-in root whose html the case can return (doc.html).
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const js = f => fs.readFileSync(path.join(__dirname, '..', 'static', 'js', f), 'utf8');

const escapeHtml = s => String(s === undefined || s === null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const roots = {};
const el = id => roots[id] || (roots[id] = {id, innerHTML: '', classList: {add(){}, remove(){}, toggle(){}, contains: () => id === 'tasksView'}, addEventListener(){}, querySelector(){ return null; }, querySelectorAll(){ return []; }});
const ctx = {
  console, today: '2026-10-27', escapeHtml, API_BASE: '', role: 'member', name: 'Ana Ruiz',
  setTimeout(){}, confirm: () => true, fetch: () => Promise.reject(new Error('no server')),
  showToast(){}, saveState(){ return Promise.resolve(); }, syncState(){}, launchShowTab(){},
  window: {scrollTo(){}},
  document: {addEventListener(){}, getElementById: el},
  doc: {get html(){ return el('tasksRoot').innerHTML; }},
  rnRow: (n, text, es, go, tone) => ({n, text, es: es || '', go: go || '', tone: tone || ''}),
  toLocalISODate: d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
};
vm.createContext(ctx);
vm.runInContext('let teamTasks = []; let teamProjects = [];', ctx);
vm.runInContext('function rnViewer(){ return {role, name}; }', ctx);
// rnSame and the Spanish glossary as the page has them.
vm.runInContext(js('right-now.js').match(/function rnSame[\s\S]*?\n}\n/)[0], ctx);
vm.runInContext(js('spanish.js'), ctx);
vm.runInContext(js('tasks.js'), ctx);
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
process.stdout.write(JSON.stringify(input.cases.map(c => vm.runInContext(`(${c.op})`, ctx)(c))));
