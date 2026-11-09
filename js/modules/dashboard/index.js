import { t, getLocale } from '../../core/i18n.js';
import { getActiveSpace } from '../../core/bootstrap.js';
import { listAccounts, calculateConsolidatedBalanceCents } from '../../services/accountRepository.js';
import { listCategories } from '../../services/categoryRepository.js';
import { listCreditCardsWithUsage } from '../../services/creditCardRepository.js';
import { listInvoices } from '../../services/invoiceRepository.js';
import { listTransactions, filterTransactions } from '../../services/transactionRepository.js';
import { groupByCategory, buildMonthlySeries, upcomingDueInvoices } from '../../services/analyticsRepository.js';
import { centsToDisplay } from '../../utils/currency.js';
import { todayISODate, monthRange, formatDateDisplay, formatReferenceMonth } from '../../utils/dates.js';
import { addMonths } from '../../utils/recurrence.js';
import { escapeHtml } from '../../utils/html.js';

// Gráficos e indicadores dependem de valores já carregados (nada de drill-down clicável ainda
// — fica para uma próxima iteração); o período (mês) escolhido aqui só afeta os indicadores e
// gráficos "do período" — a evolução mensal sempre olha os últimos 12 meses até hoje.
const chartInstances = {};
let periodState = todayISODate().slice(0, 7);

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
  return transactions.filter((transaction) => transaction.kind === kind).reduce((sum, transaction) => sum + Math.abs(transaction.amountCents), 0);
}

export async function render(container) {
  const activeSpace = await getActiveSpace();
  const [accounts, categories, cards, invoices, transactions] = activeSpace
    ? await Promise.all([
        listAccounts(activeSpace.id),
        listCategories(activeSpace.id),
        listCreditCardsWithUsage(activeSpace.id),
        listInvoices(activeSpace.id),
        listTransactions(activeSpace.id),
      ])
    : [[], [], [], [], []];

  const categoriesById = new Map(categories.map((category) => [category.id, category]));
  const locale = getLocale();

  const totalBalanceCents = calculateConsolidatedBalanceCents(accounts.map((account) => account.balanceCents));
  const totalUsedCents = cards.reduce((sum, card) => sum + card.usedCents, 0);
  const totalAvailableCents = cards.reduce((sum, card) => sum + card.availableCents, 0);
  const pendingInvoicesCount = invoices.filter((invoice) => invoice.status !== 'paid').length;
  const nextDue = upcomingDueInvoices(invoices, 3);
  const cardsById = new Map(cards.map((card) => [card.id, card]));

  const { startDate, endDate } = monthRange(periodState);
  const periodTransactions = filterTransactions(transactions, { startDate, endDate });
  const incomeCents = sumAbs(periodTransactions, 'income');
  const expenseCents = sumAbs(periodTransactions, 'expense');
  const resultCents = incomeCents - expenseCents;

  const previousMonthKey = addMonths(`${periodState}-01`, -1).slice(0, 7);
  const previousRange = monthRange(previousMonthKey);
  const previousTransactions = filterTransactions(transactions, previousRange);
  const previousIncomeCents = sumAbs(previousTransactions, 'income');
  const previousExpenseCents = sumAbs(previousTransactions, 'expense');

  container.innerHTML = `
    <section class="view">
      <div class="view__header">
        <h1>${t('dashboard.title')}</h1>
        <div class="form-field">
          <label for="dashboard-period">${t('dashboard.period')}</label>
          <input id="dashboard-period" type="month" value="${periodState}" />
        </div>
      </div>
      <p class="view__subtitle">${t('dashboard.activeSpace')}: <strong>${activeSpace ? escapeHtml(activeSpace.name) : '-'}</strong></p>
      <div class="cards-grid">
        <article class="card"><h2>${t('dashboard.totalBalance')}</h2><p class="card__value">${centsToDisplay(totalBalanceCents, locale)}</p></article>
        <article class="card"><h2>${t('dashboard.monthlyIncome')}</h2><p class="card__value">${centsToDisplay(incomeCents, locale)}</p></article>
        <article class="card"><h2>${t('dashboard.monthlyExpense')}</h2><p class="card__value">${centsToDisplay(expenseCents, locale)}</p></article>
        <article class="card"><h2>${t('dashboard.monthlyResult')}</h2><p class="card__value">${centsToDisplay(resultCents, locale)}</p></article>
        <article class="card"><h2>${t('dashboard.cardLimitUsed')}</h2><p class="card__value">${centsToDisplay(totalUsedCents, locale)}</p></article>
        <article class="card"><h2>${t('dashboard.cardLimitAvailable')}</h2><p class="card__value">${centsToDisplay(totalAvailableCents, locale)}</p></article>
        <article class="card"><h2>${t('dashboard.pendingInvoices')}</h2><p class="card__value">${pendingInvoicesCount}</p></article>
      </div>
      <div class="form-card">
        <h2>${t('dashboard.upcomingDueDates')}</h2>
        ${
          nextDue.length === 0
            ? `<p class="empty-state__note">${t('dashboard.noUpcomingDueDates')}</p>`
            : `<ul class="category-group__children">${nextDue
                .map((invoice) => {
                  const card = cardsById.get(invoice.creditCardId);
                  return `<li>${card ? escapeHtml(card.name) : '-'} — ${formatDateDisplay(invoice.dueDate, locale)} — ${centsToDisplay(invoice.totalCents, locale)}</li>`;
                })
                .join('')}</ul>`
        }
      </div>
      <div class="cards-grid">
        <article class="card"><h2>${t('dashboard.chart.incomeVsExpense')}</h2><div class="chart-container"><canvas id="chart-income-expense"></canvas></div></article>
        <article class="card"><h2>${t('dashboard.chart.expensesByCategory')}</h2><div class="chart-container"><canvas id="chart-expenses-category"></canvas></div></article>
        <article class="card"><h2>${t('dashboard.chart.monthlyEvolution')}</h2><div class="chart-container"><canvas id="chart-monthly-evolution"></canvas></div></article>
        <article class="card"><h2>${t('dashboard.chart.monthComparison')}</h2><div class="chart-container"><canvas id="chart-month-comparison"></canvas></div></article>
        <article class="card"><h2>${t('dashboard.chart.accountBalances')}</h2><div class="chart-container"><canvas id="chart-account-balances"></canvas></div></article>
        <article class="card"><h2>${t('dashboard.chart.cardSpending')}</h2><div class="chart-container"><canvas id="chart-card-spending"></canvas></div></article>
      </div>
    </section>
  `;

  const periodInput = container.querySelector('#dashboard-period');
  if (periodInput) {
    periodInput.addEventListener('change', (event) => {
      periodState = event.target.value;
      render(container);
    });
  }

  if (!activeSpace || !window.Chart) return;

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
        { label: t('transactions.kind.income'), data: [previousIncomeCents / 100, incomeCents / 100], backgroundColor: '#16a34a' },
        { label: t('transactions.kind.expense'), data: [previousExpenseCents / 100, expenseCents / 100], backgroundColor: '#dc2626' },
      ],
    },
  });

  const positiveAccounts = accounts.filter((account) => account.balanceCents > 0);
  renderChart('chart-account-balances', {
    type: 'doughnut',
    data: {
      labels: positiveAccounts.map((account) => account.name),
      datasets: [{ data: positiveAccounts.map((account) => account.balanceCents / 100) }],
    },
  });

  const cardsWithUsage = cards.filter((card) => card.usedCents > 0);
  renderChart('chart-card-spending', {
    type: 'doughnut',
    data: {
      labels: cardsWithUsage.map((card) => card.name),
      datasets: [{ data: cardsWithUsage.map((card) => card.usedCents / 100) }],
    },
  });
}
