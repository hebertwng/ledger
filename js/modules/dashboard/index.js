import { t, getLocale } from '../../core/i18n.js';
import { getActiveSpace } from '../../core/bootstrap.js';
import { getTheme, setTheme } from '../../core/theme.js';
import { listAccounts, calculateConsolidatedBalanceCents } from '../../services/accountRepository.js';
import { listCategories } from '../../services/categoryRepository.js';
import { listCreditCardsWithUsage } from '../../services/creditCardRepository.js';
import { listInvoices } from '../../services/invoiceRepository.js';
import { listTransactions, filterTransactions, ensureOccurrencesThrough } from '../../services/transactionRepository.js';
import { listBudgets, calculateBudgetProgress } from '../../services/budgetRepository.js';
import { groupByCategory } from '../../services/analyticsRepository.js';
import { centsToDisplay } from '../../utils/currency.js';
import { todayISODate, monthRange, formatReferenceMonth } from '../../utils/dates.js';
import { addMonths } from '../../utils/recurrence.js';
import { escapeHtml } from '../../utils/html.js';
import { iconSvg } from '../../utils/icons.js';
import { categoryIconHtml, institutionIconHtml, colorFromText } from '../../utils/ui.js';
import { navigateTo, isRouteEntering } from '../../core/router.js';
import { countUpMoney } from '../../utils/motion.js';
import { openCreateForm, setTransactionsMonth } from '../transactions/index.js';

// Visão geral: saudação e período, resumo do mês com atalhos, maiores gastos, contas a pagar e a
// receber, contas, cartões e limites de gastos. Cada painel pode ser recolhido.
const chartInstances = {};
let periodState = todayISODate().slice(0, 7);
const HIDE_VALUES_KEY = 'ledger.hideValues';
const COLLAPSED_KEY = 'ledger.overviewCollapsed';
const UPCOMING_LIMIT = 5;
// Painel que acabou de ser expandido (anima o conteúdo surgindo).
let justExpandedId = null;

function readStorage(key, fallback) {
  try {
    const value = window.localStorage.getItem(key);
    return value === null ? fallback : JSON.parse(value);
  } catch {
    return fallback;
  }
}

function writeStorage(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Sem localStorage (ex.: modo privado restrito): a preferência só não é lembrada.
  }
}

function greetingKey() {
  const hour = new Date().getHours();
  if (hour < 12) return 'dashboard.greeting.morning';
  if (hour < 18) return 'dashboard.greeting.afternoon';
  return 'dashboard.greeting.evening';
}

function renderChart(id, config) {
  chartInstances[id]?.destroy();
  delete chartInstances[id];
  const canvas = document.getElementById(id);
  if (!canvas || !window.Chart) return;
  chartInstances[id] = new window.Chart(canvas, { ...config, options: { responsive: true, maintainAspectRatio: false, ...config.options } });
}

function sumAbs(transactions, kind) {
  return transactions
    .filter((transaction) => transaction.kind === kind && transaction.status !== 'cancelled')
    .reduce((sum, transaction) => sum + Math.abs(transaction.amountCents), 0);
}

function periodLabel(yearMonth, locale) {
  const { startDate, endDate } = monthRange(yearMonth);
  const format = (iso) => {
    const [year, month, day] = iso.split('-').map(Number);
    return new Intl.DateTimeFormat(locale, { timeZone: 'UTC', day: 'numeric', month: 'short' }).format(new Date(Date.UTC(year, month - 1, day))).replace('.', '');
  };
  return `${format(startDate)} - ${format(endDate)}`;
}

function shortDate(isoDate, locale) {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Intl.DateTimeFormat(locale, { timeZone: 'UTC', day: '2-digit', month: '2-digit' }).format(new Date(Date.UTC(year, month - 1, day)));
}

function panelHtml(id, title, body, collapsed) {
  return `
    <article class="ov-panel ${collapsed[id] ? 'is-collapsed' : ''}" id="${id}">
      <header class="ov-panel__header">
        <h2>${title}</h2>
        <button type="button" class="icon-button" data-collapse="${id}" aria-expanded="${!collapsed[id]}" title="${collapsed[id] ? t('dashboard.expand') : t('dashboard.collapse')}">${iconSvg(collapsed[id] ? 'chevronDown' : 'chevronUp', { size: 18 })}</button>
      </header>
      <div class="ov-panel__body ${justExpandedId === id ? 'just-expanded' : ''}">${body}</div>
    </article>
  `;
}

function emptyBody(icon, title, text) {
  return `
    <div class="ov-empty">
      <span class="ov-empty__icon">${iconSvg(icon, { size: 20 })}</span>
      <strong>${title}</strong>
      <p>${text}</p>
    </div>
  `;
}

export async function render(container) {
  const activeSpace = await getActiveSpace();
  const { startDate, endDate } = monthRange(periodState);
  if (activeSpace) await ensureOccurrencesThrough(activeSpace.id, endDate);

  const [accounts, categories, cards, invoices, transactions, budgets] = activeSpace
    ? await Promise.all([
        listAccounts(activeSpace.id),
        listCategories(activeSpace.id),
        listCreditCardsWithUsage(activeSpace.id),
        listInvoices(activeSpace.id),
        listTransactions(activeSpace.id),
        listBudgets(activeSpace.id),
      ])
    : [[], [], [], [], [], []];

  const locale = getLocale();
  const hideValues = readStorage(HIDE_VALUES_KEY, false) === true || readStorage(HIDE_VALUES_KEY, false) === 1;
  const collapsed = readStorage(COLLAPSED_KEY, {}) || {};
  const money = (cents) => (hideValues ? '<span class="masked">••••</span>' : centsToDisplay(cents, locale));
  const categoriesById = new Map(categories.map((category) => [category.id, category]));
  const accountsById = new Map(accounts.map((account) => [account.id, account]));
  const cardsById = new Map(cards.map((card) => [card.id, card]));

  const periodTransactions = filterTransactions(transactions, { startDate, endDate });
  const incomeCents = sumAbs(periodTransactions, 'income');
  const expenseCents = sumAbs(periodTransactions, 'expense');

  const expenseBreakdown = groupByCategory(
    periodTransactions.filter((transaction) => transaction.status !== 'cancelled'),
    categoriesById,
    'expense',
    { rollup: true }
  );
  const topExpenses = expenseBreakdown.slice(0, 5);

  const pendingOf = (kind) =>
    periodTransactions
      .filter((transaction) => transaction.kind === kind && transaction.status === 'pending')
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const pendingExpenses = pendingOf('expense');
  const pendingIncome = pendingOf('income');

  const activeAccounts = accounts.filter((account) => !account.archived);
  const totalBalanceCents = calculateConsolidatedBalanceCents(activeAccounts.map((account) => account.confirmedBalanceCents));
  const projectedBalanceCents = calculateConsolidatedBalanceCents(activeAccounts.map((account) => account.balanceCents));

  // A "fatura atual" de cada cartão é a que vence no mês exibido.
  const activeCards = cards.filter((card) => !card.archived);
  const invoiceOfMonth = (cardId) => invoices.find((invoice) => invoice.creditCardId === cardId && invoice.dueDate.slice(0, 7) === periodState);
  const monthInvoicesTotalCents = activeCards.reduce((sum, card) => sum + (invoiceOfMonth(card.id)?.totalCents || 0), 0);

  const budgetRows = budgets
    .map((budget) => {
      const childIds = new Set([budget.categoryId, ...categories.filter((category) => category.parentId === budget.categoryId).map((category) => category.id)]);
      const spentCents = periodTransactions
        .filter((transaction) => transaction.kind === 'expense' && transaction.status !== 'cancelled' && childIds.has(transaction.categoryId))
        .reduce((sum, transaction) => sum + Math.abs(transaction.amountCents), 0);
      return { budget, category: categoriesById.get(budget.categoryId), progress: calculateBudgetProgress(budget.limitCents, spentCents) };
    })
    .sort((a, b) => b.progress.percentage - a.progress.percentage);

  const pendingListHtml = (items, emptyIcon, emptyTitle, emptyText) =>
    items.length === 0
      ? emptyBody(emptyIcon, emptyTitle, emptyText)
      : `<ul class="ov-list">${items
          .slice(0, UPCOMING_LIMIT)
          .map((transaction) => {
            const category = transaction.categoryId ? categoriesById.get(transaction.categoryId) : null;
            const parent = category?.parentId ? categoriesById.get(category.parentId) : null;
            const target = transaction.creditCardId ? cardsById.get(transaction.creditCardId)?.name : accountsById.get(transaction.accountId)?.name;
            const overdue = transaction.date < todayISODate();
            return `
              <li class="ov-list__item">
                ${categoryIconHtml(category, { parent, size: 36 })}
                <div class="ov-list__main">
                  <span class="ov-list__title">${escapeHtml(transaction.description || '')}</span>
                  <span class="ov-list__subtitle ${overdue ? 'is-overdue' : ''}">${shortDate(transaction.date, locale)}${overdue ? ` · ${t('dashboard.overdue')}` : ''}${target ? ` · ${escapeHtml(target)}` : ''}</span>
                </div>
                <span class="ov-list__value">${money(transaction.amountCents)}</span>
              </li>`;
          })
          .join('')}</ul>
        <div class="ov-panel__footer ov-panel__footer--end"><button type="button" class="button button--small" data-goto-transactions>${t('dashboard.seeAll', { count: items.length })} ${iconSvg('chevronRight', { size: 14 })}</button></div>`;

  const isDark = getTheme() === 'dark';

  container.innerHTML = `
    <section class="view ov">
      <div class="ov-welcome">
        <div class="ov-welcome__left">
          <span>${t(greetingKey())}${activeSpace ? `, <strong>${escapeHtml(activeSpace.name)}</strong>` : ''}</span>
          <span class="ov-welcome__period">
            ${t('dashboard.currentPeriod')}
            <button type="button" class="icon-button" id="ov-prev" title="${t('transactions.monthNav.previous')}">${iconSvg('chevronLeft', { size: 16 })}</button>
            <button type="button" class="ov-welcome__period-label" id="ov-today" title="${t('transactions.monthNav.today')}">${periodLabel(periodState, locale)}</button>
            <button type="button" class="icon-button" id="ov-next" title="${t('transactions.monthNav.next')}">${iconSvg('chevronRight', { size: 16 })}</button>
          </span>
        </div>
        <div class="ov-welcome__right">
          <label class="switch"><input type="checkbox" id="ov-dark-mode" ${isDark ? 'checked' : ''} /><span class="switch__track"></span>${t('dashboard.darkMode')}</label>
        </div>
      </div>

      <article class="ov-summary">
        <button type="button" class="icon-button icon-button--outline icon-button--round" id="ov-toggle-values" style="width:44px;height:44px" title="${hideValues ? t('dashboard.showValues') : t('dashboard.hideValues')}" aria-pressed="${hideValues}">${iconSvg(hideValues ? 'eyeOff' : 'eye', { size: 18 })}</button>
        <div class="ov-summary__figures">
          <div class="ov-summary__figure">
            <span class="ov-summary__label">${t('dashboard.monthlyIncome')} <span class="ov-chip ov-chip--income">${iconSvg('arrowUp', { size: 12 })}</span></span>
            <strong class="ov-summary__value" ${hideValues ? '' : `data-countup="${incomeCents}"`}>${money(incomeCents)}</strong>
          </div>
          <div class="ov-summary__divider"></div>
          <div class="ov-summary__figure">
            <span class="ov-summary__label">${t('dashboard.monthlyExpense')} <span class="ov-chip ov-chip--expense">${iconSvg('arrowDown', { size: 12 })}</span></span>
            <strong class="ov-summary__value" ${hideValues ? '' : `data-countup="${expenseCents}"`}>${money(expenseCents)}</strong>
          </div>
        </div>
        <div class="ov-summary__actions">
          <button type="button" class="button button--expense" id="quick-action-expense">${iconSvg('arrowDown', { size: 18 })} ${t('dashboard.quickAction.expense')}</button>
          <button type="button" class="button button--income" id="quick-action-income">${iconSvg('arrowUp', { size: 18 })} ${t('dashboard.quickAction.income')}</button>
          <button type="button" class="button" id="quick-action-transfer">${iconSvg('transfers', { size: 18 })} ${t('dashboard.quickAction.transfer')}</button>
          <button type="button" class="button button--primary ov-summary__add" id="quick-action-new" title="${t('transactions.newButton')}" aria-label="${t('transactions.newButton')}">${iconSvg('plus', { size: 20 })}</button>
        </div>
      </article>

      <div class="ov-grid">
        <div class="ov-column">
          ${panelHtml(
            'ov-top-expenses',
            t('dashboard.topExpenses'),
            topExpenses.length === 0
              ? emptyBody('reports', t('dashboard.topExpenses'), t('dashboard.topExpensesEmpty'))
              : `
                <div class="ov-donut"><canvas id="chart-top-expenses"></canvas></div>
                <ul class="ov-list">${topExpenses
                  .map((bucket) => {
                    const category = bucket.categoryId ? categoriesById.get(bucket.categoryId) : null;
                    const percentage = expenseCents > 0 ? Math.round((bucket.totalCents / expenseCents) * 100) : 0;
                    return `
                      <li class="ov-list__item">
                        ${categoryIconHtml(category || { name: bucket.name || '?' }, { size: 36 })}
                        <span class="ov-list__title">${escapeHtml(bucket.name || t('transactions.form.categoryNone'))}</span>
                        <span class="ov-list__value-stack"><span>${money(bucket.totalCents)}</span><small>${percentage}%</small></span>
                      </li>`;
                  })
                  .join('')}</ul>
                <div class="ov-panel__footer ov-panel__footer--end"><button type="button" class="button" data-goto="/reports">${t('dashboard.fullReport')} ${iconSvg('chevronRight', { size: 14 })}</button></div>
              `,
            collapsed
          )}
          ${panelHtml('ov-expenses-to-pay', t('dashboard.expensesToPay'), pendingListHtml(pendingExpenses, 'invoices', t('dashboard.expensesToPay'), t('dashboard.expensesToPayEmpty')), collapsed)}
          ${panelHtml('ov-income-to-receive', t('dashboard.incomeToReceive'), pendingListHtml(pendingIncome, 'wallet', t('dashboard.incomeToReceive'), t('dashboard.incomeToReceiveEmpty')), collapsed)}
        </div>

        <div class="ov-column">
          ${panelHtml(
            'ov-accounts',
            t('dashboard.myAccounts'),
            `
              <div class="ov-highlight">
                <span>${t('dashboard.totalBalance')}</span>
                <strong ${hideValues ? '' : `data-countup="${totalBalanceCents}"`}>${money(totalBalanceCents)}</strong>
                <small>${t('dashboard.projectedBalance')}: ${money(projectedBalanceCents)}</small>
              </div>
              ${
                activeAccounts.length === 0
                  ? `<p class="empty-state__note">${t('dashboard.noAccounts')}</p>`
                  : `<ul class="ov-list">${activeAccounts
                      .map(
                        (account) => `
                          <li class="ov-list__item">
                            ${institutionIconHtml(account, { size: 36 })}
                            <div class="ov-list__main">
                              <span class="ov-list__title">${escapeHtml(account.name)}</span>
                              <span class="ov-list__subtitle">${t(`accounts.type.${account.type}`)}</span>
                            </div>
                            <span class="ov-list__value ${account.confirmedBalanceCents < 0 ? 'amount--expense' : ''}">${money(account.confirmedBalanceCents)}</span>
                          </li>`
                      )
                      .join('')}</ul>`
              }
              <div class="ov-panel__footer">
                <button type="button" class="icon-button icon-button--outline" data-goto="/accounts" title="${t('dashboard.manageAccounts')}">${iconSvg('settings', { size: 16 })}</button>
                <button type="button" class="button button--soft" data-goto="/accounts">${iconSvg('plusCircle', { size: 16 })} ${t('dashboard.addAccount')}</button>
              </div>
            `,
            collapsed
          )}
          ${panelHtml(
            'ov-cards',
            t('dashboard.myCards'),
            activeCards.length === 0
              ? `${emptyBody('creditCards', t('dashboard.myCards'), t('dashboard.noCards'))}<div class="ov-panel__footer ov-panel__footer--end"><button type="button" class="button button--soft" data-goto="/credit-cards">${iconSvg('plusCircle', { size: 16 })} ${t('dashboard.addCard')}</button></div>`
              : `
                <div class="ov-highlight">
                  <span>${t('dashboard.monthInvoices', { month: formatReferenceMonth(periodState, locale) })}</span>
                  <strong>${money(-monthInvoicesTotalCents)}</strong>
                </div>
                ${activeCards
                  .map((card) => {
                    const invoice = invoiceOfMonth(card.id);
                    return `
                      <div class="ov-card">
                        <div class="ov-card__header">
                          ${institutionIconHtml(card, { fallbackIcon: 'creditCards', size: 36 })}
                          <div class="ov-list__main">
                            <span class="ov-list__title">${escapeHtml(card.name)}</span>
                            <span class="ov-list__subtitle">${invoice ? t(`invoices.status.${invoice.status}`) : t('dashboard.noInvoice')}</span>
                          </div>
                          <button type="button" class="button button--small" data-goto="/invoices">${t('dashboard.seeInvoice')}</button>
                        </div>
                        <div class="ov-card__figures">
                          <span><small>${t('dashboard.available')}</small><strong>${money(card.availableCents)}</strong></span>
                          <span class="ov-card__right"><small>${t('dashboard.currentInvoice')}</small><strong class="amount--expense">${money(-(invoice?.totalCents || 0))}</strong></span>
                        </div>
                      </div>`;
                  })
                  .join('')}
                <div class="ov-panel__footer">
                  <button type="button" class="icon-button icon-button--outline" data-goto="/credit-cards" title="${t('dashboard.manageCards')}">${iconSvg('settings', { size: 16 })}</button>
                  <button type="button" class="button button--soft" data-goto="/credit-cards">${iconSvg('plusCircle', { size: 16 })} ${t('dashboard.addCard')}</button>
                </div>
              `,
            collapsed
          )}
          ${panelHtml(
            'ov-budgets',
            t('nav.budgets'),
            budgetRows.length === 0
              ? `${emptyBody('budgets', t('nav.budgets'), t('dashboard.budgetsEmpty'))}<div class="ov-panel__footer ov-panel__footer--end"><button type="button" class="button button--soft" data-goto="/budgets">${iconSvg('plusCircle', { size: 16 })} ${t('budgets.newButton')}</button></div>`
              : `<ul class="ov-list">${budgetRows
                  .slice(0, 5)
                  .map(({ category, progress }) => {
                    const level = progress.isOverLimit ? 'danger' : progress.isNearLimit ? 'warning' : 'ok';
                    return `
                      <li class="ov-budget">
                        <div class="ov-budget__header">
                          <span class="ov-list__title">${escapeHtml(category?.name || '-')}</span>
                          <span class="ov-list__subtitle">${money(progress.spentCents)} / ${money(progress.limitCents)}</span>
                        </div>
                        <div class="progress-bar"><div class="progress-bar__fill progress-bar__fill--${level}" style="width:${Math.min(100, Math.round(progress.percentage * 100))}%"></div></div>
                      </li>`;
                  })
                  .join('')}</ul>
                <div class="ov-panel__footer ov-panel__footer--end"><button type="button" class="button button--small" data-goto="/budgets">${t('dashboard.manageBudgets')}</button></div>`,
            collapsed
          )}
        </div>
      </div>
    </section>
  `;

  const shiftMonth = (delta) => {
    periodState = addMonths(`${periodState}-01`, delta).slice(0, 7);
    render(container);
  };
  container.querySelector('#ov-prev').addEventListener('click', () => shiftMonth(-1));
  container.querySelector('#ov-next').addEventListener('click', () => shiftMonth(1));
  container.querySelector('#ov-today').addEventListener('click', () => {
    periodState = todayISODate().slice(0, 7);
    render(container);
  });
  container.querySelector('#ov-toggle-values').addEventListener('click', () => {
    writeStorage(HIDE_VALUES_KEY, !hideValues);
    render(container);
  });
  container.querySelector('#ov-dark-mode').addEventListener('change', (event) => {
    setTheme(event.target.checked ? 'dark' : 'light');
    render(container);
  });

  if (isRouteEntering()) countUpMoney(container.querySelector('.ov'), locale);

  for (const button of container.querySelectorAll('[data-collapse]')) {
    button.addEventListener('click', () => {
      const id = button.dataset.collapse;
      writeStorage(COLLAPSED_KEY, { ...collapsed, [id]: !collapsed[id] });
      justExpandedId = collapsed[id] ? id : null;
      render(container).finally(() => {
        justExpandedId = null;
      });
    });
  }

  const openTransactions = (kind) => {
    if (kind) openCreateForm(kind);
    setTransactionsMonth(periodState);
    navigateTo('/transactions');
  };
  const hasAccounts = activeAccounts.length > 0;
  container.querySelector('#quick-action-expense').addEventListener('click', () => (hasAccounts ? openTransactions('expense') : navigateTo('/accounts')));
  container.querySelector('#quick-action-income').addEventListener('click', () => (hasAccounts ? openTransactions('income') : navigateTo('/accounts')));
  container.querySelector('#quick-action-new').addEventListener('click', () => (hasAccounts ? openTransactions('expense') : navigateTo('/accounts')));
  container.querySelector('#quick-action-transfer').addEventListener('click', () => navigateTo('/transfers'));

  for (const button of container.querySelectorAll('[data-goto]')) {
    button.addEventListener('click', () => navigateTo(button.dataset.goto));
  }
  for (const button of container.querySelectorAll('[data-goto-transactions]')) {
    button.addEventListener('click', () => openTransactions(null));
  }

  if (topExpenses.length && !collapsed['ov-top-expenses']) {
    renderChart('chart-top-expenses', {
      type: 'doughnut',
      data: {
        labels: expenseBreakdown.map((bucket) => bucket.name || t('transactions.form.categoryNone')),
        datasets: [
          {
            data: expenseBreakdown.map((bucket) => bucket.totalCents / 100),
            backgroundColor: expenseBreakdown.map((bucket) => categoriesById.get(bucket.categoryId)?.color || colorFromText(bucket.name || '')),
            borderWidth: 0,
          },
        ],
      },
      options: { cutout: '70%', plugins: { legend: { display: false }, tooltip: { enabled: !hideValues } } },
    });
  }
}
