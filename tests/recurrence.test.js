import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addMonths,
  addWeeks,
  buildInstallmentAmounts,
  buildInstallmentDates,
  buildRecurringDates,
} from '../js/utils/recurrence.js';

test('addMonths preserva o dia quando o mês de destino o possui', () => {
  assert.equal(addMonths('2026-01-15', 1), '2026-02-15');
});

test('addMonths cai para o último dia do mês quando o dia original não existe', () => {
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
});

test('addMonths avança o ano corretamente', () => {
  assert.equal(addMonths('2026-12-10', 2), '2027-02-10');
});

test('addWeeks soma dias corridos', () => {
  assert.equal(addWeeks('2026-01-01', 2), '2026-01-15');
});

test('buildInstallmentAmounts divide em partes iguais quando divisível', () => {
  assert.deepEqual(buildInstallmentAmounts(10000, 10), new Array(10).fill(1000));
});

test('buildInstallmentAmounts ajusta a diferença de centavos na última parcela', () => {
  const amounts = buildInstallmentAmounts(1000, 3);
  assert.deepEqual(amounts, [333, 333, 334]);
  assert.equal(amounts.reduce((sum, value) => sum + value, 0), 1000);
});

test('buildInstallmentDates gera uma data mensal consecutiva por parcela', () => {
  assert.deepEqual(buildInstallmentDates('2026-01-31', 3), ['2026-01-31', '2026-02-28', '2026-03-31']);
});

test('buildRecurringDates respeita o horizonte de geração', () => {
  const dates = buildRecurringDates('2026-01-01', 'monthly', null, '2026-04-01');
  assert.deepEqual(dates, ['2026-01-01', '2026-02-01', '2026-03-01', '2026-04-01']);
});

test('buildRecurringDates respeita endDate quando é anterior ao horizonte', () => {
  const dates = buildRecurringDates('2026-01-01', 'monthly', '2026-02-15', '2026-06-01');
  assert.deepEqual(dates, ['2026-01-01', '2026-02-01']);
});

test('buildRecurringDates funciona com frequência semanal', () => {
  const dates = buildRecurringDates('2026-01-01', 'weekly', null, '2026-01-22');
  assert.deepEqual(dates, ['2026-01-01', '2026-01-08', '2026-01-15', '2026-01-22']);
});
