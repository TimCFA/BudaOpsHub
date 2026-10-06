// ===== SHIFT TIMES, TYPED BY HAND =====
// Set Ups' "Add Team Member" takes a time however it's typed and saves it the
// way the schedule writes it ("5:30a", "1:30p"):
//   5:30a  5:30 am  5:30AM  5:30 a.m.  530a  530  5.30  5 30  5  5p  noon
//   17:30  1730  05:30   (24-hour)
// and a whole shift in the start box ("5:30-1:30", "11 to 7") fills both.
//
// A time without a.m./p.m. is read the way Buda's shifts run (starts from
// 5:30a to 8p, ends by close): an end is the reading that makes a shift of
// 1 to 14 hours after the start; a start from 5 to 11 is morning and 12 to 4
// afternoon (4 is a closer's 4p), unless only the other reading fits the end.

const SHIFT_MIN_LEN = 60, SHIFT_MAX_LEN = 14 * 60;

// {fixed: minutes} when the text says which (a.m./p.m., 24-hour, noon), or
// {am, pm} when it doesn't; null when it isn't a time.
function shiftTimeParse(str){
  const s = String(str || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if(!s) return null;
  if(/^(12 ?)?noon$/.test(s)) return {fixed: 720};
  const m = s.match(/^(\d{1,2})(?:\s?[:.\s]?\s?(\d{2}))?\s*(?:([ap])\.?\s*(?:m\.?)?)?$/);
  if(!m) return null;
  const hour = +m[1], min = m[2] ? +m[2] : 0, ap = m[3];
  if(min > 59 || hour > 23) return null;
  if(hour >= 13 || hour === 0 || (m[1].length === 2 && m[1][0] === '0')){
    if(ap === 'a' && hour >= 13) return null;   // "17a"
    return {fixed: hour * 60 + min};
  }
  const am = (hour % 12) * 60 + min, pm = am + 720;
  if(ap) return {fixed: ap === 'a' ? am : pm};
  return {am, pm};
}

function shiftLenOk(start, end){
  const len = end - start;
  return len >= SHIFT_MIN_LEN && len <= SHIFT_MAX_LEN;
}

// "5:30a", "12:00p": the schedule's own spelling.
function shiftTimeText(min){
  const h = Math.floor(min / 60), mm = min % 60;
  return `${(h + 11) % 12 + 1}:${String(mm).padStart(2, '0')}${h < 12 ? 'a' : 'p'}`;
}

// Reads the two boxes together. Returns {start, end} as the schedule writes
// them, plus the minutes, or {error} saying what's wrong; a box still empty
// comes back null with no error.
function shiftTimesRead(startText, endText){
  let s = String(startText || '').trim(), e = String(endText || '').trim();
  const parts = s.split(/\s*(?:–|—|-|\bto\b)\s*/i).filter(Boolean);
  if(parts.length === 2 && !e){ s = parts[0]; e = parts[1]; }
  const sp = s ? shiftTimeParse(s) : null, ep = e ? shiftTimeParse(e) : null;
  if((s && !sp) || (e && !ep)) return {error: 'Try 5:30a, 530 or 17:30', bad: s && !sp ? 'start' : 'end'};
  let start = null, end = null;
  if(sp){
    if(sp.fixed !== undefined) start = sp.fixed;
    else {
      const hour = Math.floor(sp.am / 60);
      start = hour >= 5 && hour <= 11 ? sp.am : sp.pm;
      const other = start === sp.am ? sp.pm : sp.am;
      if(ep && ep.fixed !== undefined && !shiftLenOk(start, ep.fixed) && shiftLenOk(other, ep.fixed)) start = other;
    }
  }
  if(ep){
    if(ep.fixed !== undefined) end = ep.fixed;
    else if(start !== null) end = shiftLenOk(start, ep.am) ? ep.am : ep.pm;
    else end = ep.pm;
  }
  const out = {
    start: start === null ? null : shiftTimeText(start), end: end === null ? null : shiftTimeText(end),
    startMin: start, endMin: end,
  };
  if(start !== null && end !== null && end <= start) out.error = 'End time is before the start time';
  return out;
}

// The form: tidy each box when the leader moves on, and say under the boxes
// how the shift reads ("5:30a – 1:30p · 8 h") so a wrong guess shows before
// it's saved.
function shiftFormHint(){
  const hint = document.getElementById('addTMHint');
  if(!hint) return;
  const r = shiftTimesRead(document.getElementById('addTMStart').value, document.getElementById('addTMEnd').value);
  hint.classList.toggle('is-bad', !!r.error);
  if(r.error){ hint.innerHTML = escapeHtml(r.error) + esLine(r.error); return; }
  if(r.start === null || r.end === null){ hint.textContent = r.start ? `${r.start} –` : ''; return; }
  const hrs = Math.round((r.endMin - r.startMin) / 15) / 4;
  hint.textContent = `${r.start} – ${r.end} · ${hrs} h`;
}

function shiftFormTidy(){
  const startEl = document.getElementById('addTMStart'), endEl = document.getElementById('addTMEnd');
  const r = shiftTimesRead(startEl.value, endEl.value);
  if(r.start !== null && !(r.bad === 'start')) startEl.value = r.start;
  if(r.end !== null && !(r.bad === 'end')) endEl.value = r.end;
  shiftFormHint();
}

if(typeof document !== 'undefined' && document.getElementById('addTMStart')){
  ['addTMStart', 'addTMEnd'].forEach(id => {
    const el = document.getElementById(id);
    el.addEventListener('input', shiftFormHint);
    el.addEventListener('blur', shiftFormTidy);
  });
}
