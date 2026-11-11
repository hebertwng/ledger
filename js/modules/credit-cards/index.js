import { t, getLocale } from '../../core/i18n.js';
import { formatCentsForInput } from '../../utils/moneyInput.js';
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
import { iconSvg } from '../../utils/icons.js';
import { institutionIconHtml, institutionPickerHtml, openModal } from '../../utils/ui.js';
import { navigateTo } from '../../core/router.js';

let formState = null;

export async function render(container) {
  const activeSpace = await getActiveSpace();
  const [cards, accounts] = activeSpace
    ? await Promise.all([listCreditCardsWithUsage(activeSpace.id), listAccounts(activeSpace.id)])
    : [[], []];
  const locale = getLocale();
  const activeAccounts = accounts.filter((account) => !account.archived);
  const active = cards.filter((card) => !card.archived);
  const archived = cards.filter((card) => card.archived);

  container.innerHTML = `
    <section class="view">
      <div class="view__header">
        <h1>${t('modules.creditCards.title')}</h1>
        <button type="button" id="cards-new-button" class="button button--soft" ${activeAccounts.length === 0 ? 'disabled' : ''}>${iconSvg('plusCircle', { size: 18 })} ${t('creditCards.newButton')}</button>
      </div>
      ${activeAccounts.length === 0 ? `<div class="form-note"><p>${t('creditCards.noAccountsWarning')}</p></div>` : ''}
      ${active.length === 0 ? `<div class="empty-state"><span class="empty-state__icon">${iconSvg('creditCards', { size: 22 })}</span><p>${t('creditCards.emptyState')}</p></div>` : `<ul class="entity-list">${active.map((card) => rowHtml(card, locale)).join('')}</ul>`}
      ${
        archived.length
          ? `<p class="section-title">${iconSvg('folder', { size: 16 })} ${t('creditCards.archivedTitle')}</p><ul class="entity-list">${archived.map((card) => rowHtml(card, locale)).join('')}</ul>`
          : ''
      }
      <div id="cards-modal-slot"></div>
    </section>
  `;

  const newButton = container.querySelector('#cards-new-button');
  newButton.addEventListener('click', () => {
    formState = { mode: 'create' };
    renderForm(container, activeSpace, activeAccounts);
  });

  for (const element of container.querySelectorAll('[data-edit-id]')) {
    element.addEventListener('click', (event) => {
      if (event.target.closest('button')) return;
      formState = { mode: 'edit', card: cards.find((card) => card.id === element.dataset.editId) };
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

  for (const button of container.querySelectorAll('[data-invoices]')) {
    button.addEventListener('click', () => navigateTo('/invoices'));
  }

  if (formState) renderForm(container, activeSpace, formState.mode === 'edit' ? accounts : activeAccounts);
}

function rowHtml(card, locale) {
  return `
    <li class="entity-row entity-row--clickable ${card.archived ? 'is-archived' : ''}" data-edit-id="${card.id}" tabindex="0">
      ${institutionIconHtml(card, { fallbackIcon: 'creditCards', size: 40 })}
      <span class="entity-row__main">
        <span class="entity-row__title">${escapeHtml(card.name)}</span>
        <span class="entity-row__subtitle">${t('creditCards.closesDue', { closing: card.closingDay, due: card.dueDay })}${card.brand ? ` · ${escapeHtml(card.brand)}` : ''}</span>
      </span>
      <span class="entity-row__value">
        ${centsToDisplay(card.availableCents, locale)}
        <small>${t('creditCards.availableOf', { limit: centsToDisplay(card.limitCents, locale) })}</small>
      </span>
      <span class="entity-row__actions">
        <button type="button" class="button button--small" data-invoices>${t('dashboard.seeInvoice')}</button>
        <button type="button" class="link-button link-button--muted" data-archive-id="${card.id}">${iconSvg(card.archived ? 'unarchive' : 'archive', { size: 14 })} ${card.archived ? t('common.unarchive') : t('common.archive')}</button>
      </span>
    </li>
  `;
}

function renderForm(container, activeSpace, accounts) {
  const slot = container.querySelector('#cards-modal-slot');
  const isEdit = formState.mode === 'edit';
  const card = formState.card;
  const close = () => {
    formState = null;
    render(container);
  };

  const modal = openModal(slot, {
    title: isEdit ? t('creditCards.form.titleEdit') : t('creditCards.form.titleCreate'),
    size: 'lg',
    onClose: close,
    body: `
      <form id="card-form" class="modal__body" novalidate>
        <div class="form-row">
          <div class="form-field">
            <label for="card-name">${t('creditCards.form.name')}</label>
            <input id="card-name" name="name" type="text" autocomplete="off" value="${isEdit ? escapeHtml(card.name) : ''}" />
          </div>
          <div class="form-field">
            <label for="card-brand">${t('creditCards.form.brand')}</label>
            <input id="card-brand" name="brand" type="text" autocomplete="off" placeholder="Visa, Mastercard…" value="${isEdit ? escapeHtml(card.brand || '') : ''}" />
          </div>
        </div>
        <div class="form-row">
          <div class="form-field">
            <label for="card-limit">${t('creditCards.form.limit')}</label>
            <input id="card-limit" name="limit" type="text" inputmode="numeric" data-money placeholder="0,00" value="${isEdit ? formatCentsForInput(card.limitCents, getLocale()) : ''}" />
          </div>
          <div class="form-field">
            <label for="card-payment-account">${t('creditCards.form.paymentAccount')}</label>
            <select id="card-payment-account" name="paymentAccountId">
              ${accounts.map((account) => `<option value="${account.id}" ${isEdit && card.paymentAccountId === account.id ? 'selected' : ''}>${escapeHtml(account.name)}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-field">
            <label for="card-closing-day">${t('creditCards.form.closingDay')}</label>
            <input id="card-closing-day" name="closingDay" type="number" min="1" max="31" value="${isEdit ? card.closingDay : ''}" />
          </div>
          <div class="form-field">
            <label for="card-due-day">${t('creditCards.form.dueDay')}</label>
            <input id="card-due-day" name="dueDay" type="number" min="1" max="31" value="${isEdit ? card.dueDay : ''}" />
          </div>
        </div>
        <div class="form-field">
          <label for="card-closing-rule">${t('creditCards.form.closingRule')}</label>
          <select id="card-closing-rule" name="closingDayRule">
            <option value="${CLOSING_DAY_RULES.CLOSES_ON_DAY}" ${isEdit && card.closingDayRule === CLOSING_DAY_RULES.CLOSES_ON_DAY ? 'selected' : ''}>${t('creditCards.closingRule.closesOnDay')}</option>
            <option value="${CLOSING_DAY_RULES.CLOSES_BEFORE_DAY}" ${isEdit && card.closingDayRule === CLOSING_DAY_RULES.CLOSES_BEFORE_DAY ? 'selected' : ''}>${t('creditCards.closingRule.closesBeforeDay')}</option>
          </select>
        </div>
        <div class="form-field">
          <span class="form-field__label">${t('creditCards.form.institution')}</span>
          ${institutionPickerHtml('institution', isEdit ? card.institution : null, t('accounts.form.institutionNone'))}
        </div>
        <p class="form-error" id="card-form-error" hidden></p>
        <div class="form-actions">
          <button type="button" id="card-form-cancel" class="button">${t('common.cancel')}</button>
          <button type="submit" class="button button--primary">${t('common.save')}</button>
        </div>
      </form>
    `,
  });

  modal.querySelector('#card-form-cancel').addEventListener('click', close);
  modal.querySelector('#card-name').focus();

  modal.querySelector('#card-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(event.target);
    const errorElement = modal.querySelector('#card-form-error');
    const showError = (message) => {
      errorElement.textContent = message;
      errorElement.hidden = false;
    };

    const name = String(formData.get('name') || '').trim();
    const brand = String(formData.get('brand') || '').trim();
    const closingDay = Number(formData.get('closingDay'));
    const dueDay = Number(formData.get('dueDay'));
    const closingDayRule = String(formData.get('closingDayRule'));
    const paymentAccountId = String(formData.get('paymentAccountId') || '');
    const limitCents = parseCurrencyInputToCents(String(formData.get('limit') || '0'));
    const institution = String(formData.get('institution') || '') || null;

    if (!isRequired(name)) return showError(t('creditCards.validation.nameRequired'));
    if (!isRequired(brand)) return showError(t('creditCards.validation.brandRequired'));
    if (!isValidDayOfMonth(closingDay) || !isValidDayOfMonth(dueDay)) return showError(t('creditCards.validation.dayInvalid'));
    if (!isRequired(paymentAccountId)) return showError(t('creditCards.validation.paymentAccountRequired'));
    if (limitCents <= 0) return showError(t('creditCards.validation.limitInvalid'));

    const payload = { name, brand, closingDay, dueDay, closingDayRule, paymentAccountId, limitCents, institution };
    if (isEdit) await updateCreditCard(card.id, payload);
    else await createCreditCard(activeSpace.id, payload);

    formState = null;
    render(container);
  });
}
