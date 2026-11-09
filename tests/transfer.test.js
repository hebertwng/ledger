import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTransferTransactions } from '../js/services/transferRepository.js';

const baseInput = {
  spaceId: 'space-1',
  transferId: 'transfer-1',
  fromAccountId: 'acc-origin',
  toAccountId: 'acc-destination',
  amountCents: 5000,
  date: '2026-01-10',
  description: 'Teste',
  userId: 'user-1',
  timestamp: '2026-01-10T12:00:00.000Z',
};

test('buildTransferTransactions gera dois lançamentos ligados pelo mesmo transferPairId', () => {
  const [fromTransaction, toTransaction] = buildTransferTransactions(baseInput);
  assert.equal(fromTransaction.transferPairId, 'transfer-1');
  assert.equal(toTransaction.transferPairId, 'transfer-1');
  assert.notEqual(fromTransaction.id, toTransaction.id);
});

test('buildTransferTransactions debita a origem e credita o destino com o mesmo valor absoluto', () => {
  const [fromTransaction, toTransaction] = buildTransferTransactions(baseInput);
  assert.equal(fromTransaction.accountId, 'acc-origin');
  assert.equal(fromTransaction.amountCents, -5000);
  assert.equal(toTransaction.accountId, 'acc-destination');
  assert.equal(toTransaction.amountCents, 5000);
});

test('buildTransferTransactions nunca marca os lançamentos como receita ou despesa', () => {
  const [fromTransaction, toTransaction] = buildTransferTransactions(baseInput);
  assert.equal(fromTransaction.kind, 'transfer');
  assert.equal(toTransaction.kind, 'transfer');
});

test('buildTransferTransactions normaliza valores negativos de entrada para o módulo', () => {
  const [fromTransaction, toTransaction] = buildTransferTransactions({ ...baseInput, amountCents: -5000 });
  assert.equal(fromTransaction.amountCents, -5000);
  assert.equal(toTransaction.amountCents, 5000);
});
