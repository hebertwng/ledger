import { t, getLocale } from '../../core/i18n.js';
import { getActiveSpace } from '../../core/bootstrap.js';
import { listAccounts } from '../../services/accountRepository.js';
import { listCategories } from '../../services/categoryRepository.js';
import { listCreditCards } from '../../services/creditCardRepository.js';
import { listTransactions, filterTransactions, TRANSACTION_STATUSES } from '../../services/transactionRepository.js';
import { groupByCategory, groupByAccount, groupByCard, topExpenses, buildMonthlySeries, buildYearlySeries } from '../../services/analyticsRepository.js';
import { centsToDisplay } from '../../utils/currency.js';
import { todayISODate, monthRange, formatDateDisplay, formatReferenceMonth } from '../../utils/dates.js';
import { escapeHtml } from '../../utils/html.js';
import { downloadCsv } from '../../utils/csv.js';

let filterState = { month: todayISODate().slice(0, 7), accountId: '', creditCardId: '', kind: '', categoryId: '' };

export async function render(container) {
  const activeSpace = await getActiveSpace();
  const [accounts, categories, cards, transactions] = activeSpace
    ? await Promise.all([listAccounts(activeSpace.id), listCategories(activeSpace.id), listCreditCards(activeSpace.id), listTransactions(activeSpace.id)])
    : [[], [], [], []];

  const categoriesById = new Map(categories.map((category) => [category.id, category]));
  const accountsById = new Map(accounts.map((account) => [account.id, account]));
  const cardsById = new Map(cards.map((card) => [card.id, card]));
  const locale = getLocale();

  const baseFilters = {
    accountId: filterState.accountId || undefined,
    creditCardId: filterState.creditCardId || undefined,
    kind: filterState.kind || undefined,
    categoryId: filterState.categoryId || undefined,
  };
  const { startDate, endDate } = monthRange(filterState.month);
  const periodTransactions = filterTransactions(transactions, { ...baseFilters, startDate, endDate });
  const scopedTransactions = filterTransactions(transactions, baseFilters);

  container.innerHTML = `
    <section class="view">
      <div class="view__header">
        <h1>${t('modules.reports.title')}</h1>
        <div class="form-actions">
          <button type="button" id="reports-print" class="button">${t('reports.print')}</button>
        </div>
      </div>
      <form id="reports-filters" class="filters-bar">
        <div class="form-field">
          <label for="reports-month">${t('reports.filters.month')}</label>
          <input id="reports-month" type="month" value="${filterState.month}" />
        </div>
        <div class="form-field">
          <label for="reports-kind">${t('transactions.filters.kind')}</label>
          <select id="reports-kind">
            <option value="" ${filterState.kind === '' ? 'selected' : ''}>${t('transactions.filters.kindAll')}</option>
            <option value="income" ${filterState.kind === 'income' ? 'selected' : ''}>${t('transactions.kind.income')}</option>
            <option value="expense" ${filterState.kind === 'expense' ? 'selected' : ''}>${t('transactions.kind.expense')}</option>
          </select>
        </div>
        <div class="form-field">
          <label for="reports-account">${t('transactions.filters.account')}</label>
          <select id="reports-account">
            <option value="" ${filterState.accountId === '' ? 'selected' : ''}>${t('transactions.filters.accountAll')}</option>
            ${accounts.map((account) => `<option value="${account.id}" ${filterState.accountId === account.id ? 'selected' : ''}>${escapeHtml(account.name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-field">
          <label for="reports-card">${t('reports.filters.card')}</label>
          <select id="reports-card">
            <option value="" ${filterState.creditCardId === '' ? 'selected' : ''}>${t('reports.filters.cardAll')}</option>
            ${cards.map((card) => `<option value="${card.id}" ${filterState.creditCardId === card.id ? 'selected' : ''}>${escapeHtml(card.name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-field">
          <label for="reports-category">${t('transactions.filters.category')}</label>
          <select id="reports-category">
            <option value="" ${filterState.categoryId === '' ? 'selected' : ''}>${t('transactions.filters.categoryAll')}</option>
            ${categories.map((category) => `<option value="${category.id}" ${filterState.categoryId === category.id ? 'selected' : ''}>${escapeHtml(category.name)}</option>`).join('')}
          </select>
        </div>
      </form>

      ${renderBreakdownSection('incomeByCategory', t('reports.section.incomeByCategory'), groupByCategory(periodTransactions, categoriesById, 'income', { rollup: true }), locale)}
      ${renderBreakdownSection('expensesByCategory', t('reports.section.expensesByCategory'), groupByCategory(periodTransactions, categoriesById, 'expense', { rollup: true }), locale)}
      ${renderBreakdownSection('expensesBySubcategory', t('reports.section.expensesBySubcategory'), groupByCategory(periodTransactions, categoriesById, 'expense', { rollup: false }), locale)}
      ${renderMonthlyComparisonSection(buildMonthlySeries(scopedTransactions, { monthsCount: 12 }), locale)}
      ${renderYearlyComparisonSection(buildYearlySeries(scopedTransactions, { yearsCount: 5 }), locale)}
      ${renderTopExpensesSection(topExpenses(periodTransactions, 10), categoriesById, locale)}
      ${renderBreakdownSection('byAccount', t('reports.section.byAccount'), groupByAccount(periodTransactions, accountsById), locale, t('reports.column.account'))}
      ${renderBreakdownSection('byCard', t('reports.section.byCard'), groupByCard(periodTransactions, cardsById), locale, t('reports.column.card'))}
      ${renderHistorySection(periodTransactions, categoriesById, accountsById, cardsById, locale)}
    </section>
  `;

  wireFilters(container);
  wireCsvButtons(container, {
    incomeByCategory: t('reports.column.category'),
    expensesByCategory: t('reports.column.category'),
    expensesBySubcategory: t('reports.column.category'),
    byAccount: t('reports.column.account'),
    byCard: t('reports.column.card'),
  });

  const printButton = container.querySelector('#reports-print');
  if (printButton) printButton.addEventListener('click', () => window.print());
}

function renderBreakdownSection(id, title, buckets, locale, columnLabel = t('reports.column.category')) {
  const rows = buckets
    .map(
      (bucket) => `
        <tr>
          <td>${bucket.name ? escapeHtml(bucket.name) : t('transactions.form.categoryNone')}</td>
          <td class="table__value">${centsToDisplay(bucket.totalCents, locale)}</td>
        </tr>
      `
    )
    .join('');

  return `
    <div class="report-section" id="section-${id}">
      <div class="view__header">
        <h2>${title}</h2>
        <button type="button" class="button" data-csv-export="${id}">${t('reports.exportCsv')}</button>
      </div>
      ${
        buckets.length === 0
          ? `<p class="empty-state__note">${t('reports.noData')}</p>`
          : `<table class="data-table"><thead><tr><th>${columnLabel}</th><th>${t('reports.column.total')}</th></tr></thead><tbody>${rows}</tbody></table>`
      }
    </div>
  `;
}

function renderMonthlyComparisonSection(series, locale) {
  const rows = series
    .map(
      (entry) => `
        <tr>
          <td>${formatReferenceMonth(entry.month, locale)}</td>
          <td class="table__value">${centsToDisplay(entry.incomeCents, locale)}</td>
          <td class="table__value">${centsToDisplay(entry.expenseCents, locale)}</td>
          <td class="table__value">${centsToDisplay(entry.resultCents, locale)}</td>
        </tr>
      `
    )
    .join('');

  return `
    <div class="report-section">
      <h2>${t('reports.section.monthlyComparison')}</h2>
      <table class="data-table">
        <thead><tr><th>${t('reports.column.month')}</th><th>${t('reports.column.income')}</th><th>${t('reports.column.expense')}</th><th>${t('reports.column.result')}</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function renderYearlyComparisonSection(series, locale) {
  const rows = series
    .map(
      (entry) => `
        <tr>
          <td>${entry.year}</td>
          <td class="table__value">${centsToDisplay(entry.incomeCents, locale)}</td>
          <td class="table__value">${centsToDisplay(entry.expenseCents, locale)}</td>
          <td class="table__value">${centsToDisplay(entry.resultCents, locale)}</td>
        </tr>
      `
    )
    .join('');

  return `
    <div class="report-section">
      <h2>${t('reports.section.yearlyComparison')}</h2>
      <table class="data-table">
        <thead><tr><th>${t('reports.column.year')}</th><th>${t('reports.column.income')}</th><th>${t('reports.column.expense')}</th><th>${t('reports.column.result')}</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function renderTopExpensesSection(transactions, categoriesById, locale) {
  const rows = transactions
    .map((transaction) => {
      const category = transaction.categoryId ? categoriesById.get(transaction.categoryId) : null;
      return `
        <tr>
          <td>${formatDateDisplay(transaction.date, locale)}</td>
          <td>${escapeHtml(transaction.description || '')}</td>
          <td>${category ? escapeHtml(category.name) : t('transactions.form.categoryNone')}</td>
          <td class="table__value">${centsToDisplay(transaction.amountCents, locale)}</td>
        </tr>
      `;
    })
    .join('');

  return `
    <div class="report-section">
      <h2>${t('reports.section.topExpenses')}</h2>
      ${
        transactions.length === 0
          ? `<p class="empty-state__note">${t('reports.noData')}</p>`
          : `<table class="data-table"><thead><tr><th>${t('transactions.column.date')}</th><th>${t('transactions.column.description')}</th><th>${t('reports.column.category')}</th><th>${t('transactions.column.amount')}</th></tr></thead><tbody>${rows}</tbody></table>`
      }
    </div>
  `;
}

function renderHistorySection(transactions, categoriesById, accountsById, cardsById, locale) {
  const rows = transactions
    .map((transaction) => {
      const category = transaction.categoryId ? categoriesById.get(transaction.categoryId) : null;
      const account = transaction.accountId ? accountsById.get(transaction.accountId) : null;
      const card = transaction.creditCardId ? cardsById.get(transaction.creditCardId) : null;
      return `
        <tr>
          <td>${formatDateDisplay(transaction.date, locale)}</td>
          <td>${escapeHtml(transaction.description || '')}</td>
          <td>${category ? escapeHtml(category.name) : t('transactions.form.categoryNone')}</td>
          <td>${account ? escapeHtml(account.name) : card ? escapeHtml(card.name) : '-'}</td>
          <td class="table__value">${centsToDisplay(transaction.amountCents, locale)}</td>
        </tr>
      `;
    })
    .join('');

  return `
    <div class="report-section" id="section-history">
      <div class="view__header">
        <h2>${t('reports.section.history')}</h2>
        <button type="button" class="button" data-csv-export="history">${t('reports.exportCsv')}</button>
      </div>
      ${
        transactions.length === 0
          ? `<p class="empty-state__note">${t('reports.noData')}</p>`
          : `<table class="data-table"><thead><tr><th>${t('transactions.column.date')}</th><th>${t('transactions.column.description')}</th><th>${t('reports.column.category')}</th><th>${t('transactions.column.account')}</th><th>${t('transactions.column.amount')}</th></tr></thead><tbody>${rows}</tbody></table>`
      }
    </div>
  `;
}

function wireFilters(container) {
  const bindings = [
    ['reports-month', 'month'],
    ['reports-kind', 'kind'],
    ['reports-account', 'accountId'],
    ['reports-card', 'creditCardId'],
    ['reports-category', 'categoryId'],
  ];
  for (const [elementId, field] of bindings) {
    const element = container.querySelector(`#${elementId}`);
    if (!element) continue;
    element.addEventListener('change', () => {
      filterState[field] = element.value;
      render(container);
    });
  }
}

function wireCsvButtons(container, columnLabelById) {
  const history = container.querySelector('#section-history');
  if (history) {
    history.querySelector('[data-csv-export="history"]')?.addEventListener('click', () => {
      const rows = [...history.querySelectorAll('tbody tr')].map((row) => [...row.children].map((cell) => cell.textContent.trim()));
      downloadCsv('historico-movimentacoes.csv', [t('transactions.column.date'), t('transactions.column.description'), t('reports.column.category'), t('transactions.column.account'), t('transactions.column.amount')], rows);
    });
  }

  for (const [id, columnLabel] of Object.entries(columnLabelById)) {
    const button = container.querySelector(`[data-csv-export="${id}"]`);
    if (!button) continue;
    button.addEventListener('click', () => {
      const section = container.querySelector(`#section-${id}`);
      const rows = [...section.querySelectorAll('tbody tr')].map((row) => [...row.children].map((cell) => cell.textContent.trim()));
      downloadCsv(`${id}.csv`, [columnLabel, t('reports.column.total')], rows);
    });
  }
}
