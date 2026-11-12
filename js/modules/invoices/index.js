import { t, getLocale } from '../../core/i18n.js';
import { iconSvg } from '../../utils/icons.js';
import { getActiveSpace } from '../../core/bootstrap.js';
import { listAccounts } from '../../services/accountRepository.js';
import { listCreditCards } from '../../services/creditCardRepository.js';
import { listInvoices, payInvoice } from '../../services/invoiceRepository.js';
import { listTransactions } from '../../services/transactionRepository.js';
import { getAllByIndex } from '../../core/database.js';
import { centsToDisplay } from '../../utils/currency.js';
import { todayISODate, formatDateDisplay, formatReferenceMonth } from '../../utils/dates.js';
import { escapeHtml } from '../../utils/html.js';
import { mascotReact } from '../../core/mascot.js';

let payState = null;
let expandedInvoiceId = null;

export async function render(container) {
  const activeSpace = await getActiveSpace();
  const [cards, accounts, invoices, allTransactions] = activeSpace
    ? await Promise.all([
        listCreditCards(activeSpace.id),
        listAccounts(activeSpace.id),
        listInvoices(activeSpace.id),
        getAllByIndex('transactions', 'bySpace', activeSpace.id),
      ])
    : [[], [], [], []];

  const context = {
    container,
    activeSpace,
    cards,
    accounts,
    invoices,
    transactions: allTransactions.filter((transaction) => !transaction.deletedAt),
    cardsById: new Map(cards.map((card) => [card.id, card])),
  };

  container.innerHTML = `
    <section class="view">
      <div class="view__header">
        <h1>${t('invoices.title')}</h1>
      </div>
      ${cards.length === 0 ? `<div class="form-note"><p>${t('invoices.noCardsWarning')}</p></div>` : ''}
      <div id="invoices-pay-slot"></div>
      ${invoices.length === 0 ? `<div class="empty-state"><p>${t('invoices.emptyState')}</p></div>` : renderTable(context)}
    </section>
  `;

  wireRows(context);
  if (payState) renderPayForm(context);
}

function renderTable(context) {
  const { invoices, cardsById, transactions } = context;
  const locale = getLocale();

  const rows = invoices
    .map((invoice) => {
      const card = cardsById.get(invoice.creditCardId);
      const purchases = transactions.filter((transaction) => transaction.invoiceId === invoice.id && transaction.kind !== 'invoice_payment');
      const isExpanded = expandedInvoiceId === invoice.id;

      const purchasesRow = isExpanded
        ? `
          <tr class="invoice-purchases-row">
            <td colspan="7">
              ${
                purchases.length === 0
                  ? `<p class="empty-state__note">${t('invoices.noPurchases')}</p>`
                  : `
                    <table class="data-table">
                      <thead>
                        <tr>
                          <th>${t('transactions.column.date')}</th>
                          <th>${t('transactions.column.description')}</th>
                          <th>${t('transactions.column.amount')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${purchases
                          .map(
                            (purchase) => `
                              <tr>
                                <td>${formatDateDisplay(purchase.date, locale)}</td>
                                <td>${escapeHtml(purchase.description || '')}</td>
                                <td class="table__value">${centsToDisplay(purchase.amountCents, locale)}</td>
                              </tr>
                            `
                          )
                          .join('')}
                      </tbody>
                    </table>
                  `
              }
            </td>
          </tr>
        `
        : '';

      return `
        <tr>
          <td>${card ? escapeHtml(card.name) : '-'}</td>
          <td>${formatReferenceMonth(invoice.referenceMonth, locale)}</td>
          <td>${formatDateDisplay(invoice.closingDate, locale)}</td>
          <td>${formatDateDisplay(invoice.dueDate, locale)}</td>
          <td class="table__value">${centsToDisplay(invoice.totalCents, locale)}</td>
          <td>
            ${t(`invoices.status.${invoice.status}`)}
            ${invoice.status === 'paid' ? `<div class="empty-state__note">${t('invoices.paidOn', { date: formatDateDisplay(invoice.paidAt?.slice(0, 10), locale) })}</div>` : ''}
          </td>
          <td class="table__actions">
            <button type="button" class="link-button" data-toggle-id="${invoice.id}">${iconSvg(isExpanded ? 'chevronUp' : 'chevronDown', { size: 14 })} ${isExpanded ? t('invoices.hidePurchasesButton') : t('invoices.viewPurchasesButton')}</button>
            ${invoice.status !== 'paid' ? `<button type="button" class="link-button link-button--primary" data-pay-id="${invoice.id}">${iconSvg('check', { size: 14 })} ${t('invoices.payButton')}</button>` : ''}
          </td>
        </tr>
        ${purchasesRow}
      `;
    })
    .join('');

  return `
    <table class="data-table">
      <thead>
        <tr>
          <th>${t('invoices.column.card')}</th>
          <th>${t('invoices.column.period')}</th>
          <th>${t('invoices.column.closingDate')}</th>
          <th>${t('invoices.column.dueDate')}</th>
          <th>${t('invoices.column.total')}</th>
          <th>${t('invoices.column.status')}</th>
          <th>${t('common.actions')}</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function wireRows(context) {
  for (const button of context.container.querySelectorAll('[data-toggle-id]')) {
    button.addEventListener('click', () => {
      expandedInvoiceId = expandedInvoiceId === button.dataset.toggleId ? null : button.dataset.toggleId;
      render(context.container);
    });
  }
  for (const button of context.container.querySelectorAll('[data-pay-id]')) {
    button.addEventListener('click', () => {
      payState = { invoice: context.invoices.find((invoice) => invoice.id === button.dataset.payId) };
      renderPayForm(context);
    });
  }
}

function renderPayForm(context) {
  const slot = context.container.querySelector('#invoices-pay-slot');
  const { invoice } = payState;
  const card = context.cardsById.get(invoice.creditCardId);
  const locale = getLocale();

  slot.innerHTML = `
    <form id="invoice-pay-form" class="form-card">
      <h2>${t('invoices.payForm.title')}</h2>
      <p>${card ? escapeHtml(card.name) : ''} · ${formatReferenceMonth(invoice.referenceMonth, locale)}</p>
      <p class="card__value">${centsToDisplay(invoice.totalCents, locale)}</p>
      <div class="form-field">
        <label for="pay-account">${t('invoices.payForm.account')}</label>
        <select id="pay-account" name="accountId">
          ${context.accounts
            .map((account) => `<option value="${account.id}" ${account.id === card?.paymentAccountId ? 'selected' : ''}>${escapeHtml(account.name)}</option>`)
            .join('')}
        </select>
      </div>
      <div class="form-field">
        <label for="pay-date">${t('invoices.payForm.date')}</label>
        <input id="pay-date" name="date" type="date" value="${todayISODate()}" />
      </div>
      <div class="form-actions">
        <button type="submit" class="button button--primary">${t('invoices.payForm.confirm')}</button>
        <button type="button" id="pay-form-cancel" class="button">${t('common.cancel')}</button>
      </div>
    </form>
  `;

  slot.querySelector('#pay-form-cancel').addEventListener('click', () => {
    payState = null;
    render(context.container);
  });

  slot.querySelector('#invoice-pay-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(event.target);
    const accountId = String(formData.get('accountId'));
    const paymentDate = String(formData.get('date'));

    try {
      await payInvoice(context.activeSpace.id, invoice.id, { accountId, paymentDate });
    } catch (error) {
      mascotReact('error', { message: error.message });
      return;
    }
    payState = null;
    render(context.container);
    mascotReact('invoicePaid');
  });
}
