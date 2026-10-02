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
  ['5 Count Nugget', 'Pepitas (5 piezas)', 'Nuggets', 'pc', 0.96, 'magenta'],
  ['5 Count Grilled Nugget', 'Pepitas Asadas (5 piezas)', 'Nuggets', 'pc', 1.09, 'charcoal'],
  ['8 Count Nugget', 'Pepitas (8 piezas)', 'Nuggets', 'pc', 1.44, 'magenta'],
  ['8 Count Grilled Nugget', 'Pepitas Asadas (8 piezas)', 'Nuggets', 'pc', 1.61, 'charcoal'],
  ['12 Count Nugget', 'Pepitas (12 piezas)', 'Nuggets', 'pc', 2.19, 'magenta'],
  ['12 Count Grilled Nugget', 'Pepitas Asadas (12 piezas)', 'Nuggets', 'pc', 2.42, 'charcoal'],
  ['2 Count Strip', 'Tiras (2 piezas)', 'Strips', 'pc', 0.58, 'red'],
  ['3 Count Strip', 'Tiras (3 piezas)', 'Strips', 'pc', 1.44, 'red'],
  ['4 Count Strip', 'Tiras (4 piezas)', 'Strips', 'pc', 1.98, 'red'],
  ['4 Count Mini', 'Minis (4 piezas)', 'Breakfast', 'pc', 1.20, 'gold'],
  ['10 Count Mini', 'Minis (10 piezas)', 'Breakfast', 'pc', 2.80, 'gold'],
  ['Bacon', 'Tocino', 'Proteins', 'pc', 0.21, 'pink'],
  ['Bacon Biscuit', 'Bisquet con Tocino', 'Breakfast', 'pc', 0.56],
  ['BEC Biscuit', 'Bisquet de Tocino, Huevo y Queso', 'Breakfast', 'pc', 0.82],
  ['BEC Muffin', 'Muffin de Tocino, Huevo y Queso', 'Breakfast', 'pc', 0.83],
  ['Breakfast Filet', 'Filete de Desayuno', 'Breakfast', 'pc', 0.65],
  ['Brioche Bun', 'Pan Brioche', 'Breads', 'bun', 0.33],
  ['Brownie', 'Brownie', 'Desserts', 'pc', 0.59, 'maroon'],
  ['Buttered Biscuit', 'Bisquet con Mantequilla', 'Breakfast', 'pc', 1.65],
  ['CEC Biscuit', 'Bisquet de Pollo, Huevo y Queso', 'Breakfast', 'pc', 1.15],
  ['CEC Muffin', 'Muffin de Pollo, Huevo y Queso', 'Breakfast', 'pc', 1.17],
  ['CFA Deluxe Sandwich', 'Sándwich Deluxe', 'Sandwiches', 'pc', 1.68, 'navy'],
  ['CFA Sandwich', 'Sándwich de Pollo', 'Sandwiches', 'pc', 1.28, 'navy'],
  ['Chicken Biscuit', 'Bisquet de Pollo', 'Breakfast', 'pc', 0.90, 'rust'],
  ['Chicken Soup Bowl', 'Sopa de Pollo (Tazón)', 'Sides', 'portion', 2.02, 'tan'],
  ['Chicken Soup Cup', 'Sopa de Pollo (Vaso)', 'Sides', 'portion', 1.19, 'tan'],
  ['Chocolate Chunk Cookie', 'Galleta con Trozos de Chocolate', 'Desserts', 'pc', 0.40, 'crimson'],
  ['Cobb Salad', 'Ensalada Cobb', 'Prep', 'portion', 3.56, 'lime'],
  ['Coffee Base', 'Base de Café', 'FOH SAT BEV WASTE', 'quart', 0, 'brown'],
  ['Coke', 'Coca-Cola', 'Drinks', 'cup', 0.18, 'crimson'],
  ['Cookies and Cream Milkshake', 'Malteada de Galletas con Crema', 'Desserts', 'portion', 1.38],
  ['Cool Wrap', 'Envoltorio Asado', 'Prep', 'portion', 2.60, 'green'],
  ['Diet Lemonade', 'Limonada Dietética (Cuarto)', 'FOH SAT BEV WASTE', 'quart', 0, 'yellow'],
  ['Egg White Grill', 'Egg White Grill (Claras a la Parrilla)', 'Breakfast', 'pc', 1.10],
  ['Egg whites', 'Claras de Huevo', 'Breakfast', 'pc', 0.19],
  ['Egg Whites (2)', 'Claras de Huevo (2)', 'Breakfast', 'pc', 0.80, 'blue'],
  ['Filet', 'Filete CFA', 'Proteins', 'pc', 1.06, 'navy'],
  ['Frosted Coffee', 'Café Frosted', 'Desserts', 'portion', 1.02, 'maroon'],
  ['Frosted Lemonade', 'Limonada Frosted', 'Desserts', 'portion', 0.83, 'yellow'],
  ['Gluten Free Bun', 'Pan sin Gluten', 'Breads', 'bun', 0.82],
  ['Greek Yogurt Parfait', 'Parfait de Yogur Griego', 'Prep', 'portion', 1.70, 'green'],
  ['Grilled Breakfast Filet', 'Filete Asado de Desayuno', 'Breakfast', 'pc', 0.56, 'gray'],
  ['Grilled Club', 'Sándwich Club Asado', 'Sandwiches', 'pc', 2.37, 'tan'],
  ['Grilled Filet', 'Filete Asado', 'Proteins', 'pc', 1.14, 'tan'],
  ['Grilled Nugget', 'Pepita Asada (1 pieza)', 'Proteins', 'pc', 0.17, 'charcoal'],
  ['Grilled Sandwich', 'Sándwich Asado', 'Sandwiches', 'pc', 1.92, 'tan'],
  ['Hashbrown Scramble Bowl', 'Tazón Hash Brown Scramble', 'Breakfast', 'pc', 1.50],
  ['Hashbrown Scramble Burrito', 'Burrito Hash Brown Scramble', 'Breakfast', 'pc', 1.52],
  ['Hashbrowns', 'Papitas Hash Brown (Regular)', 'Breakfast', 'pc', 1.69, 'tan'],
  ['Ice Dream', 'Helado CFA (Cuarto)', 'FOH SAT BEV WASTE', 'quart', 0],
  ['IceCream Cone', 'Helado CFA (Cono)', 'Desserts', 'portion', 0.40],
  ['IceCream Cup', 'Helado CFA (Vaso)', 'Desserts', 'portion', 0.35],
  ['Kale Crunch Side', 'Ensalada de Kale', 'Prep', 'portion', 0.63, 'green'],
  ['Large Hashbrowns', 'Papitas Hash Brown (Grande)', 'Breakfast', 'pc', 2.19, 'tan'],
  ['Large Mac and Cheese', 'Pasta con Queso (Grande)', 'Sides', 'portion', 1.80, 'orange'],
  ['Large Waffle Fry', 'Papas Onduladas (Grande)', 'Sides', 'portion', 8.52, 'yellow'],
  ['Lemonade', 'Limonada (Cuarto)', 'FOH SAT BEV WASTE', 'quart', 0, 'yellow'],
  ['Market Salad', 'Ensalada Market', 'Prep', 'portion', 3.70, 'lime'],
  ['Medium Fruit Cup', 'Vaso de Fruta (Mediano)', 'Prep', 'portion', 1.03, 'green'],
  ['Medium Mac and Cheese', 'Pasta con Queso (Mediano)', 'Sides', 'portion', 1.80, 'orange'],
  ['Medium Waffle Fry', 'Papas Onduladas (Mediano)', 'Sides', 'portion', 6.02, 'yellow'],
  ['Mini Bread', 'Pan de Mini', 'Breakfast', 'pc', 0.57],
  ['Muffin', 'Muffin', 'Breakfast', 'pc', 0.39],
  ['Multi-Grain Bun', 'Pan Multigrano', 'Breads', 'bun', 0.33],
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
  ['Sausage', 'Salchicha', 'Breakfast', 'pc', 1.54, 'maroon'],
  ['Sausage Biscuit', 'Bisquet con Salchicha', 'Breakfast', 'pc', 0.73],
  ['SEC Biscuit', 'Bisquet de Salchicha, Huevo y Queso', 'Breakfast', 'pc', 0.98],
  ['SEC Muffin', 'Muffin de Salchicha, Huevo y Queso', 'Breakfast', 'pc', 1.00],
  ['Side Salad', 'Ensalada de Lado', 'Prep', 'portion', 1.33, 'lime'],
  ['Small Fruit Cup', 'Vaso de Fruta (Pequeño)', 'Prep', 'portion', 0.96, 'green'],
  ['Small Mac and Cheese', 'Pasta con Queso (Pequeño)', 'Sides', 'portion', 0.75, 'orange'],
  ['Small Waffle Fry', 'Papas Onduladas (Pequeño)', 'Sides', 'portion', 0.48, 'yellow'],
  ['Spicy Biscuit', 'Bisquet Picante', 'Breakfast', 'pc', 0, 'rust'],
  ['Spicy Breakfast Filet', 'Filete Picante de Desayuno', 'Breakfast', 'pc', 0.74, 'gray'],
  ['Spicy Deluxe Sandwich', 'Sándwich Deluxe Picante', 'Sandwiches', 'pc', 1.97, 'dviolet'],
  ['Spicy Filet', 'Filete Picante', 'Proteins', 'pc', 1.27, 'purple'],
  ['Spicy Sandwich', 'Sándwich Picante', 'Sandwiches', 'pc', 0, 'red'],
  ['Spicy Southwest Salad', 'Ensalada Suroeste Picante', 'Prep', 'portion', 0, 'lime'],
  ['Spicy Wrap', 'Envoltorio Picante', 'Prep', 'pc', 0, 'green'],
  ['Strawberry Milkshake', 'Malteada de Fresa', 'Desserts', 'portion', 0, 'red'],
  ['Strips', 'Tiras (1 pieza)', 'Proteins', 'pc', 0.53, 'red'],
  ['Sweet Tea', 'Té Dulce', 'Drinks', 'cup', 0, 'brown'],
  ['Tortilla', 'Tortilla', 'Breakfast', 'pc', 0.10],
  ['Vanilla Milkshake', 'Malteada de Vainilla', 'Desserts', 'portion', 0, 'sand'],
  ['Waffle (Bkfst)', 'Waffle (Desayuno)', 'Breads', 'pc', 0, 'yellow'],
  ['Waffle (Lunch)', 'Waffle (Almuerzo)', 'Breads', 'pc', 0, 'charcoal'],
  ['Waffle Potato Chips', 'Papas Onduladas (Chips)', 'Sides', 'portion', 0],
  ['White Bun', 'Pan Blanco', 'Breads', 'bun', 0],
  ['Yellow Egg', 'Huevo', 'Breakfast', 'pc', 0, 'yellow'],
  ['Yellow egg (2)', 'Huevos (2)', 'Breakfast', 'pc', 0.60, 'teal']
];

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

// A fresh copy of the built-in list (the saved list starts from it).
function wasteDefaultProducts(){
  const seen = {};
  return WASTE_CATALOG_ROWS.map(r => {
    let id = wasteSlug(r[0]), n = 2;
    while(seen[id]) id = wasteSlug(r[0]) + '-' + (n++);
    seen[id] = 1;
    return {id, name: r[0], es: r[1], cat: r[2], unit: r[3], cost: r[4], color: r[5] ? WASTE_COLORS[r[5]] : '', ceil: 0, active: true,
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
