// ===== WASTE CATALOG =====
// The items on the Waste tracker, from Tim's "Waste Tracker · CFA Buda" page
// (Oct 2026): name, category, unit, cost per unit and tile color. Spanish
// names were added here (the old list's Spanish is reused where the item
// matched). Costs are the page's; the old list had none. Every item is one
// list for FOH and BOH alike — where it was wasted is recorded on the entry.
//
// This is the built-in default. The saved list (Manage → Waste Tracking) can
// change any of it: price, daily ceiling, color, category, Spanish, hidden.

const WASTE_COLORS = {
  navy: '#1f3a93', dnavy: '#1b2a6b', purple: '#5b21b6', violet: '#4f46c8', dviolet: '#4c1d95',
  magenta: '#c026d3', charcoal: '#575757', tan: '#b08d6a', red: '#dc2626', crimson: '#b91c3c',
  maroon: '#9b1c1c', gold: '#d4a017', gray: '#8b93a1', yellow: '#d6d31a', lime: '#7cb518',
  green: '#2e8b3d', orange: '#e07b1a', rust: '#e0561a', teal: '#14907f', brown: '#5a3a1f',
  blue: '#2f5bd8', pink: '#e08a99', sand: '#c9b48a'
};
const WASTE_CAT_ORDER = ['Proteins', 'Breakfast', 'Breads', 'Prep', 'Raw', 'Desserts', 'Nuggets', 'Strips', 'Sandwiches', 'Sides', 'Drinks', 'FOH SAT BEV WASTE'];
const WASTE_CAT_COLOR = {
  'Proteins': '#33508f', 'Breakfast': '#c26a1b', 'Breads': '#a98756', 'Prep': '#3f8f3a', 'Raw': '#6f7785', 'Desserts': '#b6477a',
  'Nuggets': '#a21caf', 'Strips': '#c62828', 'Sandwiches': '#27418a', 'Sides': '#c9741a', 'Drinks': '#6b4a2f', 'FOH SAT BEV WASTE': '#8a8a12'
};
// Proteins first in this order, everything else by name.
const WASTE_PROTEIN_ORDER = {'Filet': 1, 'Grilled Filet': 2, 'Spicy Filet': 3, 'Nugget': 4, 'Grilled Nugget': 5, 'Strips': 6, 'Raw Breakfast Filet': 7, 'Bacon': 8};

// [name, Spanish, category, unit, cost per unit, color key]
const WASTE_CATALOG_ROWS = [
  ['5 Count Nugget', 'Pepitas (5 piezas)', 'Nuggets', 'pc', 0.93, 'magenta'],
  ['5 Count Grilled Nugget', 'Pepitas Asadas (5 piezas)', 'Nuggets', 'pc', 1.02, 'charcoal'],
  ['8 Count Nugget', 'Pepitas (8 piezas)', 'Nuggets', 'pc', 1.42, 'magenta'],
  ['8 Count Grilled Nugget', 'Pepitas Asadas (8 piezas)', 'Nuggets', 'pc', 1.56, 'charcoal'],
  ['12 Count Nugget', 'Pepitas (12 piezas)', 'Nuggets', 'pc', 2.19, 'magenta'],
  ['12 Count Grilled Nugget', 'Pepitas Asadas (12 piezas)', 'Nuggets', 'pc', 2.40, 'charcoal'],
  ['2 Count Strip', 'Tiras (2 piezas)', 'Strips', 'pc', 1.00, 'red'],
  ['3 Count Strip', 'Tiras (3 piezas)', 'Strips', 'pc', 1.45, 'red'],
  ['4 Count Strip', 'Tiras (4 piezas)', 'Strips', 'pc', 2.01, 'red'],
  ['4 Count Mini', 'Minis (4 piezas)', 'Breakfast', 'pc', 1.19, 'gold'],
  ['10 Count Mini', 'Minis (10 piezas)', 'Breakfast', 'pc', 2.97, 'gold'],
  ['Bacon', 'Tocino', 'Proteins', 'pc', 0.21, 'pink'],
  ['Bacon Biscuit', 'Bisquet con Tocino', 'Breakfast', 'pc', 0.56],
  ['BEC Biscuit', 'Bisquet de Tocino, Huevo y Queso', 'Breakfast', 'pc', 0.72],
  ['BEC Muffin', 'Muffin de Tocino, Huevo y Queso', 'Breakfast', 'pc', 0.76],
  ['Breakfast Filet', 'Filete de Desayuno', 'Breakfast', 'pc', 0.68],
  ['Brioche Bun', 'Pan Brioche', 'Breads', 'bun', 0.33],
  ['Brownie', 'Brownie', 'Desserts', 'pc', 0.50, 'maroon'],
  ['Buttered Biscuit', 'Bisquet con Mantequilla', 'Breakfast', 'pc', 1.65],
  ['CEC Biscuit', 'Bisquet de Pollo, Huevo y Queso', 'Breakfast', 'pc', 1.11],
  ['CEC Muffin', 'Muffin de Pollo, Huevo y Queso', 'Breakfast', 'pc', 1.15],
  ['CFA Deluxe Sandwich', 'Sándwich Deluxe', 'Sandwiches', 'pc', 1.63, 'navy'],
  ['CFA Sandwich', 'Sándwich de Pollo', 'Sandwiches', 'pc', 1.27, 'navy'],
  ['Chicken Biscuit', 'Bisquet de Pollo', 'Breakfast', 'pc', 0.89, 'rust'],
  ['Chicken Soup Bowl', 'Sopa de Pollo (Tazón)', 'Sides', 'portion', 1.87, 'tan'],
  ['Chicken Soup Cup', 'Sopa de Pollo (Vaso)', 'Sides', 'portion', 1.11, 'tan'],
  ['Chocolate Chunk Cookie', 'Galleta con Trozos de Chocolate', 'Desserts', 'pc', 0.38, 'crimson'],
  ['Cobb Salad', 'Ensalada Cobb', 'Prep', 'portion', 3.42, 'lime'],
  ['Coffee Base', 'Base de Café', 'FOH SAT BEV WASTE', 'quart', 0, 'brown'],
  ['Coke', 'Coca-Cola', 'Drinks', 'cup', 0.18, 'crimson'],
  ['Cookies and Cream Milkshake', 'Malteada de Galletas con Crema', 'Desserts', 'portion', 1.23],
  ['Cool Wrap', 'Envoltorio Asado', 'Prep', 'portion', 2.44, 'green'],
  ['Diet Lemonade', 'Limonada Dietética (Cuarto)', 'FOH SAT BEV WASTE', 'quart', 1.43, 'yellow'],
  ['Egg White Grill', 'Egg White Grill (Claras a la Parrilla)', 'Breakfast', 'pc', 1.06],
  ['Egg whites', 'Claras de Huevo', 'Breakfast', 'pc', 0.16],
  ['Egg Whites (2)', 'Claras de Huevo (2)', 'Breakfast', 'pc', 0.80, 'blue'],
  ['Filet', 'Filete CFA', 'Proteins', 'pc', 1.08, 'navy'],
  ['Frosted Coffee', 'Café Frosted', 'Desserts', 'portion', 0.77, 'maroon'],
  ['Frosted Lemonade', 'Limonada Frosted', 'Desserts', 'portion', 0.68, 'yellow'],
  ['Gluten Free Bun', 'Pan sin Gluten', 'Breads', 'bun', 0.86],
  ['Greek Yogurt Parfait', 'Parfait de Yogur Griego', 'Prep', 'portion', 1.60, 'green'],
  ['Grilled Breakfast Filet', 'Filete Asado de Desayuno', 'Breakfast', 'pc', 0.59, 'gray'],
  ['Grilled Club', 'Sándwich Club Asado', 'Sandwiches', 'pc', 2.29, 'tan'],
  ['Grilled Filet', 'Filete Asado', 'Proteins', 'pc', 1.18, 'tan'],
  ['Grilled Nugget', 'Pepita Asada (1 pieza)', 'Proteins', 'pc', 0.18, 'charcoal'],
  ['Grilled Sandwich', 'Sándwich Asado', 'Sandwiches', 'pc', 1.87, 'tan'],
  ['Hashbrown Scramble Bowl', 'Tazón Hash Brown Scramble', 'Breakfast', 'pc', 1.25],
  ['Hashbrown Scramble Burrito', 'Burrito Hash Brown Scramble', 'Breakfast', 'pc', 1.43],
  ['Hashbrowns', 'Papitas Hash Brown (Regular)', 'Breakfast', 'pc', 0.27, 'tan'],
  ['Ice Dream', 'Helado CFA (Cuarto)', 'FOH SAT BEV WASTE', 'quart', 0],
  ['IceCream Cone', 'Helado CFA (Cono)', 'Desserts', 'portion', 0.39],
  ['IceCream Cup', 'Helado CFA (Vaso)', 'Desserts', 'portion', 0.26],
  ['Kale Crunch Side', 'Ensalada de Kale', 'Prep', 'portion', 0.79, 'green'],
  ['Large Hashbrowns', 'Papitas Hash Brown (Grande)', 'Breakfast', 'pc', 0.41, 'tan'],
  ['Large Mac and Cheese', 'Pasta con Queso (Grande)', 'Sides', 'portion', 1.57, 'orange'],
  ['Large Waffle Fry', 'Papas Onduladas (Grande)', 'Sides', 'portion', 0.77, 'yellow'],
  ['Lemonade', 'Limonada (Cuarto)', 'FOH SAT BEV WASTE', 'quart', 1.33, 'yellow'],
  ['Market Salad', 'Ensalada Market', 'Prep', 'portion', 3.72, 'lime'],
  ['Medium Fruit Cup', 'Vaso de Fruta (Mediano)', 'Prep', 'portion', 0.99, 'green'],
  ['Medium Mac and Cheese', 'Pasta con Queso (Mediano)', 'Sides', 'portion', 1.01, 'orange'],
  ['Medium Waffle Fry', 'Papas Onduladas (Mediano)', 'Sides', 'portion', 0.57, 'yellow'],
  ['Mini Bread', 'Pan de Mini', 'Breakfast', 'pc', 0.57],
  ['Muffin', 'Muffin', 'Breakfast', 'pc', 0.35],
  ['Multi-Grain Bun', 'Pan Multigrano', 'Breads', 'bun', 0.35],
  ['Nugget', 'Pepita (1 pieza)', 'Proteins', 'pc', 0.16, 'magenta'],
  ['Peach Milkshake', 'Malteada de Durazno', 'Desserts', 'portion', 1.70, 'sand'],
  ['Raw Breakfast Filet', 'Filete Desayuno Crudo', 'Proteins', 'pc', 0.56, 'gray'],
  ['Raw Filet', 'Filete Crudo', 'Raw', 'pc', 0.85, 'dnavy'],
  ['Raw Grilled Filet', 'Filete Asado Crudo', 'Raw', 'pc', 0.89, 'tan'],
  ['Raw Grilled Nugget', 'Pepita Asada Cruda', 'Raw', 'pc', 0.14, 'charcoal'],
  ['Raw Nugget', 'Pepita Cruda', 'Raw', 'pc', 0.14, 'magenta'],
  ['Raw Spicy Breakfast Filet', 'Filete Picante Desayuno Crudo', 'Raw', 'pc', 0.69, 'gray'],
  ['Raw Spicy Filet', 'Filete Picante Crudo', 'Raw', 'pc', 0.92, 'violet'],
  ['Raw Strip', 'Tira Cruda', 'Raw', 'pc', 0.48, 'gray'],
  ['Sausage', 'Salchicha', 'Breakfast', 'pc', 0.51, 'maroon'],
  ['Sausage Biscuit', 'Bisquet con Salchicha', 'Breakfast', 'pc', 0.71],
  ['SEC Biscuit', 'Bisquet de Salchicha, Huevo y Queso', 'Breakfast', 'pc', 0.94],
  ['SEC Muffin', 'Muffin de Salchicha, Huevo y Queso', 'Breakfast', 'pc', 0.98],
  ['Side Salad', 'Ensalada de Lado', 'Prep', 'portion', 1.21, 'lime'],
  ['Small Fruit Cup', 'Vaso de Fruta (Pequeño)', 'Prep', 'portion', 0.78, 'green'],
  ['Small Mac and Cheese', 'Pasta con Queso (Pequeño)', 'Sides', 'portion', 0.63, 'orange'],
  ['Small Waffle Fry', 'Papas Onduladas (Pequeño)', 'Sides', 'portion', 0.44, 'yellow'],
  ['Spicy Biscuit', 'Bisquet Picante', 'Breakfast', 'pc', 0.96, 'rust'],
  ['Spicy Breakfast Filet', 'Filete Picante de Desayuno', 'Breakfast', 'pc', 0.76, 'gray'],
  ['Spicy Deluxe Sandwich', 'Sándwich Deluxe Picante', 'Sandwiches', 'pc', 1.91, 'dviolet'],
  ['Spicy Filet', 'Filete Picante', 'Proteins', 'pc', 1.30, 'purple'],
  ['Spicy Sandwich', 'Sándwich Picante', 'Sandwiches', 'pc', 1.49, 'red'],
  ['Spicy Southwest Salad', 'Ensalada Suroeste Picante', 'Prep', 'portion', 3.21, 'lime'],
  ['Spicy Wrap', 'Envoltorio Picante', 'Prep', 'pc', 2.20, 'green'],
  ['Strawberry Milkshake', 'Malteada de Fresa', 'Desserts', 'portion', 1.24, 'red'],
  ['Strips', 'Tiras (1 pieza)', 'Proteins', 'pc', 0.56, 'red'],
  ['Sweet Tea', 'Té Dulce', 'Drinks', 'cup', 0.06, 'brown'],
  ['Tortilla', 'Tortilla', 'Breakfast', 'pc', 0.10],
  ['Vanilla Milkshake', 'Malteada de Vainilla', 'Desserts', 'portion', 1.15, 'sand'],
  ['Waffle (Bkfst)', 'Waffle (Desayuno)', 'Breads', 'pc', 0.73, 'yellow'],
  ['Waffle (Lunch)', 'Waffle (Almuerzo)', 'Breads', 'pc', 0.79, 'charcoal'],
  ['Waffle Potato Chips', 'Papas Onduladas (Chips)', 'Sides', 'portion', 0.55],
  ['White Bun', 'Pan Blanco', 'Breads', 'bun', 0.17],
  ['Yellow Egg', 'Huevo', 'Breakfast', 'pc', 0.16, 'yellow'],
  ['Yellow egg (2)', 'Huevos (2)', 'Breakfast', 'pc', 0.60, 'teal']
];

// Price fix 5 (Oct 2026): costs from the store's Menu Details report (the
// "Avg. Item Food Cost" column); the quart lemonades are the gallon cost ÷ 4.
// {id: [cost before, cost now]}: a saved item still at the old cost (or with
// none) moves to the new one; a cost a manager typed in stays.
const WASTE_PRICE_FIX_5 = {
  '5-count-nugget': [0.96, 0.93],
  '5-count-grilled-nugget': [1.09, 1.02],
  '8-count-nugget': [1.44, 1.42],
  '8-count-grilled-nugget': [1.61, 1.56],
  '12-count-grilled-nugget': [2.42, 2.40],
  '2-count-strip': [0.58, 1.00],
  '3-count-strip': [1.44, 1.45],
  '4-count-strip': [1.98, 2.01],
  '4-count-mini': [1.20, 1.19],
  '10-count-mini': [2.80, 2.97],
  'bec-biscuit': [0.82, 0.72],
  'bec-muffin': [0.83, 0.76],
  'breakfast-filet': [0.65, 0.68],
  'brownie': [0.59, 0.50],
  'cec-biscuit': [1.15, 1.11],
  'cec-muffin': [1.17, 1.15],
  'cfa-deluxe-sandwich': [1.68, 1.63],
  'cfa-sandwich': [1.28, 1.27],
  'chicken-biscuit': [0.90, 0.89],
  'chicken-soup-bowl': [2.02, 1.87],
  'chicken-soup-cup': [1.19, 1.11],
  'chocolate-chunk-cookie': [0.40, 0.38],
  'cobb-salad': [3.56, 3.42],
  'cookies-and-cream-milkshake': [1.38, 1.23],
  'cool-wrap': [2.60, 2.44],
  'diet-lemonade': [0.00, 1.43],
  'egg-white-grill': [1.10, 1.06],
  'egg-whites': [0.19, 0.16],
  'filet': [1.06, 1.08],
  'frosted-coffee': [1.02, 0.77],
  'frosted-lemonade': [0.83, 0.68],
  'gluten-free-bun': [0.82, 0.86],
  'greek-yogurt-parfait': [1.70, 1.60],
  'grilled-breakfast-filet': [0.56, 0.59],
  'grilled-club': [2.37, 2.29],
  'grilled-filet': [1.14, 1.18],
  'grilled-nugget': [0.17, 0.18],
  'grilled-sandwich': [1.92, 1.87],
  'hashbrown-scramble-bowl': [1.50, 1.25],
  'hashbrown-scramble-burrito': [1.52, 1.43],
  'hashbrowns': [1.69, 0.27],
  'icecream-cone': [0.40, 0.39],
  'icecream-cup': [0.35, 0.26],
  'kale-crunch-side': [0.63, 0.79],
  'large-hashbrowns': [2.19, 0.41],
  'large-mac-and-cheese': [1.80, 1.57],
  'large-waffle-fry': [8.52, 0.77],
  'lemonade': [0.00, 1.33],
  'market-salad': [3.70, 3.72],
  'medium-fruit-cup': [1.03, 0.99],
  'medium-mac-and-cheese': [1.80, 1.01],
  'medium-waffle-fry': [6.02, 0.57],
  'muffin': [0.39, 0.35],
  'multi-grain-bun': [0.33, 0.35],
  'sausage': [1.54, 0.51],
  'sausage-biscuit': [0.73, 0.71],
  'sec-biscuit': [0.98, 0.94],
  'sec-muffin': [1.00, 0.98],
  'side-salad': [1.33, 1.21],
  'small-fruit-cup': [0.96, 0.78],
  'small-mac-and-cheese': [0.75, 0.63],
  'small-waffle-fry': [0.48, 0.44],
  'spicy-biscuit': [0.00, 0.96],
  'spicy-breakfast-filet': [0.74, 0.76],
  'spicy-deluxe-sandwich': [1.97, 1.91],
  'spicy-filet': [1.27, 1.30],
  'spicy-sandwich': [0.00, 1.49],
  'spicy-southwest-salad': [0.00, 3.21],
  'spicy-wrap': [0.00, 2.20],
  'strawberry-milkshake': [0.00, 1.24],
  'strips': [0.53, 0.56],
  'sweet-tea': [0.00, 0.06],
  'vanilla-milkshake': [0.00, 1.15],
  'waffle-bkfst': [0.00, 0.73],
  'waffle-lunch': [0.00, 0.79],
  'waffle-potato-chips': [0.00, 0.55],
  'white-bun': [0.00, 0.17],
  'yellow-egg': [0.00, 0.16]
};

// Which side each item shows on (Tim, Oct 2026): raw product, cooked
// proteins, breakfast components and breads are logged in the back; finished
// menu items, drinks, desserts, sides and the cold-side prep in the front.
// Every item's side can be changed in Manage (FOH, BOH or Both).
const WASTE_BOH_ITEMS = new Set([
  'raw-filet', 'raw-grilled-filet', 'raw-grilled-nugget', 'raw-nugget', 'raw-spicy-breakfast-filet', 'raw-spicy-filet', 'raw-strip', 'raw-breakfast-filet',
  'filet', 'grilled-filet', 'spicy-filet', 'nugget', 'grilled-nugget', 'strips', 'bacon',
  'breakfast-filet', 'grilled-breakfast-filet', 'spicy-breakfast-filet', 'egg-whites', 'egg-whites-2', 'yellow-egg', 'yellow-egg-2',
  'sausage', 'tortilla', 'mini-bread', 'muffin', 'buttered-biscuit',
  'brioche-bun', 'gluten-free-bun', 'multi-grain-bun', 'white-bun', 'waffle-bkfst', 'waffle-lunch'
]);
const WASTE_SIDES = ['foh', 'boh', 'both'];
function wasteDefaultSide(id){ return WASTE_BOH_ITEMS.has(id) ? 'boh' : 'foh'; }
// Does this item belong on the FOH or BOH tracker? An item with no side set
// (added before sides existed) shows on both.
function wasteItemShows(p, section){
  const side = WASTE_SIDES.includes(p.side) ? p.side : 'both';
  return side === 'both' || side === section;
}

// "5 Count Nugget" → "5-count-nugget": a stable id from the name.
function wasteSlug(name){
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item';
}

// Items from the old Log Waste list (by their old ids) → the catalog item
// they are now, so this month's entries carry over. The old items with no
// match keep their stored name on every screen. (For Tim to vet: Nuggets and
// Grilled Nuggets 30 ct, Fruit Cups (Large), Strips (10 ct), Breaded Filet,
// Breaded Spicy Filet, Buttered Bun, Sauce Container.)
const WASTE_LEGACY_MAP = {
  foh1: 'lemonade', foh2: 'cfa-sandwich', foh3: 'spicy-sandwich',
  foh29: 'nugget', foh25: '5-count-nugget', foh4: '8-count-nugget', foh5: '12-count-nugget',
  foh31: 'grilled-nugget', foh26: '5-count-grilled-nugget', foh27: '8-count-grilled-nugget', foh28: '12-count-grilled-nugget',
  foh6: 'small-waffle-fry', foh7: 'medium-waffle-fry', foh8: 'large-waffle-fry',
  foh9: 'small-mac-and-cheese', foh10: 'medium-mac-and-cheese', foh11: 'large-mac-and-cheese',
  foh18: 'small-fruit-cup', foh19: 'medium-fruit-cup',
  foh33: 'hashbrowns', foh34: 'large-hashbrowns', foh15: 'side-salad',
  foh12: 'market-salad', foh13: 'cobb-salad', foh14: 'spicy-southwest-salad',
  foh16: 'cool-wrap', foh17: 'spicy-wrap',
  foh21: 'icecream-cone', foh23: 'icecream-cup', foh24: 'ice-dream', foh22: 'vanilla-milkshake',
  boh1: 'raw-breakfast-filet', boh2: 'raw-spicy-breakfast-filet', boh3: 'raw-filet', boh4: 'raw-spicy-filet',
  boh5: 'filet', boh6: 'spicy-filet',
  boh18: 'strips', boh19: '2-count-strip', boh20: '3-count-strip', boh21: '4-count-strip'
};

const WASTE_CATALOG_IDS = new Set(WASTE_CATALOG_ROWS.map(r => wasteSlug(r[0])));

// A fresh copy of the built-in list (the saved list starts from it).
function wasteDefaultProducts(){
  const seen = {};
  return WASTE_CATALOG_ROWS.map(r => {
    let id = wasteSlug(r[0]), n = 2;
    while(seen[id]) id = wasteSlug(r[0]) + '-' + (n++);
    seen[id] = 1;
    return {id, name: r[0], es: r[1], cat: r[2], unit: r[3], cost: r[4], color: r[5] ? WASTE_COLORS[r[5]] : '', ceil: 0, active: true, side: wasteDefaultSide(id),
            ord: (r[2] === 'Proteins' && WASTE_PROTEIN_ORDER[r[0]]) || 1000};
  });
}

// Only a real "#rrggbb" is used on a tile; anything else falls back to the
// category color (saved data is never trusted as CSS).
function wasteValidColor(c){
  return /^#[0-9a-f]{6}$/i.test(String(c || '')) ? String(c).toLowerCase() : '';
}
function wasteItemColor(p){
  return wasteValidColor(p && p.color) || WASTE_CAT_COLOR[p && p.cat] || '#575757';
}
// Dark or light text for a tile color.
function wasteTextOn(hex){
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) > 170 ? '#1b2420' : '#ffffff';
}

// Categories in use, in the catalog's order; new ones after, by name.
function wasteCategories(list){
  const have = {};
  (list || products).forEach(p => { have[p.cat] = 1; });
  const known = WASTE_CAT_ORDER.filter(c => have[c]);
  const extra = Object.keys(have).filter(c => !WASTE_CAT_ORDER.includes(c)).sort((a, b) => a.localeCompare(b, undefined, {numeric: true, sensitivity: 'base'}));
  return known.concat(extra);
}

// The catalog item an entry belongs to (old ids are mapped), or a stand-in
// built from what the entry itself recorded.
function wasteItemFor(entry){
  const id = WASTE_LEGACY_MAP[entry.prodId] || entry.prodId;
  return products.find(p => p.id === id) || {id, name: entry.name || '(removed item)', es: '', cat: 'Other', unit: entry.unit || '', cost: Number(entry.unitCost) || 0, color: '', ceil: 0, active: false, legacy: true};
}
