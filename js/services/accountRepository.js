import { getAllByIndex, putRecord, getRecord } from '../core/database.js';
import { getCurrentUser } from '../core/auth.js';
import { createId } from '../utils/ids.js';
import { nowISOTimestamp } from '../utils/dates.js';

export const ACCOUNT_TYPES = Object.freeze(['checking', 'savings', 'wallet', 'investment', 'other']);
const SETTLED_STATUSES = new Set(['paid', 'received']);

// Pura: saldo "previsto" = saldo inicial + soma de todos os lançamentos não excluídos e não
// cancelados (inclui pendentes). Nunca é editado manualmente (seção 5). "amountCents" já vem
// com o sinal correto (negativo = saída, positivo = entrada), inclusive nos dois lados de uma
// transferência.
export function calculateAccountBalanceCents(account, transactions) {
  const activeTotal = transactions
    .filter((transaction) => transaction.accountId === account.id && !transaction.deletedAt && transaction.status !== 'cancelled')
    .reduce((sum, transaction) => sum + transaction.amountCents, 0);
  return account.initialBalanceCents + activeTotal;
}

// Pura: saldo "confirmado" = o mesmo cálculo, mas considerando só lançamentos já pagos/
// recebidos — exclui o que ainda está pendente. Distinção comum em apps financeiros (saldo
// real vs. projetado).
export function calculateConfirmedBalanceCents(account, transactions) {
  const settledTotal = transactions
    .filter(
      (transaction) =>
        transaction.accountId === account.id && !transaction.deletedAt && SETTLED_STATUSES.has(transaction.status)
    )
    .reduce((sum, transaction) => sum + transaction.amountCents, 0);
  return account.initialBalanceCents + settledTotal;
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
    .map((account) => ({
      ...account,
      balanceCents: calculateAccountBalanceCents(account, transactions),
      confirmedBalanceCents: calculateConfirmedBalanceCents(account, transactions),
    }))
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
    institution: input.institution || null,
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

// Pura: saldo de um conjunto de contas ao final de uma data — "confirmado" (só o que já foi
// pago/recebido até lá) e "previsto" (inclui o que ainda está pendente até lá). Usado no
// rodapé da tela de Lançamentos ao navegar pelos meses.
export function calculateBalancesAtDate(accounts, transactions, endDate) {
  const accountIds = new Set(accounts.map((account) => account.id));
  let confirmedCents = accounts.reduce((sum, account) => sum + (account.initialBalanceCents || 0), 0);
  let projectedCents = confirmedCents;
  for (const transaction of transactions) {
    if (!accountIds.has(transaction.accountId) || transaction.deletedAt || transaction.status === 'cancelled') continue;
    if (transaction.date > endDate) continue;
    projectedCents += transaction.amountCents;
    if (SETTLED_STATUSES.has(transaction.status)) confirmedCents += transaction.amountCents;
  }
  return { confirmedCents, projectedCents };
}
