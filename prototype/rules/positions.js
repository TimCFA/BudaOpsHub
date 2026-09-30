// Slots per side and daypart in priority order, derived from data/positions.js.
// Slot = { id, name, sub, captain, zone, pea, outside, raw }
import * as data from '../data/positions.js';
import { zoneKeyOf } from './leaders.js';

// The data module exports the raw name lists as RAW (API.md) or POSITIONS.
export const RAW = data.RAW || data.POSITIONS || { foh: {}, boh: {} };

const TYPO_FIXES = [
  [/dinning/i, 'Dining'], [/secondari/i, 'Secondary'], [/primari/i, 'Primary'],
  [/^drink 3/i, 'Drinks 3'], [/^breader(\d)/i, 'Breader $1'],
];

export function fixTypos(name) {
  let s = String(name || '').trim().replace(/\s+/g, ' ');
  for (const [re, to] of TYPO_FIXES) s = s.replace(re, to);
  return s;
}

// Which PEA position a slot is rated under; cleaning zones and unrated slots → null.
const PEA_RULES = {
  foh: [
    [/ipos/i, 'iPOS'], [/bagger|bagging\s*\d/i, 'Bagging'], [/drinks?\s*2\b/i, 'Drinks 2'],
    [/drinks?\s*[13]\b/i, 'Drinks 1/3'], [/\bomd\b/i, 'OMD'], [/\bhost\b/i, 'Host'], [/runner/i, 'Runner'],
  ],
  boh: [
    [/breader/i, 'Breader'], [/primar/i, 'Primary'], [/machines/i, 'Machines'], [/secondar/i, 'Secondary'],
    [/fries/i, 'Fries'], [/\bprep\b/i, 'Prep'],
  ],
};

export function peaPositionFor(side, name) {
  const hit = (PEA_RULES[side] || []).find(([re]) => re.test(String(name || '')));
  return hit ? hit[1] : null;
}

export const OUTSIDE_ZONES = ['ipos', 'omd'];

export function slugify(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// 'iPOS 2 LANE 1' → name 'iPOS 2', sub 'Lane 1'; 'DT Bagger 1 (Cockpit Cap)' → 'DT Bagger 1' / 'Captain';
// 'Drinks 2/Sample Prep' → 'Drinks 2' / 'Sample Prep'. The id is the slug of the display name, so the
// same station keeps its id from one daypart to the next.
export function slotFromName(rawName, side = 'foh') {
  const raw = fixTypos(rawName);
  let name = raw;
  let sub = null;
  let captain = false;
  if (/\((captain|cockpit cap)\)/i.test(name)) { captain = true; name = name.replace(/\s*\((captain|cockpit cap)\)\s*/i, ' ').trim(); }
  const lane = name.match(/\s*\bLANE\s*(\d+)\b/i);
  if (lane) { name = name.replace(lane[0], '').trim(); sub = `Lane ${lane[1]}`; }
  const split = name.match(/^(Drinks \d)\s*\/\s*(Sample Prep|Runner)$/i);
  if (split) { name = split[1]; sub = split[2]; }
  if (captain) sub = 'Captain';
  const zone = zoneKeyOf(side, raw);
  return {
    id: slugify(name),
    name,
    sub,
    captain,
    zone,
    pea: peaPositionFor(side, raw),
    outside: side === 'foh' && OUTSIDE_ZONES.includes(zone),
    raw,
  };
}

// Priority lists → Slot[] per daypart, skipping Transition, 'Shift Lead: …' and 'Breaks'.
export function buildSlots(raw) {
  const out = { foh: {}, boh: {} };
  for (const side of ['foh', 'boh']) {
    for (const [key, names] of Object.entries((raw && raw[side]) || {})) {
      if (/^transition/i.test(key)) continue;
      const seen = new Map();
      out[side][key] = (names || []).filter(n => !/^shift lead/i.test(n) && !/^breaks$/i.test(n)).map(n => {
        const slot = slotFromName(n, side);
        const c = seen.get(slot.id) || 0;
        seen.set(slot.id, c + 1);
        if (c) slot.id = `${slot.id}-${c + 1}`;
        return slot;
      });
    }
  }
  return out;
}

export const SLOTS = buildSlots(RAW);

export function slotsFor(side, daypartKey) {
  return (SLOTS[side] && SLOTS[side][daypartKey]) || [];
}

// By id, else by raw or display name (case-insensitive).
export function slotById(side, daypartKey, slotId) {
  const list = slotsFor(side, daypartKey);
  const k = String(slotId || '').toLowerCase();
  return list.find(s => s.id === slotId)
    || list.find(s => s.raw.toLowerCase() === k || s.name.toLowerCase() === k)
    || null;
}
