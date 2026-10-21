// ===== FOOD SAFETY WALKTHROUGH =====
// Replaces the store's "Food Safety Walkthrough" Google Form (TIM-5). Questions are
// transcribed from that form (Sept 2026 PDF export) with these corrections, approved
// by Tim: duplicate questions removed (FOH handwashing, approved chemicals/SDS);
// inverted questions reworded so "Yes" is always the good answer (rings/bracelets,
// magic erasers/steel wool, food contact surfaces); the bodily-fluid-kit Spanish
// ("a punto de caducar" said the opposite) and the cool-down Spanish ("sala de
// espera"/"puerta de entrada" for walk-in) corrected; missing Spanish added; small
// spelling fixes. The form's Name / Date / Time fields are covered by the initials +
// time stamp on every answer.
//
// Stored per day in foodSafetyWalkthroughs[dateISO] = {
//   answers: { questionId: { v: 'yes' | 'coached', i: initials, t: ts } },
//   temps:   { tempId: { v: '38', i: initials, t: ts } },
//   completedAt: ts
// }
// A day counts toward foodSafetyDays (streak + Food Safety Compliance card) once every
// check is answered and every temperature is filled in. Temperatures sit in the
// zone where they're taken (FS_TEMPS below).
//
// More than one walkthrough a day (Tim, Oct 20 2026): the day's record is the
// first; each one after it is in its .more = { r2: {answers, temps, startedAt,
// by, completedAt}, r3: … }, so pages on older code keep the first as it was.
// A day counts once any of its walkthroughs is complete. Each zone's time is
// read from its answers' stamps (first to last), and the coached & corrected
// checks of the last 90 days feed the Scoreboard (fsFindings).

const FS_HANDWASH = { en: 'Are handwashing stations stocked, accessible, properly used, clean, and in good repair?', es: '¿Las estaciones de lavado de manos están abastecidas, son accesibles, se usan correctamente, están limpias y en buen estado?' };
const FS_CONTACT_SURFACES = { en: 'Check ALL food contact surfaces for cleanliness.', es: 'Verifique que todas las superficies en contacto con los alimentos estén limpias.' };
const FS_PERSONAL_ITEMS = { en: 'Are personal items properly stored in designated areas away from food, utensils, and equipment?', es: '¿Se almacenan correctamente los artículos personales en las áreas designadas, lejos de los alimentos, los utensilios y el equipo?' };
const FS_DOOR_HANDLES = { en: 'Are all cooler/freezer door handles clean?', es: '¿Están limpias todas las manijas de las puertas del enfriador/congelador?' };
const FS_OFF_FLOOR = { en: 'Are ALL items stored 6" off the floor?', es: '¿Todos los artículos están almacenados a 6" del piso?' };
const FS_LABELS = { en: 'Are all labels up to date with no expired product?', es: '¿Están todas las etiquetas actualizadas y no hay ningún producto caducado?' };
const FS_THERMOMETERS = { en: 'Do ALL coolers have a working, undamaged, hanging thermometer? Are all stick thermometers calibrated?', es: '¿Todos los refrigeradores tienen un termómetro colgante que funcione y no esté dañado? ¿Todos los termómetros de varilla están calibrados?' };
const FS_UTENSILS = { en: 'Are ALL utensils (scoops, spatulas, knives, tongs, etc.) in good repair, clean, and stored properly?', es: '¿Todos los utensilios (cucharas, espátulas, cuchillos, pinzas, etc.) están en buen estado, limpios y almacenados correctamente?' };

const FS_SECTIONS = [
  { id: 'raw', name: 'BOH: Raw', es: 'Crudo', items: [
    { id: 'raw-handwash', ...FS_HANDWASH },
    { id: 'raw-handwashing-practice', en: 'Are food handlers washing hands properly / no bare hand contact with ready-to-eat foods?', es: '¿Los manipuladores de alimentos se lavan las manos correctamente/no tienen contacto con las manos desnudas con los alimentos listos para comer?' },
    { id: 'raw-gloves', en: 'Are food handlers wearing gloves, facial protection, and hair restraint/net? Is Breader wearing yellow gloves/apron?', es: '¿Los manipuladores de alimentos usan guantes, protección facial y redecilla para el cabello? ¿Breader lleva guantes/delantal amarillos?' },
    { id: 'raw-cross-contamination', en: 'Is cross-contamination prevented during food storage and preparation?', es: '¿Se evita la contaminación cruzada durante el almacenamiento y la preparación de los alimentos?' },
    { id: 'raw-machine-tops', en: 'Are all machine tops clean & free from all items?', es: '¿Están todas las partes superiores de las máquinas limpias y libres de todos los elementos?' },
    { id: 'raw-off-floor', ...FS_OFF_FLOOR },
    { id: 'raw-contact-surfaces', ...FS_CONTACT_SURFACES },
    { id: 'raw-personal-items', ...FS_PERSONAL_ITEMS },
    { id: 'raw-door-handles', ...FS_DOOR_HANDLES },
    { id: 'raw-chicken-storage', en: 'Is raw chicken only held in thaw cabinets or on the bottom shelf of the walk-in cooler?', es: '¿El pollo crudo solo se guarda en gabinetes de descongelación o en el estante inferior de la cámara frigorífica?' },
    { id: 'raw-thaw-clips', en: 'In thaw cabinet, are raw chicken products identified with clips? Do all trays have a label and case identification?', es: 'En el gabinete de descongelación, ¿se identifican los productos de pollo crudo con clips? ¿Todas las bandejas tienen etiqueta e identificación de caja?' },
    { id: 'raw-labels', ...FS_LABELS },
    { id: 'raw-thermometers', ...FS_THERMOMETERS },
    { id: 'raw-garbage', en: 'Are interior garbage containers cleaned and emptied as needed?', es: '¿Se limpian y vacían los contenedores de basura interiores según sea necesario?' },
    { id: 'raw-floors', en: 'Are floors, shelves, and equipment legs clean and free from debris?', es: '¿Están los pisos, estantes y patas de los equipos limpios y libres de escombros?' },
    { id: 'raw-filet-rollers', en: 'Are Filet Rollers CLEAN and STORED properly?', es: '¿Están los Filet Rollers LIMPIOS y GUARDADOS en el lugar apropiado?' },
    { id: 'raw-grilled-165', en: 'Are grilled chicken products cooked to 165F?', es: '¿Los productos de pollo a la parrilla se cocinan a 165F?' }
  ]},
  { id: 'boards', name: 'Boards Zone', es: 'Zona de Pantillas', items: [
    { id: 'boards-aha-timers', en: 'Are timers on/not expired on chicken products with AHA?', es: '¿Los temporizadores están encendidos/no vencidos en los productos de pollo con AHA?' },
    { id: 'boards-cool-down', en: 'Cool Down Process (1 hour on the line, transfer to walk-in for 5 additional hours): Is a timer set for chicken in cool down on Boards? Does the timer match the label on the pan? Are pans in walk-in safe/labeled?', es: 'Proceso de enfriamiento (1 hora en la línea, luego a la cámara frigorífica por 5 horas adicionales): ¿Hay un temporizador para el pollo en enfriamiento en Boards? ¿El temporizador coincide con la etiqueta de la charola? ¿Las charolas en la cámara frigorífica están seguras/etiquetadas?' },
    { id: 'boards-utensils', ...FS_UTENSILS },
    { id: 'boards-contact-surfaces', ...FS_CONTACT_SURFACES },
    { id: 'boards-door-handles', ...FS_DOOR_HANDLES },
    { id: 'boards-off-floor', ...FS_OFF_FLOOR },
    { id: 'boards-personal-items', ...FS_PERSONAL_ITEMS },
    { id: 'boards-labels-lowboys', en: 'Are all labels up to date with no expired product? Check all lowboys.', es: '¿Están todas las etiquetas actualizadas y no hay ningún producto caducado? Comprobar todos los frigoríficos lowboy.' },
    { id: 'boards-fry-scoops', en: 'Are fry scoops free of cracks?', es: '¿Las cucharas de papas están libres de grietas?' }
  ]},
  { id: 'prep', name: 'Prep Zone', es: 'Zona de Preparación', items: [
    { id: 'prep-handwash', ...FS_HANDWASH },
    { id: 'prep-labels', en: 'Do ALL prepped items have a label/not expired?', es: '¿Todos los artículos preparados tienen una etiqueta/no están vencidos?' },
    { id: 'prep-utensils', ...FS_UTENSILS },
    { id: 'prep-egg-slicer', en: 'Is egg slicer stored in separate container?', es: '¿El cortador de huevos se almacena en un recipiente separado?' },
    { id: 'prep-veg-wash-concentration', en: 'Is vegetable wash at proper concentration?', es: '¿El lavado de vegetales tiene la concentración adecuada?' },
    { id: 'prep-produce-dispenser', en: 'Is produce wash dispenser functioning properly?', es: '¿Funciona correctamente el dispensador de lavado de frutas y verduras?' },
    { id: 'prep-veg-washed', en: 'Are vegetables being washed properly prior to serving?', es: '¿Se lavan adecuadamente las verduras antes de servirlas?' },
    { id: 'prep-3-compartment', en: 'Is sanitizer in 3 compartment sink at proper concentration?', es: '¿El desinfectante en el fregadero de 3 compartimentos tiene la concentración adecuada?' },
    { id: 'prep-dishwasher-160', en: 'Is dishwasher 160+ at final rinse cycle?', es: '¿Está el lavavajillas a 160+ en el ciclo de enjuague final?' }
  ]},
  { id: 'equipment', name: 'Equipment', es: 'Equipo', items: [
    { id: 'equip-cut-gloves', en: 'Are cut resistant gloves being worn properly when in use?', es: '¿Se usan correctamente los guantes resistentes a los cortes cuando se usan?' },
    { id: 'equip-saber-king', en: 'Is the Saber King tomato slicer/lettuce chopper clean and stored properly?', es: '¿La cortadora de tomates/picadora de lechuga está limpia y almacenada correctamente?' },
    { id: 'equip-ice-machine', en: 'Is the Ice Machine clean both inside and outside?', es: '¿La máquina de hielo está limpia adentro y afuera?' },
    { id: 'equip-biscuit-mixer', en: 'Is biscuit mixer clean?', es: '¿Está limpia la batidora de galletas?' },
    { id: 'equip-oven', en: 'Is oven clean?', es: '¿Está limpio el horno?' }
  ]},
  { id: 'foh', name: 'FOH', es: 'Frente', items: [
    { id: 'foh-handwash', ...FS_HANDWASH },
    { id: 'foh-contact-surfaces', ...FS_CONTACT_SURFACES },
    { id: 'foh-personal-items', ...FS_PERSONAL_ITEMS },
    { id: 'foh-thermometers', ...FS_THERMOMETERS },
    { id: 'foh-labels', ...FS_LABELS },
    { id: 'foh-ice-machine', en: 'Is the ice machine clean and in working order?', es: '¿La máquina de hielo está limpia y en buen estado de funcionamiento?' },
    { id: 'foh-air-curtains', en: 'Are air curtains on for in-use windows?', es: '¿Están encendidas las cortinas de aire para las ventanas en uso?' },
    { id: 'foh-soda-towers', en: 'Are ALL soda towers and ice bins free of excess build up?', es: '¿TODAS las torres de refrescos y depósitos de hielo están libres de exceso de acumulación?' },
    { id: 'foh-utensils', en: 'Are ALL utensils (scoops, tongs, etc.) in good repair, clean, and stored properly?', es: '¿Todos los utensilios (cucharas, espátulas, cuchillos, pinzas, etc.) están en buen estado, limpios y almacenados correctamente?' }
  ]},
  { id: 'chemicals', name: 'Chemicals', es: 'Químicos', items: [
    { id: 'chem-test-kits', en: 'Are Chick-fil-A approved quat, chlorine sanitizer, and produce test kits present and readily available for use?', es: '¿Están presentes y fácilmente disponibles para su uso los kits de prueba de cuaternario, desinfectante de cloro y productos agrícolas aprobados por Chick-fil-A?' },
    { id: 'chem-wipes', en: 'Are all cleaning wipes stored away from food and food surfaces?', es: '¿Todas las toallitas de limpieza están almacenadas lejos de los alimentos y de las superficies de alimentos?' },
    { id: 'chem-bodily-fluid-kit', en: 'Is a Bodily Fluid Kit available / disinfectant within expiration?', es: '¿Hay un kit de fluidos corporales disponible y el desinfectante está dentro de su fecha de vencimiento?' },
    { id: 'chem-storage', en: 'Are chemicals stored correctly? This includes sanitizer buckets not stored directly on the floor/Sani-Wipes closed when not in use?', es: '¿Los productos químicos se almacenan correctamente? ¿Esto incluye cubos de desinfectante que no se almacenan directamente en el piso/toallitas Sani-Wipes cerradas cuando no se usan?' },
    { id: 'chem-approved-sds', en: 'Are only Chick-fil-A approved chemicals being used/stored/labeled? Are SDS Sheets available for all chemicals?', es: '¿Solo se utilizan, almacenan o etiquetan productos químicos aprobados por Chick-fil-A? ¿Hay hojas SDS disponibles para todos los productos químicos?' }
  ]},
  { id: 'misc', name: 'Misc.', es: 'Varios', items: [
    { id: 'misc-cooler-floors', en: 'Are freezer/cooler floors clean?', es: '¿Están limpios los pisos del congelador/enfriador?' },
    { id: 'misc-vents', en: 'Are vents clean and free of dust?', es: '¿Están los respiraderos limpios y libres de polvo?' },
    { id: 'misc-dishes', en: 'Are dishes stacked/drying properly?', es: '¿Están los platos apilados/secándose correctamente?' },
    { id: 'misc-no-jewelry', en: 'Are TMs free of rings/bracelets?', es: '¿Los TMs están sin anillos ni pulseras?' },
    { id: 'misc-mop-sink', en: 'Is mop sink clean?', es: '¿Está limpio el fregadero de la fregona?' }
  ]},
  { id: 'previous', name: 'Previous Findings', es: 'Hallazgos anteriores',
    note: 'High action items to prevent repeats', noteEs: 'Elementos de alta acción para evitar repeticiones', items: [
    { id: 'prev-collars-140', en: 'Are collars on ALL grilled products? Are temps to standard? 140+', es: '¿Hay collares en TODOS los productos a la parrilla? ¿Las temperaturas son estándar? 140+' },
    { id: 'prev-chemicals-labeled', en: 'Are ALL chemicals properly labeled and CFA approved?', es: '¿Todos los productos químicos están debidamente etiquetados y aprobados por CFA?' },
    { id: 'prev-dishwasher-chemicals', en: 'Does dishwasher have correct chemicals connected? (rinse aid / yellow ware-wash)', es: '¿El lavavajillas tiene los productos químicos correctos conectados? (abrillantador/lavavajillas amarillo)' },
    { id: 'prev-cool-down-labels', en: 'Does cool down chicken have correct labels/timers?', es: '¿El pollo enfriado tiene etiquetas/temporizadores correctos?' },
    { id: 'prev-no-scrubbers-in-sink', en: 'Are magic erasers/steel wool kept out of the compartment sink? (store in the office after use)', es: '¿Los borradores mágicos/lana de acero se mantienen fuera del fregadero de compartimentos? (guardar en la oficina después de usarlos)' },
    { id: 'prev-cool-down-pans', en: 'Is Cool Down chicken in the fridge stored in a Metal pan, with a gap in the saran wrap and not stacked?', es: '¿Está el pollo de Cool Down en el refrigerador en charola de metal, con hueco en el saran wrap y no está apilado?' },
    { id: 'prev-chopped-lettuce', en: 'Is Chopped Lettuce stored in the fridge temping at <40 F? Does it have an air gap?', es: '¿Está la Lechuga Picada en el refrigerador con temperatura de <40 F? ¿Tiene hueco para respirar?' },
    { id: 'prev-contact-surfaces', en: 'Are food contact surfaces clean and in good repair?', es: '¿Las superficies en contacto con los alimentos están limpias y en buen estado?' }
  ]}
];

// Temperatures are taken in the zone where the product is, as the walkthrough
// goes zone to zone (no circling back at the end). Each reading's zone comes
// from where the form says it's taken: (raw) → Raw, (line) → Boards,
// (prep) and the walk-in produce → Prep, salad and side → FOH. Saved by id in
// rec.temps, the same as before they moved.
const FS_TEMPS = [
  { id: 'temp-salad', zone: 'foh', en: 'Salad of Choice', es: 'Ensalada de Elección' },
  { id: 'temp-side', zone: 'foh', en: 'Side Item', es: 'Acompañamiento' },
  { id: 'temp-romaine-walkin', zone: 'prep', en: 'Romaine Lettuce (walk-in)', es: 'Romaine Lettuce (refrigerador)' },
  { id: 'temp-greenleaf-walkin', zone: 'prep', en: 'Green Leaf (walk-in)', es: 'Green Leaf (refrigerador)' },
  { id: 'temp-tomato-walkin', zone: 'prep', en: 'Tomato (walk-in)', es: 'Tomate (refrigerador)' },
  { id: 'temp-romaine-prep', zone: 'prep', en: 'Romaine Lettuce (prep)', es: 'Lechuga Romana (prep)' },
  { id: 'temp-sliced-regular', zone: 'prep', en: 'Sliced regular (prep)', es: 'Pollo regular picado (prep)' },
  { id: 'temp-sliced-spicy', zone: 'prep', en: 'Sliced spicy (prep)', es: 'Pollo picante picado (prep)' },
  { id: 'temp-greenleaf-line', zone: 'boards', en: 'Green Leaf (line)', es: 'Green Leaf (línea)' },
  { id: 'temp-tomato-line', zone: 'boards', en: 'Tomato (line)', es: 'Tomate (línea)' },
  { id: 'temp-cheese-line', zone: 'boards', en: 'Cheese of choice (line)', es: 'Queso de elección (línea)' },
  { id: 'temp-grilled-filets-line', zone: 'boards', en: 'Grilled Filets (line)', es: 'Filetes Asados (línea)' },
  { id: 'temp-milkwash', zone: 'raw', en: 'Milkwash', es: 'Milkwash (mezcla de leche)' },
  { id: 'temp-regular-filets-raw', zone: 'raw', en: 'Regular Filets (raw)', es: 'Filetes Regulares (crudo)' },
  { id: 'temp-spicy-filets-raw', zone: 'raw', en: 'Spicy Filets (raw)', es: 'Filetes Picantes (crudo)' },
  { id: 'temp-grilled-filets-raw', zone: 'raw', en: 'Grilled Filets (raw)', es: 'Filetes Asados (crudo)' },
  { id: 'temp-grilled-nuggets-line', zone: 'boards', en: 'Grilled Nuggets (line)', es: 'Nuggets Asados (línea)' }
];
FS_SECTIONS.forEach(s => { s.temps = FS_TEMPS.filter(t => t.zone === s.id); });

const FS_HISTORY_DAYS = 90;

let foodSafetyWalkthroughs = {};
let fsCurrentSection = FS_SECTIONS[0].id;
let fsRoundPicked = null;        // the walkthrough open on this page (1, 2 …); null = the latest
let fsOpenHistory = new Set();   // past days opened to show their walkthroughs

// ---------- progress ----------

function fsRecord(dateISO){ return foodSafetyWalkthroughs[dateISO] || null; }

// The day's walkthroughs, in order: [{n, rec}].
function fsRounds(dateISO){
  const day = fsRecord(dateISO);
  if(!day) return [];
  const out = [{n: 1, rec: day}];
  Object.keys(day.more || {}).map(k => parseInt(k.slice(1), 10)).filter(n => n > 1).sort((a, b) => a - b)
    .forEach(n => { if(day.more['r' + n]) out.push({n, rec: day.more['r' + n]}); });
  return out;
}
function fsLatest(dateISO){ const r = fsRounds(dateISO); return r.length ? r[r.length - 1].rec : null; }
// The walkthrough that got furthest (for reports that count one a day).
function fsBest(dateISO){
  return fsRounds(dateISO).reduce((best, r) => { const t = fsTotals(r.rec); return !best || t.done > best.t.done ? {rec: r.rec, t} : best; }, null)?.rec || null;
}
function fsRoundNow(){
  const rounds = fsRounds(today);
  const n = fsRoundPicked && rounds.some(r => r.n === fsRoundPicked) ? fsRoundPicked : (rounds.length ? rounds[rounds.length - 1].n : 1);
  return {n, rec: (rounds.find(r => r.n === n) || {}).rec || null, rounds};
}

// A zone's time: from its first answer to its last, in minutes (null until two).
function fsZoneMinutes(rec, section){
  const ts = [];
  section.items.forEach(item => { const a = rec && rec.answers && rec.answers[item.id]; if(a && a.t) ts.push(a.t); });
  section.temps.forEach(item => { const a = rec && rec.temps && rec.temps[item.id]; if(a && a.t) ts.push(a.t); });
  if(ts.length < 2) return null;
  return Math.max(1, Math.round((Math.max(...ts) - Math.min(...ts)) / 60000));
}
function fsMinutesText(m){ return m === null ? '' : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`; }
// The whole walkthrough: first answer to done.
function fsRoundMinutes(rec){
  const first = fsStartInfo(rec);
  return first && rec.completedAt ? Math.max(1, Math.round((rec.completedAt - first.t) / 60000)) : null;
}

const FS_ITEM_OF = {};
FS_SECTIONS.forEach(s => s.items.forEach(item => { FS_ITEM_OF[item.id] = {item, section: s}; }));

// The coached & corrected checks since `sinceISO`: [{date, n, id, en, zone, i, t}].
function fsCoachedSince(sinceISO){
  const out = [];
  Object.keys(foodSafetyWalkthroughs).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= sinceISO).forEach(date => {
    fsRounds(date).forEach(({n, rec}) => Object.entries(rec.answers || {}).forEach(([id, a]) => {
      if(!a || a.v !== 'coached' || !FS_ITEM_OF[id]) return;
      out.push({date, n, id, en: FS_ITEM_OF[id].item.en, zone: FS_ITEM_OF[id].section.id, i: a.i || '', t: a.t || 0});
    }));
  });
  return out.sort((a, b) => b.t - a.t);
}

// For the Scoreboard: the last `days` days of walkthroughs.
function fsFindings(days, now){
  const end = now || today;
  const since = (() => { const d = new Date(end + 'T12:00:00'); d.setDate(d.getDate() - days + 1); return toLocalISODate(d); })();
  const dates = Object.keys(foodSafetyWalkthroughs).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= since && d <= end);
  const rounds = dates.flatMap(d => fsRounds(d).map(r => ({date: d, ...r})));
  const coached = fsCoachedSince(since).filter(c => c.date <= end);
  const repeats = {};
  coached.forEach(c => {
    const r = repeats[c.id] = repeats[c.id] || {id: c.id, en: c.en, zone: c.zone, count: 0, last: c.date};
    r.count++;
    if(c.date > r.last) r.last = c.date;
  });
  const byZone = FS_SECTIONS.map(s => ({id: s.id, name: s.name, count: coached.filter(c => c.zone === s.id).length}));
  const median = list => { if(!list.length) return null; const a = list.slice().sort((x, y) => x - y); const m = Math.floor(a.length / 2); return a.length % 2 ? a[m] : Math.round((a[m - 1] + a[m]) / 2); };
  const zoneTimes = FS_SECTIONS.map(s => ({id: s.id, name: s.name,
    minutes: median(rounds.filter(r => { const p = fsSectionProgress(r.rec, s); return p.done === p.total; }).map(r => fsZoneMinutes(r.rec, s)).filter(m => m !== null))}));
  const complete = rounds.filter(r => fsTotals(r.rec).complete);
  return {since, end, walkthroughs: rounds.length, complete: complete.length, days: new Set(complete.map(r => r.date)).size,
    coached: coached.length, repeats: Object.values(repeats).sort((a, b) => b.count - a.count || b.last.localeCompare(a.last)),
    byZone, zoneTimes, minutes: median(complete.map(r => fsRoundMinutes(r.rec)).filter(m => m !== null)), recent: coached.slice(0, 8)};
}

function fsSectionProgress(rec, section){
  const answers = (rec && rec.answers) || {}, temps = (rec && rec.temps) || {};
  let done = 0, coached = 0;
  const count = (bucket, item) => {
    const a = bucket[item.id];
    if(a && String(a.v).trim() !== ''){ done++; if(a.v === 'coached') coached++; }
  };
  section.items.forEach(item => count(answers, item));
  section.temps.forEach(item => count(temps, item));
  return { done, total: section.items.length + section.temps.length, coached };
}

function fsTotals(rec){
  let done = 0, total = 0, coached = 0;
  FS_SECTIONS.forEach(s => { const p = fsSectionProgress(rec, s); done += p.done; total += p.total; coached += p.coached; });
  return { done, total, coached, complete: total > 0 && done === total };
}

function fsStartInfo(rec){
  if(!rec) return null;
  let first = null;
  [rec.answers || {}, rec.temps || {}].forEach(b => Object.values(b).forEach(a => { if(a && (!first || a.t < first.t)) first = a; }));
  return first;
}

// Keeps foodSafetyDays / formDone (streak, compliance card) in step with today's record.
function fsSyncCompletion(){
  // Each walkthrough keeps its own finish time; the day counts once any is complete.
  let finished = false;
  fsRounds(today).forEach(({rec}) => {
    const done = fsTotals(rec).complete;
    if(done && !rec.completedAt){ rec.completedAt = Date.now(); finished = true; }
    if(!done && rec.completedAt) delete rec.completedAt;
  });
  const complete = fsRounds(today).some(r => r.rec.completedAt);
  const listed = foodSafetyDays.includes(today);
  if(complete && !listed){
    foodSafetyDays.push(today);
    formDone = true;
    calcStreak();
    return 'completed';
  }
  if(!complete && listed && fsRecord(today)){
    foodSafetyDays = foodSafetyDays.filter(d => d !== today);
    formDone = false;
    calcStreak();
    return 'reopened';
  }
  return finished ? 'completed' : null;
}

function fsPruneOldWalkthroughs(){
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - FS_HISTORY_DAYS);
  const cutoffISO = toLocalISODate(cutoff);
  let pruned = false;
  Object.keys(foodSafetyWalkthroughs).forEach(d => { if(d < cutoffISO){ delete foodSafetyWalkthroughs[d]; pruned = true; } });
  return pruned;
}

// ---------- rendering ----------

function fsStampHtml(a){
  return a ? `<span class="fs-stamp">${escapeHtml(a.i || '')} · ${formatShortTime(a.t)}</span>` : '';
}

function fsQuestionHtml(item, rec){
  const a = rec && rec.answers ? rec.answers[item.id] : null;
  const v = a ? a.v : null;
  return `
    <div class="fs-q ${v ? 'answered ' + v : ''}">
      <div class="fs-q-text">
        <div class="fs-q-en">${escapeHtml(item.en)}</div>
        <div class="fs-q-es">${escapeHtml(item.es)}</div>
      </div>
      <div class="fs-q-actions">
        <button type="button" class="fs-btn yes ${v === 'yes' ? 'on' : ''}" data-fs-answer="${item.id}" data-value="yes" aria-pressed="${v === 'yes'}">✓ Yes <span>Sí</span></button>
        <button type="button" class="fs-btn coached ${v === 'coached' ? 'on' : ''}" data-fs-answer="${item.id}" data-value="coached" aria-pressed="${v === 'coached'}">↺ Coached &amp; Corrected <span>Entrenado y Corregido</span></button>
        ${fsStampHtml(a)}
      </div>
    </div>`;
}

function fsTempHtml(item, rec){
  const a = rec && rec.temps ? rec.temps[item.id] : null;
  return `
    <div class="fs-temp ${a ? 'answered' : ''}">
      <label class="fs-temp-label" for="fs-${item.id}">
        <span class="fs-q-en">${escapeHtml(item.en)}</span>
        <span class="fs-q-es">${escapeHtml(item.es)}</span>
      </label>
      <div class="fs-temp-input">
        <input id="fs-${item.id}" type="number" inputmode="decimal" step="0.1" data-fs-temp="${item.id}" value="${a ? escapeHtml(a.v) : ''}" placeholder="—">
        <span>°F</span>
      </div>
      ${fsStampHtml(a)}
    </div>`;
}

function fsSummaryText(rec){
  const t = fsTotals(rec);
  if(t.done === 0) return { badge: 'Not yet', line: `Not started today · ${t.total} checks and temps` , t };
  if(t.complete) return { badge: '✓ Done', line: `Completed at ${formatShortTime(rec.completedAt)} · ${t.coached} coached & corrected`, t };
  return { badge: `${t.done}/${t.total}`, line: `In progress · ${t.done} of ${t.total} answered · ${t.coached} coached`, t };
}

// Today's walkthroughs, and a way to start another once one is under way.
function fsRoundsHtml(round){
  const rounds = round.rounds;
  const last = rounds[rounds.length - 1];
  const canStart = last && fsTotals(last.rec).done > 0;
  if(rounds.length < 2 && !canStart) return '';
  return `<div class="fs-rounds">${rounds.map(({n, rec}) => {
    const t = fsTotals(rec);
    const label = rec.completedAt ? `✓ ${formatShortTime(rec.completedAt)}` : `${t.done}/${t.total}`;
    return `<button type="button" class="fs-round${n === round.n ? ' is-on' : ''}${rec.completedAt ? ' is-done' : ''}" data-fs-round="${n}" aria-pressed="${n === round.n}">Walkthrough ${n} <span>${label}</span>${esSpan(esText('Walkthrough N', n), true)}</button>`;
  }).join('')}${canStart ? `<button type="button" class="fs-round-new" data-fs-new-round>+ Start another walkthrough${esSpan(esText('Start another walkthrough'), true)}</button>` : ''}</div>`;
}

// A past day: its walkthroughs, and, opened, each one's time, zone times and
// what was coached & corrected.
function fsHistoryDayHtml(d){
  const rounds = fsRounds(d);
  const best = fsTotals(fsBest(d));
  const coached = rounds.reduce((n, r) => n + fsTotals(r.rec).coached, 0);
  const open = fsOpenHistory.has(d);
  const head = `<button type="button" class="fs-history-row" data-fs-history="${d}" aria-expanded="${open}">
      <span>${escapeHtml(formatVerboseDate(d))}${rounds.length > 1 ? ` · ${rounds.length} walkthroughs` : ''}</span>
      <span class="${best.complete ? 'fs-ok' : 'fs-partial'}">${best.complete ? `✓ Complete${esHtml('Complete')}` : `${best.done}/${best.total}`}</span>
      <span class="fs-history-coached">${coached} coached${esHtml('coached')}</span>
    </button>`;
  if(!open) return head;
  return head + `<div class="fs-history-detail">${rounds.map(({n, rec}) => {
    const t = fsTotals(rec);
    const mins = fsRoundMinutes(rec);
    const zones = FS_SECTIONS.map(s => ({s, m: fsZoneMinutes(rec, s)})).filter(z => z.m !== null);
    const items = Object.entries(rec.answers || {}).filter(([id, a]) => a && a.v === 'coached' && FS_ITEM_OF[id]);
    return `<div class="fs-hd-round">
      <div class="fs-hd-head"><b>Walkthrough ${n}</b><span>${rec.completedAt ? `✓ ${formatShortTime(rec.completedAt)}${mins ? ` · ${fsMinutesText(mins)}` : ''}` : `${t.done}/${t.total}`}</span></div>
      ${zones.length ? `<div class="fs-hd-zones">${zones.map(z => `<span>${escapeHtml(z.s.name)} <b>${fsMinutesText(z.m)}</b></span>`).join('')}</div>` : ''}
      ${items.length ? `<ul class="fs-hd-coached">${items.map(([id, a]) => `<li><span class="fs-hd-zone">${escapeHtml(FS_ITEM_OF[id].section.name)}</span>${escapeHtml(FS_ITEM_OF[id].item.en)}<span class="fs-hd-who">${escapeHtml(a.i || '')} · ${formatShortTime(a.t)}</span></li>`).join('')}</ul>`
        : `<div class="fs-hd-none">Nothing coached${esHtml('Nothing coached')}</div>`}
    </div>`;
  }).join('')}</div>`;
}

function renderFoodSafety(){
  const root = document.getElementById('foodSafetyRoot');
  if(!root) return;
  const round = fsRoundNow();
  const rec = round.rec;
  const t = fsTotals(rec);
  const start = fsStartInfo(rec);
  const section = FS_SECTIONS.find(s => s.id === fsCurrentSection) || FS_SECTIONS[0];
  const idx = FS_SECTIONS.indexOf(section);
  const pct = t.total ? Math.round((t.done / t.total) * 100) : 0;

  let status;
  if(t.complete) status = `<span class="fs-status done">✓ Complete · ${formatShortTime(rec.completedAt)}${esHtml('Complete')}</span>`;
  else if(start) status = `<span class="fs-status">In progress · started ${formatShortTime(start.t)} by ${escapeHtml(start.i || '—')}${esHtml('In progress')}</span>`;
  else if(round.n > 1) status = `<span class="fs-status">Walkthrough ${round.n} · not started yet${esHtml('Walkthrough N not started', round.n)}</span>`;
  else status = `<span class="fs-status">Not started yet today${esHtml('Not started yet today')}</span>`;

  const sp = fsSectionProgress(rec, section);
  const next = FS_SECTIONS[idx + 1], prev = FS_SECTIONS[idx - 1];

  let html = `
    <div class="fs-head">
      <div>
        <h2 class="fs-title">Food Safety Walkthrough</h2>
        <div class="fs-subtitle">Recorrido de Seguridad Alimentaria · ${escapeHtml(formatVerboseDate(today))}</div>
      </div>
      <div class="fs-count"><b>${t.done}</b><span>/ ${t.total}</span></div>
    </div>
    ${fsRoundsHtml(round)}
    <div class="fs-progress"><div class="fs-progress-fill ${t.complete ? 'done' : ''}" style="width:${pct}%"></div></div>
    <div class="fs-meta">${status}${t.coached ? `<span class="fs-coached-total">↺ ${t.coached} coached &amp; corrected${esHtml('N coached & corrected', t.coached)}</span>` : ''}</div>

    <nav class="fs-chips">${FS_SECTIONS.map(s => {
      const p = fsSectionProgress(rec, s);
      const done = p.done === p.total;
      return `<button type="button" class="fs-chip ${s.id === section.id ? 'active' : ''} ${done ? 'done' : ''}" data-fs-section="${s.id}">
        <span class="fs-chip-name">${done ? '✓ ' : ''}${escapeHtml(s.name)}${esSpan(s.es, true)}</span>
        <span class="fs-chip-count">${p.done}/${p.total}${p.coached ? ` · <i>↺${p.coached}</i>` : ''}${done && fsZoneMinutes(rec, s) !== null ? ` · ${fsMinutesText(fsZoneMinutes(rec, s))}` : ''}</span>
      </button>`;
    }).join('')}</nav>

    <section class="fs-section">
      <div class="fs-section-head">
        <div>
          <h3>${escapeHtml(section.name)} <span class="fs-section-es">${escapeHtml(section.es)}</span></h3>
          ${section.note ? `<div class="fs-section-note">${escapeHtml(section.note)} · <i>${escapeHtml(section.noteEs)}</i></div>` : ''}
        </div>
        <span class="fs-section-count">${idx + 1} of ${FS_SECTIONS.length} · ${sp.done}/${sp.total}${esLine('N of M', idx + 1, FS_SECTIONS.length)}</span>
      </div>
      ${section.temps.length ? `
      <div class="fs-temps-head">🌡️ Temperatures here <span>Temperaturas aquí · °F</span></div>
      <div class="fs-list fs-temps">
        ${section.temps.map(item => fsTempHtml(item, rec)).join('')}
      </div>
      <div class="fs-temps-head">Checks <span>Revisiones</span></div>` : ''}
      <div class="fs-list">
        ${section.items.map(item => fsQuestionHtml(item, rec)).join('')}
      </div>
      <div class="fs-nav">
        ${prev ? `<button type="button" class="btn btn-ghost fs-nav-btn" data-fs-section="${prev.id}" data-fs-scroll>← ${escapeHtml(prev.name)}${esSpan(prev.es ? `← ${prev.es}` : '', true)}</button>` : '<span></span>'}
        ${next ? `<button type="button" class="btn btn-primary fs-nav-btn ${sp.done === sp.total ? 'ready' : ''}" data-fs-section="${next.id}" data-fs-scroll>Next: ${escapeHtml(next.name)} →${esSpan(next.es ? `${esText('Next:')} ${next.es} →` : '', true)}</button>` : ''}
      </div>
    </section>
  `;

  const history = Object.keys(foodSafetyWalkthroughs).filter(d => d !== today && /^\d{4}-\d{2}-\d{2}$/.test(d)).sort().reverse().slice(0, 14);
  if(history.length) html += `<div class="fs-history"><div class="fs-history-title">Recent walkthroughs${esHtml('Recent walkthroughs')}</div>${history.map(fsHistoryDayHtml).join('')}</div>`;
  root.innerHTML = html;
}

// ---------- events ----------

function fsEnsureRecord(){
  if(!foodSafetyWalkthroughs[today]) foodSafetyWalkthroughs[today] = { answers: {}, temps: {} };
  const round = fsRoundNow();
  const rec = round.n > 1 ? round.rec : foodSafetyWalkthroughs[today];
  rec.answers = rec.answers || {};
  rec.temps = rec.temps || {};
  return rec;
}
async function fsStartRound(){
  const initials = fsRequireInitials();
  if(!initials) return;
  const rounds = fsRounds(today);
  const last = rounds[rounds.length - 1];
  if(!last || !fsTotals(last.rec).done) return;
  const day = foodSafetyWalkthroughs[today];
  const n = last.n + 1;
  day.more = day.more || {};
  day.more['r' + n] = { answers: {}, temps: {}, startedAt: Date.now(), by: initials };
  fsRoundPicked = n;
  fsCurrentSection = FS_SECTIONS[0].id;
  renderFoodSafety();
  await saveState();
}

function fsRequireInitials(){
  const initials = getInitials();
  if(!initials){ showToast(`Set your initials first (top right) · ${esText('Set your initials first (top right)')}`); beginEditInitials(); }
  return initials;
}

async function fsAfterChange(){
  const change = fsSyncCompletion();
  renderFoodSafety();
  await saveState();
  if(change === 'completed'){
    const rec = fsRoundNow().rec;
    const mins = rec && fsRoundMinutes(rec);
    showToast(`✓ Food Safety Walkthrough complete!${mins ? ` · ${fsMinutesText(mins)}` : ''}`);
  }
}

document.getElementById('foodSafetyRoot').addEventListener('click', (e) => {
  const sectionBtn = e.target.closest('[data-fs-section]');
  if(sectionBtn){
    fsCurrentSection = sectionBtn.dataset.fsSection;
    renderFoodSafety();
    if(sectionBtn.hasAttribute('data-fs-scroll')) document.getElementById('foodSafetyRoot').scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  const roundBtn = e.target.closest('[data-fs-round]');
  if(roundBtn){ fsRoundPicked = parseInt(roundBtn.dataset.fsRound, 10); renderFoodSafety(); return; }
  if(e.target.closest('[data-fs-new-round]')){ fsStartRound(); return; }
  const histBtn = e.target.closest('[data-fs-history]');
  if(histBtn){
    const d = histBtn.dataset.fsHistory;
    if(fsOpenHistory.has(d)) fsOpenHistory.delete(d); else fsOpenHistory.add(d);
    renderFoodSafety();
    return;
  }
  const answerBtn = e.target.closest('[data-fs-answer]');
  if(answerBtn){
    const initials = fsRequireInitials();
    if(!initials) return;
    const rec = fsEnsureRecord();
    const id = answerBtn.dataset.fsAnswer;
    const value = answerBtn.dataset.value;
    // Tapping the selected answer again clears it.
    if(rec.answers[id] && rec.answers[id].v === value) delete rec.answers[id];
    else rec.answers[id] = { v: value, i: initials, t: Date.now() };
    fsAfterChange();
  }
});

document.getElementById('foodSafetyRoot').addEventListener('change', (e) => {
  const input = e.target.closest('[data-fs-temp]');
  if(!input) return;
  const value = input.value.trim();
  const rec = fsEnsureRecord();
  const id = input.dataset.fsTemp;
  if(value === ''){
    delete rec.temps[id];
  } else {
    const initials = fsRequireInitials();
    if(!initials){ input.value = rec.temps[id] ? rec.temps[id].v : ''; return; }
    rec.temps[id] = { v: value, i: initials, t: Date.now() };
  }
  fsAfterChange();
});

