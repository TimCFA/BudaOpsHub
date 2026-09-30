// Waste products as tiles. From the current app's fohProducts / bohProducts (zone-reset.js),
// collapsed so one tile carries its sizes. `es` is what the crew says on the floor, so it often
// equals the menu name (Nuggets, Mac & Cheese, Ice Dream); the tile skips a duplicate second line. Every cost is 0 on purpose (sample data) — the
// Waste screen shows counts and says "$ view needs item costs" while that is true.
// Product = { id, side, cat, name, es, sizes: [{ label, qty }] | null, cost: 0 }
//   sizes: label is what the 44 px button says; qty is the piece count that size means
//   (8 nuggets, 1 for a single item). sizes: null = one size; the tile shows ×1.

export const PRODUCTS = [
  // ---------- FOH ----------
  { id: 'nuggets',        side: 'foh', cat: 'Nuggets',    name: 'Nuggets',         es: 'Nuggets',
    sizes: [{ label: '8', qty: 8 }, { label: '12', qty: 12 }, { label: '30', qty: 30 }], cost: 0 },
  { id: 'grilled-nuggets', side: 'foh', cat: 'Grilled',   name: 'Grilled Nuggets', es: 'Nuggets asados',
    sizes: [{ label: '8', qty: 8 }, { label: '12', qty: 12 }, { label: '30', qty: 30 }], cost: 0 },
  { id: 'fries',          side: 'foh', cat: 'Sides',      name: 'Fries',           es: 'Papas',
    sizes: [{ label: 'M', qty: 1 }, { label: 'L', qty: 1 }], cost: 0 },
  { id: 'sandwich',       side: 'foh', cat: 'Sandwiches', name: 'Chicken Sandwich', es: 'Sándwich de Pollo', sizes: null, cost: 0 },
  { id: 'spicy-sandwich', side: 'foh', cat: 'Sandwiches', name: 'Spicy Sandwich',  es: 'Sándwich Picante',  sizes: null, cost: 0 },
  { id: 'lemonade',       side: 'foh', cat: 'Beverages',  name: 'Lemonade',        es: 'Limonada',
    sizes: [{ label: 'M', qty: 1 }, { label: 'L', qty: 1 }], cost: 0 },
  { id: 'biscuit',        side: 'foh', cat: 'Breakfast',  name: 'Biscuit',         es: 'Bisquet', sizes: null, cost: 0 },
  { id: 'mac-cheese',     side: 'foh', cat: 'Sides',      name: 'Mac & Cheese',    es: 'Mac & Cheese',
    sizes: [{ label: 'S', qty: 1 }, { label: 'M', qty: 1 }, { label: 'L', qty: 1 }], cost: 0 },
  { id: 'fruit-cup',      side: 'foh', cat: 'Sides',      name: 'Fruit Cup',       es: 'Fruta',
    sizes: [{ label: 'S', qty: 1 }, { label: 'M', qty: 1 }, { label: 'L', qty: 1 }], cost: 0 },
  { id: 'hash-browns',    side: 'foh', cat: 'Sides',      name: 'Hash Browns',     es: 'Hash browns',
    sizes: [{ label: 'Reg', qty: 1 }, { label: 'L', qty: 1 }], cost: 0 },
  { id: 'side-salad',     side: 'foh', cat: 'Sides',      name: 'Side Salad',      es: 'Ensalada chica', sizes: null, cost: 0 },
  { id: 'market-salad',   side: 'foh', cat: 'Salads',     name: 'Market Salad',    es: 'Ensalada Market',  sizes: null, cost: 0 },
  { id: 'cobb-salad',     side: 'foh', cat: 'Salads',     name: 'Cobb Salad',      es: 'Ensalada Cobb',    sizes: null, cost: 0 },
  { id: 'southwest-salad', side: 'foh', cat: 'Salads',    name: 'Southwest Salad', es: 'Ensalada Suroeste', sizes: null, cost: 0 },
  { id: 'grilled-wrap',   side: 'foh', cat: 'Wraps',      name: 'Grilled Wrap',    es: 'Wrap asado',  sizes: null, cost: 0 },
  { id: 'spicy-wrap',     side: 'foh', cat: 'Wraps',      name: 'Spicy Wrap',      es: 'Wrap picante', sizes: null, cost: 0 },
  { id: 'ice-dream',      side: 'foh', cat: 'Ice Dream',  name: 'Ice Dream',       es: 'Ice Dream',
    sizes: [{ label: 'Cone', qty: 1 }, { label: 'Cup', qty: 1 }, { label: 'Shake', qty: 1 }], cost: 0 },
  { id: 'ice-dream-quart', side: 'foh', cat: 'Ice Dream', name: 'Ice Dream Quart', es: 'Ice Dream (cuarto)', sizes: null, cost: 0 },

  // ---------- BOH ----------
  { id: 'strips',         side: 'boh', cat: 'Tenders',    name: 'Strips',          es: 'Tiras',
    sizes: [{ label: '3', qty: 3 }, { label: '4', qty: 4 }], cost: 0 },
  { id: 'raw-filet',      side: 'boh', cat: 'Raw Filets', name: 'Raw Filet',       es: 'Filete Crudo',         sizes: null, cost: 0 },
  { id: 'raw-spicy-filet', side: 'boh', cat: 'Raw Filets', name: 'Raw Spicy Filet', es: 'Filete Picante Crudo', sizes: null, cost: 0 },
  { id: 'raw-bkf-filet',  side: 'boh', cat: 'Raw Filets', name: 'Raw Breakfast Filet', es: 'Filete Desayuno Crudo', sizes: null, cost: 0 },
  { id: 'raw-spicy-bkf-filet', side: 'boh', cat: 'Raw Filets', name: 'Raw Spicy Breakfast Filet', es: 'Filete Picante Desayuno Crudo', sizes: null, cost: 0 },
  { id: 'cfa-filet',      side: 'boh', cat: 'Cooked Filets', name: 'CFA Filet',    es: 'Filete CFA',           sizes: null, cost: 0 },
  { id: 'spicy-filet',    side: 'boh', cat: 'Cooked Filets', name: 'Spicy Filet',  es: 'Filete Picante',       sizes: null, cost: 0 },
  { id: 'breaded-filet',  side: 'boh', cat: 'Prepared',   name: 'Breaded Filet',   es: 'Filete Empanizado',    sizes: null, cost: 0 },
  { id: 'breaded-spicy-filet', side: 'boh', cat: 'Prepared', name: 'Breaded Spicy Filet', es: 'Filete Picante Empanizado', sizes: null, cost: 0 },
  { id: 'buttered-bun',   side: 'boh', cat: 'Components', name: 'Buttered Bun',    es: 'Bollo Mantequillado',  sizes: null, cost: 0 },
  { id: 'sauce-container', side: 'boh', cat: 'Sauce Prep', name: 'Sauce Container', es: 'Recipiente de Salsa', sizes: null, cost: 0 },
];

export const PRODUCTS_BY_ID = Object.fromEntries(PRODUCTS.map(p => [p.id, p]));

export function productsFor(side) { return PRODUCTS.filter(p => p.side === side); }

// Label for a logged entry: 'Nuggets 12 ct', 'Fries L', 'Biscuit'; in Spanish the crew name and
// the i18n 'ct' word ('Nuggets 12 pzas').
export function sizeLabel(product, label, lang = 'en', ct = 'ct') {
  if (!product) return '';
  const name = lang === 'es' && product.es ? product.es : product.name;
  if (!product.sizes || !label) return name;
  const s = product.sizes.find(x => x.label === label);
  if (!s) return name;
  return s.qty > 1 ? `${name} ${s.label} ${ct}` : `${name} ${s.label}`;
}
