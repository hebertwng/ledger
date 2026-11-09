import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectScopedTransactions, partitionByPaidStatus, filterTransactions } from '../js/services/transactionRepository.js';

const installments = [
  { id: 't1', installmentNumber: 1, date: '2026-01-10', status: 'paid' },
  { id: 't2', installmentNumber: 2, date: '2026-02-10', status: 'pending' },
  { id: 't3', installmentNumber: 3, date: '2026-03-10', status: 'pending' },
];

test('selectScopedTransactions "only" afeta apenas o lançamento atual', () => {
  const result = selectScopedTransactions(installments, installments[1], 'only');
  assert.deepEqual(result.map((t) => t.id), ['t2']);
});

test('selectScopedTransactions "following" inclui o atual e os de número maior', () => {
  const result = selectScopedTransactions(installments, installments[1], 'following');
  assert.deepEqual(result.map((t) => t.id), ['t2', 't3']);
});

test('selectScopedTransactions "all" inclui toda a série', () => {
  const result = selectScopedTransactions(installments, installments[1], 'all');
  assert.deepEqual(result.map((t) => t.id), ['t1', 't2', 't3']);
});

test('partitionByPaidStatus preserva pagos por padrão', () => {
  const { toApply, skipped } = partitionByPaidStatus(installments, false);
  assert.deepEqual(toApply.map((t) => t.id), ['t2', 't3']);
  assert.deepEqual(skipped.map((t) => t.id), ['t1']);
});

test('partitionByPaidStatus inclui pagos quando includePaid=true', () => {
  const { toApply, skipped } = partitionByPaidStatus(installments, true);
  assert.equal(toApply.length, 3);
  assert.equal(skipped.length, 0);
});

const sampleTransactions = [
  { id: 'a', kind: 'expense', accountId: 'acc-1', categoryId: 'cat-food', status: 'paid', date: '2026-01-05', amountCents: -5000, description: 'Mercado' },
  { id: 'b', kind: 'income', accountId: 'acc-1', categoryId: 'cat-salary', status: 'received', date: '2026-01-10', amountCents: 300000, description: 'Salário' },
  { id: 'c', kind: 'expense', accountId: 'acc-2', categoryId: 'cat-food', status: 'pending', date: '2026-02-01', amountCents: -2000, description: 'Restaurante' },
];

test('filterTransactions filtra por tipo', () => {
  assert.deepEqual(filterTransactions(sampleTransactions, { kind: 'income' }).map((t) => t.id), ['b']);
});

test('filterTransactions filtra por conta', () => {
  assert.deepEqual(filterTransactions(sampleTransactions, { accountId: 'acc-2' }).map((t) => t.id), ['c']);
});

test('filterTransactions filtra por cartão de crédito', () => {
  const withCard = [...sampleTransactions, { id: 'd', kind: 'expense', creditCardId: 'card-1', status: 'pending', date: '2026-02-05', amountCents: -1000, description: 'Compra cartão' }];
  assert.deepEqual(filterTransactions(withCard, { creditCardId: 'card-1' }).map((t) => t.id), ['d']);
});

test('filterTransactions filtra por período', () => {
  assert.deepEqual(filterTransactions(sampleTransactions, { startDate: '2026-02-01' }).map((t) => t.id), ['c']);
});

test('filterTransactions filtra por texto na descrição', () => {
  assert.deepEqual(filterTransactions(sampleTransactions, { text: 'sal' }).map((t) => t.id), ['b']);
});

test('filterTransactions filtra por faixa de valor (valor absoluto)', () => {
  assert.deepEqual(filterTransactions(sampleTransactions, { minAmountCents: 10000 }).map((t) => t.id), ['b']);
});
