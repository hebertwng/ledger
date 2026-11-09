import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateAccountBalanceCents, calculateConfirmedBalanceCents, calculateConsolidatedBalanceCents } from '../js/services/accountRepository.js';

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

test('calculateConfirmedBalanceCents considera apenas lançamentos pagos/recebidos', () => {
  const transactions = [
    { accountId: 'acc-1', amountCents: 5000, deletedAt: null, status: 'paid' },
    { accountId: 'acc-1', amountCents: -3000, deletedAt: null, status: 'pending' },
  ];
  assert.equal(calculateConfirmedBalanceCents(account, transactions), 15000);
});

test('calculateConfirmedBalanceCents ignora pendentes mesmo quando previsto os inclui', () => {
  const transactions = [
    { accountId: 'acc-1', amountCents: 5000, deletedAt: null, status: 'received' },
    { accountId: 'acc-1', amountCents: -9000, deletedAt: null, status: 'pending' },
  ];
  assert.equal(calculateAccountBalanceCents(account, transactions), 6000);
  assert.equal(calculateConfirmedBalanceCents(account, transactions), 15000);
});
