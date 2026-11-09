import { openDatabase } from './core/database.js';
import { ensureDefaultSpace } from './core/bootstrap.js';
import { registerRoute, initRouter } from './core/router.js';
import { t, getLocale, setLocale, onLocaleChange, SUPPORTED_LOCALES } from './core/i18n.js';
import { getAppState, onAppStateChange, getConnectivity, onConnectivityChange } from './core/app-state.js';

import * as dashboardModule from './modules/dashboard/index.js';
import * as accountsModule from './modules/accounts/index.js';
import * as transactionsModule from './modules/transactions/index.js';
import * as categoriesModule from './modules/categories/index.js';
import * as creditCardsModule from './modules/credit-cards/index.js';
import * as invoicesModule from './modules/invoices/index.js';
import * as budgetsModule from './modules/budgets/index.js';
import * as transfersModule from './modules/transfers/index.js';
import * as reportsModule from './modules/reports/index.js';
import * as settingsModule from './modules/settings/index.js';

const LOCALE_OPTION_LABEL_KEYS = { 'pt-BR': 'language.ptBR', 'en-US': 'language.enUS' };

function renderStaticText() {
  document.title = t('app.title');
  document.documentElement.lang = getLocale();
  document.querySelectorAll('[data-i18n]').forEach((element) => {
    element.textContent = t(element.getAttribute('data-i18n'));
  });
}

function renderStateBadges() {
  const stateBadge = document.getElementById('app-state-badge');
  const connectivityBadge = document.getElementById('connectivity-badge');
  if (stateBadge) stateBadge.textContent = t(`state.${getAppState()}`);
  if (connectivityBadge) connectivityBadge.textContent = t(`connectivity.${getConnectivity()}`);
}

function setupLanguageSwitcher() {
  const select = document.getElementById('language-switcher');
  if (!select) return;

  select.innerHTML = SUPPORTED_LOCALES.map(
    (locale) => `<option value="${locale}">${t(LOCALE_OPTION_LABEL_KEYS[locale])}</option>`
  ).join('');
  select.value = getLocale();
  select.addEventListener('change', (event) => setLocale(event.target.value));
}

function refreshCurrentRoute() {
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

async function bootstrapApp() {
  await openDatabase();
  await ensureDefaultSpace();

  registerRoute('/dashboard', dashboardModule.render);
  registerRoute('/accounts', accountsModule.render);
  registerRoute('/transactions', transactionsModule.render);
  registerRoute('/categories', categoriesModule.render);
  registerRoute('/credit-cards', creditCardsModule.render);
  registerRoute('/invoices', invoicesModule.render);
  registerRoute('/budgets', budgetsModule.render);
  registerRoute('/transfers', transfersModule.render);
  registerRoute('/reports', reportsModule.render);
  registerRoute('/settings', settingsModule.render);

  initRouter({
    outlet: document.getElementById('app-main'),
    nav: document.getElementById('app-nav'),
  });
}

renderStaticText();
setupLanguageSwitcher();
renderStateBadges();

onLocaleChange(() => {
  renderStaticText();
  setupLanguageSwitcher();
  renderStateBadges();
  refreshCurrentRoute();
});
onAppStateChange(renderStateBadges);
onConnectivityChange(renderStateBadges);

bootstrapApp().catch((error) => {
  console.error('Falha ao iniciar o LEDGER', error);
  const main = document.getElementById('app-main');
  if (main) {
    main.innerHTML = `<section class="view"><h1>${t('app.title')}</h1><p class="error-banner">${error.message}</p></section>`;
  }
});
