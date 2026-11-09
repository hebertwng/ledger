import { getAllByIndex, putRecord, getRecord } from '../core/database.js';
import { getCurrentUser } from '../core/auth.js';
import { createId } from '../utils/ids.js';
import { nowISOTimestamp } from '../utils/dates.js';

// Pura: monta os dois lançamentos de uma transferência (saída da origem, entrada no destino).
// "kind" é sempre 'transfer' — nunca receita nem despesa (seção 13) — e o valor sai negativo
// de uma conta e entra positivo na outra, ligados pelo mesmo transferPairId.
export function buildTransferTransactions({ spaceId, transferId, fromAccountId, toAccountId, amountCents, date, description, userId, timestamp }) {
  const amount = Math.abs(amountCents);
  const base = {
    spaceId,
    kind: 'transfer',
    description: description || '',
    date,
    categoryId: null,
    creditCardId: null,
    invoiceId: null,
    status: 'paid',
    seriesId: null,
    installmentNumber: null,
    transferPairId: transferId,
    createdAt: timestamp,
    updatedAt: timestamp,
    createdBy: userId,
    updatedBy: userId,
    deletedAt: null,
    version: 1,
  };
  return [
    { ...base, id: createId(), accountId: fromAccountId, amountCents: -amount },
    { ...base, id: createId(), accountId: toAccountId, amountCents: amount },
  ];
}

export async function listTransfers(spaceId) {
  const transfers = (await getAllByIndex('transfers', 'bySpace', spaceId)).filter((transfer) => !transfer.deletedAt);
  return transfers.sort((a, b) => (a.date < b.date ? 1 : -1));
}

export async function createTransfer(spaceId, input) {
  const user = getCurrentUser();
  const timestamp = nowISOTimestamp();
  const transferId = createId();

  const [fromTransaction, toTransaction] = buildTransferTransactions({
    spaceId,
    transferId,
    fromAccountId: input.fromAccountId,
    toAccountId: input.toAccountId,
    amountCents: input.amountCents,
    date: input.date,
    description: input.description,
    userId: user.uid,
    timestamp,
  });

  await putRecord('transactions', fromTransaction);
  await putRecord('transactions', toTransaction);

  const transfer = {
    id: transferId,
    spaceId,
    fromAccountId: input.fromAccountId,
    toAccountId: input.toAccountId,
    amountCents: Math.abs(input.amountCents),
    date: input.date,
    description: input.description || '',
    fromTransactionId: fromTransaction.id,
    toTransactionId: toTransaction.id,
    createdAt: timestamp,
    updatedAt: timestamp,
    createdBy: user.uid,
    updatedBy: user.uid,
    deletedAt: null,
    version: 1,
  };
  await putRecord('transfers', transfer);
  return transfer;
}

export async function updateTransfer(transferId, changes) {
  const user = getCurrentUser();
  const now = nowISOTimestamp();
  const transfer = await getRecord('transfers', transferId);
  if (!transfer) throw new Error('Transferência não encontrada.');

  const next = {
    fromAccountId: changes.fromAccountId ?? transfer.fromAccountId,
    toAccountId: changes.toAccountId ?? transfer.toAccountId,
    amountCents: Math.abs(changes.amountCents ?? transfer.amountCents),
    date: changes.date ?? transfer.date,
    description: changes.description ?? transfer.description,
  };

  const fromTransaction = await getRecord('transactions', transfer.fromTransactionId);
  const toTransaction = await getRecord('transactions', transfer.toTransactionId);

  await putRecord('transactions', {
    ...fromTransaction,
    accountId: next.fromAccountId,
    amountCents: -next.amountCents,
    date: next.date,
    description: next.description,
    updatedAt: now,
    updatedBy: user.uid,
    version: fromTransaction.version + 1,
  });
  await putRecord('transactions', {
    ...toTransaction,
    accountId: next.toAccountId,
    amountCents: next.amountCents,
    date: next.date,
    description: next.description,
    updatedAt: now,
    updatedBy: user.uid,
    version: toTransaction.version + 1,
  });

  const updatedTransfer = { ...transfer, ...next, updatedAt: now, updatedBy: user.uid, version: transfer.version + 1 };
  await putRecord('transfers', updatedTransfer);
  return updatedTransfer;
}

// Exclui logicamente os dois lados da transferência, nunca apenas um (seção 12).
export async function deleteTransfer(transferId) {
  const user = getCurrentUser();
  const now = nowISOTimestamp();
  const transfer = await getRecord('transfers', transferId);
  if (!transfer) throw new Error('Transferência não encontrada.');

  for (const transactionId of [transfer.fromTransactionId, transfer.toTransactionId]) {
    const transaction = await getRecord('transactions', transactionId);
    if (transaction) {
      await putRecord('transactions', { ...transaction, deletedAt: now, updatedAt: now, updatedBy: user.uid, version: transaction.version + 1 });
    }
  }

  await putRecord('transfers', { ...transfer, deletedAt: now, updatedAt: now, updatedBy: user.uid, version: transfer.version + 1 });
}
