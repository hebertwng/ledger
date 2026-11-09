import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateAccountBalanceCents, calculateConsolidatedBalanceCents } from '../js/services/accountRepository.js';

const account = { id: 'acc-1', initialBalanceCents: 10000 };

test('calculateAccountBalanceCents soma saldo inicial + lançamentos ativos', () => {
  const transactions = [
    { accountId: 'acc-1', amountCents: 5000, deletedAt: null, status: 'paid' },
    { accountId: 'acc-1', amountCents: -2000, deletedAt: null, status: 'paid' },
  ];
  assert.equal(calculateAccountBalanceCents(account, transactions), 13000);
});

test('calculateAccountBalanceCents ignora lançamentos excluídos (soft delete)', () => {
  const transactions = [{ accountId: 'acc-1', amountCents: 5000, deletedAt: '2026-01-01T00:00:00.000Z', status: 'paid' }];
  assert.equal(calculateAccountBalanceCents(account, transactions), 10000);
});

test('calculateAccountBalanceCents ignora lançamentos cancelados', () => {
  const transactions = [{ accountId: 'acc-1', amountCents: 5000, deletedAt: null, status: 'cancelled' }];
  assert.equal(calculateAccountBalanceCents(account, transactions), 10000);
});

test('calculateAccountBalanceCents ignora lançamentos de outra conta', () => {
  const transactions = [{ accountId: 'acc-2', amountCents: 5000, deletedAt: null, status: 'paid' }];
  assert.equal(calculateAccountBalanceCents(account, transactions), 10000);
});

test('calculateConsolidatedBalanceCents soma o saldo de todas as contas', () => {
  assert.equal(calculateConsolidatedBalanceCents([10000, -2000, 500]), 8500);
});
