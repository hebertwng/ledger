import { t, getLocale } from '../../core/i18n.js';
import { getActiveSpace } from '../../core/bootstrap.js';
import { listAccounts, calculateConsolidatedBalanceCents } from '../../services/accountRepository.js';
import { listCategories } from '../../services/categoryRepository.js';
import { listCreditCardsWithUsage } from '../../services/creditCardRepository.js';
import { listInvoices } from '../../services/invoiceRepository.js';
import { listTransactions, filterTransactions, ensureOccurrencesThrough } from '../../services/transactionRepository.js';
import { listBudgets, calculateBudgetProgress } from '../../services/budgetRepository.js';
import { groupByCategory, buildMonthlySeries } from '../../services/analyticsRepository.js';
import { centsToDisplay } from '../../utils/currency.js';
import { todayISODate, monthRange, formatReferenceMonth } from '../../utils/dates.js';
import { addMonths } from '../../utils/recurrence.js';
import { escapeHtml } from '../../utils/html.js';
import { iconSvg } from '../../utils/icons.js';
import { navigateTo } from '../../core/router.js';
import { openCreateForm, setTransactionsMonth, categoryBadgeHtml, colorFromText } from '../transactions/index.js';

// Visão geral: resumo do mês (receitas/despesas e
// atalhos), maiores gastos, contas a pagar/receber, contas, cartões e limites de gastos. Os
// gráficos analíticos completos continuam disponíveis numa seção recolhível no fim da página.
const chartInstances = {};
let periodState = todayISODate().slice(0, 7);
let analyticsOpen = false;
const HIDE_VALUES_KEY = 'ledger.hideValues';
const UPCOMING_LIMIT = 5;

function readHideValues() {
  try {
    return window.localStorage.getItem(HIDE_VALUES_KEY) === '1';
  } catch {
    return false;
  }
}

function writeHideValues(value) {
  try {
    window.localStorage.setItem(HIDE_VALUES_KEY, value ? '1' : '0');
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

function destroyChart(id) {
  if (chartInstances[id]) {
    chartInstances[id].destroy();
    delete chartInstances[id];
  }
}

function renderChart(id, config) {
  destroyChart(id);
  const canvas = document.getElementById(id);
  if (!canvas || !window.Chart) return;
  chartInstances[id] = new window.Chart(canvas, {
    ...config,
    options: { responsive: true, maintainAspectRatio: false, ...config.options },
  });
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
    return new Intl.DateTimeFormat(locale, { timeZone: 'UTC', day: 'numeric', month: 'short' }).format(new Date(Date.UTC(year, month - 1, day)));
  };
  return `${format(startDate)} – ${format(endDate)}`;
}

function shortDate(isoDate, locale) {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Intl.DateTimeFormat(locale, { timeZone: 'UTC', day: '2-digit', month: '2-digit' }).format(new Date(Date.UTC(year, month - 1, day)));
}

function panelHtml(id, title, body, { action = '' } = {}) {
  return `
    <article class="ov-panel" id="${id}">
      <header class="ov-panel__header"><h2>${title}</h2>${action}</header>
      ${body}
    </article>
  `;
}

function emptyPanelBody(icon, _title, text) {
  return `
    <div class="ov-empty">
      <span class="ov-empty__icon">${iconSvg(icon, { size: 22 })}</span>
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
  const hideValues = readHideValues();
  const money = (cents) => (hideValues ? '<span class="masked">••••</span>' : centsToDisplay(cents, locale));
  const categoriesById = new Map(categories.map((category) => [category.id, category]));
  const accountsById = new Map(accounts.map((account) => [account.id, account]));
  const cardsById = new Map(cards.map((card) => [card.id, card]));

  const periodTransactions = filterTransactions(transactions, { startDate, endDate });
  const incomeCents = sumAbs(periodTransactions, 'income');
  const expenseCents = sumAbs(periodTransactions, 'expense');

  // Maiores gastos (por categoria principal) do mês.
  const expenseBreakdown = groupByCategory(
    periodTransactions.filter((transaction) => transaction.status !== 'cancelled'),
    categoriesById,
    'expense',
    { rollup: true }
  );
  const topExpenses = expenseBreakdown.slice(0, 5);

  // Despesas a pagar / receitas a receber do mês (pendentes), as mais próximas primeiro.
  const pendingOf = (kind) =>
    periodTransactions
      .filter((transaction) => transaction.kind === kind && transaction.status === 'pending')
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const pendingExpenses = pendingOf('expense');
  const pendingIncome = pendingOf('income');

  const activeAccounts = accounts.filter((account) => !account.archived);
  const totalBalanceCents = calculateConsolidatedBalanceCents(activeAccounts.map((account) => account.confirmedBalanceCents));
  const projectedBalanceCents = calculateConsolidatedBalanceCents(activeAccounts.map((account) => account.balanceCents));

  // Cartões: a "fatura atual" é a fatura cujo vencimento cai no mês exibido.
  const activeCards = cards.filter((card) => !card.archived);
  const invoiceOfMonth = (cardId) => invoices.find((invoice) => invoice.creditCardId === cardId && invoice.dueDate.slice(0, 7) === periodState);
  const monthInvoicesTotalCents = activeCards.reduce((sum, card) => sum + (invoiceOfMonth(card.id)?.totalCents || 0), 0);

  const budgetRows = budgets
    .map((budget) => {
      const spentCents = periodTransactions
        .filter((transaction) => transaction.kind === 'expense' && transaction.status !== 'cancelled' && transaction.categoryId === budget.categoryId)
        .reduce((sum, transaction) => sum + Math.abs(transaction.amountCents), 0);
      return { budget, category: categoriesById.get(budget.categoryId), progress: calculateBudgetProgress(budget.limitCents, spentCents) };
    })
    .sort((a, b) => b.progress.percentage - a.progress.percentage);

  const pendingListHtml = (items, emptyIcon, emptyTitle, emptyText) =>
    items.length === 0
      ? emptyPanelBody(emptyIcon, emptyTitle, emptyText)
      : `<ul class="ov-list">${items
          .slice(0, UPCOMING_LIMIT)
          .map((transaction) => {
            const category = transaction.categoryId ? categoriesById.get(transaction.categoryId) : null;
            const target = transaction.creditCardId ? cardsById.get(transaction.creditCardId)?.name : accountsById.get(transaction.accountId)?.name;
            const overdue = transaction.date < todayISODate();
            return `
              <li class="ov-list__item">
                ${categoryBadgeHtml(category, 'ov-list__icon')}
                <div class="ov-list__main">
                  <span class="ov-list__title">${escapeHtml(transaction.description || '')}</span>
                  <span class="ov-list__subtitle ${overdue ? 'is-overdue' : ''}">${shortDate(transaction.date, locale)}${overdue ? ` · ${t('dashboard.overdue')}` : ''}${target ? ` · ${escapeHtml(target)}` : ''}</span>
                </div>
                <span class="ov-list__value ${transaction.kind === 'expense' ? 'amount--expense' : 'amount--income'}">${money(transaction.amountCents)}</span>
              </li>`;
          })
          .join('')}</ul>
        ${items.length > UPCOMING_LIMIT ? `<button type="button" class="link-button ov-panel__more" data-goto-transactions>${t('dashboard.seeAll', { count: items.length })}</button>` : ''}`;

  container.innerHTML = `
    <section class="view ov">
      <div class="ov-topbar">
        <div>
          <h1 class="ov-topbar__greeting">${t(greetingKey())}</h1>
          <div class="ov-topbar__period">
            <span>${t('dashboard.currentPeriod')}</span>
            <button type="button" class="icon-button" id="ov-prev" title="${t('transactions.monthNav.previous')}">${iconSvg('chevronLeft', { size: 16 })}</button>
            <button type="button" class="ov-topbar__period-label" id="ov-today" title="${t('transactions.monthNav.today')}">${periodLabel(periodState, locale)} · ${formatReferenceMonth(periodState, locale)}</button>
            <button type="button" class="icon-button" id="ov-next" title="${t('transactions.monthNav.next')}">${iconSvg('chevronRight', { size: 16 })}</button>
          </div>
        </div>
        <span class="ov-topbar__space">${activeSpace ? escapeHtml(activeSpace.name) : '-'}</span>
      </div>

      <article class="ov-summary">
        <button type="button" class="icon-button ov-summary__eye" id="ov-toggle-values" title="${hideValues ? t('dashboard.showValues') : t('dashboard.hideValues')}" aria-pressed="${hideValues}">
          ${hideValues ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3l18 18"/><path d="M10.6 5.1A10 10 0 0 1 12 5c6 0 10 7 10 7a17 17 0 0 1-3.2 3.9"/><path d="M6.6 6.6C3.9 8.4 2 12 2 12s4 7 10 7a9.6 9.6 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>' : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>'}
        </button>
        <div class="ov-summary__figure">
          <span class="ov-summary__label">${t('dashboard.monthlyIncome')} <span class="ov-chip ov-chip--income">${iconSvg('arrowUp', { size: 12 })}</span></span>
          <strong class="ov-summary__value">${money(incomeCents)}</strong>
        </div>
        <div class="ov-summary__divider"></div>
        <div class="ov-summary__figure">
          <span class="ov-summary__label">${t('dashboard.monthlyExpense')} <span class="ov-chip ov-chip--expense">${iconSvg('arrowDown', { size: 12 })}</span></span>
          <strong class="ov-summary__value">${money(expenseCents)}</strong>
        </div>
        <div class="ov-summary__actions">
          <button type="button" class="button button--expense" id="quick-action-expense">${iconSvg('arrowDown', { size: 16 })} ${t('dashboard.quickAction.expense')}</button>
          <button type="button" class="button button--income" id="quick-action-income">${iconSvg('arrowUp', { size: 16 })} ${t('dashboard.quickAction.income')}</button>
          <button type="button" class="button" id="quick-action-transfer">${iconSvg('transfers', { size: 16 })} ${t('dashboard.quickAction.transfer')}</button>
        </div>
      </article>

      <div class="ov-grid">
        <div class="ov-column">
          ${panelHtml(
            'ov-top-expenses',
            t('dashboard.topExpenses'),
            topExpenses.length === 0
              ? emptyPanelBody('reports', t('dashboard.topExpenses'), t('dashboard.topExpensesEmpty'))
              : `
                <div class="ov-donut"><canvas id="chart-top-expenses"></canvas></div>
                <ul class="ov-list">${topExpenses
                  .map((bucket) => {
                    const category = bucket.categoryId ? categoriesById.get(bucket.categoryId) : null;
                    const percentage = expenseCents > 0 ? Math.round((bucket.totalCents / expenseCents) * 100) : 0;
                    return `
                      <li class="ov-list__item">
                        ${categoryBadgeHtml(category, 'ov-list__icon')}
                        <span class="ov-list__title">${escapeHtml(bucket.name || t('transactions.form.categoryNone'))}</span>
                        <span class="ov-list__value-stack"><span>${money(bucket.totalCents)}</span><small>${percentage}%</small></span>
                      </li>`;
                  })
                  .join('')}</ul>
                <button type="button" class="button ov-panel__cta" data-goto="/reports">${t('dashboard.fullReport')} ${iconSvg('chevronRight', { size: 14 })}</button>
              `
          )}
          ${panelHtml('ov-expenses-to-pay', t('dashboard.expensesToPay'), pendingListHtml(pendingExpenses, 'invoices', t('dashboard.expensesToPay'), t('dashboard.expensesToPayEmpty')))}
          ${panelHtml('ov-income-to-receive', t('dashboard.incomeToReceive'), pendingListHtml(pendingIncome, 'wallet', t('dashboard.incomeToReceive'), t('dashboard.incomeToReceiveEmpty')))}
        </div>

        <div class="ov-column">
          ${panelHtml(
            'ov-accounts',
            t('dashboard.myAccounts'),
            `
              <div class="ov-highlight">
                <span>${t('dashboard.totalBalance')}</span>
                <strong>${money(totalBalanceCents)}</strong>
                <small>${t('dashboard.projectedBalance')}: ${money(projectedBalanceCents)}</small>
              </div>
              ${
                activeAccounts.length === 0
                  ? `<p class="empty-state__note">${t('dashboard.noAccounts')}</p>`
                  : `<ul class="ov-list">${activeAccounts
                      .map(
                        (account) => `
                          <li class="ov-list__item">
                            <span class="ov-list__icon" style="background:${escapeHtml(account.color || colorFromText(account.name))}">${iconSvg('accounts', { size: 16 })}</span>
                            <div class="ov-list__main">
                              <span class="ov-list__title">${escapeHtml(account.name)}</span>
                              <span class="ov-list__subtitle">${t(`accounts.type.${account.type}`)}</span>
                            </div>
                            <span class="ov-list__value ${account.confirmedBalanceCents < 0 ? 'amount--expense' : 'amount--neutral'}">${money(account.confirmedBalanceCents)}</span>
                          </li>`
                      )
                      .join('')}</ul>`
              }
              <div class="ov-panel__footer"><button type="button" class="button button--soft" data-goto="/accounts">${iconSvg('plus', { size: 14 })} ${t('dashboard.manageAccounts')}</button></div>
            `
          )}
          ${panelHtml(
            'ov-cards',
            t('dashboard.myCards'),
            activeCards.length === 0
              ? `${emptyPanelBody('creditCards', t('dashboard.myCards'), t('dashboard.noCards'))}<div class="ov-panel__footer"><button type="button" class="button button--soft" data-goto="/credit-cards">${iconSvg('plus', { size: 14 })} ${t('dashboard.manageCards')}</button></div>`
              : `
                <div class="ov-highlight">
                  <span>${t('dashboard.monthInvoices', { month: formatReferenceMonth(periodState, locale) })}</span>
                  <strong class="amount--expense">${money(-monthInvoicesTotalCents)}</strong>
                </div>
                ${activeCards
                  .map((card) => {
                    const invoice = invoiceOfMonth(card.id);
                    return `
                      <div class="ov-card">
                        <div class="ov-card__header">
                          <span class="ov-list__icon" style="background:${escapeHtml(colorFromText(card.name))}">${iconSvg('creditCards', { size: 16 })}</span>
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
                <div class="ov-panel__footer"><button type="button" class="button button--soft" data-goto="/credit-cards">${iconSvg('plus', { size: 14 })} ${t('dashboard.manageCards')}</button></div>
              `
          )}
          ${panelHtml(
            'ov-budgets',
            t('nav.budgets'),
            budgetRows.length === 0
              ? `${emptyPanelBody('budgets', t('nav.budgets'), t('dashboard.budgetsEmpty'))}<div class="ov-panel__footer"><button type="button" class="button button--soft" data-goto="/budgets">${iconSvg('plus', { size: 14 })} ${t('budgets.newButton')}</button></div>`
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
                <button type="button" class="link-button ov-panel__more" data-goto="/budgets">${t('dashboard.manageBudgets')}</button>`
          )}
        </div>
      </div>

      <details class="ov-analytics" ${analyticsOpen ? 'open' : ''}>
        <summary>${iconSvg('reports', { size: 16 })} ${t('dashboard.analytics')}</summary>
        <div class="cards-grid">
          <article class="card"><h2>${t('dashboard.chart.incomeVsExpense')}</h2><div class="chart-container"><canvas id="chart-income-expense"></canvas></div></article>
          <article class="card"><h2>${t('dashboard.chart.expensesByCategory')}</h2><div class="chart-container"><canvas id="chart-expenses-category"></canvas></div></article>
          <article class="card"><h2>${t('dashboard.chart.monthlyEvolution')}</h2><div class="chart-container"><canvas id="chart-monthly-evolution"></canvas></div></article>
          <article class="card"><h2>${t('dashboard.chart.monthComparison')}</h2><div class="chart-container"><canvas id="chart-month-comparison"></canvas></div></article>
          <article class="card"><h2>${t('dashboard.chart.accountBalances')}</h2><div class="chart-container"><canvas id="chart-account-balances"></canvas></div></article>
          <article class="card"><h2>${t('dashboard.chart.cardSpending')}</h2><div class="chart-container"><canvas id="chart-card-spending"></canvas></div></article>
        </div>
      </details>
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
    writeHideValues(!hideValues);
    render(container);
  });

  container.querySelector('#quick-action-expense').addEventListener('click', () => {
    openCreateForm('expense');
    navigateTo('/transactions');
  });
  container.querySelector('#quick-action-income').addEventListener('click', () => {
    openCreateForm('income');
    navigateTo('/transactions');
  });
  container.querySelector('#quick-action-transfer').addEventListener('click', () => navigateTo('/transfers'));

  for (const button of container.querySelectorAll('[data-goto]')) {
    button.addEventListener('click', () => navigateTo(button.dataset.goto));
  }
  for (const button of container.querySelectorAll('[data-goto-transactions]')) {
    button.addEventListener('click', () => {
      setTransactionsMonth(periodState);
      navigateTo('/transactions');
    });
  }

  if (!activeSpace || !window.Chart) return;

  if (topExpenses.length) {
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
      options: { cutout: '68%', plugins: { legend: { display: false }, tooltip: { enabled: !hideValues } } },
    });
  }

  // Os gráficos analíticos só são desenhados quando a seção está aberta (Chart.js não consegue
  // medir um canvas dentro de um <details> fechado).
  const analytics = container.querySelector('.ov-analytics');
  const drawAnalytics = () => renderAnalyticsCharts({ periodTransactions, transactions, categoriesById, accounts, cards, incomeCents, expenseCents, locale });
  analytics.addEventListener('toggle', () => {
    analyticsOpen = analytics.open;
    if (analytics.open) drawAnalytics();
  });
  if (analyticsOpen) drawAnalytics();
}

function renderAnalyticsCharts({ periodTransactions, transactions, categoriesById, accounts, cards, incomeCents, expenseCents, locale }) {
  const previousMonthKey = addMonths(`${periodState}-01`, -1).slice(0, 7);
  const previousTransactions = filterTransactions(transactions, monthRange(previousMonthKey));

  renderChart('chart-income-expense', {
    type: 'bar',
    data: {
      labels: [t('transactions.kind.income'), t('transactions.kind.expense')],
      datasets: [{ data: [incomeCents / 100, expenseCents / 100], backgroundColor: ['#16a34a', '#dc2626'] }],
    },
    options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } },
  });

  const categoryBreakdown = groupByCategory(periodTransactions, categoriesById, 'expense', { rollup: true });
  renderChart('chart-expenses-category', {
    type: 'doughnut',
    data: {
      labels: categoryBreakdown.map((bucket) => bucket.name || t('transactions.form.categoryNone')),
      datasets: [{ data: categoryBreakdown.map((bucket) => bucket.totalCents / 100) }],
    },
  });

  const monthlySeries = buildMonthlySeries(transactions, { monthsCount: 12 });
  renderChart('chart-monthly-evolution', {
    type: 'line',
    data: {
      labels: monthlySeries.map((entry) => formatReferenceMonth(entry.month, locale)),
      datasets: [
        { label: t('transactions.kind.income'), data: monthlySeries.map((entry) => entry.incomeCents / 100), borderColor: '#16a34a', tension: 0.2 },
        { label: t('transactions.kind.expense'), data: monthlySeries.map((entry) => entry.expenseCents / 100), borderColor: '#dc2626', tension: 0.2 },
      ],
    },
  });

  renderChart('chart-month-comparison', {
    type: 'bar',
    data: {
      labels: [formatReferenceMonth(previousMonthKey, locale), formatReferenceMonth(periodState, locale)],
      datasets: [
        { label: t('transactions.kind.income'), data: [sumAbs(previousTransactions, 'income') / 100, incomeCents / 100], backgroundColor: '#16a34a' },
        { label: t('transactions.kind.expense'), data: [sumAbs(previousTransactions, 'expense') / 100, expenseCents / 100], backgroundColor: '#dc2626' },
      ],
    },
  });

  const positiveAccounts = accounts.filter((account) => account.balanceCents > 0);
  renderChart('chart-account-balances', {
    type: 'doughnut',
    data: { labels: positiveAccounts.map((account) => account.name), datasets: [{ data: positiveAccounts.map((account) => account.balanceCents / 100) }] },
  });

  const cardsWithUsage = cards.filter((card) => card.usedCents > 0);
  renderChart('chart-card-spending', {
    type: 'doughnut',
    data: { labels: cardsWithUsage.map((card) => card.name), datasets: [{ data: cardsWithUsage.map((card) => card.usedCents / 100) }] },
  });
}
