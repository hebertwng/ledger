import { getAllByIndex, putRecord, getRecord } from '../core/database.js';
import { getCurrentUser } from '../core/auth.js';
import { createId } from '../utils/ids.js';
import { nowISOTimestamp, todayISODate } from '../utils/dates.js';

function daysInMonth(year, monthIndexZeroBased) {
  return new Date(Date.UTC(year, monthIndexZeroBased + 1, 0)).getUTCDate();
}

function formatYearMonth(year, monthIndexZeroBased) {
  return `${year}-${String(monthIndexZeroBased + 1).padStart(2, '0')}`;
}

// Pura: decide em qual "mês de referência" (fatura) uma compra cai, a partir do dia de
// fechamento do cartão e da regra configurada para o próprio dia do fechamento (seção 6) —
// o comportamento varia por administradora, por isso é configurável por cartão.
export function resolveInvoiceReferenceMonth(purchaseDate, closingDay, closingDayRule) {
  const [year, month, day] = purchaseDate.split('-').map(Number);
  const monthIndex = month - 1;
  const belongsToCurrentClosing = closingDayRule === 'closes_on_day' ? day <= closingDay : day < closingDay;
  if (belongsToCurrentClosing) return formatYearMonth(year, monthIndex);
  const nextMonthIndex = monthIndex + 1;
  const nextYear = year + Math.floor(nextMonthIndex / 12);
  return formatYearMonth(nextYear, nextMonthIndex % 12);
}

export function computeClosingDate(referenceMonth, closingDay) {
  const [year, month] = referenceMonth.split('-').map(Number);
  const day = Math.min(closingDay, daysInMonth(year, month - 1));
  return `${referenceMonth}-${String(day).padStart(2, '0')}`;
}

// Vencimento: quando o dia de vencimento é maior que o de fechamento, cai no mesmo mês da
// fatura; caso contrário, cai no mês seguinte — convenção usual entre administradoras
// (ex.: fecha dia 28, vence dia 5 do mês seguinte).
export function computeDueDate(referenceMonth, closingDay, dueDay) {
  const [year, month] = referenceMonth.split('-').map(Number);
  const monthIndex = month - 1;
  const targetMonthIndex = dueDay > closingDay ? monthIndex : monthIndex + 1;
  const targetYear = year + Math.floor(targetMonthIndex / 12);
  const normalizedMonthIndex = ((targetMonthIndex % 12) + 12) % 12;
  const day = Math.min(dueDay, daysInMonth(targetYear, normalizedMonthIndex));
  return `${targetYear}-${String(normalizedMonthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function resolveInvoiceStatus(invoice, referenceTodayISODate) {
  if (invoice.paidAt) return 'paid';
  return referenceTodayISODate > invoice.closingDate ? 'closed' : 'open';
}

// Pura: total da fatura = soma das compras vinculadas (sempre despesas, armazenadas como
// valor negativo); o total exibido é positivo, o quanto se deve. Nunca armazenado como campo
// mutável — sempre recalculado a partir dos lançamentos, como o saldo de conta (seção 5/6).
export function calculateInvoiceTotalCents(invoiceId, transactions) {
  return transactions
    .filter((transaction) => transaction.invoiceId === invoiceId && !transaction.deletedAt && transaction.status !== 'cancelled')
    .reduce((sum, transaction) => sum - transaction.amountCents, 0);
}

// Pura: limite utilizado = soma das faturas ainda não pagas (abertas + fechadas) de um cartão.
export function calculateCardUsageCents(cardInvoicesWithTotals) {
  return cardInvoicesWithTotals.filter((invoice) => invoice.status !== 'paid').reduce((sum, invoice) => sum + invoice.totalCents, 0);
}

export function isInvoiceLocked(invoice) {
  return Boolean(invoice.paidAt);
}

export async function getOrCreateInvoice(spaceId, card, purchaseDate) {
  const referenceMonth = resolveInvoiceReferenceMonth(purchaseDate, card.closingDay, card.closingDayRule);
  const existing = (await getAllByIndex('invoices', 'byCreditCard', card.id)).find(
    (invoice) => invoice.referenceMonth === referenceMonth && !invoice.deletedAt
  );
  if (existing) return existing;

  const user = getCurrentUser();
  const timestamp = nowISOTimestamp();
  const invoice = {
    id: createId(),
    spaceId,
    creditCardId: card.id,
    referenceMonth,
    closingDate: computeClosingDate(referenceMonth, card.closingDay),
    dueDate: computeDueDate(referenceMonth, card.closingDay, card.dueDay),
    paidAt: null,
    paidFromAccountId: null,
    paidAmountCents: null,
    paymentTransactionId: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    createdBy: user.uid,
    updatedBy: user.uid,
    deletedAt: null,
    version: 1,
  };
  await putRecord('invoices', invoice);
  return invoice;
}

export async function listInvoices(spaceId) {
  const [invoices, transactions] = await Promise.all([
    getAllByIndex('invoices', 'bySpace', spaceId),
    getAllByIndex('transactions', 'bySpace', spaceId),
  ]);
  const today = todayISODate();

  return invoices
    .filter((invoice) => !invoice.deletedAt)
    .map((invoice) => ({
      ...invoice,
      status: resolveInvoiceStatus(invoice, today),
      totalCents: invoice.paidAt ? invoice.paidAmountCents : calculateInvoiceTotalCents(invoice.id, transactions),
    }))
    .sort((a, b) => (a.referenceMonth < b.referenceMonth ? 1 : -1));
}

export async function payInvoice(spaceId, invoiceId, { accountId, paymentDate }) {
  const invoice = await getRecord('invoices', invoiceId);
  if (!invoice) throw new Error('Fatura não encontrada.');
  if (invoice.paidAt) throw new Error('Fatura já paga.');

  const transactions = await getAllByIndex('transactions', 'bySpace', spaceId);
  const totalCents = calculateInvoiceTotalCents(invoiceId, transactions);
  const user = getCurrentUser();
  const timestamp = nowISOTimestamp();

  // Pagamento de fatura é a liquidação de uma obrigação, não uma nova despesa — por isso o
  // "kind" é 'invoice_payment', não 'expense' (seção 6): reduz o saldo da conta pagadora, mas
  // nunca é contado de novo como despesa nos relatórios, evitando duplicidade.
  const paymentTransaction = {
    id: createId(),
    spaceId,
    kind: 'invoice_payment',
    description: '',
    amountCents: -totalCents,
    date: paymentDate,
    categoryId: null,
    accountId,
    creditCardId: invoice.creditCardId,
    invoiceId: invoice.id,
    status: 'paid',
    seriesId: null,
    installmentNumber: null,
    transferPairId: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    createdBy: user.uid,
    updatedBy: user.uid,
    deletedAt: null,
    version: 1,
  };
  await putRecord('transactions', paymentTransaction);

  // Marca as compras da fatura como "pagas": isso as protege automaticamente de edição/
  // exclusão em massa pelo mesmo mecanismo que já preserva lançamentos pagos/recebidos
  // (seção 11), sem precisar de uma trava separada — a "proteção especial" da seção 6 é essa
  // mesma confirmação, nunca um bloqueio silencioso.
  const purchases = transactions.filter(
    (transaction) => transaction.invoiceId === invoiceId && !transaction.deletedAt && transaction.status !== 'paid' && transaction.status !== 'received'
  );
  for (const purchase of purchases) {
    await putRecord('transactions', { ...purchase, status: 'paid', updatedAt: timestamp, updatedBy: user.uid, version: purchase.version + 1 });
  }

  const updatedInvoice = {
    ...invoice,
    paidAt: timestamp,
    paidFromAccountId: accountId,
    paidAmountCents: totalCents,
    paymentTransactionId: paymentTransaction.id,
    updatedAt: timestamp,
    updatedBy: user.uid,
    version: invoice.version + 1,
  };
  await putRecord('invoices', updatedInvoice);
  return updatedInvoice;
}
