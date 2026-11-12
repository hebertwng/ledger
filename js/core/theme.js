// Tema claro/escuro. Sem escolha salva, segue o sistema operacional; a escolha do usuário fica no
// navegador (o index.html já aplica antes da primeira pintura, para não piscar).
const STORAGE_KEY = 'ledger.theme';

export function getTheme() {
  const attribute = document.documentElement.getAttribute('data-theme');
  if (attribute === 'dark' || attribute === 'light') return attribute;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Sem localStorage: vale só nesta sessão.
  }
  window.dispatchEvent(new CustomEvent('ledger:themechange', { detail: theme }));
}

// Preferência escolhida em Configurações → Aparência: 'light', 'dark' ou 'system' (sem escolha
// salva, segue o sistema operacional).
export function getThemePreference() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'dark' || stored === 'light') return stored;
  } catch {
    // Sem localStorage: trata como "sistema".
  }
  return 'system';
}

export function setThemePreference(preference) {
  if (preference === 'dark' || preference === 'light') {
    setTheme(preference);
    return;
  }
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignora.
  }
  const systemTheme = window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', systemTheme);
  window.dispatchEvent(new CustomEvent('ledger:themechange', { detail: systemTheme }));
}

// Sem preferência salva, acompanha o sistema.
export function initTheme() {
  if (!document.documentElement.hasAttribute('data-theme')) {
    document.documentElement.setAttribute('data-theme', getTheme());
  }
}
