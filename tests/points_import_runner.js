// Runs Directors → Points → "Bring in the old tracker" (static/js/points-import.js,
// on points-engine.js + points.js) on cases from tests/test_points_import.py:
// reads {cases: [{op}]} on stdin. Workbooks are given as the sheets SheetJS
// would read: {sheet name: [row objects]}. Names are made up.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const js = n => fs.readFileSync(path.join(__dirname, '..', 'static', 'js', n), 'utf8');
const ctx = {console, today: '2026-10-13', document: {addEventListener(){}, querySelector(){ return null; }}, window: {},
  escapeHtml: s => (s === null || s === undefined) ? '' : String(s).replace(/[&<>"']/g, ch => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[ch])),
  getInitials: () => 'TL', saveState(){}, showToast(){}, renderDirectorsView(){},
  leaderListed: n => /maya/i.test(n)};
vm.createContext(ctx);
vm.runInContext('let pointsRecords = {}, pointsUploads = [], pointsSettings = {}, pointsTeam = {}, pointsMemos = {};', ctx);
vm.runInContext("let leaderRoster = []; function dirList(){ return [{name: 'Timothy Lane'}]; }", ctx);
vm.runInContext(js('points-engine.js'), ctx);
vm.runInContext(js('points.js'), ctx);
vm.runInContext(js('points-import.js'), ctx);
vm.runInContext(`
  function page(items){ return [{items: items.map(([s, x, y]) => ({s, x, y}))}]; }
  const ev = (name, date, type, points, running, status, extra) => Object.assign({'Team member': name, Quarter: '2026-Q4', Date: date, Type: type,
    'Tardy #': '', Points: points == null ? '' : String(points), 'Running total': running == null ? '' : String(running), Status: status || 'confirmed',
    Detail: type + ' on ' + date, Note: '', Source: 'report', Messaged: '', Logged: date}, extra || {});
  // Ana Ruiz: two tardies (5 + 5), a call-out (+25) and a pick-up (-10) = 25.
  // Ben (Benny) Cole Ortiz: a tardy (+5), a dismissed absence = 5. Maya Torres
  // (a leader, scored there) has a late break = 5.
  function BOOK(){ return {
    Totals: [
      {'Team member': 'Ana Ruiz', Quarter: '2026-Q4', 'Points QTD': '25'},
      {'Team member': 'Ben (Benny) Cole Ortiz', Quarter: '2026-Q4', 'Points QTD': '5'},
      {'Team member': 'Maya Torres', Quarter: '2026-Q4', 'Points QTD': '5'}],
    Events: [
      ev('Ana Ruiz', '2026-10-02', 'Tardy', 5, 5, 'confirmed', {Messaged: '2026-10-03'}),
      ev('Ana Ruiz', '2026-10-05', 'Call-out, under 24 hrs notice', 25, 30, 'confirmed', {Messaged: '2026-10-06'}),
      ev('Ana Ruiz', '2026-10-06', 'Picked up a shift', -10, 20, 'confirmed', {Source: 'manual', Note: 'Covered Sunday prep'}),
      ev('Ana Ruiz', '2026-10-07', 'Tardy', 5, 25),
      ev('Ana Ruiz', '2026-10-08', 'Late from break', null, null, 'dismissed'),
      ev('Ben (Benny) Cole Ortiz', '2026-10-06', 'Tardy', 5, 5),
      ev('Ben (Benny) Cole Ortiz', '2026-10-07', 'Absence (needs review)', null, null, 'dismissed'),
      ev('Maya Torres', '2026-10-08', 'Late from break', 5, 5)],
    'Ladder steps': [
      {'Team member': 'Ana Ruiz', Quarter: '2026-Q4', Step: '20', Closed: '2026-10-06', Leader: 'Casey', Memo: 'ruiz-ana__2026-Q4__20'}],
    Memos: [
      {'Team member': 'Ana Ruiz', Quarter: '2026-Q4', Step: '20', Memo: 'Leader Conversation Record', Date: '2026-10-06', Leader: 'Casey',
       'Follow-up': '2026-10-20', Acknowledgment: 'Team member signed', 'Suspension start': '', 'Suspension end': '', 'Points at the time': '30',
       'What was discussed': 'Call-outs', Expectations: 'Call 24 hours ahead.'}],
    Messages: [
      {'Team member': 'Ana Ruiz', Quarter: '2026-Q4', Sent: '2026-10-06 14:21', Message: 'Hey Ana, attendance note.'},
      {'Team member': 'Ana Ruiz', Quarter: '2026-Q4', Sent: '2026-10-03 09:05', Message: 'Hey Ana, first note.'}],
    Roster: [
      {'Team member': 'Ana Ruiz', Active: 'Yes', 'Not scored': 'No', Language: 'Spanish', 'Connecteam ID': '', Added: '2026-10-01'},
      {'Team member': 'Ben (Benny) Cole Ortiz', Active: 'Yes', 'Not scored': 'No', Language: 'English', 'Connecteam ID': 'ct-7', Added: '2026-10-01'},
      {'Team member': 'Maya Torres', Active: 'Yes', 'Not scored': 'No', Language: 'English', 'Connecteam ID': '', Added: '2026-10-01'},
      {'Team member': 'Casey Director', Active: 'Yes', 'Not scored': 'Yes', Language: 'English', 'Connecteam ID': '', Added: '2026-10-01'}],
    Uploads: [
      {'Report run': '2026-10-08', 'Covers from': '2026-10-07', 'Covers to': '2026-10-07', Quarter: '2026-Q4', 'Events added': '4', Uploaded: '2026-10-08 09:10'}]
  }; }
  // A punch report from the hub's own upload, Ben spelled "Cole Ortiz, Ben (Benny)".
  const REPORT = page([
    ['Actual Vs. Scheduled', 200, 790], ['Chick-fil-A Buda (04066)', 200, 780], ['10/06/2026 - 10/13/2026', 200, 770], ['10/14/2026 3:00:00 AM', 400, 760],
    ['Cole Ortiz, Ben (Benny)', 10, 700],
    ['10/06/2026', 150, 690], ['06:08 AM', 200, 690], ['06:00 AM', 260, 690], ['02:00 PM', 200, 681], ['02:00 PM', 260, 681],
    ['10/13/2026', 150, 660], ['06:10 AM', 200, 660], ['06:00 AM', 260, 660], ['02:00 PM', 200, 651], ['02:00 PM', 260, 651]
  ]);
`, ctx);
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
process.stdout.write(JSON.stringify(input.cases.map(c => vm.runInContext(`(${c.op})`, ctx)(c))));
