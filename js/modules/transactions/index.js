import { t, getLocale } from '../../core/i18n.js';
import { formatCentsForInput } from '../../utils/moneyInput.js';
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
import { addMonths, buildInstallmentAmounts } from '../../utils/recurrence.js';
import { listInvoices } from '../../services/invoiceRepository.js';
import { getAllByIndex } from '../../core/database.js';
import { isRequired, isValidISODate } from '../../utils/validation.js';
import { escapeHtml } from '../../utils/html.js';
import { iconSvg } from '../../utils/icons.js';
import { categoryIconHtml, institutionIconHtml, colorFromText as colorFromTextBase, openModal, confirmDialog } from '../../utils/ui.js';
import { mountCategoryCombo, buildCategoryOptions } from '../../utils/categoryCombo.js';
import { navigateTo } from '../../core/router.js';
import { mascotReact } from '../../core/mascot.js';

const SETTLED_STATUSES_SET = new Set(['paid', 'received']);
const MAX_INSTALLMENTS = 60;

let formState = null;
let scopeState = null;
let keydownHandler = null;
let newMenuOpen = false;
// Lançamento cujo joinha acabou de ser clicado — ganha a animação de "pulo" no próximo desenho.
let justToggledId = null;

// Mês exibido na tela (YYYY-MM). Navegar para um mês futuro é o que dispara a geração das
// parcelas/recorrências daquele mês — elas não são criadas todas de uma vez.
let monthState = todayISODate().slice(0, 7);

// Permite que outra tela (ex.: os atalhos da Visão geral) abra esta tela já com o formulário de
// criação pronto, em vez de só navegar para a lista.
export function openCreateForm(kind) {
  formState = { mode: 'create', draft: newDraft(kind) };
}

// Permite que a Visão geral abra a lista já posicionada em um mês específico.
export function setTransactionsMonth(yearMonth) {
  monthState = yearMonth;
}

// Mantidos por compatibilidade com outras telas que importam daqui.
export const colorFromText = colorFromTextBase;
export function categoryBadgeHtml(category, className = '', parent = null) {
  return categoryIconHtml(category, { parent, size: 36, className });
}

const EMPTY_FILTERS = Object.freeze({
  kind: '',
  origin: '',
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

// Rascunho do formulário: guarda tudo o que o usuário já preencheu, para que trocar o tipo, a
// repetição ou a conta nunca apague (nem troque) o que já foi informado.
function newDraft(kind = 'expense') {
  return {
    kind,
    description: '',
    amount: '',
    date: todayISODate(),
    settled: true,
    settledTouched: false,
    target: '',
    categoryId: null,
    repeatOpen: false,
    repeatType: 'recurring',
    frequency: 'monthly',
    endDate: '',
    installmentsTotal: '2',
  };
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
  const canCreate = accounts.some((account) => !account.archived);

  container.innerHTML = `
    <section class="view tx-view">
      <div class="tx-header">
        <div class="tx-toolbar">
          <div class="menu" id="tx-new-menu">
            <button type="button" id="transactions-new-button" class="button button--dark" aria-haspopup="menu" aria-expanded="${newMenuOpen}" ${canCreate ? '' : 'disabled'}>${iconSvg('plus')} ${t('transactions.newButtonShort')}</button>
            ${
              newMenuOpen
                ? `<div class="menu__panel" role="menu">
                    <button type="button" class="menu__item" data-new-kind="expense" role="menuitem"><span class="menu__item-icon amount--expense">${iconSvg('arrowDown', { size: 16 })}</span>${t('transactions.menu.newExpense')}<kbd>${t('transactions.menu.key', { key: 'D' })}</kbd></button>
                    <button type="button" class="menu__item" data-new-kind="income" role="menuitem"><span class="menu__item-icon amount--income">${iconSvg('arrowUp', { size: 16 })}</span>${t('transactions.menu.newIncome')}<kbd>${t('transactions.menu.key', { key: 'R' })}</kbd></button>
                    <button type="button" class="menu__item" data-new-kind="transfer" role="menuitem"><span class="menu__item-icon" style="color:var(--color-dark)">${iconSvg('transfers', { size: 16 })}</span>${t('transactions.menu.newTransfer')}<kbd>${t('transactions.menu.key', { key: 'T' })}</kbd></button>
                  </div>`
                : ''
            }
          </div>
          <div class="month-nav" role="group" aria-label="${t('transactions.monthNav.label')}">
            <button type="button" class="icon-button" id="month-prev" title="${t('transactions.monthNav.previous')}">${iconSvg('chevronLeft')}</button>
            <button type="button" class="month-nav__label" id="month-current" title="${t('transactions.monthNav.today')}">${monthTitle(monthState, locale)}</button>
            <button type="button" class="icon-button" id="month-next" title="${t('transactions.monthNav.next')}">${iconSvg('chevronRight')}</button>
          </div>
          <div class="tx-toolbar__end"></div>
        </div>
        ${canCreate ? '' : `<div class="form-note"><p>${t('transactions.noAccountsWarning')}</p></div>`}
        <div id="transactions-filters-slot"></div>
      </div>
      <div class="tx-panel">
        <div id="transactions-results-slot"></div>
        <div id="transactions-footer-slot" class="tx-footer"></div>
      </div>
      <div id="transactions-modal-slot"></div>
    </section>
  `;

  const newButton = container.querySelector('#transactions-new-button');
  newButton.addEventListener('click', (event) => {
    event.stopPropagation();
    newMenuOpen = !newMenuOpen;
    render(container);
  });
  for (const item of container.querySelectorAll('[data-new-kind]')) {
    item.addEventListener('click', () => {
      newMenuOpen = false;
      startCreate(context, item.dataset.newKind);
    });
  }
  if (newMenuOpen) {
    const closeMenu = (event) => {
      document.removeEventListener('mousedown', closeMenu);
      if (!container.querySelector('#tx-new-menu')?.contains(event.target) && newMenuOpen) {
        newMenuOpen = false;
        render(container);
      }
    };
    document.addEventListener('mousedown', closeMenu);
  }

  container.querySelector('#month-prev').addEventListener('click', () => shiftMonth(context, -1));
  container.querySelector('#month-next').addEventListener('click', () => shiftMonth(context, 1));
  container.querySelector('#month-current').addEventListener('click', () => {
    monthState = todayISODate().slice(0, 7);
    render(container);
  });

  renderFiltersBar(context);
  updateResultsSlot(context);
  attachKeyboardShortcuts(context);

  if (formState) renderForm(context);
  else if (scopeState) renderScopeChooser(context);
}

function shiftMonth(context, delta) {
  monthState = addMonths(`${monthState}-01`, delta).slice(0, 7);
  render(context.container);
}

function startCreate(context, kind) {
  if (kind === 'transfer') {
    navigateTo('/transfers');
    return;
  }
  formState = { mode: 'create', draft: newDraft(kind) };
  render(context.container);
}

// Atalhos D/R/T (nova despesa/receita/transferência) e ←/→ para trocar de mês — só reagem
// enquanto esta tela está ativa e sem modal aberto (o Esc do modal é tratado pelo próprio modal).
function attachKeyboardShortcuts(context) {
  if (keydownHandler) document.removeEventListener('keydown', keydownHandler);
  keydownHandler = (event) => {
    if (window.location.hash.replace(/^#/, '') !== '/transactions') return;
    if (formState || scopeState) return;
    const target = event.target;
    if (target && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (!context.accounts.some((account) => !account.archived) && ['d', 'r'].includes(event.key.toLowerCase())) return;

    const key = event.key.toLowerCase();
    if (key === 'd') startCreate(context, 'expense');
    else if (key === 'r') startCreate(context, 'income');
    else if (key === 't') startCreate(context, 'transfer');
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') shiftMonth(context, event.key === 'ArrowLeft' ? -1 : 1);
    else if (event.key === 'Escape' && newMenuOpen) {
      newMenuOpen = false;
      render(context.container);
    }
  };
  document.addEventListener('keydown', keydownHandler);
}

// Ids da categoria escolhida no filtro mais os das subcategorias dela.
function categoryFilterIds(context) {
  if (!filterState.categoryId) return undefined;
  const ids = [filterState.categoryId];
  for (const category of context.categories) if (category.parentId === filterState.categoryId) ids.push(category.id);
  return ids;
}

function resolveEffectiveFilters(context) {
  const [originType, originId] = filterState.origin ? filterState.origin.split(':') : [];
  return {
    ...monthRange(monthState),
    kind: filterState.kind || undefined,
    accountId: originType === 'account' ? originId : undefined,
    creditCardId: originType === 'card' ? originId : undefined,
    categoryIds: categoryFilterIds(context),
    status: filterState.status || undefined,
    text: filterState.text || undefined,
    minAmountCents: filterState.minAmount ? parseCurrencyInputToCents(filterState.minAmount) : undefined,
    maxAmountCents: filterState.maxAmount ? parseCurrencyInputToCents(filterState.maxAmount) : undefined,
  };
}

function chipHtml(name, label, allLabel, groups) {
  const optionHtml = (option) =>
    `<option value="${option.value}" ${filterState[name] === option.value ? 'selected' : ''}>${escapeHtml(option.label)}</option>`;
  return `
    <label class="filter-chip">
      <span class="visually-hidden">${label}</span>
      <select name="${name}" aria-label="${label}" class="${filterState[name] ? 'is-set' : ''}">
        <option value="">${allLabel}</option>
        ${groups
          .map((group) => (group.label ? `<optgroup label="${escapeHtml(group.label)}">${group.options.map(optionHtml).join('')}</optgroup>` : group.options.map(optionHtml).join('')))
          .join('')}
      </select>
    </label>
  `;
}

function renderFiltersBar(context) {
  const slot = context.container.querySelector('#transactions-filters-slot');
  const { accounts, creditCards, categories } = context;
  const hasActiveFilters = Object.keys(EMPTY_FILTERS).some((key) => filterState[key] !== EMPTY_FILTERS[key]);

  // Categorias: só as do tipo escolhido no filtro "Tipo" (ou todas, se nenhum), principais primeiro.
  const categoryGroups = (filterState.kind ? [filterState.kind] : ['expense', 'income']).map((kind) => ({
    label: filterState.kind ? '' : t(`categories.tab.${kind}`),
    options: buildCategoryOptions(categories, kind, filterState.categoryId || null)
      .filter((option) => !option.parent)
      .map((option) => ({ value: option.category.id, label: option.category.name })),
  }));

  slot.innerHTML = `
    <div class="tx-filters-wrap">
      <form id="transactions-filters" class="tx-filters">
        <div class="tx-filters__row">
          ${chipHtml('origin', t('transactions.filters.origin'), t('transactions.filters.originChip'), [
            { label: t('nav.accounts'), options: accounts.map((account) => ({ value: `account:${account.id}`, label: account.name })) },
            ...(creditCards.length ? [{ label: t('nav.creditCards'), options: creditCards.map((card) => ({ value: `card:${card.id}`, label: card.name })) }] : []),
          ])}
          ${chipHtml('kind', t('transactions.filters.kind'), t('transactions.filters.kindChip'), [
            { options: [
              { value: 'expense', label: t('transactions.kind.expensePlural') },
              { value: 'income', label: t('transactions.kind.incomePlural') },
            ] },
          ])}
          ${chipHtml('categoryId', t('transactions.filters.category'), t('transactions.filters.categoryChip'), categoryGroups)}
          ${chipHtml('status', t('transactions.filters.status'), t('transactions.filters.statusChip'), [
            { options: TRANSACTION_STATUSES.map((status) => ({ value: status, label: t(`transactions.status.${status}`) })) },
          ])}
          <label class="tx-filters__search">
            ${iconSvg('search', { size: 16 })}
            <input name="text" type="search" placeholder="${t('transactions.filters.text')}" value="${escapeHtml(filterState.text)}" />
          </label>
          ${hasActiveFilters ? `<button type="button" id="filters-clear" class="link-button">${iconSvg('close', { size: 14 })} ${t('transactions.filters.clear')}</button>` : ''}
        </div>
        ${
          moreFiltersOpen
            ? `
              <div class="tx-filters__more">
                <div class="form-field">
                  <label for="filter-min-amount">${t('transactions.filters.minAmount')}</label>
                  <input id="filter-min-amount" name="minAmount" type="text" inputmode="numeric" data-money value="${escapeHtml(filterState.minAmount)}" />
                </div>
                <div class="form-field">
                  <label for="filter-max-amount">${t('transactions.filters.maxAmount')}</label>
                  <input id="filter-max-amount" name="maxAmount" type="text" inputmode="numeric" data-money value="${escapeHtml(filterState.maxAmount)}" />
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
      <button type="button" id="filters-more" class="icon-button icon-button--outline icon-button--round ${moreFiltersOpen ? 'is-active' : ''}" style="width:48px;height:48px" title="${t('transactions.filters.more')}" aria-pressed="${moreFiltersOpen}">${iconSvg('filter')}</button>
    </div>
  `;

  const form = slot.querySelector('#transactions-filters');
  form.addEventListener('submit', (event) => event.preventDefault());

  for (const field of Object.keys(EMPTY_FILTERS)) {
    const input = form.querySelector(`[name="${field}"]`);
    if (!input) continue;
    const eventName = input.tagName === 'SELECT' ? 'change' : 'input';
    input.addEventListener(eventName, () => {
      filterState[field] = input.value;
      // Trocar o tipo descarta uma categoria do outro tipo.
      if (field === 'kind' && filterState.categoryId) {
        const category = context.categoriesById.get(filterState.categoryId);
        if (category && filterState.kind && category.kind !== filterState.kind) filterState.categoryId = '';
      }
      updateResultsSlot(context);
      // Só re-renderiza a barra em selects, para não tirar o foco de quem está digitando.
      if (input.tagName === 'SELECT') renderFiltersBar(context);
    });
  }

  slot.querySelector('#filters-more').addEventListener('click', () => {
    moreFiltersOpen = !moreFiltersOpen;
    renderFiltersBar(context);
  });

  slot.querySelector('#filters-clear')?.addEventListener('click', () => {
    filterState = { ...EMPTY_FILTERS };
    renderFiltersBar(context);
    updateResultsSlot(context);
  });
}

function updateResultsSlot(context) {
  const slot = context.container.querySelector('#transactions-results-slot');
  const filtered = filterTransactions(context.transactions, resolveEffectiveFilters(context));
  const sorted = sortTransactions(filtered, filterState.sortBy);

  slot.innerHTML =
    sorted.length === 0
      ? `<div class="empty-state tx-empty"><span class="empty-state__icon">${iconSvg('transactions', { size: 22 })}</span><p>${t('transactions.emptyStateMonth', { month: monthTitle(monthState, getLocale()) })}</p></div>`
      : listHtml(sorted, context);

  renderFooter(context, filtered);

  for (const element of slot.querySelectorAll('[data-edit-id]')) {
    element.addEventListener('click', (event) => {
      if (event.target.closest('button')) return;
      startEdit(context, element.dataset.editId);
    });
    element.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && event.target === element) startEdit(context, element.dataset.editId);
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
      if (!(await confirmDialog(t('transactions.endSeriesConfirm'), { danger: false, confirmLabel: t('transactions.action.endSeries') }))) return;
      await endRecurringSeries(button.dataset.endSeries, todayISODate());
      render(context.container);
    });
  }
}

// Rodapé fixo da lista: totais do mês à esquerda; saldo realizado e previsto das contas ao final
// do mês exibido à direita.
function renderFooter(context, monthTransactions) {
  const slot = context.container.querySelector('#transactions-footer-slot');
  const locale = getLocale();
  const { endDate } = monthRange(monthState);
  const [originType, originId] = filterState.origin ? filterState.origin.split(':') : [];
  const accounts = originType === 'account' ? context.accounts.filter((account) => account.id === originId) : context.accounts;
  const { confirmedCents, projectedCents } = calculateBalancesAtDate(accounts, context.allTransactions, endDate);
  const active = monthTransactions.filter((transaction) => transaction.status !== 'cancelled');
  const incomeCents = active.filter((transaction) => transaction.kind === 'income').reduce((sum, transaction) => sum + Math.abs(transaction.amountCents), 0);
  const expenseCents = active.filter((transaction) => transaction.kind === 'expense').reduce((sum, transaction) => sum + Math.abs(transaction.amountCents), 0);

  slot.innerHTML = `
    <div class="tx-footer__group">
      <span>${t('transactions.footer.income')}</span><strong class="amount--income">${centsToDisplay(incomeCents, locale)}</strong>
      <span>${t('transactions.footer.expense')}</span><strong class="amount--expense">${centsToDisplay(expenseCents ? -expenseCents : 0, locale)}</strong>
    </div>
    <span class="tx-footer__divider"></span>
    <div class="tx-footer__group">
      <span>${t('transactions.footer.balance')}</span><strong class="${confirmedCents < 0 ? 'amount--expense' : 'amount--income'}">${centsToDisplay(confirmedCents, locale)}</strong>
      <span>${t('transactions.footer.projected')}</span><strong class="${projectedCents < 0 ? 'amount--expense' : 'amount--income'}">${centsToDisplay(projectedCents, locale)}</strong>
    </div>
  `;
}

function seriesBadgeHtml(transaction, seriesById) {
  if (!transaction.seriesId) return '<span class="tx-row__series"></span>';
  const series = seriesById.get(transaction.seriesId);
  if (!series) return '<span class="tx-row__series"></span>';
  if (series.kind === 'installment') {
    return `<span class="tx-row__series" title="${t('transactions.badge.installment', { n: transaction.installmentNumber, total: series.installmentsTotal })}">${iconSvg('calendar', { size: 15 })}</span>`;
  }
  const title = series.paused ? `${t('transactions.badge.recurring')} · ${t('transactions.badge.paused')}` : `${t('transactions.badge.recurring')} · ${t(`transactions.frequency.${series.frequency}`)}`;
  return `<span class="tx-row__series ${series.paused ? 'is-paused' : ''}" title="${title}">${iconSvg('repeat', { size: 15 })}</span>`;
}

function seriesActionsHtml(transaction, seriesById) {
  if (!transaction.seriesId) return '';
  const series = seriesById.get(transaction.seriesId);
  if (!series || series.kind !== 'recurring') return '';
  return series.paused
    ? `<button type="button" class="link-button" data-resume-series="${series.id}">${iconSvg('play', { size: 14 })} ${t('transactions.action.resumeSeries')}</button>`
    : `<button type="button" class="link-button" data-pause-series="${series.id}">${iconSvg('pause', { size: 14 })} ${t('transactions.action.pauseSeries')}</button>
       <button type="button" class="link-button link-button--danger" data-end-series="${series.id}">${iconSvg('stop', { size: 14 })} ${t('transactions.action.endSeries')}</button>`;
}

function paymentTargetHtml(transaction, context) {
  if (transaction.creditCardId) {
    const card = context.creditCardsById.get(transaction.creditCardId);
    const invoice = transaction.invoiceId ? context.invoicesById.get(transaction.invoiceId) : null;
    const label = `${card ? escapeHtml(card.name) : '-'}${invoice ? ` · ${t('transactions.invoiceLabel', { month: formatReferenceMonth(invoice.referenceMonth, getLocale()) })}` : ''}`;
    return `${institutionIconHtml(card, { fallbackIcon: 'creditCards', size: 22 })}<span>${label}</span>`;
  }
  const account = context.accountsById.get(transaction.accountId);
  return `${institutionIconHtml(account, { size: 22 })}<span>${account ? escapeHtml(account.name) : '-'}</span>`;
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
  const parent = category?.parentId ? categoriesById.get(category.parentId) : null;
  const series = transaction.seriesId ? seriesById.get(transaction.seriesId) : null;
  const isSettled = SETTLED_STATUSES_SET.has(transaction.status);
  const isCancelled = transaction.status === 'cancelled';
  const toggleTitle = isSettled
    ? t('transactions.quickAction.markPending')
    : transaction.kind === 'income'
      ? t('transactions.quickAction.markReceived')
      : t('transactions.quickAction.markPaid');
  const subtitle = category ? (parent ? `${parent.name} › ${category.name}` : category.name) : t('transactions.form.categoryNone');

  return `
    <article class="tx-row ${isCancelled ? 'is-cancelled' : ''}" data-edit-id="${transaction.id}" tabindex="0" title="${escapeHtml(subtitle)}">
      ${categoryIconHtml(category, { parent, size: 37 })}
      <div class="tx-row__main">
        <p class="tx-row__title">${escapeHtml(transaction.description || '')}</p>
        ${series?.kind === 'installment' ? `<span class="tx-row__installment">${transaction.installmentNumber}/${series.installmentsTotal}</span>` : ''}
        ${isCancelled ? `<span class="badge">${t('transactions.status.cancelled')}</span>` : ''}
      </div>
      ${seriesBadgeHtml(transaction, seriesById)}
      <span class="tx-row__target">${paymentTargetHtml(transaction, context)}</span>
      <div class="tx-row__amount">${centsToDisplay(transaction.amountCents, locale)}</div>
      <button type="button" class="status-toggle ${isSettled ? 'is-settled' : ''} ${justToggledId === transaction.id ? 'just-toggled' : ''}" data-toggle-paid-id="${transaction.id}" title="${toggleTitle}" aria-label="${toggleTitle}" aria-pressed="${isSettled}" ${isCancelled ? 'disabled' : ''}>${iconSvg('thumbsUp', { size: 18 })}</button>
      <div class="tx-row__actions">
        ${seriesActionsHtml(transaction, seriesById)}
        <button type="button" class="icon-button icon-button--danger" data-delete-id="${transaction.id}" title="${t('common.delete')}" aria-label="${t('common.delete')}">${iconSvg('trash', { size: 16 })}</button>
      </div>
    </article>
  `;
}

// Agrupar por data só faz sentido com a lista ordenada por data (o padrão); com ordenação por
// valor/descrição a lista aparece sem cabeçalhos de data.
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
  if (!transaction || transaction.status === 'cancelled') return;
  let mascotEvent;
  if (SETTLED_STATUSES_SET.has(transaction.status)) {
    await updateTransactionScoped(context.activeSpace.id, transaction.id, { status: 'pending' }, { scope: 'only', includePaid: true });
    mascotEvent = 'transactionUnpaid';
  } else {
    const nextStatus = transaction.kind === 'income' ? 'received' : 'paid';
    await updateTransactionScoped(context.activeSpace.id, transaction.id, { status: nextStatus }, { scope: 'only', includePaid: false });
    mascotEvent = transaction.kind === 'income' ? 'transactionReceived' : 'transactionPaid';
  }
  justToggledId = transaction.id;
  await render(context.container);
  justToggledId = null;
  // Ledi: pagar → comemora (todas pagas no mês → festa maior); receber → dinheiro entrando.
  mascotReact(mascotEvent, { date: transaction.date });
}

function editDraft(transaction) {
  return {
    kind: transaction.kind,
    description: transaction.description || '',
    amount: formatCentsForInput(Math.abs(transaction.amountCents), getLocale()),
    date: transaction.date,
    settled: SETTLED_STATUSES_SET.has(transaction.status),
    settledTouched: true,
    target: transaction.creditCardId ? `card:${transaction.creditCardId}` : `account:${transaction.accountId}`,
    categoryId: transaction.categoryId || null,
    repeatOpen: false,
  };
}

function startEdit(context, transactionId) {
  const transaction = context.transactions.find((item) => item.id === transactionId);
  if (!transaction) return;
  if (transaction.seriesId) {
    scopeState = { action: 'edit', transaction };
    renderScopeChooser(context);
    return;
  }
  // Lançamento avulso já pago/recebido pode ser editado direto: o próprio formulário mostra a
  // situação, e salvar só grava o que foi alterado.
  formState = { mode: 'edit', transaction, scope: 'only', includePaid: true, draft: editDraft(transaction) };
  renderForm(context);
}

async function startDelete(context, transactionId) {
  const transaction = context.transactions.find((item) => item.id === transactionId);
  if (!transaction) return;
  if (transaction.seriesId) {
    scopeState = { action: 'delete', transaction };
    renderScopeChooser(context);
    return;
  }
  const isSettled = SETTLED_STATUSES_SET.has(transaction.status);
  if (!(await confirmDialog(isSettled ? t('transactions.confirmDeletePaid') : t('transactions.deleteConfirm')))) return;
  formState = null;
  deleteTransactionScoped(context.activeSpace.id, transaction.id, { scope: 'only', includePaid: true }).then(() => render(context.container));
}

function renderScopeChooser(context) {
  const slot = context.container.querySelector('#transactions-modal-slot');
  const { transaction, action } = scopeState;
  const closeChooser = () => {
    scopeState = null;
    render(context.container);
  };

  const modal = openModal(slot, {
    title: action === 'delete' ? t('transactions.scope.titleDelete') : t('transactions.scope.titleEdit'),
    size: 'sm',
    onClose: closeChooser,
    body: `
      <div class="modal__body">
        <p class="form-hint">${t('transactions.scope.title')}</p>
        <div class="choice-group" style="grid-template-columns:1fr">
          <label class="choice"><input type="radio" name="scope" value="only" checked /> ${t('transactions.scope.only')}</label>
          <label class="choice"><input type="radio" name="scope" value="following" /> ${t('transactions.scope.following')}</label>
          <label class="choice"><input type="radio" name="scope" value="all" /> ${t('transactions.scope.all')}</label>
        </div>
        <label class="switch"><input type="checkbox" id="scope-include-paid" /><span class="switch__track"></span>${t('transactions.scope.includePaid')}</label>
        <div class="form-actions">
          <button type="button" id="scope-cancel" class="button">${t('common.cancel')}</button>
          <button type="button" id="scope-continue" class="button ${action === 'delete' ? 'button--danger' : 'button--primary'}">${action === 'delete' ? t('common.delete') : t('transactions.scope.confirmEdit')}</button>
        </div>
      </div>
    `,
  });

  modal.querySelector('#scope-cancel').addEventListener('click', closeChooser);
  modal.querySelector('#scope-continue').addEventListener('click', async () => {
    const scope = modal.querySelector('input[name="scope"]:checked').value;
    // Na edição de "somente este" o próprio lançamento escolhido sempre pode ser alterado.
    const includePaid = modal.querySelector('#scope-include-paid').checked || scope === 'only';

    if (action === 'delete') {
      const result = await deleteTransactionScoped(context.activeSpace.id, transaction.id, { scope, includePaid });
      scopeState = null;
      formState = null;
      if (result.skippedCount > 0) window.alert(t('transactions.scope.skippedNote', { count: result.skippedCount }));
      render(context.container);
      return;
    }

    formState = { mode: 'edit', transaction, scope, includePaid, draft: editDraft(transaction) };
    scopeState = null;
    render(context.container);
  });
}

// Opções do campo único "Conta/Cartão": contas e cartões agrupados. Cartão só serve para despesa.
function targetOptionsHtml(context, draft, isEdit, transaction) {
  const accounts = context.accounts.filter((account) => !account.archived || (isEdit && transaction.accountId === account.id));
  const cards = context.creditCards.filter((card) => !card.archived || (isEdit && transaction.creditCardId === card.id));
  const editingCard = isEdit && transaction.creditCardId;
  const option = (value, label, disabled = false) => `<option value="${value}" ${draft.target === value ? 'selected' : ''} ${disabled ? 'disabled' : ''}>${escapeHtml(label)}</option>`;
  return `
    <optgroup label="${t('nav.accounts')}">${accounts.map((account) => option(`account:${account.id}`, account.name, Boolean(editingCard))).join('')}</optgroup>
    ${
      cards.length
        ? `<optgroup label="${t('nav.creditCards')}">${cards
            .map((card) => option(`card:${card.id}`, card.name, draft.kind === 'income' || (isEdit && !editingCard) || (editingCard && transaction.creditCardId !== card.id)))
            .join('')}</optgroup>`
        : ''
    }
  `;
}

function installmentPreviewHtml(draft) {
  const total = Number(draft.installmentsTotal);
  const amountCents = parseCurrencyInputToCents(draft.amount);
  if (!Number.isInteger(total) || total < 2 || total > MAX_INSTALLMENTS || amountCents < 0) {
    return t('transactions.form.installmentPreviewEmpty');
  }
  const amounts = buildInstallmentAmounts(amountCents, total);
  const locale = getLocale();
  const allEqual = amounts.every((amount) => amount === amounts[0]);
  return allEqual
    ? t('transactions.form.installmentPreview', { count: total, amount: `<strong>${centsToDisplay(amounts[0], locale)}</strong>` })
    : t('transactions.form.installmentPreviewUneven', { count: total, amount: `<strong>${centsToDisplay(amounts[0], locale)}</strong>`, last: `<strong>${centsToDisplay(amounts[amounts.length - 1], locale)}</strong>` });
}

function repeatSectionHtml(draft) {
  const kindLabel = draft.kind === 'income' ? t('transactions.form.repeatIncome') : t('transactions.form.repeatExpense');
  return `
    <div class="tx-form__section" id="tx-repeat-section">
      <p class="tx-form__section-title">${kindLabel}</p>
      <div class="choice-group">
        <label class="choice"><input type="radio" name="repeatType" value="recurring" ${draft.repeatType === 'recurring' ? 'checked' : ''} /> ${t('transactions.recurrenceType.fixed')}</label>
        <label class="choice"><input type="radio" name="repeatType" value="installment" ${draft.repeatType === 'installment' ? 'checked' : ''} /> ${t('transactions.recurrenceType.installment')}</label>
      </div>
      ${
        draft.repeatType === 'installment'
          ? `
            <div class="form-row">
              <div class="form-field">
                <label for="tx-installments-total">${t('transactions.form.installmentsTotal')}</label>
                <input id="tx-installments-total" name="installmentsTotal" type="number" min="2" max="${MAX_INSTALLMENTS}" value="${escapeHtml(draft.installmentsTotal)}" />
              </div>
              <div class="form-field">
                <span class="form-field__label">${t('transactions.form.frequency')}</span>
                <input type="text" value="${t('transactions.frequency.monthly')}" disabled />
              </div>
            </div>
            <p class="tx-form__preview" id="tx-installment-preview">${installmentPreviewHtml(draft)}</p>
            <p class="form-hint">${t('transactions.form.installmentAmountHint')}</p>
          `
          : `
            <div class="form-row">
              <div class="form-field">
                <label for="tx-frequency">${t('transactions.form.frequency')}</label>
                <select id="tx-frequency" name="frequency">
                  ${RECURRENCE_FREQUENCIES.map((frequency) => `<option value="${frequency}" ${draft.frequency === frequency ? 'selected' : ''}>${t(`transactions.frequency.${frequency}`)}</option>`).join('')}
                </select>
              </div>
              <div class="form-field">
                <label for="tx-end-date">${t('transactions.form.endDate')}</label>
                <input id="tx-end-date" name="endDate" type="date" value="${escapeHtml(draft.endDate)}" min="${escapeHtml(draft.date)}" />
              </div>
            </div>
          `
      }
    </div>
  `;
}

function renderForm(context) {
  const slot = context.container.querySelector('#transactions-modal-slot');
  const isEdit = formState.mode === 'edit';
  const transaction = formState.transaction;
  const draft = formState.draft;
  const isSeriesEdit = isEdit && Boolean(transaction.seriesId);

  // Conta/Cartão padrão: a primeira conta ativa (cartão só se o usuário escolher).
  if (!draft.target) {
    const firstAccount = context.accounts.find((account) => !account.archived);
    draft.target = firstAccount ? `account:${firstAccount.id}` : '';
  }
  if (draft.kind === 'income' && draft.target.startsWith('card:')) {
    const firstAccount = context.accounts.find((account) => !account.archived);
    draft.target = firstAccount ? `account:${firstAccount.id}` : '';
  }

  const settledLabel = draft.kind === 'income' ? t('transactions.form.received') : t('transactions.form.paid');
  const closeForm = () => {
    formState = null;
    render(context.container);
  };

  const modal = openModal(slot, {
    title: isEdit ? t('transactions.form.titleEdit') : t('transactions.form.titleCreate'),
    onClose: closeForm,
    body: `
      <form id="transaction-form" class="tx-form" novalidate>
        <div class="segmented" role="tablist">
          <button type="button" class="segmented__option ${draft.kind === 'expense' ? 'is-active' : ''}" data-kind="expense" ${isEdit ? 'disabled' : ''}>${t('transactions.kind.expense')}</button>
          <button type="button" class="segmented__option ${draft.kind === 'income' ? 'is-active' : ''}" data-kind="income" ${isEdit ? 'disabled' : ''}>${t('transactions.kind.income')}</button>
          <button type="button" class="segmented__option" data-kind="transfer" ${isEdit ? 'disabled' : ''}>${t('transactions.kind.transfer')}</button>
        </div>

        <div class="form-field">
          <label for="tx-description">${t('transactions.form.description')}</label>
          <input id="tx-description" name="description" type="text" autocomplete="off" placeholder="${t('transactions.form.descriptionPlaceholder')}" value="${escapeHtml(draft.description)}" />
        </div>

        <div class="form-row">
          <div class="form-field">
            <label for="tx-amount">${!isEdit && draft.repeatOpen && draft.repeatType === 'installment' ? t('transactions.form.totalAmount') : t('transactions.form.amount')}</label>
            <div class="input-prefix"><span>${getLocale() === 'pt-BR' ? 'R$' : '$'}</span><input id="tx-amount" name="amount" type="text" inputmode="numeric" data-money placeholder="0,00" value="${escapeHtml(draft.amount)}" ${isSeriesEdit ? 'disabled' : ''} /></div>
          </div>
          <div class="form-field">
            <label for="tx-date">${!isEdit && draft.repeatOpen ? t('transactions.form.firstDate') : t('transactions.form.date')}</label>
            <input id="tx-date" name="date" type="date" value="${escapeHtml(draft.date)}" ${isSeriesEdit ? 'disabled' : ''} />
          </div>
        </div>
        ${isSeriesEdit ? `<p class="form-hint">${t('transactions.form.seriesLockedHint')}</p>` : ''}

        <label class="switch"><input type="checkbox" id="tx-settled" ${draft.settled ? 'checked' : ''} /><span class="switch__track"></span>${settledLabel}</label>
        ${isEdit && transaction.status === 'cancelled' ? `<p class="form-hint">${t('transactions.form.cancelledHint')}</p>` : ''}

        <div class="form-row">
          <div class="form-field">
            <label for="tx-target">${t('transactions.form.accountOrCard')}</label>
            <select id="tx-target" name="target">${targetOptionsHtml(context, draft, isEdit, transaction)}</select>
          </div>
          <div class="form-field">
            <span class="form-field__label">${t('transactions.form.category')}</span>
            <div id="tx-category-combo"></div>
          </div>
        </div>

        ${
          isEdit
            ? ''
            : `
              <div class="tx-form__extras">
                <button type="button" class="tx-form__extra ${draft.repeatOpen ? 'is-active' : ''}" id="tx-toggle-repeat" title="${t('transactions.form.repeat')}" aria-pressed="${draft.repeatOpen}">${iconSvg('repeat', { size: 18 })}</button>
              </div>
              ${draft.repeatOpen ? repeatSectionHtml(draft) : ''}
            `
        }

        <p class="form-error" id="tx-form-error" hidden></p>

        <div class="tx-form__footer">
          ${
            isEdit
              ? `<button type="button" class="icon-button icon-button--outline icon-button--round icon-button--danger" id="tx-form-delete" title="${t('common.delete')}" aria-label="${t('common.delete')}">${iconSvg('trash', { size: 18 })}</button>`
              : `<button type="button" class="icon-button icon-button--outline icon-button--round" id="tx-form-clear" title="${t('transactions.form.clear')}" aria-label="${t('transactions.form.clear')}">${iconSvg('trash', { size: 18 })}</button>`
          }
          <button type="submit" class="fab-save" title="${t('common.save')}" aria-label="${t('common.save')}">${iconSvg('check', { size: 28, strokeWidth: 2.5 })}</button>
          ${
            isEdit
              ? '<span></span>'
              : `<button type="button" class="icon-button icon-button--outline icon-button--round" id="tx-form-save-another" title="${t('transactions.form.saveAndNew')}" aria-label="${t('transactions.form.saveAndNew')}">${iconSvg('plusCircle', { size: 18 })}</button>`
          }
        </div>
      </form>
    `,
  });

  const form = modal.querySelector('#transaction-form');
  const errorElement = modal.querySelector('#tx-form-error');
  const settledInput = modal.querySelector('#tx-settled');

  mountCategoryCombo(modal.querySelector('#tx-category-combo'), {
    categories: context.categories,
    kind: draft.kind,
    value: draft.categoryId,
    labels: {
      placeholder: t('transactions.form.categoryPlaceholder'),
      none: t('transactions.form.categoryNone'),
      search: t('transactions.form.categorySearch'),
      empty: t('transactions.form.categoryEmpty'),
    },
    onChange: (value) => {
      draft.categoryId = value;
    },
  });

  // Mantém o rascunho sempre atualizado — nada do que foi digitado se perde ao redesenhar.
  const bind = (selector, field, eventName = 'input') => {
    const element = modal.querySelector(selector);
    if (!element) return;
    element.addEventListener(eventName, () => {
      draft[field] = element.value;
    });
  };
  bind('#tx-description', 'description');
  bind('#tx-amount', 'amount');
  bind('#tx-target', 'target', 'change');
  bind('#tx-frequency', 'frequency', 'change');
  bind('#tx-end-date', 'endDate', 'change');

  modal.querySelector('#tx-amount')?.addEventListener('input', () => {
    const preview = modal.querySelector('#tx-installment-preview');
    if (preview) preview.innerHTML = installmentPreviewHtml(draft);
  });
  modal.querySelector('#tx-installments-total')?.addEventListener('input', (event) => {
    draft.installmentsTotal = event.target.value;
    modal.querySelector('#tx-installment-preview').innerHTML = installmentPreviewHtml(draft);
  });

  // Data futura sugere "não pago"; passada/hoje sugere "pago" — até o usuário mexer na chave.
  modal.querySelector('#tx-date').addEventListener('change', (event) => {
    draft.date = event.target.value;
    if (!draft.settledTouched && !isEdit) {
      draft.settled = draft.date <= todayISODate();
      settledInput.checked = draft.settled;
    }
    const endDateInput = modal.querySelector('#tx-end-date');
    if (endDateInput) endDateInput.min = draft.date;
  });
  settledInput.addEventListener('change', () => {
    draft.settled = settledInput.checked;
    draft.settledTouched = true;
  });

  for (const button of modal.querySelectorAll('[data-kind]')) {
    button.addEventListener('click', () => {
      const kind = button.dataset.kind;
      if (kind === 'transfer') {
        formState = null;
        navigateTo('/transfers');
        return;
      }
      if (kind === draft.kind) return;
      draft.kind = kind;
      // A categoria escolhida só continua se for do novo tipo.
      const category = draft.categoryId ? context.categoriesById.get(draft.categoryId) : null;
      if (category && category.kind !== kind) draft.categoryId = null;
      renderForm(context);
    });
  }

  modal.querySelector('#tx-toggle-repeat')?.addEventListener('click', () => {
    draft.repeatOpen = !draft.repeatOpen;
    renderForm(context);
  });
  for (const radio of modal.querySelectorAll('input[name="repeatType"]')) {
    radio.addEventListener('change', () => {
      draft.repeatType = radio.value;
      renderForm(context);
    });
  }

  modal.querySelector('#tx-form-clear')?.addEventListener('click', () => {
    formState.draft = newDraft(draft.kind);
    renderForm(context);
  });
  modal.querySelector('#tx-form-delete')?.addEventListener('click', () => startDelete(context, transaction.id));

  let saveAndNew = false;
  modal.querySelector('#tx-form-save-another')?.addEventListener('click', () => {
    saveAndNew = true;
    form.requestSubmit();
  });

  if (!isEdit) modal.querySelector('#tx-description').focus();

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const createAnother = saveAndNew;
    saveAndNew = false;
    const showError = (message) => {
      errorElement.textContent = message;
      errorElement.hidden = false;
    };

    const kind = draft.kind;
    const description = draft.description.trim();
    const [targetType, targetId] = (draft.target || '').split(':');
    const accountId = targetType === 'account' ? targetId : null;
    const creditCardId = targetType === 'card' ? targetId : null;
    const categoryId = draft.categoryId || null;
    const date = draft.date;
    const amountCents = parseCurrencyInputToCents(draft.amount);
    const settledStatus = kind === 'income' ? 'received' : 'paid';

    if (!isRequired(description)) return showError(t('transactions.validation.descriptionRequired'));
    if (!isSeriesEdit) {
      // Valor zerado é permitido (ex.: lançamento a definir ou cortesia); só negativo é inválido.
      if (amountCents < 0) return showError(t('transactions.validation.amountInvalid'));
      if (!isValidISODate(date)) return showError(t('transactions.validation.dateInvalid'));
    }
    if (!accountId && !creditCardId) return showError(t('transactions.validation.accountRequired'));
    if (creditCardId && kind === 'income') return showError(t('transactions.validation.cardIncome'));

    if (isEdit) {
      // A situação só muda se a chave foi alterada (preserva "cancelado" e o tipo de baixa).
      const wasSettled = SETTLED_STATUSES_SET.has(transaction.status);
      const status = draft.settled === wasSettled ? transaction.status : draft.settled ? settledStatus : 'pending';
      const changes = { description, categoryId, status };
      if (!transaction.creditCardId) changes.accountId = accountId;
      if (!transaction.seriesId) {
        changes.amountCents = kind === 'expense' && amountCents !== 0 ? -amountCents : amountCents;
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

    const status = draft.settled ? settledStatus : 'pending';
    const common = { kind, description, date, categoryId, accountId, creditCardId, status };

    try {
      if (draft.repeatOpen && draft.repeatType === 'installment') {
        const installmentsTotal = Number(draft.installmentsTotal);
        if (!Number.isInteger(installmentsTotal) || installmentsTotal < 2 || installmentsTotal > MAX_INSTALLMENTS) {
          return showError(t('transactions.validation.installmentsInvalid'));
        }
        await createInstallmentSeries(context.activeSpace.id, { ...common, totalAmountCents: amountCents, installmentsTotal });
      } else if (draft.repeatOpen && draft.repeatType === 'recurring') {
        if (draft.endDate && (!isValidISODate(draft.endDate) || draft.endDate < date)) return showError(t('transactions.validation.endDateInvalid'));
        await createRecurringSeries(context.activeSpace.id, { ...common, amountCents, frequency: draft.frequency, endDate: draft.endDate || null });
      } else {
        await createSimpleTransaction(context.activeSpace.id, { ...common, amountCents });
      }
    } catch (error) {
      showError(t('settings.failed', { message: error.message }));
      mascotReact('error');
      return;
    }
    // Ledi reage: receita → dinheiro entrando; despesa → aprova, leva as mãos à cabeça com valor
    // alto ou mostra os bolsos vazios se estourou o limite de gastos da categoria.
    mascotReact(kind === 'income' ? 'incomeCreated' : 'expenseCreated', { amountCents, categoryId, date });

    // "Salvar e criar outro": mantém tipo, data e conta para agilizar uma sequência de lançamentos.
    formState = createAnother ? { mode: 'create', draft: { ...newDraft(kind), date, target: draft.target } } : null;
    render(context.container);
  });
}
