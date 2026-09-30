// Router (hash routes), shell (header lives in each screen; bottom nav + toast + the screen's Dock here), screen switch.
// A screen may export a `Dock` (Screen.Dock): a bar rendered inside .bottom above the snackbar and the nav,
// docked like the snackbar (Set Ups uses it for the Fill bar).
// Routes: #/setups · #/me · #/waste · #/tasks · #/scores · #/more. A query string after the route
// (#/setups?sheet=pick&slot=drinks-1) is parsed into route.query for the screen to use.
import { html, render, useState, useEffect, useMemo } from './lib/h.js';
import store from './state/store.js';
import { setLang, tFor } from './state/i18n.js';
import { Nav, isLeader } from './ui/components/Nav.js';
import { Toast } from './ui/components/Toast.js';
import { personById } from './data/people.js';
import SetUps from './ui/screens/SetUps.js';
import MiPuesto from './ui/screens/MiPuesto.js';
import Waste from './ui/screens/Waste.js';
import Tasks from './ui/screens/Tasks.js';
import Scores from './ui/screens/Scores.js';
import More from './ui/screens/More.js';

const SCREENS = { setups: SetUps, me: MiPuesto, waste: Waste, tasks: Tasks, scores: Scores, more: More };
const ROUTES = Object.keys(SCREENS);

// '#/setups?sheet=pick&slot=drinks-1' → { path: 'setups', query: { sheet: 'pick', slot: 'drinks-1' }, hash }
export function parseHash(hash) {
  const raw = String(hash == null ? (typeof location !== 'undefined' ? location.hash : '') : hash);
  const m = raw.match(/^#\/?([^?]*)(?:\?(.*))?$/);
  const path = (m && m[1] ? m[1] : '').replace(/\/+$/, '').toLowerCase();
  const query = {};
  if (m && m[2]) {
    for (const pair of m[2].split('&')) {
      if (!pair) continue;
      const [k, v = ''] = pair.split('=');
      try { query[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, ' ')); } catch (e) { query[k] = v; }
    }
  }
  return { path, query, hash: raw };
}

// go('setups', { sheet: 'pick', slot: 'drinks-1' }) or go('#/waste')
export function go(path, query) {
  let target = String(path || '');
  if (!target.startsWith('#')) target = `#/${target.replace(/^\/+/, '')}`;
  if (query && Object.keys(query).length) {
    const qs = Object.entries(query).filter(([, v]) => v != null && v !== '').map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&');
    if (qs) target += `?${qs}`;
  }
  if (typeof location !== 'undefined') location.hash = target;
}

// The landing route for the person on this phone: leaders → Set Ups, team members → Mi puesto.
export function homeRoute(state) {
  return isLeader(personById(state.me)) ? 'setups' : 'me';
}

function useStore() {
  const [state, setState] = useState(store.getState());
  useEffect(() => store.subscribe(setState), []);
  return state;
}

function useRoute() {
  const [route, setRoute] = useState(() => parseHash());
  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return route;
}

function useOnline() {
  useEffect(() => {
    const sync = () => store.setOnline(navigator.onLine !== false);
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    sync();
    return () => { window.removeEventListener('online', sync); window.removeEventListener('offline', sync); };
  }, []);
}

function App() {
  const state = useStore();
  const route = useRoute();
  useOnline();

  setLang(state.lang);
  const t = useMemo(() => tFor(state.lang), [state.lang]);

  // unknown or empty route → home for this identity
  useEffect(() => {
    if (!ROUTES.includes(route.path)) go(homeRoute(state));
  }, [route.path, state.me]);

  useEffect(() => { document.documentElement.lang = state.lang; }, [state.lang]);

  // scroll to the top when the screen changes (not when only the query changes)
  useEffect(() => { window.scrollTo(0, 0); }, [route.path]);

  const path = ROUTES.includes(route.path) ? route.path : homeRoute(state);
  const Screen = SCREENS[path];
  const Dock = Screen.Dock || null;

  return html`<div class="phone">
    <main class="screen" id="main">
      <${Screen} store=${store} state=${state} t=${t} route=${route} go=${go} />
    </main>
    <div class="bottom">
      ${Dock ? html`<${Dock} store=${store} state=${state} t=${t} route=${route} go=${go} />` : null}
      <${Toast} toast=${state.toast} onClose=${() => store.hideToast()} t=${t} />
      <${Nav} state=${state} route=${path} t=${t} />
    </div>
  </div>`;
}

render(html`<${App} />`, document.getElementById('app'));
