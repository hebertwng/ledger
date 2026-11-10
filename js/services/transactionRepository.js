import { getAllByIndex, putRecord, getRecord } from '../core/database.js';
import { getCurrentUser } from '../core/auth.js';
import { createId } from '../utils/ids.js';
import { nowISOTimestamp, todayISODate } from '../utils/dates.js';
import { buildInstallmentAmounts, planMissingOccurrences, unmaterializedInstallmentCents, addDays, endOfMonth } from '../utils/recurrence.js';
import { getOrCreateInvoice } from './invoiceRepository.js';

export const TRANSACTION_STATUSES = Object.freeze(['pending', 'paid', 'received', 'cancelled']);
export const RECURRENCE_FREQUENCIES = Object.freeze(['weekly', 'monthly', 'annual']);
const PAID_STATUSES = new Set(['paid', 'received']);

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

// Molde (template) com os dados comuns a todas as ocorrências de uma série — usado para gerar
// as próximas ocorrências sob demanda, quando o mês delas for visualizado.
function buildSeriesTemplate(input, amountCents) {
  return {
    kind: input.kind,
    description: input.description || '',
    amountCents,
    categoryId: input.categoryId || null,
    accountId: input.creditCardId ? null : input.accountId || null,
    creditCardId: input.creditCardId || null,
    firstStatus: input.status,
  };
}

// Até onde gerar ocorrências logo na criação: o fim do mês corrente (ou do mês da primeira
// ocorrência, se ela for futura). Os meses seguintes só são gerados ao serem visualizados.
function initialMaterializationDate(startDate) {
  const currentMonthEnd = endOfMonth(todayISODate());
  const startMonthEnd = endOfMonth(startDate);
  return startMonthEnd > currentMonthEnd ? startMonthEnd : currentMonthEnd;
}

export async function createInstallmentSeries(spaceId, input) {
  const user = getCurrentUser();
  const timestamp = nowISOTimestamp();
  const amounts = buildInstallmentAmounts(input.totalAmountCents, input.installmentsTotal);

  const series = {
    id: createId(),
    spaceId,
    kind: 'installment',
    installmentsTotal: input.installmentsTotal,
    installmentAmountsCents: amounts.map((amount) => signedAmount(input.kind, amount)),
    template: buildSeriesTemplate(input, signedAmount(input.kind, amounts[0])),
    frequency: 'monthly',
    startDate: input.date,
    endDate: null,
    paused: false,
    resumeFrom: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    createdBy: user.uid,
    updatedBy: user.uid,
    deletedAt: null,
    version: 1,
  };
  await putRecord('transactionSeries', series);
  const transactions = await materializeSeries(spaceId, series, [], initialMaterializationDate(input.date));
  return { series, transactions };
}

export async function createRecurringSeries(spaceId, input) {
  const user = getCurrentUser();
  const timestamp = nowISOTimestamp();

  const series = {
    id: createId(),
    spaceId,
    kind: 'recurring',
    installmentsTotal: null,
    template: buildSeriesTemplate(input, signedAmount(input.kind, input.amountCents)),
    frequency: input.frequency,
    startDate: input.date,
    endDate: input.endDate || null,
    paused: false,
    resumeFrom: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    createdBy: user.uid,
    updatedBy: user.uid,
    deletedAt: null,
    version: 1,
  };
  await putRecord('transactionSeries', series);
  const transactions = await materializeSeries(spaceId, series, [], initialMaterializationDate(input.date));
  return { series, transactions };
}

// Cria (de fato, no banco) as ocorrências ainda inexistentes de uma série até "throughDate".
// "existing" são as ocorrências já gravadas da série, incluindo as excluídas.
async function materializeSeries(spaceId, series, existing, throughDate) {
  const planned = planMissingOccurrences(series, existing, throughDate);
  if (planned.length === 0) return [];

  const template = series.template;
  const user = getCurrentUser();
  const timestamp = nowISOTimestamp();
  const created = [];

  for (const occurrence of planned) {
    const target = await resolvePaymentTarget(spaceId, template, occurrence.date);
    const isFirst = series.kind === 'installment' ? occurrence.installmentNumber === 1 : occurrence.date === series.startDate;
    const transaction = {
      id: createId(),
      ...baseTransactionFields({ spaceId, userId: user.uid, timestamp }),
      kind: template.kind,
      description: template.description || '',
      amountCents: occurrence.amountCents,
      date: occurrence.date,
      categoryId: template.categoryId || null,
      ...target,
      status: isFirst && template.firstStatus ? template.firstStatus : 'pending',
      seriesId: series.id,
      installmentNumber: occurrence.installmentNumber,
    };
    await putRecord('transactions', transaction);
    created.push(transaction);
  }
  return created;
}

// Séries criadas antes da geração sob demanda não têm "template": ele é reconstruído a partir
// da ocorrência mais recente, para que essas recorrências também continuem sendo geradas.
function withLegacyTemplate(series, existing) {
  if (series.template || series.kind !== 'recurring') return series;
  const latest = existing.filter((transaction) => !transaction.deletedAt).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  if (!latest) return series;
  return {
    ...series,
    template: {
      kind: latest.kind,
      description: latest.description || '',
      amountCents: latest.amountCents,
      categoryId: latest.categoryId || null,
      accountId: latest.accountId || null,
      creditCardId: latest.creditCardId || null,
      firstStatus: null,
    },
  };
}

// Garante que todas as séries ativas do espaço tenham suas ocorrências geradas até
// "throughDate" (normalmente o último dia do mês sendo visualizado). Chamado ao abrir/navegar
// a tela de Lançamentos e a Visão geral — é isso que faz as parcelas e recorrências "aparecerem"
// conforme o usuário avança os meses, sem criar tudo antecipadamente.
export async function ensureOccurrencesThrough(spaceId, throughDate) {
  const [seriesList, transactions] = await Promise.all([
    getAllByIndex('transactionSeries', 'bySpace', spaceId),
    getAllByIndex('transactions', 'bySpace', spaceId),
  ]);
  const bySeries = new Map();
  for (const transaction of transactions) {
    if (!transaction.seriesId) continue;
    if (!bySeries.has(transaction.seriesId)) bySeries.set(transaction.seriesId, []);
    bySeries.get(transaction.seriesId).push(transaction);
  }

  let createdCount = 0;
  for (const series of seriesList) {
    if (series.deletedAt) continue;
    const existing = bySeries.get(series.id) || [];
    const created = await materializeSeries(spaceId, withLegacyTemplate(series, existing), existing, throughDate);
    createdCount += created.length;
  }
  return createdCount;
}

// Valor das parcelas de cartão ainda não geradas, por cartão — já comprometem o limite.
export async function pendingInstallmentCentsByCard(spaceId) {
  const [seriesList, transactions] = await Promise.all([
    getAllByIndex('transactionSeries', 'bySpace', spaceId),
    getAllByIndex('transactions', 'bySpace', spaceId),
  ]);
  const totals = new Map();
  for (const series of seriesList) {
    const cardId = series.template?.creditCardId;
    if (!cardId) continue;
    const existing = transactions.filter((transaction) => transaction.seriesId === series.id);
    const pending = unmaterializedInstallmentCents(series, existing);
    if (pending > 0) totals.set(cardId, (totals.get(cardId) || 0) + pending);
  }
  return totals;
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

  // "Este e os próximos" / "todos" também atualiza o molde da série, para que as ocorrências
  // geradas depois (ao visualizar meses futuros) já nasçam com os dados novos.
  if (current.seriesId && scope !== 'only') {
    const series = await getRecord('transactionSeries', current.seriesId);
    if (series && series.template) {
      const templateChanges = {};
      for (const field of ['description', 'categoryId', 'accountId']) {
        if (field in changes && !(field === 'accountId' && series.template.creditCardId)) templateChanges[field] = changes[field];
      }
      await putRecord('transactionSeries', {
        ...series,
        template: { ...series.template, ...templateChanges },
        updatedAt: now,
        updatedBy: user.uid,
        version: series.version + 1,
      });
    }
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

  // "Esta e as próximas" ou "toda a série" encerra a série na véspera desta ocorrência, para
  // que as ocorrências futuras (ainda não geradas) nunca venham a ser criadas.
  if (current.seriesId && (scope === 'following' || scope === 'all')) {
    const series = await getRecord('transactionSeries', current.seriesId);
    if (series) {
      const cutoff = addDays(scope === 'all' ? series.startDate : current.date, -1);
      const endDate = series.endDate && series.endDate < cutoff ? series.endDate : cutoff;
      await putRecord('transactionSeries', {
        ...series,
        endDate,
        paused: series.kind === 'recurring' ? true : series.paused,
        updatedAt: now,
        updatedBy: user.uid,
        version: series.version + 1,
      });
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

// Retomar não gera de volta o período em que a recorrência ficou pausada: a geração recomeça a
// partir de hoje, e as próximas ocorrências surgem conforme os meses forem visualizados.
export async function resumeRecurringSeries(spaceId, seriesId) {
  const series = await getRecord('transactionSeries', seriesId);
  if (!series) throw new Error('Série não encontrada.');
  const user = getCurrentUser();
  const updated = { ...series, paused: false, resumeFrom: todayISODate(), updatedAt: nowISOTimestamp(), updatedBy: user.uid, version: series.version + 1 };
  await putRecord('transactionSeries', updated);
  return ensureOccurrencesThrough(spaceId, endOfMonth(todayISODate()));
}
