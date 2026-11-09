import { getAllByIndex, putRecord, getRecord } from '../core/database.js';
import { getCurrentUser } from '../core/auth.js';
import { createId } from '../utils/ids.js';
import { nowISOTimestamp, todayISODate } from '../utils/dates.js';
import { buildInstallmentAmounts, buildInstallmentDates, buildRecurringDates, addMonths } from '../utils/recurrence.js';
import { getOrCreateInvoice } from './invoiceRepository.js';

export const TRANSACTION_STATUSES = Object.freeze(['pending', 'paid', 'received', 'cancelled']);
export const RECURRENCE_FREQUENCIES = Object.freeze(['weekly', 'monthly', 'annual']);
const PAID_STATUSES = new Set(['paid', 'received']);
const RECURRING_HORIZON_MONTHS = 12;

function isPaid(transaction) {
  return PAID_STATUSES.has(transaction.status);
}

function signedAmount(kind, amountCents) {
  return kind === 'expense' ? -Math.abs(amountCents) : Math.abs(amountCents);
}

function baseTransactionFields({ spaceId, userId, timestamp }) {
  return {
    spaceId,
    creditCardId: null,
    invoiceId: null,
    transferPairId: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    createdBy: userId,
    updatedBy: userId,
    deletedAt: null,
    version: 1,
  };
}

// Resolve a conta OU o cartão de um lançamento para uma data específica. Uma compra no cartão
// sempre gera/reaproveita a fatura correspondente (seção 6); a UI garante que só despesas
// podem ser lançadas no cartão (não existe "receita no cartão").
async function resolvePaymentTarget(spaceId, input, date) {
  if (input.creditCardId) {
    const card = await getRecord('creditCards', input.creditCardId);
    const invoice = await getOrCreateInvoice(spaceId, card, date);
    return { accountId: null, creditCardId: card.id, invoiceId: invoice.id };
  }
  return { accountId: input.accountId, creditCardId: null, invoiceId: null };
}

export async function listSeries(spaceId) {
  return (await getAllByIndex('transactionSeries', 'bySpace', spaceId)).filter((series) => !series.deletedAt);
}

// Lista apenas receitas/despesas "comuns" — transferências e pagamentos de fatura têm suas
// próprias telas dedicadas (Transferências/Faturas) e não entram aqui, para não serem editados
// pelo formulário genérico de lançamento (que não sabe manter a consistência desses casos).
export async function listTransactions(spaceId) {
  const transactions = (await getAllByIndex('transactions', 'bySpace', spaceId)).filter(
    (transaction) => !transaction.deletedAt && (transaction.kind === 'income' || transaction.kind === 'expense')
  );
  return sortTransactions(transactions, 'date');
}

// Pura: aplica os filtros combináveis da seção 16 sobre uma lista de lançamentos já carregada.
export function filterTransactions(transactions, filters = {}) {
  return transactions.filter((transaction) => {
    if (filters.kind && transaction.kind !== filters.kind) return false;
    if (filters.accountId && transaction.accountId !== filters.accountId) return false;
    if (filters.creditCardId && transaction.creditCardId !== filters.creditCardId) return false;
    if (filters.categoryId && transaction.categoryId !== filters.categoryId) return false;
    if (filters.status && transaction.status !== filters.status) return false;
    if (filters.startDate && transaction.date < filters.startDate) return false;
    if (filters.endDate && transaction.date > filters.endDate) return false;
    if (typeof filters.minAmountCents === 'number' && Math.abs(transaction.amountCents) < filters.minAmountCents) return false;
    if (typeof filters.maxAmountCents === 'number' && Math.abs(transaction.amountCents) > filters.maxAmountCents) return false;
    if (filters.onlyRecurring && !transaction.seriesId) return false;
    if (filters.text) {
      const needle = filters.text.trim().toLowerCase();
      if (needle && !(transaction.description || '').toLowerCase().includes(needle)) return false;
    }
    return true;
  });
}

export function sortTransactions(transactions, sortBy = 'date') {
  const sorted = [...transactions];
  if (sortBy === 'amount') sorted.sort((a, b) => Math.abs(b.amountCents) - Math.abs(a.amountCents));
  else if (sortBy === 'description') sorted.sort((a, b) => (a.description || '').localeCompare(b.description || ''));
  else sorted.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return sorted;
}

export async function createSimpleTransaction(spaceId, input) {
  const user = getCurrentUser();
  const timestamp = nowISOTimestamp();
  const target = await resolvePaymentTarget(spaceId, input, input.date);
  const transaction = {
    id: createId(),
    ...baseTransactionFields({ spaceId, userId: user.uid, timestamp }),
    kind: input.kind,
    description: input.description || '',
    amountCents: signedAmount(input.kind, input.amountCents),
    date: input.date,
    categoryId: input.categoryId || null,
    ...target,
    status: input.status,
    seriesId: null,
    installmentNumber: null,
  };
  await putRecord('transactions', transaction);
  return transaction;
}

export async function createInstallmentSeries(spaceId, input) {
  const user = getCurrentUser();
  const timestamp = nowISOTimestamp();
  const seriesId = createId();

  const amounts = buildInstallmentAmounts(input.totalAmountCents, input.installmentsTotal);
  const dates = buildInstallmentDates(input.date, input.installmentsTotal);

  const series = {
    id: seriesId,
    spaceId,
    kind: 'installment',
    installmentsTotal: input.installmentsTotal,
    frequency: 'monthly',
    startDate: input.date,
    endDate: null,
    paused: false,
    createdAt: timestamp,
    updatedAt: timestamp,
    createdBy: user.uid,
    updatedBy: user.uid,
    deletedAt: null,
    version: 1,
  };
  await putRecord('transactionSeries', series);

  const transactions = [];
  for (let index = 0; index < amounts.length; index += 1) {
    const target = await resolvePaymentTarget(spaceId, input, dates[index]);
    transactions.push({
      id: createId(),
      ...baseTransactionFields({ spaceId, userId: user.uid, timestamp }),
      kind: input.kind,
      description: input.description || '',
      amountCents: signedAmount(input.kind, amounts[index]),
      date: dates[index],
      categoryId: input.categoryId || null,
      ...target,
      status: index === 0 ? input.status : 'pending',
      seriesId,
      installmentNumber: index + 1,
    });
  }

  for (const transaction of transactions) {
    await putRecord('transactions', transaction);
  }

  return { series, transactions };
}

export async function createRecurringSeries(spaceId, input) {
  const user = getCurrentUser();
  const timestamp = nowISOTimestamp();
  const seriesId = createId();
  const horizonEndDate = addMonths(input.date, RECURRING_HORIZON_MONTHS);

  const series = {
    id: seriesId,
    spaceId,
    kind: 'recurring',
    installmentsTotal: null,
    frequency: input.frequency,
    startDate: input.date,
    endDate: input.endDate || null,
    paused: false,
    createdAt: timestamp,
    updatedAt: timestamp,
    createdBy: user.uid,
    updatedBy: user.uid,
    deletedAt: null,
    version: 1,
  };
  await putRecord('transactionSeries', series);

  const dates = buildRecurringDates(input.date, input.frequency, input.endDate, horizonEndDate);
  const transactions = [];
  for (let index = 0; index < dates.length; index += 1) {
    const target = await resolvePaymentTarget(spaceId, input, dates[index]);
    transactions.push({
      id: createId(),
      ...baseTransactionFields({ spaceId, userId: user.uid, timestamp }),
      kind: input.kind,
      description: input.description || '',
      amountCents: signedAmount(input.kind, input.amountCents),
      date: dates[index],
      categoryId: input.categoryId || null,
      ...target,
      status: index === 0 ? input.status : 'pending',
      seriesId,
      installmentNumber: null,
    });
  }

  for (const transaction of transactions) {
    await putRecord('transactions', transaction);
  }

  return { series, transactions };
}

async function getSeriesSiblings(spaceId, seriesId) {
  const transactions = await getAllByIndex('transactions', 'bySpace', spaceId);
  return transactions.filter((transaction) => transaction.seriesId === seriesId && !transaction.deletedAt);
}

// Pura: resolve quais lançamentos de uma série entram no escopo escolhido pelo usuário
// ("somente este" / "este e os próximos" / "todos"), seção 11/12.
export function selectScopedTransactions(siblings, current, scope) {
  if (scope === 'following') {
    return siblings.filter((transaction) =>
      current.installmentNumber != null ? transaction.installmentNumber >= current.installmentNumber : transaction.date >= current.date
    );
  }
  if (scope === 'all') return siblings;
  return [current];
}

// Pura: por padrão preserva lançamentos já pagos/recebidos (seção 11); só os inclui quando o
// usuário confirma explicitamente (includePaid).
export function partitionByPaidStatus(transactions, includePaid) {
  if (includePaid) return { toApply: transactions, skipped: [] };
  return {
    toApply: transactions.filter((transaction) => !isPaid(transaction)),
    skipped: transactions.filter((transaction) => isPaid(transaction)),
  };
}

export async function updateTransactionScoped(spaceId, transactionId, changes, { scope = 'only', includePaid = false } = {}) {
  const user = getCurrentUser();
  const now = nowISOTimestamp();
  const current = await getRecord('transactions', transactionId);
  if (!current) throw new Error('Lançamento não encontrado.');

  const siblings = current.seriesId ? await getSeriesSiblings(spaceId, current.seriesId) : [current];
  const scoped = current.seriesId ? selectScopedTransactions(siblings, current, scope) : [current];
  const { toApply, skipped } = partitionByPaidStatus(scoped, includePaid);

  for (const transaction of toApply) {
    let invoiceOverride = {};
    // Mudar a data de uma compra no cartão recalcula a fatura correspondente (seção 6).
    if (changes.date && transaction.creditCardId) {
      const card = await getRecord('creditCards', transaction.creditCardId);
      const invoice = await getOrCreateInvoice(spaceId, card, changes.date);
      invoiceOverride = { invoiceId: invoice.id };
    }
    await putRecord('transactions', {
      ...transaction,
      ...changes,
      ...invoiceOverride,
      updatedAt: now,
      updatedBy: user.uid,
      version: transaction.version + 1,
    });
  }

  return { updatedCount: toApply.length, skippedCount: skipped.length };
}

export async function deleteTransactionScoped(spaceId, transactionId, { scope = 'only', includePaid = false } = {}) {
  const user = getCurrentUser();
  const now = nowISOTimestamp();
  const current = await getRecord('transactions', transactionId);
  if (!current) throw new Error('Lançamento não encontrado.');

  const siblings = current.seriesId ? await getSeriesSiblings(spaceId, current.seriesId) : [current];
  const scoped = current.seriesId ? selectScopedTransactions(siblings, current, scope) : [current];
  const { toApply, skipped } = partitionByPaidStatus(scoped, includePaid);

  for (const transaction of toApply) {
    await putRecord('transactions', { ...transaction, deletedAt: now, updatedAt: now, updatedBy: user.uid, version: transaction.version + 1 });
  }

  // "Esta e as próximas" ou "toda a série" interrompe a geração de novas ocorrências futuras.
  if (current.seriesId && (scope === 'following' || scope === 'all')) {
    const series = await getRecord('transactionSeries', current.seriesId);
    if (series && series.kind === 'recurring' && !series.paused) {
      await putRecord('transactionSeries', { ...series, paused: true, updatedAt: now, updatedBy: user.uid, version: series.version + 1 });
    }
  }

  return { deletedCount: toApply.length, skippedCount: skipped.length };
}

export async function setSeriesPaused(seriesId, paused) {
  const user = getCurrentUser();
  const series = await getRecord('transactionSeries', seriesId);
  if (!series) throw new Error('Série não encontrada.');
  const updated = { ...series, paused, updatedAt: nowISOTimestamp(), updatedBy: user.uid, version: series.version + 1 };
  await putRecord('transactionSeries', updated);
  return updated;
}

export async function endRecurringSeries(seriesId, endDate) {
  const user = getCurrentUser();
  const series = await getRecord('transactionSeries', seriesId);
  if (!series) throw new Error('Série não encontrada.');
  const updated = { ...series, endDate, paused: true, updatedAt: nowISOTimestamp(), updatedBy: user.uid, version: series.version + 1 };
  await putRecord('transactionSeries', updated);
  return updated;
}

// Gera as próximas ocorrências que ainda não existem para uma recorrência ativa (ex.: ao
// retomá-la) — nunca duplica uma data já existente, nunca gera além do horizonte de 12 meses.
export async function generateUpcomingOccurrences(spaceId, seriesId) {
  const series = await getRecord('transactionSeries', seriesId);
  if (!series || series.kind !== 'recurring' || series.paused) return [];

  const existing = await getSeriesSiblings(spaceId, seriesId);
  if (existing.length === 0) return [];

  const existingDates = new Set(existing.map((transaction) => transaction.date));
  const referenceDate = existing.reduce((latest, transaction) => (transaction.date > latest ? transaction.date : latest), series.startDate);
  const horizonEndDate = addMonths(todayISODate(), RECURRING_HORIZON_MONTHS);

  const allDates = buildRecurringDates(series.startDate, series.frequency, series.endDate, horizonEndDate);
  const newDates = allDates.filter((date) => date > referenceDate && !existingDates.has(date));
  if (newDates.length === 0) return [];

  const template = existing[0];
  const card = template.creditCardId ? await getRecord('creditCards', template.creditCardId) : null;
  const user = getCurrentUser();
  const timestamp = nowISOTimestamp();
  const created = [];

  for (const date of newDates) {
    const invoiceId = card ? (await getOrCreateInvoice(spaceId, card, date)).id : null;
    const transaction = {
      ...template,
      id: createId(),
      date,
      invoiceId,
      status: 'pending',
      installmentNumber: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      createdBy: user.uid,
      updatedBy: user.uid,
      deletedAt: null,
      version: 1,
    };
    await putRecord('transactions', transaction);
    created.push(transaction);
  }

  return created;
}

export async function resumeRecurringSeries(spaceId, seriesId) {
  await setSeriesPaused(seriesId, false);
  return generateUpcomingOccurrences(spaceId, seriesId);
}
