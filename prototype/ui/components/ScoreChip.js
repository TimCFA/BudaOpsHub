// The PEA score chip: green (Crushing It ≥ 2.75), amber (On the Rise ≥ 1.75), grey (Not Yet).
// One decimal; ★ in front when the person is getting a PEA there today; null when never rated
// (the board shows nothing) unless `showEmpty` (the pick sheet shows a grey —).
//   html`<${ScoreChip} score=${2.8} tier="crushing" />`   html`<${ScoreChip} score=${2.3} tier="rise" star />`
//   html`<${ScoreChip} score=${null} showEmpty />`
import { html } from '../../lib/h.js';

export function tierOf(score) {
  if (score == null || !Number.isFinite(Number(score))) return null;
  const s = Number(score);
  if (s >= 2.75) return 'crushing';
  if (s >= 1.75) return 'rise';
  return 'notyet';
}

export function ScoreChip({ score, tier, star, showEmpty, label, cls = '' }) {
  const hasScore = score != null && Number.isFinite(Number(score));
  if (!hasScore && !showEmpty) return null;
  const tr = tier || tierOf(score);
  const tone = !hasScore ? 'h' : (tr === 'crushing' ? '' : (tr === 'rise' ? 'a' : 'h'));
  const text = hasScore ? Number(score).toFixed(1) : '—';
  return html`<span class=${['sc', tone, cls].filter(Boolean).join(' ')} aria-label=${label || null}>${star ? '★ ' : ''}${text}</span>`;
}

export default ScoreChip;
