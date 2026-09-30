// Strings and t(). Pure module: no DOM, no store. Position and zone names stay as the floor
// says them (Drinks, Host, iPOS) in both languages. Spanish is Texas-Mexican crew Spanish, a
// draft for a bilingual Team Lead to review (ASSUMPTIONS 7).
//
//   import { t, setLang, getLang, tFor, tx, dateLabel, daypartName, tierLabel, roleTag } from '../state/i18n.js';
//   t('fill', { n: 5 })        → 'Fill 5 open spots' / 'Llenar 5 puestos libres'
//   t('placed', { n: 8, of: 13 })
//   tx({ en: 'Wipe sinks', es: 'Limpiar lavabos' })   → the line in the current language
//
// app.js calls setLang(state.lang) before every render and hands screens `t` already bound.
// A missing key falls back to English, then to the key itself, so nothing ever renders blank.

export const LANGS = ['en', 'es'];

const EN = {
  // nav
  'nav.setups': 'Set Ups', 'nav.me': 'My spot', 'nav.waste': 'Waste', 'nav.tasks': 'Tasks', 'nav.scores': 'Scores', 'nav.more': 'More',
  'nav.aria': 'Main',

  // header / sync
  saved: 'Saved', saving: 'Saving…', offline: 'Offline',
  gameDay: 'Game Day', practiceDay: 'Practice Day',
  identityAria: 'Who is using this phone: {name}',
  dateAria: 'Date and day type',

  // generic
  confirm: 'Confirm', cancel: 'Cancel', undo: 'Undo', close: 'Close', done: 'Done', back: 'Back', save: 'Save',
  ok: 'OK', change: 'Change', clear: 'Clear', handOff: 'Hand off', profile: 'Profile', swap: 'swap', move: 'move',
  search: 'Search a name', today: 'Today', now: 'Now', next: 'Next', later: 'Later', all: 'All', more: 'more',
  yes: 'Yes', no: 'No', english: 'English', spanish: 'Español', comingSoon: 'Coming in the next pass',
  readOnly: 'Read-only for team members. Leaders edit from Set Ups with their name.',
  placeholder: 'This screen is being built. The shell, store and components are in place.',

  // set ups
  setUps: 'Set Ups', needed: 'Needed', pending: 'not saved yet', captain: 'Captain', outside: 'outside', inside: 'inside',
  fill: 'Fill {n} open spots', fillOne: 'Fill 1 open spot',
  placed: '{n} of {of} placed', flags: '{n} flags', flagOne: '1 flag', noFlags: 'no flags', carriedFrom: 'carried from {from}',
  proposed: '{placed} placed + {n} proposed', staysOpen: '{n} stays open', staysOpenMany: '{n} stay open',
  onShift: '{n} on shift', tapName: 'tap a name for their profile',
  positionsPriority: 'Positions · priority order',
  moreSpots: '+ {n} more spots if you have extra people', lessSpots: 'Hide extra spots',
  leadCaptain: 'Lead Captain', breaks: 'Breaks', offNow: 'Off', backAt: 'back {t}', covers: '{name} covers', covering: '{name} covering',
  leadShort: 'Lead', offShort: 'off {name}, back {t}', nextShort: 'next {name} {t}',
  onBreak: 'on break', nextBreak: 'Next', noBreaks: 'no breaks planned', hasntLedSince: "hasn't led since {when}", neverLed: 'never led',
  keepAnEye: 'Keep an eye on', develop: 'Develop', at1: 'At {t}', leave: '{n} leave', leaveOne: '1 leaves', spotCloses: '1 spot closes', spotsClose: '{n} spots close',
  spotToCover: '1 spot to cover', spotsToCover: '{n} spots to cover', openFrom: 'open from {t}', leavesOpenFrom: '{name} leaves · {slot} open from {t} ›', leavesCloses: '{name} leaves · {slot} closes', leavesFolds: '{name} leaves · {slot} folds', leavesTo: '{name} leaves · {slot} → {to}', leavesNotPlaced: '{name} leaves · not placed yet',
  leaves: 'leaves', leavesAt: 'leaves {t}', arrives: 'arrives {t}', till: 'till {t}', onTill: 'on till {t}', closes: 'closes', notPlacedYet: 'not placed yet',
  lastDaypart: 'their last daypart, so outside is fine', herLastDaypart: 'her last daypart, so outside is fine', hisLastDaypart: 'his last daypart, so outside is fine',
  leadSpot: "Lead Captain's spot", reaches: '{name} reaches {zone}', captainTill: 'Captain till {t}, then {name} reaches {zone}',
  gettingPea: 'getting a PEA here', withTill: 'with {name} till {t}',
  outsideAgain: 'outside all {prev} · swap ›', notLeader: "{name} isn't a leader", captainLeaves: '{name} leaves {t} · {to} isn’t a leader ›',
  noLeaderZone: 'no leader on {zone}', neverRatedGame: 'never rated on {pos} · Game Day', notYetGame: 'Not Yet on {pos} · Game Day', noGameDayPick: 'no Game Day pick',
  notPlaced: 'Not placed yet', arrivingLater: 'Arriving later', alreadyPlaced: 'Already placed', tapToMove: 'tap to move', tapToSwap: 'tap to swap',
  priority: 'priority {n}', scoreIs: 'score = their PEA on {pos}', lastWorked: 'last worked {zone} {when}', workedHere: 'worked here {when}', notRatedHere: 'not rated here',
  takes: 'takes {slot}', takesAt: 'takes {slot} at {t}', onlyOneFree: 'only one free', nobodyFree: 'nobody free', strongestFree: 'strongest free person on {pos}',
  fillProposed: 'Fill proposed {n} placements', fillProposedOne: 'Fill proposed 1 placement',
  fillExplain: 'Grey rows aren’t saved yet. Tap one to swap the name. People you placed by hand are never moved.', fillGameDay: 'Game Day, so no Not Yet development picks.',
  confirmN: 'Confirm {n} placements', confirmOne: 'Confirm 1 placement', wasInside: 'was inside all {prev}',
  changeSpot: 'Change spot', clearSpot: 'Clear spot', handOffTo: 'Hand off to…', split: 'Split',
  shift: 'Shift', todaysSpots: "Today's spots", scores: 'Scores', lastPea: 'Last PEA', allGreen: 'All Green', allGreenProgress: '{n} of {of} positions green',
  leadCandidates: 'Who leads', setLead: 'Set as Lead Captain', worksAt: 'works {slot}', rotation: 'by rotation', picks: 'Picks', pairedWith: 'with {name}',
  practiceExplain: 'Practice Day: try positions they are not green in yet, paired with a Trainer.', gameExplain: 'Game Day: one On the Rise pick, paired with a Trainer.',
  daypartAll: 'All {n}', breakfastDone: '{name} ✓',
  placedBy: '{who} placed {name} on {slot}', cleared: '{slot} cleared', handedOff: '{slot} → {name} {t}',
  leaderOverride: 'Leader override', useDefault: 'Use the calendar',

  // tiers / roles
  'tier.crushing': 'Crushing It', 'tier.rise': 'On the Rise', 'tier.notyet': 'Not Yet', 'tier.none': 'not rated',
  tierOn: '{tier} on {pos}', 'role.tl': 'TL', 'role.trainer': 'Trainer', 'role.manager': 'Manager', 'role.tm': 'Team member',
  peaDue: 'PEA due, {n} days', fromAllGreen: '{n} positions from all green', oneFromAllGreen: '1 position from all green', stalled: 'stalled on {zone}',

  // mi puesto
  myMe: 'My spot', hello: 'Hi, {name}', tapNameToChange: 'tap your name to change', notYou: 'Not you? Change name', zone: 'Zone {zone}', captainIs: 'Captain', coversZone: '{zone}, covers {other}',
  untilT: 'until {t}', task: 'Task', taskAt: 'Task at {t}', startList: 'Start the list', seeList: 'See the list', shiftStartsAt: 'Shift starts {t}', endOfShift: 'End of shift', breakMin: 'Break {n} min', notPlacedMe: 'Not placed yet — ask your Lead Captain', noShift: 'Not on today’s roster',
  ahora: 'Now', despues: 'Later', hoy: 'Today', tarea: 'Task',

  // waste
  waste: 'Waste', entries: '{n} entries', entryOne: '1 entry', needsCosts: '$ needs item costs', tapSize: 'Tap a size to log it',
  last15: 'Last 15 min', nothing15: 'Nothing in the last 15 minutes', logged: '{item} logged', loggedBy: '{item} logged · {who}', undone: 'Undone', ct: 'ct',
  overLimit: 'over the limit', underLimit: 'under the limit', limit: 'limit {n}', prepWaste: 'Prep waste',

  // tasks
  tasks: 'Tasks', dueNow: 'Due now', zoneReset: 'Zone reset', foodSafety: 'Food safety', transition: 'Transition', nothingDue: 'Nothing due right now',
  progress: '{done} of {total}', markDone: 'Mark done', window: 'Window {t}', minutes: '{n} min', oneWindow: 'one window at a time', finalCheck: 'Final check',
  nextUp: 'Next', owner: '{slot} · {name}', owned: '{slot}', unassigned: 'nobody placed there',

  // scores
  wasteToday: 'Waste today', vsLimit: '{n} of {limit}', streak: '{n} days under the limit', streakOne: '1 day under the limit', streakNone: 'streak starts today',
  cemNote: 'CEM and LX come from office uploads and are not in this prototype.', allGreenSummary: 'All Green', peopleAllGreen: '{n} people all green', nobodyAllGreen: 'Nobody all green yet',
  counts: 'in counts', readOnlyScores: 'Read-only. Numbers, no editing here.',

  // more
  whosPhone: "Who's using this phone", language: 'Language', demoClock: 'Demo clock', manage: 'Manage', managePin: 'Manager PIN', enterPin: 'Enter any 4 digits',
  manageWould: 'Manage would hold: today’s limit, products, home text, close-out, and what’s due (roster, CEM, PEA, Sales Mix). Uploads happen from the office desktop.',
  structure: 'Structure & assumptions', print: 'Print', printDay: 'Print the day', reset: 'Reset the demo', resetDone: 'Demo reset',
  side: 'Side', identity: 'Identity', you: 'you', isManager: 'manager', pickYourName: 'Pick your name from today’s roster', store: 'Store', resources: 'Resources',
  sample: 'Sample data only. Fake names, invented ratings, every product cost is 0.', clockAt: 'Clock at {t}', presets: 'Presets', custom: 'Custom',

  // dayparts
  'dp.early': 'Early Breakfast', 'dp.breakfast': 'Breakfast', 'dp.lunch': 'Lunch', 'dp.mid': 'Mid', 'dp.afternoon': 'Afternoon', 'dp.dinner': 'Dinner', 'dp.close': 'Close',

  // weekdays / months (short)
  'wd.0': 'Sun', 'wd.1': 'Mon', 'wd.2': 'Tue', 'wd.3': 'Wed', 'wd.4': 'Thu', 'wd.5': 'Fri', 'wd.6': 'Sat',
  'mo.1': 'Jan', 'mo.2': 'Feb', 'mo.3': 'Mar', 'mo.4': 'Apr', 'mo.5': 'May', 'mo.6': 'Jun', 'mo.7': 'Jul', 'mo.8': 'Aug', 'mo.9': 'Sep', 'mo.10': 'Oct', 'mo.11': 'Nov', 'mo.12': 'Dec',
  yesterday: 'yesterday', todayLower: 'today',
};

const ES = {
  'nav.setups': 'Set Ups', 'nav.me': 'Mi puesto', 'nav.waste': 'Desperdicio', 'nav.tasks': 'Tareas', 'nav.scores': 'Marcador', 'nav.more': 'Más',
  'nav.aria': 'Principal',

  saved: 'Guardado', saving: 'Guardando…', offline: 'Sin conexión',
  gameDay: 'Día de juego', practiceDay: 'Día de práctica',
  identityAria: 'Quién usa este teléfono: {name}',
  dateAria: 'Fecha y tipo de día',

  confirm: 'Confirmar', cancel: 'Cancelar', undo: 'Deshacer', close: 'Cerrar', done: 'Listo', back: 'Atrás', save: 'Guardar',
  ok: 'OK', change: 'Cambiar', clear: 'Quitar', handOff: 'Pasar el puesto', profile: 'Perfil', swap: 'cambiar', move: 'mover',
  search: 'Busca un nombre', today: 'Hoy', now: 'Ahora', next: 'Después', later: 'Después', all: 'Todos', more: 'más',
  yes: 'Sí', no: 'No', english: 'English', spanish: 'Español', comingSoon: 'Viene en la siguiente vuelta',
  readOnly: 'Solo lectura para el equipo. Los líderes editan desde Set Ups con su nombre.',
  placeholder: 'Esta pantalla se está armando. La base, el store y los componentes ya están.',

  setUps: 'Set Ups', needed: 'Falta', pending: 'sin guardar', captain: 'Capitán', outside: 'afuera', inside: 'adentro',
  fill: 'Llenar {n} puestos libres', fillOne: 'Llenar 1 puesto libre',
  placed: '{n} de {of} puestos', flags: '{n} avisos', flagOne: '1 aviso', noFlags: 'sin avisos', carriedFrom: 'viene de {from}',
  proposed: '{placed} puestos + {n} propuestos', staysOpen: '{n} queda libre', staysOpenMany: '{n} quedan libres',
  onShift: '{n} en turno', tapName: 'toca un nombre para ver su perfil',
  positionsPriority: 'Puestos · por prioridad',
  moreSpots: '+ {n} puestos más si sobra gente', lessSpots: 'Esconder los puestos extra',
  leadCaptain: 'Lead Captain', breaks: 'Descansos', offNow: 'En descanso', backAt: 'vuelve {t}', covers: '{name} cubre', covering: 'te cubre {name}',
  leadShort: 'Lead', offShort: 'descansa {name}, vuelve {t}', nextShort: 'después {name} {t}',
  onBreak: 'en descanso', nextBreak: 'Después', noBreaks: 'sin descansos planeados', hasntLedSince: 'no lidera desde el {when}', neverLed: 'nunca ha liderado',
  keepAnEye: 'Échale un ojo a', develop: 'Desarrollar', at1: 'A la {t}', leave: 'se van {n}', leaveOne: 'se va 1', spotCloses: 'se cierra 1 puesto', spotsClose: 'se cierran {n} puestos',
  spotToCover: '1 puesto por cubrir', spotsToCover: '{n} puestos por cubrir', openFrom: 'libre desde {t}', leavesOpenFrom: '{name} se va · {slot} libre desde {t} ›', leavesCloses: '{name} se va · {slot} se cierra', leavesFolds: '{name} se va · {slot} se guarda', leavesTo: '{name} se va · {slot} → {to}', leavesNotPlaced: '{name} se va · sin puesto todavía',
  leaves: 'se va', leavesAt: 'se va {t}', arrives: 'llega {t}', till: 'hasta {t}', onTill: 'hasta las {t}', closes: 'se cierra', notPlacedYet: 'sin puesto todavía',
  lastDaypart: 'es su último bloque, afuera está bien', herLastDaypart: 'es su último bloque, afuera está bien', hisLastDaypart: 'es su último bloque, afuera está bien',
  leadSpot: 'Puesto del Lead Captain', reaches: '{name} alcanza {zone}', captainTill: 'Capitán hasta {t}, luego {name} alcanza {zone}',
  gettingPea: 'le toca PEA aquí', withTill: 'con {name} hasta {t}',
  outsideAgain: 'afuera todo {prev} · cambiar ›', notLeader: '{name} no es líder', captainLeaves: '{name} se va {t} · {to} no es líder ›',
  noLeaderZone: 'sin líder en {zone}', neverRatedGame: 'sin PEA en {pos} · Día de juego', notYetGame: 'Todavía no en {pos} · Día de juego', noGameDayPick: 'no en Día de juego',
  notPlaced: 'Sin puesto todavía', arrivingLater: 'Llegan después', alreadyPlaced: 'Ya tienen puesto', tapToMove: 'toca para mover', tapToSwap: 'toca para cambiar',
  priority: 'prioridad {n}', scoreIs: 'número = su PEA en {pos}', lastWorked: 'estuvo en {zone} el {when}', workedHere: 'estuvo aquí el {when}', notRatedHere: 'sin PEA aquí',
  takes: 'toma {slot}', takesAt: 'toma {slot} a las {t}', onlyOneFree: 'solo queda una persona', nobodyFree: 'nadie libre', strongestFree: 'la persona libre más fuerte en {pos}',
  fillProposed: 'Fill propone {n} puestos', fillProposedOne: 'Fill propone 1 puesto',
  fillExplain: 'Las filas grises no están guardadas. Toca una para cambiar el nombre. A la gente que pusiste a mano nunca se le mueve.', fillGameDay: 'Es Día de juego, así que no hay picks de desarrollo con Todavía no.',
  confirmN: 'Confirmar {n} puestos', confirmOne: 'Confirmar 1 puesto', wasInside: 'estuvo adentro todo {prev}',
  changeSpot: 'Cambiar puesto', clearSpot: 'Quitar del puesto', handOffTo: 'Pasar el puesto a…', split: 'Dividir',
  shift: 'Turno', todaysSpots: 'Puestos de hoy', scores: 'Puntajes', lastPea: 'Último PEA', allGreen: 'Todo verde', allGreenProgress: '{n} de {of} puestos en verde',
  leadCandidates: 'Quién lidera', setLead: 'Poner de Lead Captain', worksAt: 'trabaja en {slot}', rotation: 'por rotación', picks: 'Picks', pairedWith: 'con {name}',
  practiceExplain: 'Día de práctica: prueban puestos donde aún no están en verde, con un Trainer al lado.', gameExplain: 'Día de juego: un solo pick que va subiendo, con un Trainer al lado.',
  daypartAll: 'Todos {n}', breakfastDone: '{name} ✓',
  placedBy: '{who} puso a {name} en {slot}', cleared: '{slot} quedó libre', handedOff: '{slot} → {name} {t}',
  leaderOverride: 'Lo cambió un líder', useDefault: 'Usar el calendario',

  'tier.crushing': 'Lo domina', 'tier.rise': 'Va subiendo', 'tier.notyet': 'Todavía no', 'tier.none': 'sin PEA',
  tierOn: '{tier} en {pos}', 'role.tl': 'TL', 'role.trainer': 'Trainer', 'role.manager': 'Gerente', 'role.tm': 'Equipo',
  peaDue: 'PEA pendiente, {n} días', fromAllGreen: 'a {n} puestos de todo verde', oneFromAllGreen: 'a 1 puesto de todo verde', stalled: 'estancado en {zone}',

  myMe: 'Mi puesto', hello: 'Hola, {name}', tapNameToChange: 'toca tu nombre para cambiar', notYou: '¿No eres tú? Cambiar nombre', zone: 'Zona {zone}', captainIs: 'Capitán', coversZone: '{zone}, cubre {other}',
  untilT: 'hasta las {t}', task: 'Tarea', taskAt: 'Tarea a las {t}', startList: 'Empezar la lista', seeList: 'Ver la lista', shiftStartsAt: 'Tu turno empieza a las {t}', endOfShift: 'Fin del turno', breakMin: 'Descanso {n} min', notPlacedMe: 'Sin puesto todavía — pregúntale al Lead Captain', noShift: 'No estás en el rol de hoy',
  ahora: 'Ahora', despues: 'Después', hoy: 'Hoy', tarea: 'Tarea',

  waste: 'Desperdicio', entries: '{n} registros', entryOne: '1 registro', needsCosts: '$ · faltan costos', tapSize: 'Toca un tamaño para registrarlo',
  last15: 'Últimos 15 min', nothing15: 'Nada en los últimos 15 minutos', logged: '{item} registrado', loggedBy: '{item} registrado · {who}', undone: 'Deshecho', ct: 'pzas',
  overLimit: 'pasado del límite', underLimit: 'bajo el límite', limit: 'límite {n}', prepWaste: 'Desperdicio de prep',

  tasks: 'Tareas', dueNow: 'Te toca ahora', zoneReset: 'Reset de zona', foodSafety: 'Seguridad alimentaria', transition: 'Transición', nothingDue: 'Nada pendiente ahorita',
  progress: '{done} de {total}', markDone: 'Marcar hecha', window: 'Ventana {t}', minutes: '{n} min', oneWindow: 'una ventana a la vez', finalCheck: 'Revisión final',
  nextUp: 'Después', owner: '{slot} · {name}', owned: '{slot}', unassigned: 'nadie en ese puesto',

  wasteToday: 'Desperdicio de hoy', vsLimit: '{n} de {limit}', streak: '{n} días bajo el límite', streakOne: '1 día bajo el límite', streakNone: 'la racha empieza hoy',
  cemNote: 'CEM y LX vienen de cargas en la oficina y no están en este prototipo.', allGreenSummary: 'Todo verde', peopleAllGreen: '{n} personas todo verde', nobodyAllGreen: 'Nadie está todo verde todavía',
  counts: 'en piezas', readOnlyScores: 'Solo lectura. Números, aquí no se edita.',

  whosPhone: '¿Quién usa este teléfono?', language: 'Idioma', demoClock: 'Reloj de demo', manage: 'Administrar', managePin: 'PIN de gerente', enterPin: 'Pon cualquier 4 números',
  manageWould: 'Administrar tendría: el límite de hoy, productos, texto de inicio, cierre, y lo que falta (rol, CEM, PEA, Sales Mix). Las cargas se hacen desde la oficina.',
  structure: 'Estructura y supuestos', print: 'Imprimir', printDay: 'Imprimir el día', reset: 'Reiniciar la demo', resetDone: 'Demo reiniciada',
  side: 'Lado', identity: 'Quién soy', you: 'tú', isManager: 'gerente', pickYourName: 'Escoge tu nombre del rol de hoy', store: 'Tienda', resources: 'Recursos',
  sample: 'Solo datos de muestra. Nombres inventados, PEA inventados, todos los costos en 0.', clockAt: 'Reloj a las {t}', presets: 'Horas', custom: 'Otra',

  'dp.early': 'Desayuno temprano', 'dp.breakfast': 'Desayuno', 'dp.lunch': 'Lunch', 'dp.mid': 'Medio turno', 'dp.afternoon': 'Tarde', 'dp.dinner': 'Cena', 'dp.close': 'Cierre',

  'wd.0': 'Dom', 'wd.1': 'Lun', 'wd.2': 'Mar', 'wd.3': 'Mié', 'wd.4': 'Jue', 'wd.5': 'Vie', 'wd.6': 'Sáb',
  'mo.1': 'ene', 'mo.2': 'feb', 'mo.3': 'mar', 'mo.4': 'abr', 'mo.5': 'may', 'mo.6': 'jun', 'mo.7': 'jul', 'mo.8': 'ago', 'mo.9': 'sep', 'mo.10': 'oct', 'mo.11': 'nov', 'mo.12': 'dic',
  yesterday: 'ayer', todayLower: 'hoy',
};

export const STRINGS = { en: EN, es: ES };

let current = 'en';

export function setLang(lang) {
  current = LANGS.includes(lang) ? lang : 'en';
  return current;
}

export function getLang() {
  return current;
}

function fill(str, vars) {
  if (!vars) return str;
  return String(str).replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m));
}

// t(key, vars, lang?) — the string for `key` in `lang` (default: the current language),
// with {placeholders} filled from vars. Falls back to English, then to the key.
export function t(key, vars, lang) {
  const l = lang || current;
  const table = STRINGS[l] || EN;
  const str = table[key] != null ? table[key] : (EN[key] != null ? EN[key] : key);
  return fill(str, vars);
}

// A t() bound to one language, for screens rendered with a lang from the store.
export function tFor(lang) {
  const fn = (key, vars) => t(key, vars, lang);
  fn.lang = LANGS.includes(lang) ? lang : 'en';
  return fn;
}

// Pick the line of a bilingual data object ({ en, es } or { name, es }) in the current language.
export function tx(obj, lang) {
  if (obj == null) return '';
  if (typeof obj === 'string') return obj;
  const l = lang || current;
  if (l === 'es' && obj.es) return obj.es;
  return obj.en != null ? obj.en : (obj.name != null ? obj.name : '');
}

// Both lines when the screen shows Spanish under English (Tasks, Waste tiles).
export function both(obj) {
  if (obj == null) return { en: '', es: '' };
  return { en: obj.en != null ? obj.en : (obj.name || ''), es: obj.es || '' };
}

// 'Sat, Oct 3' / 'Sáb, 3 oct' from 'YYYY-MM-DD' (no Date parsing so a phone's zone never shifts it).
export function dateLabel(date, lang) {
  const m = String(date || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return String(date || '');
  const y = Number(m[1]); const mo = Number(m[2]); const d = Number(m[3]);
  const days = Math.floor(Date.UTC(y, mo - 1, d) / 86400000);
  const wd = ((days + 4) % 7 + 7) % 7;
  const l = lang || current;
  const w = t(`wd.${wd}`, null, l);
  const mon = t(`mo.${mo}`, null, l);
  return l === 'es' ? `${w}, ${d} ${mon}` : `${w}, ${mon} ${d}`;
}

// Daypart display name from its key ('lunch' → 'Lunch' in both languages: the crew says Lunch). Unknown keys pass through.
export function daypartName(keyOrDaypart, lang) {
  const key = typeof keyOrDaypart === 'string' ? keyOrDaypart : (keyOrDaypart && keyOrDaypart.key);
  if (!key) return '';
  const k = `dp.${key}`;
  const s = t(k, null, lang);
  if (s !== k) return s;
  return (keyOrDaypart && keyOrDaypart.name) || key;
}

// Tier label from its key ('crushing' | 'rise' | 'notyet' | null).
export function tierLabel(tierKey, lang) {
  return t(`tier.${tierKey || 'none'}`, null, lang);
}

// Role tag text: 'TL' | 'TRAINER' (the tag is uppercase in CSS; source text stays readable).
export function roleTag(role, lang) {
  if (!role || role === 'tm') return '';
  return t(`role.${role}`, null, lang);
}

export default t;
