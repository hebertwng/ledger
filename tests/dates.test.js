import { test } from 'node:test';
import assert from 'node:assert/strict';
import { currentWeekRange, currentMonthRange } from '../js/utils/dates.js';

test('currentWeekRange retorna de segunda a domingo contendo a data', () => {
  // 2026-01-14 é uma quarta-feira.
  assert.deepEqual(currentWeekRange('2026-01-14'), { startDate: '2026-01-12', endDate: '2026-01-18' });
});

test('currentWeekRange funciona quando a referência já é domingo', () => {
  assert.deepEqual(currentWeekRange('2026-01-18'), { startDate: '2026-01-12', endDate: '2026-01-18' });
});

test('currentMonthRange retorna do primeiro ao último dia do mês', () => {
  assert.deepEqual(currentMonthRange('2026-02-10'), { startDate: '2026-02-01', endDate: '2026-02-28' });
});

test('currentMonthRange lida com mês de 31 dias', () => {
  assert.deepEqual(currentMonthRange('2026-01-10'), { startDate: '2026-01-01', endDate: '2026-01-31' });
});
