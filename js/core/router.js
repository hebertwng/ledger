// Router por hash: funciona em hospedagem estática (GitHub Pages) sem rewrite de servidor.
const routes = new Map();
const FALLBACK_PATH = '/dashboard';

let outletElement = null;
let navLinks = [];

export function registerRoute(path, render) {
  routes.set(path, render);
}

export function initRouter({ outlet, nav }) {
  outletElement = outlet;
  navLinks = Array.from(nav.querySelectorAll('[data-route]'));
  window.addEventListener('hashchange', renderCurrentRoute);
  renderCurrentRoute();
}

export function navigateTo(path) {
  window.location.hash = path;
}

function currentPath() {
  const hash = window.location.hash.replace(/^#/, '');
  return hash || FALLBACK_PATH;
}

function renderCurrentRoute() {
  const path = currentPath();
  const render = routes.get(path) || routes.get(FALLBACK_PATH);

  outletElement.innerHTML = '';
  render(outletElement);

  for (const link of navLinks) {
    link.classList.toggle('is-active', link.getAttribute('data-route') === path);
  }
}
