import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  sumByKind,
  groupByCategory,
  groupByAccount,
  groupByCard,
  topExpenses,
  buildMonthlySeries,
  buildYearlySeries,
  upcomingDueInvoices,
} from '../js/services/analyticsRepository.js';
import { monthRange } from '../js/utils/dates.js';

const categoriesById = new Map([
  ['parent-1', { id: 'parent-1', name: 'Moradia', parentId: null }],
  ['child-1', { id: 'child-1', name: 'Aluguel', parentId: 'parent-1' }],
  ['parent-2', { id: 'parent-2', name: 'Salário', parentId: null }],
]);

const transactions = [
  { kind: 'expense', categoryId: 'child-1', amountCents: -1000, date: '2026-01-05', accountId: 'acc-1', creditCardId: null },
  { kind: 'expense', categoryId: 'parent-1', amountCents: -500, date: '2026-01-10', accountId: 'acc-1', creditCardId: null },
  { kind: 'expense', categoryId: null, amountCents: -200, date: '2026-01-12', accountId: 'acc-2', creditCardId: 'card-1' },
  { kind: 'income', categoryId: 'parent-2', amountCents: 5000, date: '2026-01-15', accountId: 'acc-1', creditCardId: null },
];

test('sumByKind soma apenas o tipo pedido, em valor absoluto', () => {
  assert.equal(sumByKind(transactions, 'expense'), 1700);
  assert.equal(sumByKind(transactions, 'income'), 5000);
});

test('groupByCategory sem rollup mantém subcategoria separada da categoria pai', () => {
  const result = groupByCategory(transactions, categoriesById, 'expense', { rollup: false });
  const childBucket = result.find((bucket) => bucket.categoryId === 'child-1');
  const parentBucket = result.find((bucket) => bucket.categoryId === 'parent-1');
  assert.equal(childBucket.totalCents, 1000);
  assert.equal(parentBucket.totalCents, 500);
});

test('groupByCategory com rollup soma a subcategoria na categoria pai', () => {
  const result = groupByCategory(transactions, categoriesById, 'expense', { rollup: true });
  const parentBucket = result.find((bucket) => bucket.categoryId === 'parent-1');
  assert.equal(parentBucket.totalCents, 1500);
});

test('groupByCategory agrupa lançamentos sem categoria sob uma chave "sem categoria"', () => {
  const result = groupByCategory(transactions, categoriesById, 'expense', { rollup: true });
  const noneBucket = result.find((bucket) => bucket.categoryId === null);
  assert.equal(noneBucket.totalCents, 200);
});

test('groupByAccount soma despesas por conta', () => {
  const accountsById = new Map([
    ['acc-1', { id: 'acc-1', name: 'Conta Corrente' }],
    ['acc-2', { id: 'acc-2', name: 'Carteira' }],
  ]);
  const result = groupByAccount(transactions, accountsById);
  assert.deepEqual(
    result.map((bucket) => [bucket.name, bucket.totalCents]),
    [['Conta Corrente', 1500], ['Carteira', 200]]
  );
});

test('groupByCard soma despesas por cartão e ignora despesas sem cartão', () => {
  const cardsById = new Map([['card-1', { id: 'card-1', name: 'Visa' }]]);
  const result = groupByCard(transactions, cardsById);
  assert.deepEqual(result, [{ creditCardId: 'card-1', name: 'Visa', totalCents: 200 }]);
});

test('topExpenses ordena despesas da maior para a menor e respeita o limite', () => {
  const result = topExpenses(transactions, 2);
  assert.deepEqual(result.map((t) => t.amountCents), [-1000, -500]);
});

test('buildMonthlySeries gera uma linha por mês, mesmo sem lançamentos', () => {
  const series = buildMonthlySeries(transactions, { monthsCount: 3, referenceDate: '2026-01-15' });
  assert.deepEqual(
    series.map((entry) => entry.month),
    ['2025-11', '2025-12', '2026-01']
  );
  const january = series.find((entry) => entry.month === '2026-01');
  assert.equal(january.incomeCents, 5000);
  assert.equal(january.expenseCents, 1700);
  assert.equal(january.resultCents, 3300);
});

test('buildYearlySeries agrega por ano', () => {
  const series = buildYearlySeries(transactions, { yearsCount: 2, referenceYear: 2026 });
  assert.deepEqual(series.map((entry) => entry.year), [2025, 2026]);
  const year2026 = series.find((entry) => entry.year === 2026);
  assert.equal(year2026.expenseCents, 1700);
});

test('upcomingDueInvoices ignora pagas e ordena por vencimento', () => {
  const invoices = [
    { id: 'a', status: 'paid', dueDate: '2026-01-01' },
    { id: 'b', status: 'open', dueDate: '2026-03-01' },
    { id: 'c', status: 'closed', dueDate: '2026-02-01' },
  ];
  const result = upcomingDueInvoices(invoices, 5);
  assert.deepEqual(result.map((invoice) => invoice.id), ['c', 'b']);
});

test('monthRange calcula o primeiro e o último dia do mês informado', () => {
  assert.deepEqual(monthRange('2026-02'), { startDate: '2026-02-01', endDate: '2026-02-28' });
  assert.deepEqual(monthRange('2026-01'), { startDate: '2026-01-01', endDate: '2026-01-31' });
});
