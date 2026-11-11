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

// Sem preferência salva, acompanha o sistema.
export function initTheme() {
  if (!document.documentElement.hasAttribute('data-theme')) {
    document.documentElement.setAttribute('data-theme', getTheme());
  }
}
