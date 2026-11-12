import { t, getLocale } from '../../core/i18n.js';
import { iconSvg } from '../../utils/icons.js';
import { formatCentsForInput } from '../../utils/moneyInput.js';
import { getActiveSpace } from '../../core/bootstrap.js';
import { listAccounts } from '../../services/accountRepository.js';
import { listTransfers, createTransfer, updateTransfer, deleteTransfer } from '../../services/transferRepository.js';
import { centsToDisplay, parseCurrencyInputToCents } from '../../utils/currency.js';
import { todayISODate, formatDateDisplay } from '../../utils/dates.js';
import { isValidISODate } from '../../utils/validation.js';
import { escapeHtml } from '../../utils/html.js';
import { mascotReact } from '../../core/mascot.js';
import { confirmDialog } from '../../utils/ui.js';

let formState = null;

export async function render(container) {
  const activeSpace = await getActiveSpace();
  const [transfers, accounts] = activeSpace
    ? await Promise.all([listTransfers(activeSpace.id), listAccounts(activeSpace.id)])
    : [[], []];
  const locale = getLocale();
  const accountsById = new Map(accounts.map((account) => [account.id, account]));
  const canCreate = accounts.length >= 2;

  container.innerHTML = `
    <section class="view">
      <div class="view__header">
        <h1>${t('modules.transfers.title')}</h1>
        <button type="button" id="transfers-new-button" class="button button--primary" ${canCreate ? '' : 'disabled'}>${t('transfers.newButton')}</button>
      </div>
      ${canCreate ? '' : `<div class="form-note"><p>${t('transfers.noAccountsWarning')}</p></div>`}
      <div id="transfers-form-slot"></div>
      ${transfers.length === 0 ? `<div class="empty-state"><p>${t('transfers.emptyState')}</p></div>` : renderTable(transfers, accountsById, locale)}
    </section>
  `;

  const newButton = container.querySelector('#transfers-new-button');
  if (canCreate) {
    newButton.addEventListener('click', () => {
      formState = { mode: 'create' };
      renderForm(container, activeSpace, accounts);
    });
  }

  for (const button of container.querySelectorAll('[data-edit-id]')) {
    button.addEventListener('click', () => {
      formState = { mode: 'edit', transfer: transfers.find((transfer) => transfer.id === button.dataset.editId) };
      renderForm(container, activeSpace, accounts);
    });
  }

  for (const button of container.querySelectorAll('[data-delete-id]')) {
    button.addEventListener('click', async () => {
      if (!(await confirmDialog(t('transfers.deleteConfirm')))) return;
      await deleteTransfer(button.dataset.deleteId);
      render(container);
    });
  }

  if (formState) renderForm(container, activeSpace, accounts);
}

function renderTable(transfers, accountsById, locale) {
  const rows = transfers
    .map((transfer) => {
      const fromName = accountsById.get(transfer.fromAccountId)?.name || '-';
      const toName = accountsById.get(transfer.toAccountId)?.name || '-';
      return `
        <tr>
          <td>${formatDateDisplay(transfer.date, locale)}</td>
          <td>${escapeHtml(fromName)}</td>
          <td>${escapeHtml(toName)}</td>
          <td class="table__value">${centsToDisplay(transfer.amountCents, locale)}</td>
          <td>${escapeHtml(transfer.description || '')}</td>
          <td class="table__actions">
            <button type="button" class="link-button" data-edit-id="${transfer.id}">${iconSvg('pencil', { size: 14 })} ${t('common.edit')}</button>
            <button type="button" class="link-button link-button--danger" data-delete-id="${transfer.id}">${iconSvg('trash', { size: 14 })} ${t('common.delete')}</button>
          </td>
        </tr>
      `;
    })
    .join('');

  return `
    <table class="data-table">
      <thead>
        <tr>
          <th>${t('transfers.column.date')}</th>
          <th>${t('transfers.column.from')}</th>
          <th>${t('transfers.column.to')}</th>
          <th>${t('transfers.column.amount')}</th>
          <th>${t('transfers.column.description')}</th>
          <th>${t('common.actions')}</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderForm(container, activeSpace, accounts) {
  const slot = container.querySelector('#transfers-form-slot');
  const isEdit = formState.mode === 'edit';
  const transfer = formState.transfer;

  const accountOption = (account, selectedId) =>
    `<option value="${account.id}" ${selectedId === account.id ? 'selected' : ''}>${escapeHtml(account.name)}</option>`;

  slot.innerHTML = `
    <form id="transfer-form" class="form-card">
      <h2>${isEdit ? t('transfers.form.titleEdit') : t('transfers.form.titleCreate')}</h2>
      <div class="form-field">
        <label for="transfer-from">${t('transfers.form.fromAccount')}</label>
        <select id="transfer-from" name="fromAccountId">
          ${accounts.map((account) => accountOption(account, isEdit ? transfer.fromAccountId : accounts[0].id)).join('')}
        </select>
      </div>
      <div class="form-field">
        <label for="transfer-to">${t('transfers.form.toAccount')}</label>
        <select id="transfer-to" name="toAccountId">
          ${accounts.map((account) => accountOption(account, isEdit ? transfer.toAccountId : accounts[1].id)).join('')}
        </select>
      </div>
      <div class="form-field">
        <label for="transfer-amount">${t('transfers.form.amount')}</label>
        <input id="transfer-amount" name="amount" type="text" inputmode="numeric" data-money value="${isEdit ? formatCentsForInput(transfer.amountCents, getLocale()) : ''}" />
      </div>
      <div class="form-field">
        <label for="transfer-date">${t('transfers.form.date')}</label>
        <input id="transfer-date" name="date" type="date" value="${isEdit ? transfer.date : todayISODate()}" />
      </div>
      <div class="form-field">
        <label for="transfer-description">${t('transfers.form.description')}</label>
        <input id="transfer-description" name="description" type="text" value="${isEdit ? escapeHtml(transfer.description || '') : ''}" />
      </div>
      <p class="form-error" id="transfer-form-error" hidden></p>
      <div class="form-actions">
        <button type="submit" class="button button--primary">${t('common.save')}</button>
        <button type="button" id="transfer-form-cancel" class="button">${t('common.cancel')}</button>
      </div>
    </form>
  `;

  slot.querySelector('#transfer-form-cancel').addEventListener('click', () => {
    formState = null;
    render(container);
  });

  slot.querySelector('#transfer-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(event.target);
    const errorElement = slot.querySelector('#transfer-form-error');

    const fromAccountId = String(formData.get('fromAccountId'));
    const toAccountId = String(formData.get('toAccountId'));
    const date = String(formData.get('date'));
    const description = String(formData.get('description') || '').trim();
    const amountCents = parseCurrencyInputToCents(String(formData.get('amount') || '0'));

    const showError = (message) => {
      errorElement.textContent = message;
      errorElement.hidden = false;
    };

    if (fromAccountId === toAccountId) return showError(t('transfers.validation.sameAccount'));
    if (amountCents <= 0) return showError(t('transfers.validation.amountInvalid'));
    if (!isValidISODate(date)) return showError(t('transfers.validation.dateInvalid'));

    const payload = { fromAccountId, toAccountId, amountCents, date, description };

    if (isEdit) {
      await updateTransfer(transfer.id, payload);
    } else {
      await createTransfer(activeSpace.id, payload);
      // Ledi: para poupança/investimento guarda no cofrinho; entre contas comuns, aprova.
      const destination = accounts.find((account) => account.id === toAccountId);
      mascotReact('transferCreated', { toAccountType: destination?.type });
    }

    formState = null;
    render(container);
  });
}
