import { t, getLocale } from '../../core/i18n.js';
import { formatCentsForInput } from '../../utils/moneyInput.js';
import { getActiveSpace } from '../../core/bootstrap.js';
import { listAccounts, createAccount, updateAccount, setAccountArchived, ACCOUNT_TYPES } from '../../services/accountRepository.js';
import { centsToDisplay, parseCurrencyInputToCents } from '../../utils/currency.js';
import { todayISODate } from '../../utils/dates.js';
import { isRequired, isValidISODate } from '../../utils/validation.js';
import { escapeHtml } from '../../utils/html.js';
import { iconSvg } from '../../utils/icons.js';
import { institutionIconHtml, institutionPickerHtml, openModal } from '../../utils/ui.js';

let formState = null;

export async function render(container) {
  const activeSpace = await getActiveSpace();
  const accounts = activeSpace ? await listAccounts(activeSpace.id) : [];
  const locale = getLocale();
  const active = accounts.filter((account) => !account.archived);
  const archived = accounts.filter((account) => account.archived);

  container.innerHTML = `
    <section class="view">
      <div class="view__header">
        <h1>${t('modules.accounts.title')}</h1>
        <button type="button" id="accounts-new-button" class="button button--soft">${iconSvg('plusCircle', { size: 18 })} ${t('accounts.newButton')}</button>
      </div>
      ${active.length === 0 ? `<div class="empty-state"><span class="empty-state__icon">${iconSvg('accounts', { size: 22 })}</span><p>${t('accounts.emptyState')}</p></div>` : `<ul class="entity-list">${active.map((account) => rowHtml(account, locale)).join('')}</ul>`}
      ${
        archived.length
          ? `<p class="section-title">${iconSvg('folder', { size: 16 })} ${t('accounts.archivedTitle')}</p><ul class="entity-list">${archived.map((account) => rowHtml(account, locale)).join('')}</ul>`
          : ''
      }
      <div id="accounts-modal-slot"></div>
    </section>
  `;

  container.querySelector('#accounts-new-button').addEventListener('click', () => {
    formState = { mode: 'create' };
    renderForm(container, activeSpace);
  });

  for (const element of container.querySelectorAll('[data-edit-id]')) {
    element.addEventListener('click', (event) => {
      if (event.target.closest('button')) return;
      formState = { mode: 'edit', account: accounts.find((account) => account.id === element.dataset.editId) };
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

function rowHtml(account, locale) {
  return `
    <li class="entity-row entity-row--clickable ${account.archived ? 'is-archived' : ''}" data-edit-id="${account.id}" tabindex="0">
      ${institutionIconHtml(account, { size: 40 })}
      <span class="entity-row__main">
        <span class="entity-row__title">${escapeHtml(account.name)}</span>
        <span class="entity-row__subtitle">${t(`accounts.type.${account.type}`)}</span>
      </span>
      <span class="entity-row__value ${account.confirmedBalanceCents < 0 ? 'amount--expense' : ''}">
        ${centsToDisplay(account.confirmedBalanceCents, locale)}
        <small>${t('dashboard.projectedBalance')}: ${centsToDisplay(account.balanceCents, locale)}</small>
      </span>
      <span class="entity-row__actions">
        <button type="button" class="link-button link-button--muted" data-archive-id="${account.id}">${iconSvg(account.archived ? 'unarchive' : 'archive', { size: 14 })} ${account.archived ? t('common.unarchive') : t('common.archive')}</button>
      </span>
    </li>
  `;
}

function renderForm(container, activeSpace) {
  const slot = container.querySelector('#accounts-modal-slot');
  const isEdit = formState.mode === 'edit';
  const account = formState.account;
  const close = () => {
    formState = null;
    render(container);
  };

  const modal = openModal(slot, {
    title: isEdit ? t('accounts.form.titleEdit') : t('accounts.form.titleCreate'),
    size: 'lg',
    onClose: close,
    body: `
      <form id="account-form" class="modal__body" novalidate>
        <div class="form-row">
          <div class="form-field">
            <label for="account-name">${t('accounts.form.name')}</label>
            <input id="account-name" name="name" type="text" autocomplete="off" value="${isEdit ? escapeHtml(account.name) : ''}" />
          </div>
          <div class="form-field">
            <label for="account-type">${t('accounts.form.type')}</label>
            <select id="account-type" name="type">
              ${ACCOUNT_TYPES.map((type) => `<option value="${type}" ${isEdit && account.type === type ? 'selected' : ''}>${t(`accounts.type.${type}`)}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-field">
            <label for="account-balance">${t('accounts.form.initialBalance')}</label>
            <input id="account-balance" name="initialBalance" type="text" inputmode="numeric" data-money data-money-negative placeholder="0,00" value="${isEdit ? formatCentsForInput(account.initialBalanceCents, getLocale()) : ''}" ${isEdit ? 'disabled' : ''} />
          </div>
          <div class="form-field">
            <label for="account-balance-date">${t('accounts.form.initialBalanceDate')}</label>
            <input id="account-balance-date" name="initialBalanceDate" type="date" value="${isEdit ? account.initialBalanceDate : todayISODate()}" ${isEdit ? 'disabled' : ''} />
          </div>
        </div>
        <div class="form-field">
          <span class="form-field__label">${t('accounts.form.institution')}</span>
          ${institutionPickerHtml('institution', isEdit ? account.institution : null, t('accounts.form.institutionNone'))}
        </div>
        <p class="form-error" id="account-form-error" hidden></p>
        <div class="form-actions">
          <button type="button" id="account-form-cancel" class="button">${t('common.cancel')}</button>
          <button type="submit" class="button button--primary">${t('common.save')}</button>
        </div>
      </form>
    `,
  });

  modal.querySelector('#account-form-cancel').addEventListener('click', close);
  modal.querySelector('#account-name').focus();

  modal.querySelector('#account-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(event.target);
    const errorElement = modal.querySelector('#account-form-error');
    const showError = (message) => {
      errorElement.textContent = message;
      errorElement.hidden = false;
    };
    const name = String(formData.get('name') || '').trim();
    const type = String(formData.get('type'));
    const institution = String(formData.get('institution') || '') || null;

    if (!isRequired(name)) return showError(t('accounts.validation.nameRequired'));

    if (isEdit) {
      await updateAccount(account.id, { name, type, institution });
    } else {
      const initialBalanceCents = parseCurrencyInputToCents(String(formData.get('initialBalance') || '0'));
      const initialBalanceDate = String(formData.get('initialBalanceDate'));
      if (!isValidISODate(initialBalanceDate)) return showError(t('accounts.validation.initialBalanceDateInvalid'));
      await createAccount(activeSpace.id, { name, type, institution, initialBalanceCents, initialBalanceDate });
    }

    formState = null;
    render(container);
  });
}
