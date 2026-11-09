import { t, getLocale } from '../../core/i18n.js';
import { getActiveSpace } from '../../core/bootstrap.js';
import { listAccounts, createAccount, updateAccount, setAccountArchived, ACCOUNT_TYPES } from '../../services/accountRepository.js';
import { centsToDisplay, parseCurrencyInputToCents } from '../../utils/currency.js';
import { todayISODate } from '../../utils/dates.js';
import { isRequired, isValidISODate } from '../../utils/validation.js';
import { escapeHtml } from '../../utils/html.js';

let formState = null;

export async function render(container) {
  const activeSpace = await getActiveSpace();
  const accounts = activeSpace ? await listAccounts(activeSpace.id) : [];
  const locale = getLocale();

  container.innerHTML = `
    <section class="view">
      <div class="view__header">
        <h1>${t('modules.accounts.title')}</h1>
        <button type="button" id="accounts-new-button" class="button button--primary">${t('accounts.newButton')}</button>
      </div>
      <div id="accounts-form-slot"></div>
      ${accounts.length === 0 ? `<div class="empty-state"><p>${t('accounts.emptyState')}</p></div>` : renderTable(accounts, locale)}
    </section>
  `;

  container.querySelector('#accounts-new-button').addEventListener('click', () => {
    formState = { mode: 'create' };
    renderForm(container, activeSpace);
  });

  for (const button of container.querySelectorAll('[data-edit-id]')) {
    button.addEventListener('click', () => {
      formState = { mode: 'edit', account: accounts.find((account) => account.id === button.dataset.editId) };
      renderForm(container, activeSpace);
    });
  }

  for (const button of container.querySelectorAll('[data-archive-id]')) {
    button.addEventListener('click', async () => {
      const account = accounts.find((item) => item.id === button.dataset.archiveId);
      await setAccountArchived(account.id, !account.archived);
      render(container);
    });
  }

  if (formState) renderForm(container, activeSpace);
}

function renderTable(accounts, locale) {
  const rows = accounts
    .map(
      (account) => `
        <tr>
          <td>${escapeHtml(account.name)}${account.archived ? ` <span class="badge badge--muted">${t('common.archivedBadge')}</span>` : ''}</td>
          <td>${t(`accounts.type.${account.type}`)}</td>
          <td class="table__value">${centsToDisplay(account.balanceCents, locale)}</td>
          <td class="table__actions">
            <button type="button" class="link-button" data-edit-id="${account.id}">${t('common.edit')}</button>
            <button type="button" class="link-button" data-archive-id="${account.id}">${account.archived ? t('common.unarchive') : t('common.archive')}</button>
          </td>
        </tr>
      `
    )
    .join('');

  return `
    <table class="data-table">
      <thead>
        <tr>
          <th>${t('accounts.column.name')}</th>
          <th>${t('accounts.column.type')}</th>
          <th>${t('accounts.column.balance')}</th>
          <th>${t('common.actions')}</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderForm(container, activeSpace) {
  const slot = container.querySelector('#accounts-form-slot');
  const isEdit = formState.mode === 'edit';
  const account = formState.account;

  slot.innerHTML = `
    <form id="account-form" class="form-card">
      <h2>${isEdit ? t('accounts.form.titleEdit') : t('accounts.form.titleCreate')}</h2>
      <div class="form-field">
        <label for="account-name">${t('accounts.form.name')}</label>
        <input id="account-name" name="name" type="text" value="${isEdit ? escapeHtml(account.name) : ''}" />
      </div>
      <div class="form-field">
        <label for="account-type">${t('accounts.form.type')}</label>
        <select id="account-type" name="type">
          ${ACCOUNT_TYPES.map(
            (type) => `<option value="${type}" ${isEdit && account.type === type ? 'selected' : ''}>${t(`accounts.type.${type}`)}</option>`
          ).join('')}
        </select>
      </div>
      <div class="form-field">
        <label for="account-balance">${t('accounts.form.initialBalance')}</label>
        <input
          id="account-balance"
          name="initialBalance"
          type="text"
          inputmode="decimal"
          value="${isEdit ? (account.initialBalanceCents / 100).toFixed(2) : ''}"
          ${isEdit ? 'disabled' : ''}
        />
      </div>
      <div class="form-field">
        <label for="account-balance-date">${t('accounts.form.initialBalanceDate')}</label>
        <input
          id="account-balance-date"
          name="initialBalanceDate"
          type="date"
          value="${isEdit ? account.initialBalanceDate : todayISODate()}"
          ${isEdit ? 'disabled' : ''}
        />
      </div>
      <div class="form-field">
        <label for="account-color">${t('accounts.form.color')}</label>
        <input id="account-color" name="color" type="color" value="${isEdit && account.color ? account.color : '#2563eb'}" />
      </div>
      <p class="form-error" id="account-form-error" hidden></p>
      <div class="form-actions">
        <button type="submit" class="button button--primary">${t('common.save')}</button>
        <button type="button" id="account-form-cancel" class="button">${t('common.cancel')}</button>
      </div>
    </form>
  `;

  slot.querySelector('#account-form-cancel').addEventListener('click', () => {
    formState = null;
    render(container);
  });

  slot.querySelector('#account-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(event.target);
    const errorElement = slot.querySelector('#account-form-error');
    const name = String(formData.get('name') || '').trim();
    const type = String(formData.get('type'));
    const color = String(formData.get('color'));

    if (!isRequired(name)) {
      errorElement.textContent = t('accounts.validation.nameRequired');
      errorElement.hidden = false;
      return;
    }

    if (isEdit) {
      await updateAccount(account.id, { name, type, color });
    } else {
      const initialBalanceCents = parseCurrencyInputToCents(String(formData.get('initialBalance') || '0'));
      const initialBalanceDate = String(formData.get('initialBalanceDate'));
      if (!isValidISODate(initialBalanceDate)) {
        errorElement.textContent = t('accounts.validation.initialBalanceDateInvalid');
        errorElement.hidden = false;
        return;
      }
      await createAccount(activeSpace.id, { name, type, color, initialBalanceCents, initialBalanceDate });
    }

    formState = null;
    render(container);
  });
}
