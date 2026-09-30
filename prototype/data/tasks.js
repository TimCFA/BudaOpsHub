// Recurring FOH tasks. From the current app's SHIFT_TASKS (break-planner.js): Tim's times and
// durations, each owned by a position (ASSUMPTIONS 8: Restrooms → Host 1, Restock → Host 2,
// Trash → Runner, Lemonades → Drinks 1, Restroom check → Host 1).
// Task = { id, at: min, name, es, mins, minsEs, dur: max minutes (integer, for due-now math),
//          owner: slot display name, checklist: zone key in data/checklists.js | null,
//          items: [{ en, es }] | null (inline checklist when no zone checklist applies) }
// Due now (rules/tasks.js) = at ≤ now < at + dur + 30.

const RESTROOM_CHECK = [
  { en: 'Check paper towels & toilet paper', es: 'Revisar toallas y papel de baño' },
  { en: 'Check soap & sanitizer',            es: 'Revisar jabón y gel antibacterial' },
  { en: 'Wipe sinks & counters',             es: 'Limpiar lavabos y superficies' },
  { en: 'Wipe toilets if needed',            es: 'Limpiar los escusados si hace falta' },
  { en: 'Empty trash if over half',          es: 'Sacar la basura si pasa de la mitad' },
  { en: 'Quick sweep',                       es: 'Barrida rápida' },
];

const LEMONADES = [
  { en: 'Check lemonade & tea levels',       es: 'Revisar el nivel de limonada y té' },
  { en: 'Mix fresh lemonade batches',        es: 'Preparar limonada fresca' },
  { en: 'Label each with the time',          es: 'Poner la hora en cada una' },
  { en: 'Refill the lemonade fridge',        es: 'Llenar el refri de limonada' },
  { en: 'Restock cups & lids',               es: 'Reponer vasos y tapas' },
];

const TRASH_RESET = [
  { en: 'Pull full bags, tie them',          es: 'Sacar las bolsas llenas y amarrarlas' },
  { en: 'New liners in every bin',           es: 'Bolsa nueva en cada bote' },
  { en: 'Wipe the lids',                     es: 'Limpiar las tapas' },
  { en: 'Bags to the dumpster',              es: 'Llevar las bolsas al basurero' },
];

const TRASH_DUMPSTER = [
  { en: 'Collect bags from every bin',       es: 'Juntar las bolsas de todos los botes' },
  { en: 'Dining room & patio bins',          es: 'Botes del comedor y del patio' },
  { en: 'Take everything to the dumpster',   es: 'Llevar todo al basurero' },
  { en: 'Wash hands after',                  es: 'Lavarse las manos después' },
];

const RESTOCK = [
  { en: 'Cups, lids & straws',               es: 'Vasos, tapas y popotes' },
  { en: 'Sauces & condiment bins',           es: 'Salsas y condimentos' },
  { en: 'Napkins & kids toys',               es: 'Servilletas y juguetes' },
  { en: 'Bags & trays',                      es: 'Bolsas y charolas' },
  { en: 'Open all boxes, break them down',   es: 'Abrir las cajas y aplastarlas' },
];

const RESTOCK_TOMORROW = [
  { en: 'Cups, lids & straws for the morning', es: 'Vasos, tapas y popotes para la mañana' },
  { en: 'Sauces & condiment bins',           es: 'Salsas y condimentos' },
  { en: 'Bags & trays',                      es: 'Bolsas y charolas' },
  { en: 'Lemonade & tea fridge full',        es: 'Refri de limonada y té lleno' },
  { en: 'Note anything running low',         es: 'Anotar lo que se está acabando' },
];

export const TASKS = [
  { id: 't-0800-restroom-check', at: 480,  name: 'Restroom check',        es: 'Revisar los baños',
    mins: '10–15 min', minsEs: '10–15 min', dur: 15, owner: 'Host 1',   checklist: null, items: RESTROOM_CHECK },
  { id: 't-0930-lemonades',      at: 570,  name: 'Lemonades for lunch',   es: 'Limonadas para el lunch',
    mins: '15–20 min', minsEs: '15–20 min', dur: 20, owner: 'Drinks 1', checklist: null, items: LEMONADES },
  { id: 't-1000-restrooms',      at: 600,  name: 'Restrooms — full reset', es: 'Baños — reset completo',
    mins: '20–30 min', minsEs: '20–30 min', dur: 30, owner: 'Host 1',   checklist: 'restrooms', items: null },
  { id: 't-1015-trash',          at: 615,  name: 'Trash reset',           es: 'Reset de basura',
    mins: '5–10 min (+5 to the dumpster)', minsEs: '5–10 min (+5 al basurero)', dur: 15, owner: 'Runner', checklist: null, items: TRASH_RESET },
  { id: 't-1400-restrooms',      at: 840,  name: 'Restrooms — full reset', es: 'Baños — reset completo',
    mins: '20–30 min', minsEs: '20–30 min', dur: 30, owner: 'Host 1',   checklist: 'restrooms', items: null },
  { id: 't-1415-restock',        at: 855,  name: 'Restock',               es: 'Reponer',
    mins: '15–30 min', minsEs: '15–30 min', dur: 30, owner: 'Host 2',   checklist: null, items: RESTOCK },
  { id: 't-1445-trash',          at: 885,  name: 'Trash to the dumpster', es: 'Basura al basurero',
    mins: '10–15 min', minsEs: '10–15 min', dur: 15, owner: 'Runner',   checklist: null, items: TRASH_DUMPSTER },
  { id: 't-1515-lemonades',      at: 915,  name: 'Lemonades for dinner',  es: 'Limonadas para la cena',
    mins: '15–20 min', minsEs: '15–20 min', dur: 20, owner: 'Drinks 1', checklist: null, items: LEMONADES },
  { id: 't-2030-restrooms',      at: 1230, name: 'Restrooms — full reset', es: 'Baños — reset completo',
    mins: '20–30 min', minsEs: '20–30 min', dur: 30, owner: 'Host 1',   checklist: 'restrooms', items: null },
  { id: 't-2045-trash',          at: 1245, name: 'Trash reset',           es: 'Reset de basura',
    mins: '5–10 min (+5 to the dumpster)', minsEs: '5–10 min (+5 al basurero)', dur: 15, owner: 'Runner', checklist: null, items: TRASH_RESET },
  { id: 't-2100-restock',        at: 1260, name: 'Restock for tomorrow',  es: 'Reponer para mañana',
    mins: '15–30 min', minsEs: '15–30 min', dur: 30, owner: 'Host 2',   checklist: null, items: RESTOCK_TOMORROW },
];

export const TASKS_BY_ID = Object.fromEntries(TASKS.map(t => [t.id, t]));
