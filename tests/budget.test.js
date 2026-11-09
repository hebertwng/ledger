import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateBudgetProgress } from '../js/services/budgetRepository.js';

test('calculateBudgetProgress calcula percentual e restante dentro do limite', () => {
  const progress = calculateBudgetProgress(10000, 4000);
  assert.equal(progress.percentage, 0.4);
  assert.equal(progress.remainingCents, 6000);
  assert.equal(progress.isOverLimit, false);
  assert.equal(progress.isNearLimit, false);
});

test('calculateBudgetProgress marca isNearLimit a partir de 80%', () => {
  const progress = calculateBudgetProgress(10000, 8500);
  assert.equal(progress.isNearLimit, true);
  assert.equal(progress.isOverLimit, false);
});

test('calculateBudgetProgress marca isOverLimit quando o gasto passa do limite', () => {
  const progress = calculateBudgetProgress(10000, 12000);
  assert.equal(progress.isOverLimit, true);
  assert.equal(progress.isNearLimit, false);
  assert.equal(progress.remainingCents, -2000);
});

test('calculateBudgetProgress trata limite zero sem dividir por zero', () => {
  const progress = calculateBudgetProgress(0, 500);
  assert.equal(progress.percentage, 0);
  assert.equal(progress.isOverLimit, true);
});
