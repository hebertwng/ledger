// Saúde financeira do mês → nível de Ledi (1 Crítico · 2 Baixo · 3 Equilibrado · 4 Confortável ·
// 5 Excelente). Pura: recebe números já calculados, sem acesso a banco.
//
// Pontuação de 0 a 100, somando quatro fatores proporcionais (nenhum decide sozinho):
//
//   Sobra do mês      até 40   (receitas − despesas) / receitas do mês, contando pendentes.
//                              −20% ou pior → 0 · 0% → 16 · 10% → 24 · 20% → 32 · 30% ou mais → 40.
//                              Sem movimento → 20 (neutro). Despesas sem receita → 0.
//   Reserva           até 30   quantos meses de despesas o SALDO PREVISTO cobre (média de despesas
//                              dos últimos 3 meses). 0 → 0 · 1 mês → 10 · 2 → 20 · 3 ou mais → 30.
//   Contas em dia     até 15   15, menos 5 por conta/fatura atrasada.
//   Limites de gastos até 15   média dos limites: dentro → 1 · perto (80%+) → 0,5 · estourado → 0.
//                              Sem limites cadastrados → 10 (neutro).
//
// Nível pela pontuação: 0–19 → 1 · 20–39 → 2 · 40–59 → 3 · 60–79 → 4 · 80–100 → 5.
// Trava do saldo previsto negativo, proporcional ao valor devido (comparado à despesa média de um
// mês; sem despesas, às receitas do mês):
//   devendo até 50% de um mês → no máximo 2 (Baixo) · mais de 50% → 1 (Crítico).
//
// Tudo é calculado pelos valores PREVISTOS (contando lançamentos pendentes): saldo previsto,
// receitas e despesas previstas do mês. O saldo confirmado não entra no cálculo.
export const HEALTH_LEVELS = Object.freeze([1, 2, 3, 4, 5]);

export const FACTOR_MAX = Object.freeze({ surplus: 40, reserve: 30, onTime: 15, budgets: 15 });

const SURPLUS_FLOOR = -0.2;
const SURPLUS_CEIL = 0.3;
const RESERVE_FULL_MONTHS = 3;
const OVERDUE_PENALTY = 5;
const NO_BUDGETS_POINTS = 10;
const NO_MOVEMENT_POINTS = 20;
// Saldo previsto negativo: acima desta fração de um mês de despesas, o nível é Crítico.
export const DEBT_CRITICAL_RATIO = 0.5;

const clamp01 = (value) => Math.max(0, Math.min(1, value));
const round1 = (value) => Math.round(value * 10) / 10;

function toneOf(points, max) {
  const ratio = max > 0 ? points / max : 0;
  if (ratio >= 0.75) return 'good';
  if (ratio >= 0.4) return 'neutral';
  return 'bad';
}

export function levelFromScore(score) {
  if (score >= 80) return 5;
  if (score >= 60) return 4;
  if (score >= 40) return 3;
  if (score >= 20) return 2;
  return 1;
}

export function computeFinancialHealth({
  incomeCents = 0,
  expenseCents = 0,
  projectedBalanceCents = 0,
  avgMonthlyExpenseCents = expenseCents,
  overdueCount = 0,
  budgetsTotal = 0,
  budgetsNear = 0,
  budgetsOver = 0,
} = {}) {
  const factors = [];

  // Sobra do mês
  const hasMovement = incomeCents > 0 || expenseCents > 0;
  const savingsRate = incomeCents > 0 ? (incomeCents - expenseCents) / incomeCents : null;
  let surplus;
  if (!hasMovement) surplus = { key: 'noMovement', points: NO_MOVEMENT_POINTS };
  else if (savingsRate === null) surplus = { key: 'noIncome', points: 0 };
  else {
    surplus = {
      key: savingsRate < 0 ? 'surplusNegative' : 'surplus',
      points: clamp01((savingsRate - SURPLUS_FLOOR) / (SURPLUS_CEIL - SURPLUS_FLOOR)) * FACTOR_MAX.surplus,
      params: { rate: Math.abs(savingsRate) },
    };
  }
  factors.push({ factor: 'surplus', max: FACTOR_MAX.surplus, ...surplus });

  // Reserva (saldo previsto ÷ despesa média mensal)
  let reserve;
  if (projectedBalanceCents <= 0) reserve = { key: 'reserveNone', points: 0 };
  else if (avgMonthlyExpenseCents <= 0) reserve = { key: 'reserveNoExpenses', points: FACTOR_MAX.reserve };
  else {
    const months = projectedBalanceCents / avgMonthlyExpenseCents;
    reserve = { key: 'reserve', points: clamp01(months / RESERVE_FULL_MONTHS) * FACTOR_MAX.reserve, params: { months: round1(months) } };
  }
  factors.push({ factor: 'reserve', max: FACTOR_MAX.reserve, ...reserve });

  // Contas em dia
  factors.push({
    factor: 'onTime',
    max: FACTOR_MAX.onTime,
    key: overdueCount > 0 ? 'overdue' : 'onTime',
    points: Math.max(0, FACTOR_MAX.onTime - overdueCount * OVERDUE_PENALTY),
    params: { count: overdueCount },
  });

  // Limites de gastos
  let budgets;
  if (budgetsTotal <= 0) budgets = { key: 'noBudgets', points: NO_BUDGETS_POINTS };
  else {
    const okCount = Math.max(0, budgetsTotal - budgetsNear - budgetsOver);
    budgets = {
      key: budgetsOver > 0 ? 'overBudget' : budgetsNear > 0 ? 'nearBudget' : 'budgetsOk',
      points: ((okCount + budgetsNear * 0.5) / budgetsTotal) * FACTOR_MAX.budgets,
      params: { count: budgetsOver || budgetsNear, ok: okCount, total: budgetsTotal },
    };
  }
  factors.push({ factor: 'budgets', max: FACTOR_MAX.budgets, ...budgets });

  for (const factor of factors) {
    factor.points = Math.round(factor.points);
    factor.tone = toneOf(factor.points, factor.max);
    factor.params = factor.params || {};
  }

  const score = factors.reduce((sum, factor) => sum + factor.points, 0);
  let level = levelFromScore(score);
  const alerts = [];
  if (projectedBalanceCents < 0) {
    const reference = avgMonthlyExpenseCents > 0 ? avgMonthlyExpenseCents : incomeCents;
    // Sem nenhuma referência (nem despesas, nem receitas), qualquer dívida conta como grande.
    const debtRatio = reference > 0 ? Math.abs(projectedBalanceCents) / reference : Infinity;
    const critical = debtRatio > DEBT_CRITICAL_RATIO;
    level = critical ? 1 : Math.min(level, 2);
    alerts.push({
      key: critical ? 'projectedNegativeCritical' : 'projectedNegative',
      tone: 'bad',
      params: Number.isFinite(debtRatio) ? { rate: debtRatio } : {},
    });
  }

  // Fator mais fraco (proporcionalmente) — orienta a dica de Ledi.
  const weakest = factors.reduce((worst, factor) => (factor.points / factor.max < worst.points / worst.max ? factor : worst), factors[0]);
  const tip = score >= 80 && !alerts.length ? 'excellent' : weakest.factor;

  return { level, score, savingsRate, factors, alerts, reasons: [...alerts, ...factors], tip };
}
