import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateBackup, summarizeBackup, BACKUP_FORMAT, MOVEMENT_STORES } from '../js/services/dataManagementRepository.js';

const validBackup = {
  format: BACKUP_FORMAT,
  version: 1,
  exportedAt: '2026-11-11T12:00:00.000Z',
  stores: {
    spaces: [{ id: 's1' }],
    accounts: [{ id: 'a1' }, { id: 'a2', deletedAt: '2026-11-01' }],
    categories: [{ id: 'c1' }],
    transactions: [{ id: 't1' }, { id: 't2' }],
  },
};

test('cópia válida é aceita e coleções ausentes viram listas vazias', () => {
  const result = validateBackup(validBackup);
  assert.equal(result.ok, true);
  assert.deepEqual(result.stores.creditCards, []);
  assert.equal(result.stores.transactions.length, 2);
});

test('arquivo que não é cópia do LEDGER é recusado', () => {
  assert.deepEqual(validateBackup(null), { ok: false, reason: 'invalidFile' });
  assert.deepEqual(validateBackup({ foo: 1 }), { ok: false, reason: 'notLedger' });
});

test('cópia de versão mais nova é recusada', () => {
  assert.deepEqual(validateBackup({ ...validBackup, version: 99 }), { ok: false, reason: 'newerVersion' });
});

test('coleção que não é lista torna o arquivo inválido', () => {
  assert.deepEqual(validateBackup({ ...validBackup, stores: { ...validBackup.stores, accounts: 'x' } }), { ok: false, reason: 'invalidFile' });
});

test('cópia sem espaço financeiro é recusada', () => {
  assert.deepEqual(validateBackup({ ...validBackup, stores: { ...validBackup.stores, spaces: [] } }), { ok: false, reason: 'empty' });
});

test('resumo ignora registros excluídos', () => {
  const { stores } = validateBackup(validBackup);
  assert.deepEqual(summarizeBackup(stores), { accounts: 1, creditCards: 0, categories: 1, transactions: 2 });
});

test('apagar movimentações não inclui os cadastros', () => {
  for (const store of ['spaces', 'accounts', 'creditCards', 'categories', 'budgets']) {
    assert.equal(MOVEMENT_STORES.includes(store), false);
  }
  assert.ok(MOVEMENT_STORES.includes('transactions'));
  assert.ok(MOVEMENT_STORES.includes('invoices'));
});
