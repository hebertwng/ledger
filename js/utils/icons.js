// Ícones de linha (SVG inline, 24x24, cor herdada via currentColor) usados no menu lateral, nas
// listas e nos formulários. Inline para funcionar offline, sem fonte de ícones nem dependência
// externa.
const PATHS = {
  // ---------- Interface ----------
  overview: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  transactions: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M7 9h10"/><path d="M7 13h10"/><path d="M7 17h6"/>',
  transfers: '<path d="M8 3 4 7l4 4"/><path d="M4 7h16"/><path d="m16 21 4-4-4-4"/><path d="M20 17H4"/>',
  alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  sparkles: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9Z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8Z"/>',
  invoices: '<path d="M5 2h14v20l-2.5-1.5L14 22l-2-1.5L10 22l-2.5-1.5L5 22Z"/><path d="M9 7h6"/><path d="M9 11h6"/><path d="M9 15h4"/>',
  budgets: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  reports: '<path d="M6 20V10"/><path d="M12 20V4"/><path d="M18 20v-7"/>',
  accounts: '<path d="M3 21h18"/><path d="M5 18v-7"/><path d="M9.5 18v-7"/><path d="M14.5 18v-7"/><path d="M19 18v-7"/><path d="M12 3 21 8H3Z"/>',
  creditCards: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/><path d="M6 15h4"/>',
  categories: '<rect x="3" y="3" width="7" height="7" rx="3.5"/><rect x="14" y="3" width="7" height="7" rx="3.5"/><rect x="3" y="14" width="7" height="7" rx="3.5"/><path d="M17.5 14v7"/><path d="M14 17.5h7"/>',
  settings: '<path d="M12 2.5 20.5 7v10L12 21.5 3.5 17V7Z"/><circle cx="12" cy="12" r="3"/>',
  repeat: '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  checkCircle: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  circle: '<circle cx="12" cy="12" r="9"/>',
  chevronLeft: '<path d="m15 18-6-6 6-6"/>',
  chevronRight: '<path d="m9 18 6-6-6-6"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  chevronUp: '<path d="m18 15-6-6-6 6"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  plusCircle: '<circle cx="12" cy="12" r="9"/><path d="M8 12h8"/><path d="M12 8v8"/>',
  close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  pencil: '<path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  filter: '<path d="M3 5h18l-7 8v6l-4 2v-8Z"/>',
  arrowUp: '<path d="M12 19V5"/><path d="m5 12 7-7 7 7"/>',
  arrowDown: '<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>',
  wallet: '<path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4"/><path d="M21 9h-5a3 3 0 0 0 0 6h5Z"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/>',
  thumbsUp: '<path d="M7 10v11"/><path d="M15 5.9 14 10h5.8a2 2 0 0 1 2 2.3l-1.4 7A2 2 0 0 1 18.4 21H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h2.8a2 2 0 0 0 1.8-1.1L12 2a3.1 3.1 0 0 1 3 3.9Z"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M3 3l18 18"/><path d="M10.6 5.1A10 10 0 0 1 12 5c6 0 10 7 10 7a17 17 0 0 1-3.2 3.9"/><path d="M6.6 6.6C3.9 8.4 2 12 2 12s4 7 10 7a9.6 9.6 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.9 4.9 1.4 1.4"/><path d="m17.7 17.7 1.4 1.4"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m4.9 19.1 1.4-1.4"/><path d="m17.7 6.3 1.4-1.4"/>',
  sidebar: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16"/>',
  more: '<circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
  note: '<path d="M4 4h16v12l-4 4H4Z"/><path d="M8 9h8"/><path d="M8 13h5"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="m21 15-4-4-9 9"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14 14 0 0 1 0 18"/><path d="M12 3a14 14 0 0 0 0 18"/>',

  // ---------- Categorias (escolhidos no cadastro de categoria) ----------
  home: '<path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-5h4v5"/>',
  utensils: '<path d="M7 3v8"/><path d="M4 3v5a3 3 0 0 0 6 0V3"/><path d="M7 11v10"/><path d="M17 21V3c-2.2 0-4 2.5-4 7h4"/>',
  cart: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.7 12.3a1 1 0 0 0 1 .7h9.6a1 1 0 0 0 1-.8L21 7H6"/>',
  car: '<path d="M5 17H3v-5l2-5h14l2 5v5h-2"/><path d="M3 12h18"/><circle cx="7.5" cy="17" r="2"/><circle cx="16.5" cy="17" r="2"/>',
  fuel: '<path d="M4 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16"/><path d="M3 21h12"/><path d="M4 10h10"/><path d="M14 8h2a2 2 0 0 1 2 2v6a1.5 1.5 0 0 0 3 0V8l-3-3"/>',
  bus: '<rect x="4" y="3" width="16" height="15" rx="3"/><path d="M4 11h16"/><path d="M8 18v3"/><path d="M16 18v3"/><circle cx="8" cy="14.5" r=".5"/><circle cx="16" cy="14.5" r=".5"/>',
  heart: '<path d="M12 20s-8-4.6-8-10.5A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 8 2.5C20 15.4 12 20 12 20Z"/>',
  pill: '<rect x="2.5" y="8.5" width="19" height="7" rx="3.5" transform="rotate(-45 12 12)"/><path d="m8.5 8.5 7 7"/>',
  graduation: '<path d="m2 9 10-5 10 5-10 5Z"/><path d="M6 11v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5"/><path d="M22 9v6"/>',
  book: '<path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H20v16H5.5A1.5 1.5 0 0 0 4 20.5Z"/><path d="M4 20.5A1.5 1.5 0 0 0 5.5 22H20"/>',
  bag: '<path d="M5 8h14l-1 13H6Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
  shirt: '<path d="M8 3 3 6l2 4 2-1v12h10V9l2 1 2-4-5-3a4 4 0 0 1-8 0Z"/>',
  plane: '<path d="M10.5 13.5 3 11l1.5-1.5 8 .5 4-4.5a2.1 2.1 0 0 1 3 3L15 12.5l.5 8L14 22l-2.5-7.5L8 18v3l-1.5 1L5 19l-3-1.5L3 16h3l3.5-3.5"/>',
  umbrella: '<path d="M3 12a9 9 0 0 1 18 0Z"/><path d="M12 12v7a2 2 0 0 1-4 0"/><path d="M12 3v0"/>',
  film: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 3v18"/><path d="M17 3v18"/><path d="M3 8h4"/><path d="M3 16h4"/><path d="M17 8h4"/><path d="M17 16h4"/>',
  music: '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
  gamepad: '<rect x="2" y="7" width="20" height="11" rx="5"/><path d="M7 11v3"/><path d="M5.5 12.5h3"/><circle cx="15.5" cy="11.5" r=".5"/><circle cx="17.5" cy="13.5" r=".5"/>',
  coffee: '<path d="M4 9h13v5a6 6 0 0 1-6 6h-1a6 6 0 0 1-6-6Z"/><path d="M17 11h1.5a2.5 2.5 0 0 1 0 5H17"/><path d="M8 2v3"/><path d="M12 2v3"/>',
  beer: '<path d="M6 7h10v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2Z"/><path d="M16 10h2a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-2"/><path d="M6 7a3 3 0 0 1 3-4 3 3 0 0 1 4 0 3 3 0 0 1 3 4"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8"/><path d="M18 14a6.5 6.5 0 0 1 3.5 6"/>',
  baby: '<circle cx="12" cy="13" r="8"/><path d="M9 13h.01"/><path d="M15 13h.01"/><path d="M10 17a3 3 0 0 0 4 0"/><path d="M12 5a2 2 0 0 1 2-2"/>',
  paw: '<circle cx="5.5" cy="10" r="2"/><circle cx="9.5" cy="5.5" r="2"/><circle cx="14.5" cy="5.5" r="2"/><circle cx="18.5" cy="10" r="2"/><path d="M12 12c-3 0-5.5 3.5-5.5 6a2.5 2.5 0 0 0 3.5 2.3 5 5 0 0 1 4 0 2.5 2.5 0 0 0 3.5-2.3c0-2.5-2.5-6-5.5-6Z"/>',
  gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v9h14v-9"/><path d="M12 8v13"/><path d="M12 8S10.5 3 8 4s0 4 4 4"/><path d="M12 8s1.5-5 4-4 0 4-4 4"/>',
  receipt: '<path d="M5 2h14v20l-3-2-2 2-2-2-2 2-2-2-3 2Z"/><path d="m9 15 6-6"/><circle cx="9.5" cy="9.5" r=".5"/><circle cx="14.5" cy="14.5" r=".5"/>',
  bank: '<path d="M3 21h18"/><path d="M5 18v-7"/><path d="M9.5 18v-7"/><path d="M14.5 18v-7"/><path d="M19 18v-7"/><path d="M12 3 21 8H3Z"/>',
  coins: '<circle cx="8" cy="8" r="6"/><path d="M18.1 10.4A6 6 0 1 1 10.4 18"/><path d="M7 6h1v4"/>',
  piggy: '<path d="M19 9.5c1.2.2 2 1 2 2v1.5h-2.2a7 7 0 0 1-2.8 3.4V20h-3v-2.2a8 8 0 0 1-3 0V20H7v-3.6A6.8 6.8 0 0 1 4 11c0-3.9 3.6-7 8-7a8.8 8.8 0 0 1 5 1.5L19 4Z"/><circle cx="15.5" cy="10" r=".5"/>',
  briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M3 13h18"/>',
  trendingUp: '<path d="m3 17 6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9Z"/>',
  key: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.7 12.3 9.3-9.3"/><path d="m16 7 3 3"/><path d="m14 9 2 2"/>',
  refund: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 8v8"/><path d="M14.5 9.5H11a1.5 1.5 0 0 0 0 3h2a1.5 1.5 0 0 1 0 3H9.5"/>',
  zap: '<path d="M13 2 4 14h7l-1 8 9-12h-7Z"/>',
  droplet: '<path d="M12 2.5S5 10 5 14.5a7 7 0 0 0 14 0C19 10 12 2.5 12 2.5Z"/>',
  wifi: '<path d="M2 8.8a15 15 0 0 1 20 0"/><path d="M5 12.9a10 10 0 0 1 14 0"/><path d="M8.5 16.4a5 5 0 0 1 7 0"/><circle cx="12" cy="20" r=".5"/>',
  phone: '<rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M11 18h2"/>',
  tv: '<rect x="2" y="6" width="20" height="13" rx="2"/><path d="m8 2 4 4 4-4"/>',
  wrench: '<path d="M14.7 6.3a4 4 0 0 0 5.2 5.2l-8.6 8.6a2.1 2.1 0 0 1-3-3l8.6-8.6a4 4 0 0 1-2.2-2.2Z"/><path d="M14.7 6.3 18 3l3 3-3.3 3.3"/>',
  dumbbell: '<path d="M6.5 6.5v11"/><path d="M17.5 6.5v11"/><path d="M3 9v6"/><path d="M21 9v6"/><path d="M6.5 12h11"/>',
  scissors: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M8.1 8.1 20 20"/><path d="M8.1 15.9 20 4"/>',
  percent: '<path d="M19 5 5 19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>',
  tag: '<path d="M3 4a1 1 0 0 1 1-1h7.2a1 1 0 0 1 .7.3l8.8 8.8a1.5 1.5 0 0 1 0 2.1l-6.6 6.6a1.5 1.5 0 0 1-2.1 0L3.3 12a1 1 0 0 1-.3-.7Z"/><circle cx="7.5" cy="7.5" r="1.2"/>',
  archive: '<rect x="3" y="4" width="18" height="5" rx="1.5"/><path d="M5 9v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9"/><path d="M10 13h4"/>',
  unarchive: '<rect x="3" y="4" width="18" height="5" rx="1.5"/><path d="M5 9v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9"/><path d="m9.5 15 2.5-2.5 2.5 2.5"/><path d="M12 12.5V18"/>',
  pause: '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>',
  play: '<path d="M7 4.5v15a1 1 0 0 0 1.5.9l12-7.5a1 1 0 0 0 0-1.8l-12-7.5A1 1 0 0 0 7 4.5Z"/>',
  stop: '<circle cx="12" cy="12" r="9"/><rect x="9" y="9" width="6" height="6" rx="1"/>',
  dots: '<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>',
};

// Ícones oferecidos no cadastro de categoria, na ordem em que aparecem no seletor.
export const CATEGORY_ICON_KEYS = Object.freeze([
  'home', 'utensils', 'cart', 'car', 'fuel', 'bus', 'heart', 'pill', 'graduation', 'book',
  'bag', 'shirt', 'plane', 'umbrella', 'film', 'music', 'gamepad', 'coffee', 'beer', 'users',
  'baby', 'paw', 'gift', 'receipt', 'bank', 'coins', 'piggy', 'briefcase', 'trendingUp', 'star',
  'key', 'refund', 'zap', 'droplet', 'wifi', 'phone', 'tv', 'wrench', 'dumbbell', 'scissors',
  'percent', 'tag', 'wallet', 'creditCards', 'calendar', 'dots',
]);

export function hasIcon(name) {
  return Boolean(name && PATHS[name]);
}

export function iconSvg(name, { size = 18, className = 'icon', strokeWidth = 2 } = {}) {
  const paths = PATHS[name];
  if (!paths) return '';
  return `<svg class="${className}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}

// Preenche todo elemento com data-icon="nome" com o SVG correspondente (usado no index.html).
export function hydrateIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((element) => {
    element.innerHTML = iconSvg(element.getAttribute('data-icon'), { size: Number(element.getAttribute('data-icon-size')) || 20, strokeWidth: 1.8 });
  });
}
