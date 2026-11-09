import { t, getLocale } from '../../core/i18n.js';
import { getActiveSpace } from '../../core/bootstrap.js';
import { listAccounts } from '../../services/accountRepository.js';
import { listCategories } from '../../services/categoryRepository.js';
import { listCreditCards } from '../../services/creditCardRepository.js';
import {
  listTransactions,
  listSeries,
  filterTransactions,
  sortTransactions,
  createSimpleTransaction,
  createInstallmentSeries,
  createRecurringSeries,
  updateTransactionScoped,
  deleteTransactionScoped,
  setSeriesPaused,
  resumeRecurringSeries,
  endRecurringSeries,
  TRANSACTION_STATUSES,
  RECURRENCE_FREQUENCIES,
} from '../../services/transactionRepository.js';
import { centsToDisplay, parseCurrencyInputToCents } from '../../utils/currency.js';
import { todayISODate, formatDateDisplay, formatReferenceMonth, currentWeekRange, currentMonthRange } from '../../utils/dates.js';
import { listInvoices } from '../../services/invoiceRepository.js';
import { isRequired, isValidISODate } from '../../utils/validation.js';
import { escapeHtml } from '../../utils/html.js';

let formState = null;
let scopeState = null;
let filterState = {
  kind: '',
  accountId: '',
  categoryId: '',
  status: '',
  text: '',
  minAmount: '',
  maxAmount: '',
  period: 'all',
  startDate: '',
  endDate: '',
  sortBy: 'date',
};

export async function render(container) {
  const activeSpace = await getActiveSpace();
  const [transactions, accounts, categories, series, creditCards, invoices] = activeSpace
    ? await Promise.all([
        listTransactions(activeSpace.id),
        listAccounts(activeSpace.id),
        listCategories(activeSpace.id),
        listSeries(activeSpace.id),
        listCreditCards(activeSpace.id),
        listInvoices(activeSpace.id),
      ])
    : [[], [], [], [], [], []];

  const context = {
    container,
    activeSpace,
    transactions,
    accounts,
    categories,
    series,
    creditCards,
    accountsById: new Map(accounts.map((account) => [account.id, account])),
    categoriesById: new Map(categories.map((category) => [category.id, category])),
    seriesById: new Map(series.map((item) => [item.id, item])),
    creditCardsById: new Map(creditCards.map((card) => [card.id, card])),
    invoicesById: new Map(invoices.map((invoice) => [invoice.id, invoice])),
  };

  container.innerHTML = `
    <section class="view">
      <div class="view__header">
        <h1>${t('modules.transactions.title')}</h1>
        <button type="button" id="transactions-new-button" class="button button--primary" ${accounts.length === 0 ? 'disabled' : ''}>${t('transactions.newButton')}</button>
      </div>
      ${accounts.length === 0 ? `<div class="form-note"><p>${t('transactions.noAccountsWarning')}</p></div>` : ''}
      <div id="transactions-form-slot"></div>
      <div id="transactions-scope-slot"></div>
      <div id="transactions-filters-slot"></div>
      <div id="transactions-results-slot"></div>
    </section>
  `;

  const newButton = container.querySelector('#transactions-new-button');
  if (accounts.length) {
    newButton.addEventListener('click', () => {
      formState = { mode: 'create' };
      renderForm(context);
    });
  }

  renderFiltersBar(context);
  updateResultsSlot(context);

  if (formState) renderForm(context);
  if (scopeState) renderScopeChooser(context);
}

function resolveEffectiveFilters() {
  const filters = {
    kind: filterState.kind || undefined,
    accountId: filterState.accountId || undefined,
    categoryId: filterState.categoryId || undefined,
    status: filterState.status || undefined,
    text: filterState.text || undefined,
    minAmountCents: filterState.minAmount ? parseCurrencyInputToCents(filterState.minAmount) : undefined,
    maxAmountCents: filterState.maxAmount ? parseCurrencyInputToCents(filterState.maxAmount) : undefined,
  };

  if (filterState.period === 'today') {
    const today = todayISODate();
    filters.startDate = today;
    filters.endDate = today;
  } else if (filterState.period === 'week') {
    Object.assign(filters, currentWeekRange());
  } else if (filterState.period === 'month') {
    Object.assign(filters, currentMonthRange());
  } else if (filterState.period === 'custom') {
    if (filterState.startDate) filters.startDate = filterState.startDate;
    if (filterState.endDate) filters.endDate = filterState.endDate;
  }

  return filters;
}

function renderFiltersBar(context) {
  const slot = context.container.querySelector('#transactions-filters-slot');
  const { accounts, categories } = context;

  slot.innerHTML = `
    <form id="transactions-filters" class="filters-bar">
      <div class="form-field">
        <label for="filter-period">${t('transactions.filters.period')}</label>
        <select id="filter-period" name="period">
          <option value="all" ${filterState.period === 'all' ? 'selected' : ''}>${t('transactions.filters.periodAll')}</option>
          <option value="today" ${filterState.period === 'today' ? 'selected' : ''}>${t('transactions.filters.periodToday')}</option>
          <option value="week" ${filterState.period === 'week' ? 'selected' : ''}>${t('transactions.filters.periodWeek')}</option>
          <option value="month" ${filterState.period === 'month' ? 'selected' : ''}>${t('transactions.filters.periodMonth')}</option>
          <option value="custom" ${filterState.period === 'custom' ? 'selected' : ''}>${t('transactions.filters.periodCustom')}</option>
        </select>
      </div>
      ${
        filterState.period === 'custom'
          ? `
            <div class="form-field">
              <label for="filter-start-date">${t('transactions.filters.startDate')}</label>
              <input id="filter-start-date" name="startDate" type="date" value="${filterState.startDate}" />
            </div>
            <div class="form-field">
              <label for="filter-end-date">${t('transactions.filters.endDate')}</label>
              <input id="filter-end-date" name="endDate" type="date" value="${filterState.endDate}" />
            </div>
          `
          : ''
      }
      <div class="form-field">
        <label for="filter-kind">${t('transactions.filters.kind')}</label>
        <select id="filter-kind" name="kind">
          <option value="" ${filterState.kind === '' ? 'selected' : ''}>${t('transactions.filters.kindAll')}</option>
          <option value="income" ${filterState.kind === 'income' ? 'selected' : ''}>${t('transactions.kind.income')}</option>
          <option value="expense" ${filterState.kind === 'expense' ? 'selected' : ''}>${t('transactions.kind.expense')}</option>
        </select>
      </div>
      <div class="form-field">
        <label for="filter-account">${t('transactions.filters.account')}</label>
        <select id="filter-account" name="accountId">
          <option value="" ${filterState.accountId === '' ? 'selected' : ''}>${t('transactions.filters.accountAll')}</option>
          ${accounts.map((account) => `<option value="${account.id}" ${filterState.accountId === account.id ? 'selected' : ''}>${escapeHtml(account.name)}</option>`).join('')}
        </select>
      </div>
      <div class="form-field">
        <label for="filter-category">${t('transactions.filters.category')}</label>
        <select id="filter-category" name="categoryId">
          <option value="" ${filterState.categoryId === '' ? 'selected' : ''}>${t('transactions.filters.categoryAll')}</option>
          ${categories.map((category) => `<option value="${category.id}" ${filterState.categoryId === category.id ? 'selected' : ''}>${escapeHtml(category.name)}</option>`).join('')}
        </select>
      </div>
      <div class="form-field">
        <label for="filter-status">${t('transactions.filters.status')}</label>
        <select id="filter-status" name="status">
          <option value="" ${filterState.status === '' ? 'selected' : ''}>${t('transactions.filters.statusAll')}</option>
          ${TRANSACTION_STATUSES.map((status) => `<option value="${status}" ${filterState.status === status ? 'selected' : ''}>${t(`transactions.status.${status}`)}</option>`).join('')}
        </select>
      </div>
      <div class="form-field">
        <label for="filter-text">${t('transactions.filters.text')}</label>
        <input id="filter-text" name="text" type="text" value="${escapeHtml(filterState.text)}" />
      </div>
      <div class="form-field">
        <label for="filter-min-amount">${t('transactions.filters.minAmount')}</label>
        <input id="filter-min-amount" name="minAmount" type="text" inputmode="decimal" value="${escapeHtml(filterState.minAmount)}" />
      </div>
      <div class="form-field">
        <label for="filter-max-amount">${t('transactions.filters.maxAmount')}</label>
        <input id="filter-max-amount" name="maxAmount" type="text" inputmode="decimal" value="${escapeHtml(filterState.maxAmount)}" />
      </div>
      <div class="form-field">
        <label for="filter-sort">${t('transactions.filters.sortBy')}</label>
        <select id="filter-sort" name="sortBy">
          <option value="date" ${filterState.sortBy === 'date' ? 'selected' : ''}>${t('transactions.filters.sortDate')}</option>
          <option value="amount" ${filterState.sortBy === 'amount' ? 'selected' : ''}>${t('transactions.filters.sortAmount')}</option>
          <option value="description" ${filterState.sortBy === 'description' ? 'selected' : ''}>${t('transactions.filters.sortDescription')}</option>
        </select>
      </div>
      <div class="form-actions">
        <button type="button" id="filters-clear" class="button">${t('transactions.filters.clear')}</button>
      </div>
    </form>
  `;

  const form = slot.querySelector('#transactions-filters');
  const periodSelect = form.querySelector('#filter-period');

  periodSelect.addEventListener('change', () => {
    filterState.period = periodSelect.value;
    renderFiltersBar(context);
    updateResultsSlot(context);
  });

  for (const field of ['startDate', 'endDate', 'kind', 'accountId', 'categoryId', 'status', 'text', 'minAmount', 'maxAmount', 'sortBy']) {
    const input = form.querySelector(`[name="${field}"]`);
    if (!input) continue;
    const eventName = input.tagName === 'SELECT' || input.type === 'date' ? 'change' : 'input';
    input.addEventListener(eventName, () => {
      filterState[field] = input.value;
      updateResultsSlot(context);
    });
  }

  slot.querySelector('#filters-clear').addEventListener('click', () => {
    filterState = { kind: '', accountId: '', categoryId: '', status: '', text: '', minAmount: '', maxAmount: '', period: 'all', startDate: '', endDate: '', sortBy: 'date' };
    renderFiltersBar(context);
    updateResultsSlot(context);
  });
}

function updateResultsSlot(context) {
  const slot = context.container.querySelector('#transactions-results-slot');
  const filtered = filterTransactions(context.transactions, resolveEffectiveFilters());
  const sorted = sortTransactions(filtered, filterState.sortBy);

  slot.innerHTML = sorted.length === 0 ? `<div class="empty-state"><p>${t('transactions.emptyState')}</p></div>` : tableHtml(sorted, context);

  for (const button of slot.querySelectorAll('[data-edit-id]')) {
    button.addEventListener('click', () => startEdit(context, button.dataset.editId));
  }
  for (const button of slot.querySelectorAll('[data-delete-id]')) {
    button.addEventListener('click', () => startDelete(context, button.dataset.deleteId));
  }
  for (const button of slot.querySelectorAll('[data-pause-series]')) {
    button.addEventListener('click', async () => {
      await setSeriesPaused(button.dataset.pauseSeries, true);
      render(context.container);
    });
  }
  for (const button of slot.querySelectorAll('[data-resume-series]')) {
    button.addEventListener('click', async () => {
      await resumeRecurringSeries(context.activeSpace.id, button.dataset.resumeSeries);
      render(context.container);
    });
  }
  for (const button of slot.querySelectorAll('[data-end-series]')) {
    button.addEventListener('click', async () => {
      if (!window.confirm(t('transactions.endSeriesConfirm'))) return;
      await endRecurringSeries(button.dataset.endSeries, todayISODate());
      render(context.container);
    });
  }
}

function seriesBadgeHtml(transaction, seriesById) {
  if (!transaction.seriesId) return '';
  const series = seriesById.get(transaction.seriesId);
  if (!series) return '';
  if (series.kind === 'installment') {
    return `<span class="badge badge--muted">${t('transactions.badge.installment', { n: transaction.installmentNumber, total: series.installmentsTotal })}</span>`;
  }
  const pausedBadge = series.paused ? ` <span class="badge badge--muted">${t('transactions.badge.paused')}</span>` : '';
  return `<span class="badge badge--muted">${t('transactions.badge.recurring')}</span>${pausedBadge}`;
}

function seriesActionsHtml(transaction, seriesById) {
  if (!transaction.seriesId) return '';
  const series = seriesById.get(transaction.seriesId);
  if (!series || series.kind !== 'recurring') return '';
  return series.paused
    ? `<button type="button" class="link-button" data-resume-series="${series.id}">${t('transactions.action.resumeSeries')}</button>`
    : `<button type="button" class="link-button" data-pause-series="${series.id}">${t('transactions.action.pauseSeries')}</button>
       <button type="button" class="link-button" data-end-series="${series.id}">${t('transactions.action.endSeries')}</button>`;
}

function paymentTargetLabel(transaction, context) {
  if (transaction.creditCardId) {
    const card = context.creditCardsById.get(transaction.creditCardId);
    const invoice = transaction.invoiceId ? context.invoicesById.get(transaction.invoiceId) : null;
    const cardName = card ? escapeHtml(card.name) : '-';
    if (!invoice) return cardName;
    return `${cardName} · ${t('transactions.invoiceLabel', { month: formatReferenceMonth(invoice.referenceMonth, getLocale()) })}`;
  }
  const account = context.accountsById.get(transaction.accountId);
  return account ? escapeHtml(account.name) : '-';
}

function tableHtml(transactions, context) {
  const { categoriesById, seriesById } = context;
  const locale = getLocale();

  const rows = transactions
    .map((transaction) => {
      const category = transaction.categoryId ? categoriesById.get(transaction.categoryId) : null;
      return `
        <tr>
          <td>${formatDateDisplay(transaction.date, locale)}</td>
          <td>${escapeHtml(transaction.description || '')} ${seriesBadgeHtml(transaction, seriesById)}</td>
          <td>${category ? escapeHtml(category.name) : '-'}</td>
          <td>${paymentTargetLabel(transaction, context)}</td>
          <td class="table__value">${centsToDisplay(transaction.amountCents, locale)}</td>
          <td>${t(`transactions.status.${transaction.status}`)}</td>
          <td class="table__actions">
            <button type="button" class="link-button" data-edit-id="${transaction.id}">${t('common.edit')}</button>
            <button type="button" class="link-button" data-delete-id="${transaction.id}">${t('common.delete')}</button>
            ${seriesActionsHtml(transaction, seriesById)}
          </td>
        </tr>
      `;
    })
    .join('');

  return `
    <table class="data-table">
      <thead>
        <tr>
          <th>${t('transactions.column.date')}</th>
          <th>${t('transactions.column.description')}</th>
          <th>${t('transactions.column.category')}</th>
          <th>${t('transactions.column.account')}</th>
          <th>${t('transactions.column.amount')}</th>
          <th>${t('transactions.column.status')}</th>
          <th>${t('common.actions')}</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

const SETTLED_STATUSES = new Set(['paid', 'received']);

function startEdit(context, transactionId) {
  const transaction = context.transactions.find((item) => item.id === transactionId);
  if (transaction.seriesId) {
    scopeState = { action: 'edit', transaction };
    renderScopeChooser(context);
    return;
  }
  // Lançamento avulso já pago/recebido: preservado por padrão (seção 11/12), mas o usuário
  // pode confirmar explicitamente que quer editá-lo mesmo assim.
  let includePaid = false;
  if (SETTLED_STATUSES.has(transaction.status)) {
    if (!window.confirm(t('transactions.confirmEditPaid'))) return;
    includePaid = true;
  }
  formState = { mode: 'edit', transaction, scope: 'only', includePaid };
  renderForm(context);
}

function startDelete(context, transactionId) {
  const transaction = context.transactions.find((item) => item.id === transactionId);
  if (transaction.seriesId) {
    scopeState = { action: 'delete', transaction };
    renderScopeChooser(context);
    return;
  }
  const isSettled = SETTLED_STATUSES.has(transaction.status);
  if (!window.confirm(isSettled ? t('transactions.confirmDeletePaid') : t('transactions.deleteConfirm'))) return;
  deleteTransactionScoped(context.activeSpace.id, transaction.id, { scope: 'only', includePaid: isSettled }).then(() => render(context.container));
}

function renderScopeChooser(context) {
  const slot = context.container.querySelector('#transactions-scope-slot');
  const { transaction, action } = scopeState;

  slot.innerHTML = `
    <div class="form-note">
      <p><strong>${t('transactions.scope.title')}</strong></p>
      <div class="form-field">
        <label><input type="radio" name="scope" value="only" checked /> ${t('transactions.scope.only')}</label>
      </div>
      <div class="form-field">
        <label><input type="radio" name="scope" value="following" /> ${t('transactions.scope.following')}</label>
      </div>
      <div class="form-field">
        <label><input type="radio" name="scope" value="all" /> ${t('transactions.scope.all')}</label>
      </div>
      <div class="form-field">
        <label><input type="checkbox" id="scope-include-paid" /> ${t('transactions.scope.includePaid')}</label>
      </div>
      <div class="form-actions">
        <button type="button" id="scope-continue" class="button button--primary">${t('transactions.scope.confirmEdit')}</button>
        <button type="button" id="scope-cancel" class="button">${t('common.cancel')}</button>
      </div>
    </div>
  `;

  slot.querySelector('#scope-cancel').addEventListener('click', () => {
    scopeState = null;
    render(context.container);
  });

  slot.querySelector('#scope-continue').addEventListener('click', async () => {
    const scope = slot.querySelector('input[name="scope"]:checked').value;
    const includePaid = slot.querySelector('#scope-include-paid').checked;

    if (action === 'delete') {
      if (!window.confirm(t('transactions.deleteConfirm'))) return;
      const result = await deleteTransactionScoped(context.activeSpace.id, transaction.id, { scope, includePaid });
      scopeState = null;
      if (result.skippedCount > 0) window.alert(t('transactions.scope.skippedNote', { count: result.skippedCount }));
      render(context.container);
      return;
    }

    formState = { mode: 'edit', transaction, scope, includePaid };
    scopeState = null;
    render(context.container);
  });
}

function renderForm(context) {
  const slot = context.container.querySelector('#transactions-form-slot');
  const isEdit = formState.mode === 'edit';
  const transaction = formState.transaction;
  const { accounts, categories, creditCards, creditCardsById } = context;
  const recurrenceType = isEdit ? 'single' : formState.recurrenceType || 'single';
  // Forma de pagamento (conta ou cartão) só é escolhida na criação; não é possível trocar
  // depois (evita ter que reprocessar faturas/saldo de uma transação já existente).
  const paymentMethod = isEdit ? (transaction.creditCardId ? 'creditCard' : 'account') : formState.paymentMethod || 'account';

  const categoryOptions = (kind) =>
    categories
      .filter((category) => category.kind === kind)
      .map((category) => `<option value="${category.id}" ${isEdit && transaction.categoryId === category.id ? 'selected' : ''}>${escapeHtml(category.name)}</option>`)
      .join('');

  slot.innerHTML = `
    <form id="transaction-form" class="form-card">
      <h2>${isEdit ? t('transactions.form.titleEdit') : t('transactions.form.titleCreate')}</h2>
      <div class="form-field">
        <label for="tx-kind">${t('transactions.form.kind')}</label>
        <select id="tx-kind" name="kind" ${isEdit || paymentMethod === 'creditCard' ? 'disabled' : ''}>
          <option value="expense" ${(isEdit ? transaction.kind : 'expense') === 'expense' ? 'selected' : ''}>${t('transactions.kind.expense')}</option>
          <option value="income" ${paymentMethod === 'creditCard' ? 'disabled' : ''}>${t('transactions.kind.income')}</option>
        </select>
      </div>
      ${
        !isEdit && creditCards.length > 0
          ? `
            <div class="form-field">
              <label for="tx-payment-method">${t('transactions.form.paymentMethod')}</label>
              <select id="tx-payment-method" name="paymentMethod">
                <option value="account" ${paymentMethod === 'account' ? 'selected' : ''}>${t('transactions.paymentMethod.account')}</option>
                <option value="creditCard" ${paymentMethod === 'creditCard' ? 'selected' : ''}>${t('transactions.paymentMethod.creditCard')}</option>
              </select>
            </div>
          `
          : ''
      }
      ${
        isEdit
          ? ''
          : `
            <div class="form-field">
              <label for="tx-recurrence-type">${t('transactions.form.recurrenceType')}</label>
              <select id="tx-recurrence-type" name="recurrenceType">
                <option value="single" ${recurrenceType === 'single' ? 'selected' : ''}>${t('transactions.recurrenceType.single')}</option>
                <option value="installment" ${recurrenceType === 'installment' ? 'selected' : ''}>${t('transactions.recurrenceType.installment')}</option>
                <option value="recurring" ${recurrenceType === 'recurring' ? 'selected' : ''}>${t('transactions.recurrenceType.recurring')}</option>
              </select>
            </div>
          `
      }
      <div class="form-field">
        <label for="tx-description">${t('transactions.form.description')}</label>
        <input id="tx-description" name="description" type="text" value="${isEdit ? escapeHtml(transaction.description || '') : ''}" />
      </div>
      <div class="form-field">
        <label for="tx-amount">${recurrenceType === 'installment' ? t('transactions.form.totalAmount') : t('transactions.form.amount')}</label>
        <input id="tx-amount" name="amount" type="text" inputmode="decimal" value="${isEdit ? (Math.abs(transaction.amountCents) / 100).toFixed(2) : ''}" ${isEdit && transaction.seriesId ? 'disabled' : ''} />
      </div>
      ${
        !isEdit && recurrenceType === 'installment'
          ? `
            <div class="form-field">
              <label for="tx-installments-total">${t('transactions.form.installmentsTotal')}</label>
              <input id="tx-installments-total" name="installmentsTotal" type="number" min="2" max="60" value="2" />
            </div>
          `
          : ''
      }
      ${
        !isEdit && recurrenceType === 'recurring'
          ? `
            <div class="form-field">
              <label for="tx-frequency">${t('transactions.form.frequency')}</label>
              <select id="tx-frequency" name="frequency">
                ${RECURRENCE_FREQUENCIES.map((frequency) => `<option value="${frequency}">${t(`transactions.frequency.${frequency}`)}</option>`).join('')}
              </select>
            </div>
            <div class="form-field">
              <label for="tx-end-date">${t('transactions.form.endDate')}</label>
              <input id="tx-end-date" name="endDate" type="date" />
            </div>
          `
          : ''
      }
      <div class="form-field">
        <label for="tx-date">${t('transactions.form.date')}</label>
        <input id="tx-date" name="date" type="date" value="${isEdit ? transaction.date : todayISODate()}" ${isEdit && transaction.seriesId ? 'disabled' : ''} />
      </div>
      <div class="form-field">
        <label for="tx-category">${t('transactions.form.category')}</label>
        <select id="tx-category" name="categoryId">
          <option value="">${t('transactions.form.categoryNone')}</option>
          ${categoryOptions(isEdit ? transaction.kind : 'expense')}
        </select>
      </div>
      ${
        paymentMethod === 'creditCard'
          ? isEdit
            ? `
              <div class="form-field">
                <label>${t('transactions.form.creditCard')}</label>
                <input type="text" value="${escapeHtml(creditCardsById.get(transaction.creditCardId)?.name || '')}" disabled />
              </div>
            `
            : `
              <div class="form-field">
                <label for="tx-credit-card">${t('transactions.form.creditCard')}</label>
                <select id="tx-credit-card" name="creditCardId">
                  ${creditCards.map((card) => `<option value="${card.id}">${escapeHtml(card.name)}</option>`).join('')}
                </select>
              </div>
            `
          : `
            <div class="form-field">
              <label for="tx-account">${t('transactions.form.account')}</label>
              <select id="tx-account" name="accountId">
                ${accounts.map((account) => `<option value="${account.id}" ${isEdit && transaction.accountId === account.id ? 'selected' : ''}>${escapeHtml(account.name)}</option>`).join('')}
              </select>
            </div>
          `
      }
      <div class="form-field">
        <label for="tx-status">${t('transactions.form.status')}</label>
        <select id="tx-status" name="status">
          ${TRANSACTION_STATUSES.filter((status) => status !== 'cancelled' || isEdit)
            .map((status) => `<option value="${status}" ${(isEdit ? transaction.status : 'pending') === status ? 'selected' : ''}>${t(`transactions.status.${status}`)}</option>`)
            .join('')}
        </select>
      </div>
      <p class="form-error" id="tx-form-error" hidden></p>
      <div class="form-actions">
        <button type="submit" class="button button--primary">${t('common.save')}</button>
        <button type="button" id="tx-form-cancel" class="button">${t('common.cancel')}</button>
      </div>
    </form>
  `;

  const kindSelect = slot.querySelector('#tx-kind');
  const categorySelect = slot.querySelector('#tx-category');
  if (!isEdit) {
    kindSelect.addEventListener('change', () => {
      categorySelect.innerHTML = `<option value="">${t('transactions.form.categoryNone')}</option>${categoryOptions(kindSelect.value)}`;
    });
  }

  const recurrenceSelect = slot.querySelector('#tx-recurrence-type');
  if (recurrenceSelect) {
    recurrenceSelect.addEventListener('change', () => {
      formState.recurrenceType = recurrenceSelect.value;
      renderForm(context);
    });
  }

  const paymentMethodSelect = slot.querySelector('#tx-payment-method');
  if (paymentMethodSelect) {
    paymentMethodSelect.addEventListener('change', () => {
      formState.paymentMethod = paymentMethodSelect.value;
      renderForm(context);
    });
  }

  slot.querySelector('#tx-form-cancel').addEventListener('click', () => {
    formState = null;
    render(context.container);
  });

  slot.querySelector('#transaction-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(event.target);
    const errorElement = slot.querySelector('#tx-form-error');
    const showError = (message) => {
      errorElement.textContent = message;
      errorElement.hidden = false;
    };

    // "kind", e na edição de série também "date"/"amount", ficam desabilitados no formulário
    // (não são campos "disabled" não entram no FormData) — por isso o valor vem da
    // própria transação nesses casos, em vez do formulário. O cartão também é travado na
    // edição (não é possível trocar a forma de pagamento depois de criado).
    const kind = isEdit ? transaction.kind : paymentMethod === 'creditCard' ? 'expense' : String(formData.get('kind'));
    const description = String(formData.get('description') || '').trim();
    const categoryId = String(formData.get('categoryId') || '') || null;
    const accountId = paymentMethod === 'account' ? String(formData.get('accountId') || '') : null;
    const creditCardId = paymentMethod === 'creditCard' ? (isEdit ? transaction.creditCardId : String(formData.get('creditCardId') || '')) : null;
    const status = String(formData.get('status'));
    const dateAndAmountEditable = !isEdit || !transaction.seriesId;
    const date = dateAndAmountEditable ? String(formData.get('date')) : transaction.date;
    const amountCents = dateAndAmountEditable
      ? parseCurrencyInputToCents(String(formData.get('amount') || '0'))
      : Math.abs(transaction.amountCents);

    if (!isRequired(description)) return showError(t('transactions.validation.descriptionRequired'));
    if (paymentMethod === 'account' && !isRequired(accountId)) return showError(t('transactions.validation.accountRequired'));
    if (paymentMethod === 'creditCard' && !isEdit && !isRequired(creditCardId)) return showError(t('transactions.validation.creditCardRequired'));
    if (dateAndAmountEditable) {
      if (!isValidISODate(date)) return showError(t('transactions.validation.dateInvalid'));
      if (amountCents <= 0) return showError(t('transactions.validation.amountInvalid'));
    }

    if (isEdit) {
      const changes = { description, categoryId, accountId, status };
      if (!transaction.seriesId) {
        changes.amountCents = kind === 'expense' ? -amountCents : amountCents;
        changes.date = date;
      }
      const result = await updateTransactionScoped(context.activeSpace.id, transaction.id, changes, {
        scope: formState.scope,
        includePaid: formState.includePaid,
      });
      formState = null;
      if (result.skippedCount > 0) window.alert(t('transactions.scope.skippedNote', { count: result.skippedCount }));
      render(context.container);
      return;
    }

    if (recurrenceType === 'installment') {
      const installmentsTotal = Number(formData.get('installmentsTotal'));
      if (!Number.isInteger(installmentsTotal) || installmentsTotal < 2 || installmentsTotal > 60) {
        return showError(t('transactions.validation.installmentsInvalid'));
      }
      await createInstallmentSeries(context.activeSpace.id, {
        kind,
        description,
        totalAmountCents: amountCents,
        installmentsTotal,
        date,
        categoryId,
        accountId,
        creditCardId,
        status,
      });
    } else if (recurrenceType === 'recurring') {
      const frequency = String(formData.get('frequency'));
      const endDate = String(formData.get('endDate') || '') || null;
      await createRecurringSeries(context.activeSpace.id, {
        kind,
        description,
        amountCents,
        frequency,
        date,
        endDate,
        categoryId,
        accountId,
        creditCardId,
        status,
      });
    } else {
      await createSimpleTransaction(context.activeSpace.id, { kind, description, amountCents, date, categoryId, accountId, creditCardId, status });
    }

    formState = null;
    render(context.container);
  });
}
