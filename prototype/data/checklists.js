// Zone reset checklists. From the current app's ZONE_CHECKLISTS + FINAL_CHECK_ITEMS
// (state-and-utils.js), with a DRAFT Spanish line per item for a bilingual Team Lead to review
// (ASSUMPTIONS 7). Crew vocabulary: escusados, gel antibacterial, papel de baño, trapear.
// Checklist = { key, zone, es, items: [{ en, es }] }
// Windows (ASSUMPTIONS 8): zone reset uses the FOH Set Ups dayparts — the last hour of a
// daypart is the reset window into the next one. One window at a time on the Tasks screen.

export const CHECKLISTS = [
  { key: 'dining-room', zone: 'Dining Room', es: 'Comedor', items: [
    { en: 'Take out trash',               es: 'Sacar la basura' },
    { en: 'Sweep floor mats',             es: 'Barrer los tapetes' },
    { en: 'Clean glass & windows',        es: 'Limpiar vidrios y ventanas' },
    { en: 'Wipe tables & chairs',         es: 'Limpiar mesas y sillas' },
    { en: 'Sweep playscape',              es: 'Barrer el área de juegos' },
    { en: 'Wipe high chairs',             es: 'Limpiar las sillas para bebé' },
    { en: 'Sweep & mop floors',           es: 'Barrer y trapear el piso' },
    { en: 'Restock condiment bins',       es: 'Reponer los condimentos' },
    { en: 'Align tables + place flowers', es: 'Acomodar las mesas y poner las flores' },
    { en: 'Ensure TVs are on',            es: 'Revisar que las teles estén prendidas' },
  ] },
  { key: 'restrooms', zone: 'Restrooms', es: 'Baños', items: [
    { en: 'Wipe sinks & counters',                    es: 'Limpiar lavabos y superficies' },
    { en: 'Clean mirrors',                            es: 'Limpiar espejos' },
    { en: 'Restock paper towels & toilet paper',      es: 'Reponer toallas y papel de baño' },
    { en: 'Check soap & sanitizer',                   es: 'Revisar jabón y gel antibacterial' },
    { en: 'Restock seat covers',                      es: 'Reponer cubreasientos' },
    { en: 'Wipe toilets',                             es: 'Limpiar los escusados' },
    { en: 'Take out trash',                           es: 'Sacar la basura' },
    { en: 'Sweep & mop',                              es: 'Barrer y trapear' },
  ] },
  { key: 'front-counter', zone: 'Front Counter', es: 'Mostrador', items: [
    { en: 'Restock cubbies',              es: 'Reponer los cubbies' },
    { en: 'Fill ice bins',                es: 'Llenar los botes de hielo' },
    { en: 'Refill teas & lemonades',      es: 'Rellenar tés y limonadas' },
    { en: 'Take out trash',               es: 'Sacar la basura' },
    { en: 'Clean hand sink',              es: 'Limpiar el lavamanos' },
    { en: 'Wipe surfaces',                es: 'Limpiar las superficies' },
    { en: 'Clean/reset trays',            es: 'Limpiar y acomodar las charolas' },
    { en: 'Wipe stainless door',          es: 'Limpiar la puerta de acero' },
    { en: 'Clear clutter',                es: 'Quitar lo que estorba' },
    { en: 'Sweep & mop',                  es: 'Barrer y trapear' },
  ] },
  { key: 'bagging', zone: 'Bagging Station', es: 'Estación de Bagging', items: [
    { en: 'Restock fridges, bags, toys',        es: 'Reponer refris, bolsas y juguetes' },
    { en: 'Open all boxes (bags, toys, etc.)',  es: 'Abrir todas las cajas (bolsas, juguetes, etc.)' },
    { en: 'Stock sauces',                       es: 'Surtir las salsas' },
    { en: 'Clear clutter',                      es: 'Quitar lo que estorba' },
    { en: 'Prep printer paper',                 es: 'Preparar papel para la impresora' },
    { en: 'Refill cubbies',                     es: 'Rellenar los cubbies' },
    { en: 'Stock hospitality cart',             es: 'Surtir el carrito de hospitalidad' },
    { en: 'Empty trash bins',                   es: 'Vaciar los botes de basura' },
    { en: 'Wipe counters',                      es: 'Limpiar las barras' },
    { en: 'Sweep & mop',                        es: 'Barrer y trapear' },
  ] },
  { key: 'drinks', zone: 'Drinks Zone', es: 'Zona de Drinks', items: [
    { en: 'Wipe staging table',                 es: 'Limpiar la mesa de staging' },
    { en: 'Clean ice cream machine',            es: 'Limpiar la máquina de helado' },
    { en: 'Wipe counters',                      es: 'Limpiar las barras' },
    { en: 'Refill teas/lemonades',              es: 'Rellenar tés y limonadas' },
    { en: 'Refill ice cream & shake base',      es: 'Rellenar la base de helado y malteada' },
    { en: 'Restock lowboys',                    es: 'Reponer los lowboys' },
    { en: 'Prep cups & lemonades',              es: 'Preparar vasos y limonadas' },
    { en: 'Take out trash',                     es: 'Sacar la basura' },
    { en: 'Clean sugar bin',                    es: 'Limpiar el bote de azúcar' },
    { en: 'Organize shelves',                   es: 'Ordenar los estantes' },
    { en: 'Clean lemonade fridge',              es: 'Limpiar el refri de limonada' },
    { en: 'Restock cups',                       es: 'Reponer vasos' },
    { en: 'Sweep & mop',                        es: 'Barrer y trapear' },
    { en: 'Ensure wallboard displayed',         es: 'Revisar que el tablero esté puesto' },
  ] },
  { key: 'outside', zone: 'Outside', es: 'Afuera', items: [
    { en: 'Sweep lot',                          es: 'Barrer el estacionamiento' },
    { en: 'Remove trash from iPOS areas',       es: 'Quitar la basura de las áreas de iPOS' },
    { en: 'Check equipment charging',           es: 'Revisar que el equipo esté cargando' },
    { en: 'Clean OMD trash bin',                es: 'Limpiar el bote de basura de OMD' },
    { en: 'Clean patio tables',                 es: 'Limpiar las mesas del patio' },
    { en: 'Sweep patio',                        es: 'Barrer el patio' },
    { en: 'Empty large trash bins',             es: 'Vaciar los botes grandes' },
    { en: 'Ensure iPOS coverage',               es: 'Revisar que iPOS esté cubierto' },
  ] },
  { key: 'soda-room', zone: 'Soda Room / Tea Station', es: 'Cuarto de sodas / Estación de té', items: [
    { en: 'Stock sodas',                        es: 'Surtir las sodas' },
    { en: 'Clean lemonade table',               es: 'Limpiar la mesa de limonada' },
    { en: 'Remake lemonades (if needed)',       es: 'Volver a hacer limonadas (si hace falta)' },
    { en: 'Ensure tea lids are on',             es: 'Revisar que los tés tengan tapa' },
    { en: 'Clean sugar bin',                    es: 'Limpiar el bote de azúcar' },
    { en: 'Clean sinks',                        es: 'Limpiar los lavabos' },
  ] },
  { key: 'the-spot', zone: 'The Spot', es: 'The Spot', items: [
    { en: 'Clear clutter',                      es: 'Quitar lo que estorba' },
    { en: 'Sweep & mop',                        es: 'Barrer y trapear' },
    { en: 'Take out trash',                     es: 'Sacar la basura' },
  ] },
];

export const FINAL_CHECK = { key: 'final-check', zone: 'Final Check', es: 'Revisión final', items: [
  { en: 'Floors cleaned',                        es: 'Pisos limpios' },
  { en: 'Trash taken out',                       es: 'Basura afuera' },
  { en: 'Surfaces wiped',                        es: 'Superficies limpias' },
  { en: 'Fully restocked',                       es: 'Todo repuesto' },
  { en: 'Smooth transition to next leader?',     es: '¿Entrega clara al siguiente líder?' },
] };

export const CHECKLISTS_BY_KEY = Object.fromEntries([...CHECKLISTS, FINAL_CHECK].map(c => [c.key, c]));

// Reset windows: the last hour of a FOH daypart, resetting into the next one. Minutes since midnight.
// The panel title ('Breakfast → Lunch') is built from the daypart names in state/i18n.js so the
// dayparts read the same on every screen.
export const ZONE_WINDOWS = [
  { key: 'to-lunch',     daypartKey: 'breakfast', into: 'lunch',     start: 600,  end: 660  },
  { key: 'to-afternoon', daypartKey: 'lunch',     into: 'afternoon', start: 780,  end: 840  },
  { key: 'to-dinner',    daypartKey: 'afternoon', into: 'dinner',    start: 960,  end: 1020 },
  { key: 'to-close',     daypartKey: 'dinner',    into: 'close',     start: 1140, end: 1200 },
  { key: 'close',        daypartKey: 'close',     into: null,        start: 1260, end: 1320 },
];

// The window that is open at `now`, else the next one (null after the last).
export function zoneWindowAt(now) {
  return ZONE_WINDOWS.find(w => now >= w.start && now < w.end)
    || ZONE_WINDOWS.find(w => w.start > now)
    || null;
}
