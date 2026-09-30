// PEA tiers. A position's score = mean of the latest 5 ratings there.
import { daysBetween } from './time.js';

export const TIERS = [
  { key: 'crushing', label: 'Crushing It', min: 2.75 },
  { key: 'rise', label: 'On the Rise', min: 1.75 },
  { key: 'notyet', label: 'Not Yet', min: 0 },
];

export const RECENT_RATINGS = 5;

// The brief's PEA position lists per side.
export const PEA_POSITIONS = {
  foh: ['iPOS', 'Bagging', 'Drinks 1/3', 'Drinks 2', 'OMD', 'Host', 'Runner'],
  boh: ['Breader', 'Primary', 'Secondary', 'Machines', 'Fries', 'Prep'],
};

export function tierFor(score) {
  if (score == null || !Number.isFinite(score)) return null;
  return (TIERS.find(t => score >= t.min) || TIERS[TIERS.length - 1]).key;
}

export function tierLabel(key) {
  const t = TIERS.find(t => t.key === key);
  return t ? t.label : '';
}

function same(a, b) { return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase(); }

function rowsFor(peaRows, personId, position) {
  return (peaRows || []).filter(r => r && r.personId === personId && (position == null || same(r.position, position)))
    .slice().sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
}

// { score, tier, count, lastAt } — score = mean of the latest 5 (2 dp); null when never rated.
export function scoreFor(peaRows, personId, peaPosition) {
  const rows = rowsFor(peaRows, personId, peaPosition);
  if (!rows.length) return { score: null, tier: null, count: 0, lastAt: null };
  const recent = rows.slice(0, RECENT_RATINGS);
  const mean = recent.reduce((s, r) => s + Number(r.score || 0), 0) / recent.length;
  const score = Math.round(mean * 100) / 100;
  return { score, tier: tierFor(score), count: rows.length, lastAt: rows[0].at || null };
}

// Crushing It on every position of the side; never rated is not green.
export function allGreen(peaRows, personId, side) {
  const positions = PEA_POSITIONS[side] || [];
  const green = [];
  const missing = [];
  for (const pos of positions) (scoreFor(peaRows, personId, pos).tier === 'crushing' ? green : missing).push(pos);
  return { green, missing, isAllGreen: missing.length === 0 && positions.length > 0 };
}

// Days since the person's last rating anywhere; null when never rated.
export function peaDueDays(peaRows, personId, asOfDate) {
  const rows = rowsFor(peaRows, personId, null);
  if (!rows.length) return null;
  return daysBetween(String(rows[0].at).slice(0, 10), asOfDate);
}
