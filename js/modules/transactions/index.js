import { t, getLocale } from '../../core/i18n.js';
import { getActiveSpace } from '../../core/bootstrap.js';
import { listAccounts, calculateBalancesAtDate } from '../../services/accountRepository.js';
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
  ensureOccurrencesThrough,
  TRANSACTION_STATUSES,
  RECURRENCE_FREQUENCIES,
} from '../../services/transactionRepository.js';
import { centsToDisplay, parseCurrencyInputToCents } from '../../utils/currency.js';
import { todayISODate, formatReferenceMonth, monthRange } from '../../utils/dates.js';
import { addMonths } from '../../utils/recurrence.js';
import { listInvoices } from '../../services/invoiceRepository.js';
import { getAllByIndex } from '../../core/database.js';
import { isRequired, isValidISODate } from '../../utils/validation.js';
import { escapeHtml } from '../../utils/html.js';
import { iconSvg } from '../../utils/icons.js';
import { navigateTo } from '../../core/router.js';

let formState = null;
let scopeState = null;
let keydownHandler = null;

// Mês exibido na tela (YYYY-MM). Navegar para um mês futuro é o que dispara a geração das
// parcelas/recorrências daquele mês — elas não são mais criadas todas de uma vez.
let monthState = todayISODate().slice(0, 7);

// Permite que outra tela (ex.: os atalhos de "Novo lançamento" da Visão geral) abra esta tela já
// com o formulário de criação pronto, em vez de só navegar para a lista.
export function openCreateForm(kind) {
  formState = { mode: 'create', kind };
}

// Permite que a Visão geral abra a lista já posicionada em um mês específico.
export function setTransactionsMonth(yearMonth) {
  monthState = yearMonth;
}

const EMPTY_FILTERS = Object.freeze({
  kind: '',
  accountId: '',
  categoryId: '',
  status: '',
  text: '',
  minAmount: '',
  maxAmount: '',
  sortBy: 'date',
});

let filterState = { ...EMPTY_FILTERS };
let moreFiltersOpen = false;

function monthTitle(yearMonth, locale) {
  const [year, month] = yearMonth.split('-').map(Number);
  const name = new Intl.DateTimeFormat(locale, { timeZone: 'UTC', month: 'long' }).format(new Date(Date.UTC(year, month - 1, 1)));
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${year}`;
}

export async function render(container) {
  const activeSpace = await getActiveSpace();
  const { endDate: monthEndDate } = monthRange(monthState);
  if (activeSpace) await ensureOccurrencesThrough(activeSpace.id, monthEndDate);

  const [transactions, accounts, categories, series, creditCards, invoices, allTransactions] = activeSpace
    ? await Promise.all([
        listTransactions(activeSpace.id),
        listAccounts(activeSpace.id),
        listCategories(activeSpace.id),
        listSeries(activeSpace.id),
        listCreditCards(activeSpace.id),
        listInvoices(activeSpace.id),
        getAllByIndex('transactions', 'bySpace', activeSpace.id),
      ])
    : [[], [], [], [], [], [], []];

  const context = {
    container,
    activeSpace,
    transactions,
    allTransactions,
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
  const locale = getLocale();

  container.innerHTML = `
    <section class="view tx-view">
      <div class="tx-toolbar">
        <button type="button" id="transactions-new-button" class="button button--dark" ${accounts.length === 0 ? 'disabled' : ''}>${iconSvg('plus')} ${t('transactions.newButtonShort')}</button>
        <div class="month-nav" role="group" aria-label="${t('transactions.monthNav.label')}">
          <button type="button" class="icon-button" id="month-prev" title="${t('transactions.monthNav.previous')}">${iconSvg('chevronLeft')}</button>
          <button type="button" class="month-nav__label" id="month-current" title="${t('transactions.monthNav.today')}">${monthTitle(monthState, locale)}</button>
          <button type="button" class="icon-button" id="month-next" title="${t('transactions.monthNav.next')}">${iconSvg('chevronRight')}</button>
        </div>
        <div class="tx-toolbar__spacer"></div>
      </div>
      ${accounts.length === 0 ? `<div class="form-note"><p>${t('transactions.noAccountsWarning')}</p></div>` : ''}
      <div id="transactions-filters-slot"></div>
      <div class="tx-panel">
        <div id="transactions-results-slot"></div>
        <div id="transactions-footer-slot" class="tx-footer"></div>
      </div>
      <div id="transactions-modal-slot"></div>
    </section>
  `;

  const newButton = container.querySelector('#transactions-new-button');
  if (accounts.length) {
    newButton.addEventListener('click', () => {
      formState = { mode: 'create' };
      renderForm(context);
    });
  }

  container.querySelector('#month-prev').addEventListener('click', () => {
    monthState = addMonths(`${monthState}-01`, -1).slice(0, 7);
    render(container);
  });
  container.querySelector('#month-next').addEventListener('click', () => {
    monthState = addMonths(`${monthState}-01`, 1).slice(0, 7);
    render(container);
  });
  container.querySelector('#month-current').addEventListener('click', () => {
    monthState = todayISODate().slice(0, 7);
    render(container);
  });

  renderFiltersBar(context);
  updateResultsSlot(context);
  attachKeyboardShortcuts(context);

  if (formState) renderForm(context);
  if (scopeState) renderScopeChooser(context);
}

// Atalhos D/R/T (nova despesa/receita/transferência), ←/→ para trocar de mês, e Esc para fechar
// o modal aberto — só reagem enquanto esta tela está ativa (confere a rota a cada tecla, já que
// o listener fica em document e o router não tem um "desmontar" explícito).
function attachKeyboardShortcuts(context) {
  if (keydownHandler) document.removeEventListener('keydown', keydownHandler);
  keydownHandler = (event) => {
    if (window.location.hash.replace(/^#/, '') !== '/transactions') return;

    if (event.key === 'Escape' && (formState || scopeState)) {
      formState = null;
      scopeState = null;
      render(context.container);
      return;
    }

    if (formState || scopeState) return;
    const target = event.target;
    if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    const key = event.key.toLowerCase();
    if (key === 'd') {
      formState = { mode: 'create', kind: 'expense' };
      renderForm(context);
    } else if (key === 'r') {
      formState = { mode: 'create', kind: 'income' };
      renderForm(context);
    } else if (key === 't') {
      navigateTo('/transfers');
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      monthState = addMonths(`${monthState}-01`, event.key === 'ArrowLeft' ? -1 : 1).slice(0, 7);
      render(context.container);
    }
  };
  document.addEventListener('keydown', keydownHandler);
}

function resolveEffectiveFilters() {
  return {
    ...monthRange(monthState),
    kind: filterState.kind || undefined,
    accountId: filterState.accountId || undefined,
    categoryId: filterState.categoryId || undefined,
    status: filterState.status || undefined,
    text: filterState.text || undefined,
    minAmountCents: filterState.minAmount ? parseCurrencyInputToCents(filterState.minAmount) : undefined,
    maxAmountCents: filterState.maxAmount ? parseCurrencyInputToCents(filterState.maxAmount) : undefined,
  };
}

function selectHtml(name, label, allLabel, options) {
  return `
    <label class="filter-chip">
      <span class="visually-hidden">${label}</span>
      <select name="${name}" aria-label="${label}">
        <option value="">${allLabel}</option>
        ${options.map((option) => `<option value="${option.value}" ${filterState[name] === option.value ? 'selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}
      </select>
    </label>
  `;
}

function renderFiltersBar(context) {
  const slot = context.container.querySelector('#transactions-filters-slot');
  const { accounts, categories } = context;
  const hasActiveFilters = Object.keys(EMPTY_FILTERS).some((key) => filterState[key] !== EMPTY_FILTERS[key]);

  slot.innerHTML = `
    <form id="transactions-filters" class="tx-filters">
      <div class="tx-filters__row">
        ${selectHtml('kind', t('transactions.filters.kind'), t('transactions.filters.kindChip'), [
          { value: 'income', label: t('transactions.kind.income') },
          { value: 'expense', label: t('transactions.kind.expense') },
        ])}
        ${selectHtml('accountId', t('transactions.filters.account'), t('transactions.filters.accountChip'), accounts.map((account) => ({ value: account.id, label: account.name })))}
        ${selectHtml('categoryId', t('transactions.filters.category'), t('transactions.filters.categoryChip'), categories.map((category) => ({ value: category.id, label: category.name })))}
        ${selectHtml('status', t('transactions.filters.status'), t('transactions.filters.statusChip'), TRANSACTION_STATUSES.map((status) => ({ value: status, label: t(`transactions.status.${status}`) })))}
        <label class="tx-filters__search">
          ${iconSvg('search', { size: 16 })}
          <input name="text" type="search" placeholder="${t('transactions.filters.text')}" value="${escapeHtml(filterState.text)}" />
        </label>
        <button type="button" id="filters-more" class="icon-button ${moreFiltersOpen ? 'is-active' : ''}" title="${t('transactions.filters.more')}">${iconSvg('filter')}</button>
        ${hasActiveFilters ? `<button type="button" id="filters-clear" class="link-button">${t('transactions.filters.clear')}</button>` : ''}
      </div>
      ${
        moreFiltersOpen
          ? `
            <div class="tx-filters__more">
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
            </div>
          `
          : ''
      }
    </form>
  `;

  const form = slot.querySelector('#transactions-filters');
  form.addEventListener('submit', (event) => event.preventDefault());

  for (const field of ['kind', 'accountId', 'categoryId', 'status', 'text', 'minAmount', 'maxAmount', 'sortBy']) {
    const input = form.querySelector(`[name="${field}"]`);
    if (!input) continue;
    const eventName = input.tagName === 'SELECT' ? 'change' : 'input';
    input.addEventListener(eventName, () => {
      filterState[field] = input.value;
      updateResultsSlot(context);
      // O botão "Limpar filtros" aparece/some conforme haja filtro ativo — só re-renderiza a
      // barra em selects, para não tirar o foco de quem está digitando na busca.
      if (input.tagName === 'SELECT') renderFiltersBar(context);
    });
  }

  slot.querySelector('#filters-more').addEventListener('click', () => {
    moreFiltersOpen = !moreFiltersOpen;
    renderFiltersBar(context);
  });

  const clearButton = slot.querySelector('#filters-clear');
  if (clearButton) {
    clearButton.addEventListener('click', () => {
      filterState = { ...EMPTY_FILTERS };
      renderFiltersBar(context);
      updateResultsSlot(context);
    });
  }
}

function updateResultsSlot(context) {
  const slot = context.container.querySelector('#transactions-results-slot');
  const filtered = filterTransactions(context.transactions, resolveEffectiveFilters());
  const sorted = sortTransactions(filtered, filterState.sortBy);

  slot.innerHTML =
    sorted.length === 0
      ? `<div class="empty-state tx-empty"><p>${t('transactions.emptyStateMonth', { month: monthTitle(monthState, getLocale()) })}</p></div>`
      : listHtml(sorted, context);

  renderFooter(context, filtered);

  for (const element of slot.querySelectorAll('[data-edit-id]')) {
    element.addEventListener('click', (event) => {
      if (event.target.closest('[data-delete-id], [data-toggle-paid-id], [data-pause-series], [data-resume-series], [data-end-series]')) return;
      startEdit(context, element.dataset.editId);
    });
  }
  for (const button of slot.querySelectorAll('[data-delete-id]')) {
    button.addEventListener('click', () => startDelete(context, button.dataset.deleteId));
  }
  for (const button of slot.querySelectorAll('[data-toggle-paid-id]')) {
    button.addEventListener('click', () => toggleQuickPay(context, button.dataset.togglePaidId));
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

// Rodapé fixo da lista: saldo realizado e previsto das contas ao final do
// mês exibido, mais os totais de receitas/despesas dos lançamentos listados.
function renderFooter(context, monthTransactions) {
  const slot = context.container.querySelector('#transactions-footer-slot');
  const locale = getLocale();
  const { endDate } = monthRange(monthState);
  const accounts = filterState.accountId ? context.accounts.filter((account) => account.id === filterState.accountId) : context.accounts;
  const { confirmedCents, projectedCents } = calculateBalancesAtDate(accounts, context.allTransactions, endDate);
  const active = monthTransactions.filter((transaction) => transaction.status !== 'cancelled');
  const incomeCents = active.filter((transaction) => transaction.kind === 'income').reduce((sum, transaction) => sum + Math.abs(transaction.amountCents), 0);
  const expenseCents = active.filter((transaction) => transaction.kind === 'expense').reduce((sum, transaction) => sum + Math.abs(transaction.amountCents), 0);

  slot.innerHTML = `
    <div class="tx-footer__group">
      <span class="tx-footer__item"><span>${t('transactions.footer.income')}</span><strong class="amount--income">${centsToDisplay(incomeCents, locale)}</strong></span>
      <span class="tx-footer__item"><span>${t('transactions.footer.expense')}</span><strong class="amount--expense">${centsToDisplay(expenseCents, locale)}</strong></span>
    </div>
    <div class="tx-footer__group">
      <span class="tx-footer__item"><span>${t('transactions.footer.balance')}</span><strong>${centsToDisplay(confirmedCents, locale)}</strong></span>
      <span class="tx-footer__item"><span>${t('transactions.footer.projected')}</span><strong>${centsToDisplay(projectedCents, locale)}</strong></span>
    </div>
  `;
}

function seriesBadgeHtml(transaction, seriesById) {
  if (!transaction.seriesId) return '';
  const series = seriesById.get(transaction.seriesId);
  if (!series) return '';
  if (series.kind === 'installment') {
    return `<span class="tx-row__series" title="${t('transactions.badge.installment', { n: transaction.installmentNumber, total: series.installmentsTotal })}">${iconSvg('repeat', { size: 14 })} ${transaction.installmentNumber}/${series.installmentsTotal}</span>`;
  }
  const title = series.paused ? `${t('transactions.badge.recurring')} · ${t('transactions.badge.paused')}` : `${t('transactions.badge.recurring')} · ${t(`transactions.frequency.${series.frequency}`)}`;
  return `<span class="tx-row__series ${series.paused ? 'is-paused' : ''}" title="${title}">${iconSvg('repeat', { size: 14 })}</span>`;
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

const SETTLED_STATUSES_SET = new Set(['paid', 'received']);

// Cor determinística a partir do nome da categoria — usada quando a categoria não tem uma
// cor própria definida, só para dar variedade visual aos ícones da lista.
export function colorFromText(text) {
  if (!text) return '#94a3b8';
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) hash = text.charCodeAt(index) + ((hash << 5) - hash);
  return `hsl(${Math.abs(hash) % 360}, 55%, 52%)`;
}

export function categoryBadgeHtml(category, className = 'tx-row__icon') {
  const letter = category?.name ? category.name.trim().charAt(0).toUpperCase() : '•';
  const color = category?.color || colorFromText(category?.name || '');
  return `<div class="${className}" style="background:${escapeHtml(color)}">${escapeHtml(letter)}</div>`;
}

function dateHeaderLabel(isoDate, locale) {
  if (isoDate === todayISODate()) return t('transactions.dateGroup.today');
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Intl.DateTimeFormat(locale, { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: '2-digit' }).format(new Date(Date.UTC(year, month - 1, day)));
}

function rowHtml(transaction, context) {
  const { categoriesById, seriesById } = context;
  const locale = getLocale();
  const category = transaction.categoryId ? categoriesById.get(transaction.categoryId) : null;
  const isSettled = SETTLED_STATUSES_SET.has(transaction.status);
  const isCancelled = transaction.status === 'cancelled';
  const amountClass = transaction.amountCents < 0 ? 'amount--expense' : 'amount--income';
  const toggleTitle = isSettled ? t('transactions.quickAction.markPending') : t('transactions.quickAction.markPaid');

  return `
    <article class="tx-row ${isCancelled ? 'is-cancelled' : ''}" data-edit-id="${transaction.id}" tabindex="0">
      ${categoryBadgeHtml(category)}
      <div class="tx-row__main">
        <p class="tx-row__title">${escapeHtml(transaction.description || '')}</p>
        <p class="tx-row__subtitle">${category ? escapeHtml(category.name) : t('transactions.form.categoryNone')}${isCancelled ? ` · ${t('transactions.status.cancelled')}` : ''}</p>
      </div>
      <div class="tx-row__meta">
        ${seriesBadgeHtml(transaction, seriesById) || '<span></span>'}
        <span class="tx-row__target">${iconSvg(transaction.creditCardId ? 'creditCards' : 'accounts', { size: 14 })} ${paymentTargetLabel(transaction, context)}</span>
      </div>
      <div class="tx-row__amount ${amountClass}">${centsToDisplay(transaction.amountCents, locale)}</div>
      <button type="button" class="status-toggle ${isSettled ? 'is-settled' : ''}" data-toggle-paid-id="${transaction.id}" title="${toggleTitle}" aria-label="${toggleTitle}">${iconSvg(isSettled ? 'checkCircle' : 'circle', { size: 20 })}</button>
      <div class="tx-row__actions">
        ${seriesActionsHtml(transaction, seriesById)}
        <button type="button" class="icon-button icon-button--danger" data-delete-id="${transaction.id}" title="${t('common.delete')}" aria-label="${t('common.delete')}">${iconSvg('trash', { size: 16 })}</button>
      </div>
    </article>
  `;
}

// Agrupar por data só faz sentido quando a lista está ordenada por data (o padrão); com
// ordenação por valor/descrição os grupos ficariam espalhados e fora de ordem, então nesses
// casos a lista aparece sem cabeçalhos de data.
function listHtml(transactions, context) {
  const locale = getLocale();
  if (filterState.sortBy !== 'date') {
    return `<div class="tx-list">${transactions.map((transaction) => rowHtml(transaction, context)).join('')}</div>`;
  }

  const groups = [];
  for (const transaction of transactions) {
    const lastGroup = groups[groups.length - 1];
    if (lastGroup && lastGroup.date === transaction.date) lastGroup.items.push(transaction);
    else groups.push({ date: transaction.date, items: [transaction] });
  }

  return `
    <div class="tx-list">
      ${groups
        .map(
          (group) => `
            <h3 class="tx-date-header">${dateHeaderLabel(group.date, locale)}</h3>
            ${group.items.map((transaction) => rowHtml(transaction, context)).join('')}
          `
        )
        .join('')}
    </div>
  `;
}

async function toggleQuickPay(context, transactionId) {
  const transaction = context.transactions.find((item) => item.id === transactionId);
  if (SETTLED_STATUSES_SET.has(transaction.status)) {
    if (!window.confirm(t('transactions.confirmEditPaid'))) return;
    await updateTransactionScoped(context.activeSpace.id, transaction.id, { status: 'pending' }, { scope: 'only', includePaid: true });
  } else {
    const nextStatus = transaction.kind === 'income' ? 'received' : 'paid';
    await updateTransactionScoped(context.activeSpace.id, transaction.id, { status: nextStatus }, { scope: 'only', includePaid: false });
  }
  render(context.container);
}

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
  if (SETTLED_STATUSES_SET.has(transaction.status)) {
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
  const isSettled = SETTLED_STATUSES_SET.has(transaction.status);
  if (!window.confirm(isSettled ? t('transactions.confirmDeletePaid') : t('transactions.deleteConfirm'))) return;
  deleteTransactionScoped(context.activeSpace.id, transaction.id, { scope: 'only', includePaid: isSettled }).then(() => render(context.container));
}

function renderScopeChooser(context) {
  const slot = context.container.querySelector('#transactions-modal-slot');
  const { transaction, action } = scopeState;

  slot.innerHTML = `
    <div class="modal-overlay" id="transactions-modal-overlay">
    <div class="form-note modal-dialog">
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
    </div>
  `;

  slot.querySelector('#scope-cancel').addEventListener('click', () => {
    scopeState = null;
    render(context.container);
  });

  slot.querySelector('#transactions-modal-overlay').addEventListener('click', (event) => {
    if (event.target.id === 'transactions-modal-overlay') {
      scopeState = null;
      render(context.container);
    }
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
  const slot = context.container.querySelector('#transactions-modal-slot');
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
    <div class="modal-overlay" id="transactions-modal-overlay">
    <form id="transaction-form" class="form-card modal-dialog">
      <h2>${isEdit ? t('transactions.form.titleEdit') : t('transactions.form.titleCreate')}</h2>
      <div class="form-field">
        <label for="tx-kind">${t('transactions.form.kind')}</label>
        <select id="tx-kind" name="kind" ${isEdit || paymentMethod === 'creditCard' ? 'disabled' : ''}>
          <option value="expense" ${(isEdit ? transaction.kind : formState.kind || 'expense') === 'expense' ? 'selected' : ''}>${t('transactions.kind.expense')}</option>
          <option value="income" ${!isEdit && formState.kind === 'income' ? 'selected' : ''} ${paymentMethod === 'creditCard' ? 'disabled' : ''}>${t('transactions.kind.income')}</option>
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
    </div>
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

  slot.querySelector('#transactions-modal-overlay').addEventListener('click', (event) => {
    if (event.target.id === 'transactions-modal-overlay') {
      formState = null;
      render(context.container);
    }
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
