import { getAllByIndex, putRecord, getRecord } from '../core/database.js';
import { getCurrentUser } from '../core/auth.js';
import { createId } from '../utils/ids.js';
import { nowISOTimestamp } from '../utils/dates.js';
import { listInvoices, calculateCardUsageCents } from './invoiceRepository.js';
import { pendingInstallmentCentsByCard } from './transactionRepository.js';

// Comportamento no próprio dia do fechamento varia por administradora (seção 6); configurável
// por cartão.
export const CLOSING_DAY_RULES = Object.freeze({
  CLOSES_ON_DAY: 'closes_on_day',
  CLOSES_BEFORE_DAY: 'closes_before_day',
});

export async function listCreditCards(spaceId) {
  const cards = (await getAllByIndex('creditCards', 'bySpace', spaceId)).filter((card) => !card.deletedAt);
  return cards.sort((a, b) => a.name.localeCompare(b.name));
}

// Limite utilizado = soma das faturas ainda não pagas do cartão (seção 6); nunca armazenado,
// sempre recalculado a partir das faturas/lançamentos, como o saldo de conta. Parcelas de compras
// parceladas cujos meses ainda não foram visualizados (e por isso ainda não foram geradas) também
// entram: comprometem o limite desde a compra, como em qualquer cartão.
export async function listCreditCardsWithUsage(spaceId) {
  const [cards, invoices, pendingByCard] = await Promise.all([listCreditCards(spaceId), listInvoices(spaceId), pendingInstallmentCentsByCard(spaceId)]);
  return cards.map((card) => {
    const cardInvoices = invoices.filter((invoice) => invoice.creditCardId === card.id);
    const usedCents = calculateCardUsageCents(cardInvoices) + (pendingByCard.get(card.id) || 0);
    return { ...card, usedCents, availableCents: card.limitCents - usedCents };
  });
}

export async function createCreditCard(spaceId, input) {
  const user = getCurrentUser();
  const createdAt = nowISOTimestamp();
  const card = {
    id: createId(),
    spaceId,
    name: input.name.trim(),
    brand: input.brand.trim(),
    limitCents: input.limitCents,
    closingDay: input.closingDay,
    dueDay: input.dueDay,
    closingDayRule: input.closingDayRule,
    paymentAccountId: input.paymentAccountId,
    archived: false,
    createdAt,
    updatedAt: createdAt,
    createdBy: user.uid,
    updatedBy: user.uid,
    deletedAt: null,
    version: 1,
  };
  await putRecord('creditCards', card);
  return card;
}

export async function updateCreditCard(cardId, changes) {
  const user = getCurrentUser();
  const card = await getRecord('creditCards', cardId);
  if (!card) throw new Error('Cartão não encontrado.');
  const updated = { ...card, ...changes, updatedAt: nowISOTimestamp(), updatedBy: user.uid, version: card.version + 1 };
  await putRecord('creditCards', updated);
  return updated;
}

export async function setCreditCardArchived(cardId, archived) {
  return updateCreditCard(cardId, { archived });
}
