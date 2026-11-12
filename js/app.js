import { openDatabase, getAllByIndex } from './core/database.js';
import { ensureDefaultSpace, getActiveSpace, applyDefaultCategoryIcons, spaceDisplayName } from './core/bootstrap.js';
import { registerRoute, initRouter } from './core/router.js';
import { t, getLocale, setLocale, onLocaleChange, SUPPORTED_LOCALES } from './core/i18n.js';
import { initTheme } from './core/theme.js';
import { hydrateIcons } from './utils/icons.js';
import { attachMoneyMask } from './utils/moneyInput.js';
import { autoEnhanceSelects } from './utils/selectEnhancer.js';
import { autoEnhanceDatePickers } from './utils/datePicker.js';
import { ensureOccurrencesThrough } from './services/transactionRepository.js';
import { todayISODate } from './utils/dates.js';
import { endOfMonth } from './utils/recurrence.js';
import { getAppState, onAppStateChange, getConnectivity, onConnectivityChange } from './core/app-state.js';
import { initMascot, refreshMascotTexts } from './core/mascot.js';

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
import * as investmentsModule from './modules/investments/index.js';

const LOCALE_OPTION_LABEL_KEYS = { 'pt-BR': 'language.ptBR', 'en-US': 'language.enUS' };
const SIDEBAR_KEY = 'ledger.sidebarCollapsed';

function renderStaticText() {
  document.title = t('app.title');
  document.documentElement.lang = getLocale();
  document.querySelectorAll('[data-i18n]').forEach((element) => {
    element.textContent = t(element.getAttribute('data-i18n'));
  });
  // O nome também vira "title" — é o que aparece quando o menu está recolhido (só ícones).
  document.querySelectorAll('.sidebar__section a').forEach((link) => {
    const label = link.querySelector('[data-i18n]');
    if (label) link.title = label.textContent;
  });
  const collapse = document.getElementById('sidebar-collapse');
  if (collapse) collapse.title = t('nav.collapse');
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
  select.innerHTML = SUPPORTED_LOCALES.map((locale) => `<option value="${locale}">${t(LOCALE_OPTION_LABEL_KEYS[locale])}</option>`).join('');
  select.value = getLocale();
  select.onchange = (event) => setLocale(event.target.value);
}

function setupSidebarCollapse() {
  const button = document.getElementById('sidebar-collapse');
  button?.addEventListener('click', () => {
    const collapsed = document.documentElement.classList.toggle('sidebar-collapsed');
    try {
      window.localStorage.setItem(SIDEBAR_KEY, collapsed ? '1' : '0');
    } catch {
      // Sem localStorage: vale só nesta sessão.
    }
  });
}

// Nome do espaço no rodapé do menu e contadores de contas/cartões ativos ao lado dos itens.
async function refreshSidebarSummary() {
  const space = await getActiveSpace();
  if (!space) return;
  const nameElement = document.getElementById('sidebar-space-name');
  const avatar = document.getElementById('sidebar-avatar');
  // Sem nome informado (ainda o padrão "Pessoal"), o rodapé não mostra nome: só o modo e a conexão.
  const displayName = spaceDisplayName(space);
  if (nameElement) {
    nameElement.textContent = displayName;
    nameElement.hidden = !displayName;
  }
  if (avatar) avatar.textContent = (displayName || 'LEDGER').charAt(0).toUpperCase();

  const [accounts, cards] = await Promise.all([getAllByIndex('accounts', 'bySpace', space.id), getAllByIndex('creditCards', 'bySpace', space.id)]);
  const count = (items) => items.filter((item) => !item.deletedAt && !item.archived).length;
  for (const [id, value] of [['nav-count-accounts', count(accounts)], ['nav-count-cards', count(cards)]]) {
    const element = document.getElementById(id);
    if (!element) continue;
    element.textContent = String(value);
    element.hidden = value === 0;
  }
}

// Campos de data (dia e mês): continuam digitáveis e, ao clicar, abrem o calendário próprio no
// estilo dos seletores (js/utils/datePicker.js) em vez do calendário nativo do navegador.
function setupDatePickers() {
  autoEnhanceDatePickers({
    locale: getLocale,
    texts: () => ({
      today: t('datepicker.today'),
      thisMonth: t('datepicker.thisMonth'),
      clear: t('datepicker.clear'),
      previous: t('datepicker.previous'),
      next: t('datepicker.next'),
    }),
  });
}

// Roda uma única vez por espaço (as categorias criadas antes dos ícones ganham ícone e cor).
async function applyDefaultCategoryIconsOnce(spaceId) {
  const key = `ledger.categoryIconsApplied.${spaceId}`;
  try {
    if (window.localStorage.getItem(key) === '1') return;
  } catch {
    // Sem localStorage: aplica de novo (só afeta categorias padrão ainda sem ícone).
  }
  await applyDefaultCategoryIcons(spaceId);
  try {
    window.localStorage.setItem(key, '1');
  } catch {
    // Ignora.
  }
}

function refreshCurrentRoute() {
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

async function bootstrapApp() {
  await openDatabase();
  await ensureDefaultSpace();

  // Parcelas e recorrências são geradas sob demanda: ao abrir o app, garante só as do mês atual.
  const activeSpace = await getActiveSpace();
  if (activeSpace) await applyDefaultCategoryIconsOnce(activeSpace.id);
  if (activeSpace) await ensureOccurrencesThrough(activeSpace.id, endOfMonth(todayISODate()));

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
  registerRoute('/investments', investmentsModule.render);

  initRouter({
    outlet: document.getElementById('app-main'),
    nav: document.getElementById('app-nav'),
  });

  await refreshSidebarSummary();
  window.addEventListener('hashchange', () => {
    refreshSidebarSummary().catch(() => {});
  });

  // Ledi: personagem animado no menu lateral; no primeiro acesso se apresenta e pede a escolha do visual.
  await initMascot();
}

initTheme();
hydrateIcons();
renderStaticText();
setupLanguageSwitcher();
setupSidebarCollapse();
setupDatePickers();
// Todo <select> ganha o mesmo visual do seletor de categorias (sem busca).
autoEnhanceSelects();
attachMoneyMask(document, getLocale);
renderStateBadges();

onLocaleChange(() => {
  renderStaticText();
  setupLanguageSwitcher();
  renderStateBadges();
  refreshMascotTexts();
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
