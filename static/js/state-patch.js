// ===== CHANGE-BASED SAVES =====
// A save sends what this page changed since it last heard from the server —
// "Drinks 1 = Avah", "add this waste entry" — and the server applies those
// changes to the latest saved data, so two people saving at once both keep
// their work. stateDiff makes the list of changes; stateApplyOps applies one
// (the server does the same in state_patch.py; tests/test_patch.py runs both
// on the same cases). No page state here: plain functions only.
//
// Changes: {o:'set', p:path, v}, {o:'del', p:path}, and for lists
// {o:'arr', p:path, rm:[{v, n}], add:[{v, n, i, end}]} — keep at most / at
// least n copies of item v, new ones inserted at index i (or at the end).
// Counts make a change safe to apply twice.

function stateCanon(v){
  if(Array.isArray(v)) return '[' + v.map(stateCanon).join(',') + ']';
  if(v && typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + stateCanon(v[k])).join(',') + '}';
  return JSON.stringify(v === undefined ? null : v);
}

function stateIsObj(v){ return !!v && typeof v === 'object' && !Array.isArray(v); }
function stateHas(o, k){ return Object.prototype.hasOwnProperty.call(o, k); }

function stateCount(keys){
  const m = new Map();
  keys.forEach(k => m.set(k, (m.get(k) || 0) + 1));
  return m;
}

function stateDiffList(b, m, path, ops){
  const bk = b.map(stateCanon), mk = m.map(stateCanon);
  if(bk.length === mk.length && bk.every((k, i) => k === mk[i])) return;
  const cb = stateCount(bk), cm = stateCount(mk);
  const rm = [];
  cb.forEach((n, k)=>{ const have = cm.get(k) || 0; if(have < n) rm.push({k, n: have, drop: n - have}); });
  // Which of my copies are new: the last extra ones of each item.
  const addedAt = new Set();
  cm.forEach((n, k)=>{
    let extra = n - (cb.get(k) || 0);
    for(let i = mk.length - 1; i >= 0 && extra > 0; i--) if(mk[i] === k){ addedAt.add(i); extra--; }
  });
  // What's left once removals (first copies) are taken out of the saved list
  // must be what's left of mine without the new items, in the same order —
  // otherwise the list was reordered, and it's saved whole.
  const drop = new Map(rm.map(r => [r.k, r.drop]));
  const keptB = bk.filter(k => { const d = drop.get(k) || 0; if(d > 0){ drop.set(k, d - 1); return false; } return true; });
  const keptM = mk.filter((k, i) => !addedAt.has(i));
  if(keptB.length !== keptM.length || keptB.some((k, i) => k !== keptM[i])){
    ops.push({o: 'set', p: path, v: m});
    return;
  }
  let lastKept = -1;
  mk.forEach((k, i) => { if(!addedAt.has(i)) lastKept = i; });
  const add = [...addedAt].sort((x, y) => x - y).map(i => ({v: m[i], n: cm.get(mk[i]), i, end: i > lastKept}));
  const rmOut = rm.map(r => ({v: b[bk.indexOf(r.k)], n: r.n}));
  const op = {o: 'arr', p: path};
  if(rmOut.length) op.rm = rmOut;
  if(add.length) op.add = add;
  ops.push(op);
}

function stateDiffInto(b, m, path, ops){
  if(stateIsObj(b) && stateIsObj(m)){
    Object.keys(b).forEach(k => { if(!stateHas(m, k)) ops.push({o: 'del', p: path.concat(k)}); });
    Object.keys(m).forEach(k=>{
      if(!stateHas(b, k)) ops.push({o: 'set', p: path.concat(k), v: m[k]});
      else stateDiffInto(b[k], m[k], path.concat(k), ops);
    });
  } else if(Array.isArray(b) && Array.isArray(m)){
    stateDiffList(b, m, path, ops);
  } else if(b !== m && stateCanon(b) !== stateCanon(m)){
    ops.push({o: 'set', p: path, v: m});
  }
}

// The changes that turn section `base` into section `mine` (both plain
// objects, as parsed from JSON).
function stateDiff(base, mine){
  const ops = [];
  stateDiffInto(stateIsObj(base) ? base : {}, stateIsObj(mine) ? mine : {}, [], ops);
  return ops;
}

function stateApplyList(current, rm, add){
  const out = Array.isArray(current) ? current.slice() : [];
  const keys = out.map(stateCanon);
  const counts = stateCount(keys);
  (rm || []).forEach(r=>{
    const k = stateCanon(r.v);
    while((counts.get(k) || 0) > r.n){
      const at = keys.indexOf(k);
      out.splice(at, 1); keys.splice(at, 1);
      counts.set(k, counts.get(k) - 1);
    }
  });
  (add || []).slice().sort((x, y) => x.i - y.i).forEach(a=>{
    const k = stateCanon(a.v);
    if((counts.get(k) || 0) >= a.n) return;
    const at = a.end ? out.length : Math.min(a.i, out.length);
    out.splice(at, 0, JSON.parse(JSON.stringify(a.v)));
    keys.splice(at, 0, k);
    counts.set(k, (counts.get(k) || 0) + 1);
  });
  return out;
}

function stateParent(root, path, create){
  let node = root;
  for(const key of path.slice(0, -1)){
    if(!stateHas(node, key) || !stateIsObj(node[key])){
      if(!create) return null;
      node[key] = {};
    }
    node = node[key];
  }
  return node;
}

// A new object: `section` with the changes applied (section is untouched).
function stateApplyOps(section, ops){
  const out = stateIsObj(section) ? JSON.parse(JSON.stringify(section)) : {};
  ops.forEach(op=>{
    if(op.p.includes('__proto__')) return;
    const last = op.p[op.p.length - 1];
    if(op.o === 'set'){
      stateParent(out, op.p, true)[last] = JSON.parse(JSON.stringify(op.v === undefined ? null : op.v));
    } else if(op.o === 'del'){
      const parent = stateParent(out, op.p, false);
      if(parent) delete parent[last];
    } else {
      const parent = stateParent(out, op.p, true);
      parent[last] = stateApplyList(stateHas(parent, last) ? parent[last] : undefined, op.rm, op.add);
    }
  });
  return out;
}
