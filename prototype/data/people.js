// Sample people. Fake names only (SPEC roster + Dorian the manager + invented BOH crew).
// Person = { id, first, last, role: 'tm'|'trainer'|'tl'|'manager', side: 'foh'|'boh', lang: 'en'|'es' }

export const PEOPLE = [
  // Manager (default identity on a fresh device)
  { id: 'p-dorian',   first: 'Dorian',  last: 'Ferris',     role: 'manager', side: 'foh', lang: 'en' },

  // FOH — the SPEC roster
  { id: 'p-maria',   first: 'Maria',  last: 'Delgado',    role: 'trainer', side: 'foh', lang: 'en' },
  { id: 'p-luke',    first: 'Luke',   last: 'Bennett',    role: 'tl',      side: 'foh', lang: 'en' },
  { id: 'p-brielle',    first: 'Brielle',   last: 'Torres',     role: 'trainer', side: 'foh', lang: 'en' },
  { id: 'p-sofia',   first: 'Sofia',  last: 'Navarro',    role: 'tm',      side: 'foh', lang: 'es' },
  { id: 'p-tobias',    first: 'Tobias',   last: 'Kimball',    role: 'tm',      side: 'foh', lang: 'en' },
  { id: 'p-emilio',  first: 'Emilio', last: 'Alvarado',   role: 'tm',      side: 'foh', lang: 'es' },
  { id: 'p-sam',     first: 'Sam',    last: 'Okafor',     role: 'tl',      side: 'foh', lang: 'en' },
  { id: 'p-noor',      first: 'Noor',     last: 'Nakamura',   role: 'trainer', side: 'foh', lang: 'en' },
  { id: 'p-kendra',  first: 'Kendra', last: 'Pruitt',     role: 'tm',      side: 'foh', lang: 'en' },
  { id: 'p-sienna',  first: 'Sienna', last: 'Castillo',   role: 'tm',      side: 'foh', lang: 'en' },
  { id: 'p-rafael',  first: 'Rafael', last: 'Mendoza',    role: 'tm',      side: 'foh', lang: 'es' },
  { id: 'p-harper',  first: 'Harper', last: 'Whitfield',  role: 'tm',      side: 'foh', lang: 'en' },
  { id: 'p-diego',   first: 'Diego',  last: 'Salinas',    role: 'tm',      side: 'foh', lang: 'es' },
  { id: 'p-yesenia',   first: 'Yesenia',  last: 'Hobbs',      role: 'tm',      side: 'foh', lang: 'en' },

  // BOH — invented sample crew (one TL, one Trainer, six team members)
  { id: 'p-mateo',   first: 'Mateo',  last: 'Peralta',    role: 'tl',      side: 'boh', lang: 'es' },
  { id: 'p-priya',   first: 'Priya',  last: 'Raman',      role: 'trainer', side: 'boh', lang: 'en' },
  { id: 'p-andre',   first: 'Andre',  last: 'Boyd',       role: 'tm',      side: 'boh', lang: 'en' },
  { id: 'p-rosa',    first: 'Rosa',   last: 'Villanueva', role: 'tm',      side: 'boh', lang: 'es' },
  { id: 'p-kenji',   first: 'Kenji',  last: 'Sato',       role: 'tm',      side: 'boh', lang: 'en' },
  { id: 'p-bianca',  first: 'Bianca', last: 'Cruz',       role: 'tm',      side: 'boh', lang: 'es' },
  { id: 'p-omar',    first: 'Omar',   last: 'Haddad',     role: 'tm',      side: 'boh', lang: 'en' },
  { id: 'p-tessa',   first: 'Tessa',  last: 'Lind',       role: 'tm',      side: 'boh', lang: 'en' },
];

export const PEOPLE_BY_ID = Object.fromEntries(PEOPLE.map(p => [p.id, p]));

export function personById(id) { return PEOPLE_BY_ID[id] || null; }

export const DEFAULT_IDENTITY = 'p-dorian';
