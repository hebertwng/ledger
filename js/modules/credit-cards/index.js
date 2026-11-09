import { t, getLocale } from '../../core/i18n.js';
import { getActiveSpace } from '../../core/bootstrap.js';
import { listAccounts } from '../../services/accountRepository.js';
import {
  listCreditCardsWithUsage,
  createCreditCard,
  updateCreditCard,
  setCreditCardArchived,
  CLOSING_DAY_RULES,
} from '../../services/creditCardRepository.js';
import { centsToDisplay, parseCurrencyInputToCents } from '../../utils/currency.js';
import { isRequired, isValidDayOfMonth } from '../../utils/validation.js';
import { escapeHtml } from '../../utils/html.js';

let formState = null;

export async function render(container) {
  const activeSpace = await getActiveSpace();
  const [cards, accounts] = activeSpace
    ? await Promise.all([listCreditCardsWithUsage(activeSpace.id), listAccounts(activeSpace.id)])
    : [[], []];
  const locale = getLocale();

  container.innerHTML = `
    <section class="view">
      <div class="view__header">
        <h1>${t('modules.creditCards.title')}</h1>
        <button type="button" id="cards-new-button" class="button button--primary" ${accounts.length === 0 ? 'disabled' : ''}>${t('creditCards.newButton')}</button>
      </div>
      ${accounts.length === 0 ? `<div class="form-note"><p>${t('creditCards.noAccountsWarning')}</p></div>` : ''}
      <div id="cards-form-slot"></div>
      ${cards.length === 0 ? `<div class="empty-state"><p>${t('creditCards.emptyState')}</p></div>` : renderTable(cards, locale)}
    </section>
  `;

  const newButton = container.querySelector('#cards-new-button');
  if (accounts.length) {
    newButton.addEventListener('click', () => {
      formState = { mode: 'create' };
      renderForm(container, activeSpace, accounts);
    });
  }

  for (const button of container.querySelectorAll('[data-edit-id]')) {
    button.addEventListener('click', () => {
      formState = { mode: 'edit', card: cards.find((card) => card.id === button.dataset.editId) };
      renderForm(container, activeSpace, accounts);
    });
  }

  for (const button of container.querySelectorAll('[data-archive-id]')) {
    button.addEventListener('click', async () => {
      const card = cards.find((item) => item.id === button.dataset.archiveId);
      await setCreditCardArchived(card.id, !card.archived);
      render(container);
    });
  }

  if (formState) renderForm(container, activeSpace, accounts);
}

function renderTable(cards, locale) {
  const rows = cards
    .map(
      (card) => `
        <tr>
          <td>${escapeHtml(card.name)}${card.archived ? ` <span class="badge badge--muted">${t('common.archivedBadge')}</span>` : ''}</td>
          <td>${escapeHtml(card.brand)}</td>
          <td class="table__value">${centsToDisplay(card.limitCents, locale)}</td>
          <td class="table__value">${centsToDisplay(card.usedCents, locale)}</td>
          <td class="table__value">${centsToDisplay(card.availableCents, locale)}</td>
          <td>${card.closingDay}</td>
          <td>${card.dueDay}</td>
          <td class="table__actions">
            <button type="button" class="link-button" data-edit-id="${card.id}">${t('common.edit')}</button>
            <button type="button" class="link-button" data-archive-id="${card.id}">${card.archived ? t('common.unarchive') : t('common.archive')}</button>
          </td>
        </tr>
      `
    )
    .join('');

  return `
    <table class="data-table">
      <thead>
        <tr>
          <th>${t('creditCards.column.name')}</th>
          <th>${t('creditCards.column.brand')}</th>
          <th>${t('creditCards.column.limit')}</th>
          <th>${t('creditCards.column.used')}</th>
          <th>${t('creditCards.column.available')}</th>
          <th>${t('creditCards.column.closingDay')}</th>
          <th>${t('creditCards.column.dueDay')}</th>
          <th>${t('common.actions')}</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderForm(container, activeSpace, accounts) {
  const slot = container.querySelector('#cards-form-slot');
  const isEdit = formState.mode === 'edit';
  const card = formState.card;

  slot.innerHTML = `
    <form id="card-form" class="form-card">
      <h2>${isEdit ? t('creditCards.form.titleEdit') : t('creditCards.form.titleCreate')}</h2>
      <div class="form-field">
        <label for="card-name">${t('creditCards.form.name')}</label>
        <input id="card-name" name="name" type="text" value="${isEdit ? escapeHtml(card.name) : ''}" />
      </div>
      <div class="form-field">
        <label for="card-brand">${t('creditCards.form.brand')}</label>
        <input id="card-brand" name="brand" type="text" value="${isEdit ? escapeHtml(card.brand) : ''}" />
      </div>
      <div class="form-field">
        <label for="card-limit">${t('creditCards.form.limit')}</label>
        <input id="card-limit" name="limit" type="text" inputmode="decimal" value="${isEdit ? (card.limitCents / 100).toFixed(2) : ''}" />
      </div>
      <div class="form-field">
        <label for="card-closing-day">${t('creditCards.form.closingDay')}</label>
        <input id="card-closing-day" name="closingDay" type="number" min="1" max="31" value="${isEdit ? card.closingDay : ''}" />
      </div>
      <div class="form-field">
        <label for="card-due-day">${t('creditCards.form.dueDay')}</label>
        <input id="card-due-day" name="dueDay" type="number" min="1" max="31" value="${isEdit ? card.dueDay : ''}" />
      </div>
      <div class="form-field">
        <label for="card-closing-rule">${t('creditCards.form.closingRule')}</label>
        <select id="card-closing-rule" name="closingDayRule">
          <option value="${CLOSING_DAY_RULES.CLOSES_ON_DAY}" ${isEdit && card.closingDayRule === CLOSING_DAY_RULES.CLOSES_ON_DAY ? 'selected' : ''}>${t('creditCards.closingRule.closesOnDay')}</option>
          <option value="${CLOSING_DAY_RULES.CLOSES_BEFORE_DAY}" ${isEdit && card.closingDayRule === CLOSING_DAY_RULES.CLOSES_BEFORE_DAY ? 'selected' : ''}>${t('creditCards.closingRule.closesBeforeDay')}</option>
        </select>
      </div>
      <div class="form-field">
        <label for="card-payment-account">${t('creditCards.form.paymentAccount')}</label>
        <select id="card-payment-account" name="paymentAccountId">
          ${accounts
            .map((account) => `<option value="${account.id}" ${isEdit && card.paymentAccountId === account.id ? 'selected' : ''}>${escapeHtml(account.name)}</option>`)
            .join('')}
        </select>
      </div>
      <p class="form-error" id="card-form-error" hidden></p>
      <div class="form-actions">
        <button type="submit" class="button button--primary">${t('common.save')}</button>
        <button type="button" id="card-form-cancel" class="button">${t('common.cancel')}</button>
      </div>
    </form>
  `;

  slot.querySelector('#card-form-cancel').addEventListener('click', () => {
    formState = null;
    render(container);
  });

  slot.querySelector('#card-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(event.target);
    const errorElement = slot.querySelector('#card-form-error');

    const name = String(formData.get('name') || '').trim();
    const brand = String(formData.get('brand') || '').trim();
    const closingDay = Number(formData.get('closingDay'));
    const dueDay = Number(formData.get('dueDay'));
    const closingDayRule = String(formData.get('closingDayRule'));
    const paymentAccountId = String(formData.get('paymentAccountId') || '');
    const limitCents = parseCurrencyInputToCents(String(formData.get('limit') || '0'));

    const showError = (message) => {
      errorElement.textContent = message;
      errorElement.hidden = false;
    };

    if (!isRequired(name)) return showError(t('creditCards.validation.nameRequired'));
    if (!isRequired(brand)) return showError(t('creditCards.validation.brandRequired'));
    if (!isValidDayOfMonth(closingDay) || !isValidDayOfMonth(dueDay)) return showError(t('creditCards.validation.dayInvalid'));
    if (!isRequired(paymentAccountId)) return showError(t('creditCards.validation.paymentAccountRequired'));
    if (limitCents <= 0) return showError(t('creditCards.validation.limitInvalid'));

    const payload = { name, brand, closingDay, dueDay, closingDayRule, paymentAccountId, limitCents };

    if (isEdit) {
      await updateCreditCard(card.id, payload);
    } else {
      await createCreditCard(activeSpace.id, payload);
    }

    formState = null;
    render(container);
  });
}
