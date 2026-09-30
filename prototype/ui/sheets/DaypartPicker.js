// "All 6 ▾": every daypart of the side with placed / expected and flags; tap one to show its board.
import { html, useMemo } from '../../lib/h.js';
import { Sheet } from '../components/Sheet.js';
import { L, daypartSummaries, fmtRange, currentDaypartKey } from './ctx.js';

export default function DaypartPicker({ ctx, store, state, t, route, go, close }) {
  const { side, dp } = ctx;
  const list = useMemo(() => daypartSummaries(state, side, t), [state, side, t]);
  const nowKey = currentDaypartKey(state, side);
  return html`<${Sheet} open title=${L(t, 'dayparts')} sub=${`${side.toUpperCase()} · ${L(t, 'tapDaypart')}`} onClose=${close}>
    ${list.map(s => {
      const on = s.key === dp.key;
      const isNow = s.key === nowKey;
      return html`<button key=${s.key} type="button" class=${'person' + (on ? ' on' : '')} aria-pressed=${String(on)} onClick=${() => go('setups', { dp: s.key })}>
        <span class="col" style="flex: 1">
          <span class="row" style="gap: 6px"><span class="n">${s.name}</span>${isNow ? html`<span class="tag">${t('now')}</span>` : null}</span>
          <span class="sub">${fmtRange(s.dp.start, s.dp.end)}${s.flags ? html` · <span class="amber">${s.flags === 1 ? t('flagOne') : t('flags', { n: s.flags })}</span>` : null}</span>
        </span>
        <span class="m">${t('placed', { n: s.placed, of: s.expected })}</span>
      </button>`;
    })}
  </${Sheet}>`;
}
