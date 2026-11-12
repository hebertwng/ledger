import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  valueAt,
  flowsUntil,
  summarizeInvestment,
  buildInvestmentSeries,
  summarizeSeries,
  monthsBetween,
  monthEnd,
  shiftMonth,
  firstEntryMonth,
} from '../js/services/investmentAnalytics.js';

const entry = (kind, date, amountCents, createdAt = date) => ({ kind, date, amountCents, createdAt });

// CDB: aplica 1.000 em jan; rende até 1.010 em jan; aporta 500 em fev; vale 1.530 no fim de fev;
// resgata 200 em mar; vale 1.345 no fim de mar.
const cdb = [
  entry('contribution', '2026-01-05', 100000),
  entry('valuation', '2026-01-31', 101000),
  entry('contribution', '2026-02-10', 50000),
  entry('valuation', '2026-02-28', 153000),
  entry('withdrawal', '2026-03-15', 20000),
  entry('valuation', '2026-03-31', 134500),
];

test('valor numa data: atualização define o valor; aportes e resgates somam/subtraem', () => {
  assert.equal(valueAt(cdb, '2026-01-04'), 0);
  assert.equal(valueAt(cdb, '2026-01-10'), 100000);
  assert.equal(valueAt(cdb, '2026-01-31'), 101000);
  assert.equal(valueAt(cdb, '2026-02-15'), 151000);
  assert.equal(valueAt(cdb, '2026-03-20'), 133000);
  assert.equal(valueAt(cdb, '2026-12-31'), 134500);
});

test('mesmo dia: vale a ordem de registro', () => {
  const sameDay = [entry('valuation', '2026-01-10', 5000, '2026-01-10T10:00'), entry('contribution', '2026-01-10', 1000, '2026-01-10T11:00')];
  assert.equal(valueAt(sameDay, '2026-01-10'), 6000);
});

test('total aplicado e rendimento', () => {
  assert.deepEqual(flowsUntil(cdb, '2026-12-31'), { contributedCents: 150000, withdrawnCents: 20000, investedCents: 130000 });
  const summary = summarizeInvestment(cdb, '2026-12-31');
  assert.equal(summary.valueCents, 134500);
  assert.equal(summary.gainCents, 4500);
  assert.ok(Math.abs(summary.gainRate - 4500 / 130000) < 1e-9);
});

test('evolução mensal: rendimento do mês desconta aportes e resgates', () => {
  const series = buildInvestmentSeries([cdb], { startMonth: '2026-01', endMonth: '2026-03' });
  assert.deepEqual(series.map((item) => item.valueCents), [101000, 153000, 134500]);
  assert.deepEqual(series.map((item) => item.gainCents), [1000, 2000, 1500]);
  assert.deepEqual(series.map((item) => item.investedCents), [100000, 150000, 130000]);
  assert.equal(series[1].startValueCents, 101000);
  assert.ok(Math.abs(series[1].gainRate - 2000 / 151000) < 1e-9);
});

test('período: totais e rendimento do período', () => {
  const series = buildInvestmentSeries([cdb], { startMonth: '2026-02', endMonth: '2026-03' });
  const total = summarizeSeries(series);
  assert.equal(total.startValueCents, 101000);
  assert.equal(total.endValueCents, 134500);
  assert.equal(total.contributionsCents, 50000);
  assert.equal(total.withdrawalsCents, 20000);
  assert.equal(total.gainCents, 3500);
});

test('vários investimentos somam no mesmo mês', () => {
  const savings = [entry('contribution', '2026-02-01', 30000), entry('valuation', '2026-02-28', 30200)];
  const series = buildInvestmentSeries([cdb, savings], { startMonth: '2026-02', endMonth: '2026-02' });
  assert.equal(series[0].valueCents, 153000 + 30200);
  assert.equal(series[0].contributionsCents, 80000);
  assert.equal(series[0].gainCents, 2000 + 200);
});

test('utilitários de mês', () => {
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
  assert.equal(monthEnd('2024-02'), '2024-02-29');
  assert.deepEqual(monthsBetween('2025-11', '2026-02'), ['2025-11', '2025-12', '2026-01', '2026-02']);
  assert.equal(firstEntryMonth(cdb), '2026-01');
  assert.equal(firstEntryMonth([]), null);
});
