import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeFinancialHealth, levelFromScore } from '../js/services/financialHealth.js';

const points = (health) => Object.fromEntries(health.factors.map((factor) => [factor.factor, factor.points]));

test('faixas de nível pela pontuação', () => {
  assert.deepEqual([0, 19, 20, 39, 40, 59, 60, 79, 80, 100].map(levelFromScore), [1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
});

test('sem nenhum dado: neutro (sobra 20, reserva 0, em dia 15, sem limites 10) → nível 3', () => {
  const health = computeFinancialHealth({});
  assert.deepEqual(points(health), { surplus: 20, reserve: 0, onTime: 15, budgets: 10 });
  assert.equal(health.score, 45);
  assert.equal(health.level, 3);
});

test('sobra do mês é proporcional, de −20% (0) a 30% (40)', () => {
  const surplusFor = (expense) => points(computeFinancialHealth({ incomeCents: 100000, expenseCents: expense })).surplus;
  assert.equal(surplusFor(120000), 0);
  assert.equal(surplusFor(100000), 16);
  assert.equal(surplusFor(90000), 24);
  assert.equal(surplusFor(80000), 32);
  assert.equal(surplusFor(70000), 40);
  assert.equal(surplusFor(10000), 40);
});

test('reserva = meses de despesa cobertos pelo saldo previsto (3 meses = 30)', () => {
  const reserveFor = (projected) => points(computeFinancialHealth({ projectedBalanceCents: projected, avgMonthlyExpenseCents: 100000 })).reserve;
  assert.equal(reserveFor(0), 0);
  assert.equal(reserveFor(100000), 10);
  assert.equal(reserveFor(200000), 20);
  assert.equal(reserveFor(900000), 30);
});

test('um salário grande sem reserva não leva direto ao nível máximo', () => {
  const health = computeFinancialHealth({
    incomeCents: 500000,
    expenseCents: 150000,
    projectedBalanceCents: 350000,
    avgMonthlyExpenseCents: 300000,
  });
  // sobra 40 + reserva ~12 + em dia 15 + sem limites 10 = 77 → Confortável
  assert.equal(health.level, 4);
});

test('gastar mais do que recebe com pouca reserva → Baixo', () => {
  const health = computeFinancialHealth({
    incomeCents: 500000,
    expenseCents: 520000,
    projectedBalanceCents: 50000,
    avgMonthlyExpenseCents: 500000,
  });
  assert.equal(health.level, 2);
});

test('atrasos e limites estourados reduzem a pontuação proporcionalmente', () => {
  const base = { incomeCents: 100000, expenseCents: 70000, projectedBalanceCents: 300000, avgMonthlyExpenseCents: 100000 };
  assert.equal(computeFinancialHealth(base).score, 95);
  assert.equal(computeFinancialHealth({ ...base, overdueCount: 2 }).score, 85);
  assert.equal(computeFinancialHealth({ ...base, budgetsTotal: 2, budgetsOver: 1 }).score, 93);
  assert.equal(computeFinancialHealth({ ...base, budgetsTotal: 2, budgetsNear: 2 }).score, 93);
});

test('saldo previsto negativo: Baixo se deve até 50% de um mês de despesas, Crítico acima disso', () => {
  const good = { incomeCents: 100000, expenseCents: 50000, avgMonthlyExpenseCents: 100000 };
  const small = computeFinancialHealth({ ...good, projectedBalanceCents: -50000 });
  assert.equal(small.level, 2);
  assert.equal(small.reasons[0].key, 'projectedNegative');
  assert.equal(small.reasons[0].params.rate, 0.5);
  const large = computeFinancialHealth({ ...good, projectedBalanceCents: -50001 });
  assert.equal(large.level, 1);
  assert.equal(large.reasons[0].key, 'projectedNegativeCritical');
  // Nunca sobe por estar negativo: com pontuação já baixa, continua no nível dela.
  const alreadyLow = computeFinancialHealth({ incomeCents: 100000, expenseCents: 150000, avgMonthlyExpenseCents: 100000, overdueCount: 3, projectedBalanceCents: -10000 });
  assert.equal(alreadyLow.level, 1);
  // Sem despesas, compara com as receitas do mês; sem referência nenhuma, é Crítico.
  assert.equal(computeFinancialHealth({ incomeCents: 100000, avgMonthlyExpenseCents: 0, projectedBalanceCents: -20000 }).level, 2);
  assert.equal(computeFinancialHealth({ projectedBalanceCents: -100 }).level, 1);
});

test('o nível segue só o previsto: saldo confirmado não entra no cálculo', () => {
  const base = { incomeCents: 100000, expenseCents: 70000, projectedBalanceCents: 300000, avgMonthlyExpenseCents: 100000 };
  // Mesmo que o confirmado esteja negativo (ex.: receitas ainda pendentes), vale o previsto.
  assert.equal(computeFinancialHealth({ ...base, confirmedBalanceCents: -50000 }).level, computeFinancialHealth(base).level);
  assert.equal(computeFinancialHealth(base).level, 5);
});

test('dica aponta o fator mais fraco, ou "excellent" com 80+', () => {
  assert.equal(computeFinancialHealth({ incomeCents: 100000, expenseCents: 70000, projectedBalanceCents: 10, avgMonthlyExpenseCents: 100000 }).tip, 'reserve');
  assert.equal(computeFinancialHealth({ incomeCents: 100000, expenseCents: 70000, projectedBalanceCents: 900000, avgMonthlyExpenseCents: 100000 }).tip, 'excellent');
});
