import { getAllByIndex, putRecord, getRecord } from '../core/database.js';
import { getCurrentUser } from '../core/auth.js';
import { createId } from '../utils/ids.js';
import { nowISOTimestamp } from '../utils/dates.js';

export const ACCOUNT_TYPES = Object.freeze(['checking', 'savings', 'wallet', 'investment', 'other']);

// Pura: saldo = saldo inicial + soma dos lançamentos não excluídos e não cancelados vinculados
// à conta. Nunca é editado manualmente (seção 5). "amountCents" já vem com o sinal correto
// (negativo = saída, positivo = entrada), inclusive para os dois lados de uma transferência.
export function calculateAccountBalanceCents(account, transactions) {
  const activeTotal = transactions
    .filter((transaction) => transaction.accountId === account.id && !transaction.deletedAt && transaction.status !== 'cancelled')
    .reduce((sum, transaction) => sum + transaction.amountCents, 0);
  return account.initialBalanceCents + activeTotal;
}

export function calculateConsolidatedBalanceCents(accountBalancesCents) {
  return accountBalancesCents.reduce((sum, balance) => sum + balance, 0);
}

export async function listAccounts(spaceId) {
  const [accounts, transactions] = await Promise.all([
    getAllByIndex('accounts', 'bySpace', spaceId),
    getAllByIndex('transactions', 'bySpace', spaceId),
  ]);
  return accounts
    .filter((account) => !account.deletedAt)
    .map((account) => ({ ...account, balanceCents: calculateAccountBalanceCents(account, transactions) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function createAccount(spaceId, input) {
  const user = getCurrentUser();
  const createdAt = nowISOTimestamp();
  const account = {
    id: createId(),
    spaceId,
    name: input.name.trim(),
    type: input.type,
    initialBalanceCents: input.initialBalanceCents,
    initialBalanceDate: input.initialBalanceDate,
    color: input.color || null,
    archived: false,
    createdAt,
    updatedAt: createdAt,
    createdBy: user.uid,
    updatedBy: user.uid,
    deletedAt: null,
    version: 1,
  };
  await putRecord('accounts', account);
  return account;
}

export async function updateAccount(accountId, changes) {
  const user = getCurrentUser();
  const account = await getRecord('accounts', accountId);
  if (!account) throw new Error('Conta não encontrada.');
  const updated = { ...account, ...changes, updatedAt: nowISOTimestamp(), updatedBy: user.uid, version: account.version + 1 };
  await putRecord('accounts', updated);
  return updated;
}

export async function setAccountArchived(accountId, archived) {
  return updateAccount(accountId, { archived });
}
