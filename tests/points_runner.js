// Runs Directors → Points (static/js/points-engine.js + points.js) on cases
// from tests/test_points.py: reads {cases: [{op}]} on stdin. A punch report
// is built as pdf.js text items in the Actual vs. Scheduled layout.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const js = n => fs.readFileSync(path.join(__dirname, '..', 'static', 'js', n), 'utf8');
const ctx = {console, today: '2026-10-12', document: {addEventListener(){}, querySelector(){ return null; }}, window: {},
  escapeHtml: s => (s === null || s === undefined) ? '' : String(s).replace(/[&<>"']/g, ch => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[ch])),
  getInitials: () => 'TL', saveState(){}, showToast(){}, renderDirectorsView(){},
  leaderListed: n => /aurora/i.test(n)};
vm.createContext(ctx);
vm.runInContext('let pointsRecords = {}, pointsUploads = [], pointsSettings = {}, pointsTeam = {}, pointsMemos = {};', ctx);
vm.runInContext("let leaderRoster = [{name: 'Kianna Ramos'}]; function dirList(){ return [{name: 'Timothy Lane'}, {name: 'Kianna Ramos'}]; }", ctx);
vm.runInContext(js('points-engine.js'), ctx);
vm.runInContext(js('points.js'), ctx);
// A report: [text, x, y] per item, all on one page.
vm.runInContext(`
  function page(items){ return [{items: items.map(([s, x, y]) => ({s, x, y}))}]; }
  const REPORT = page([
    ['Actual Vs. Scheduled', 200, 790], ['Chick-fil-A Buda (04066)', 200, 780], ['10/05/2026 - 10/11/2026', 200, 770], ['10/12/2026 3:00:00 AM', 400, 760],
    ['Torres, Maya', 10, 700],
    ['09/30/2026', 150, 695], ['06:30 AM', 200, 695], ['06:00 AM', 260, 695], ['02:00 PM', 200, 686], ['02:00 PM', 260, 686],
    ['10/06/2026', 150, 690], ['06:08 AM', 200, 690], ['06:00 AM', 260, 690], ['11:00 AM', 200, 681], ['02:00 PM', 260, 681],
    ['10/06/2026', 150, 660], ['11:40 AM', 200, 660], ['02:00 PM', 200, 651],
    ['Ruiz, Ana', 10, 600],
    ['10/07/2026', 150, 590], ['05:00 PM', 260, 590], ['10:00 PM', 260, 581],
    ['Cole, Ben', 10, 550],
    ['10/08/2026', 150, 540], ['10:00 AM', 200, 540], ['02:00 PM', 200, 531],
    ['Diaz, Aurora', 10, 500],
    ['10/08/2026', 150, 490], ['06:30 AM', 200, 490], ['06:00 AM', 260, 490], ['02:00 PM', 200, 481], ['02:00 PM', 260, 481]
  ]);
`, ctx);
vm.runInContext(`function setup(){ ptCommit(ptPrepare(APS.parseReport(REPORT)), 'a.pdf');
  const items = ptReviewItems(); ptResolve('ruiz-ana', items.find(e => e.tm === 'ruiz-ana').id, 'ncns'); ptResolve('cole-ben', items.find(e => e.tm === 'cole-ben').id, 'pickup'); }`, ctx);
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
process.stdout.write(JSON.stringify(input.cases.map(c => vm.runInContext(`(${c.op})`, ctx)(c))));
