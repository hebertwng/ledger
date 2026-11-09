import { getAllByIndex, putRecord, getRecord } from '../core/database.js';
import { getCurrentUser } from '../core/auth.js';
import { createId } from '../utils/ids.js';
import { nowISOTimestamp } from '../utils/dates.js';

// Um limite de gastos é sempre mensal e por categoria (seção "Limite de gastos"): um único
// valor reaplicado todo mês, não um valor por mês específico — mantém o cadastro simples.
const NEAR_LIMIT_THRESHOLD = 0.8;

export async function listBudgets(spaceId) {
  return (await getAllByIndex('budgets', 'bySpace', spaceId)).filter((budget) => !budget.deletedAt);
}

export async function createBudget(spaceId, input) {
  const user = getCurrentUser();
  const timestamp = nowISOTimestamp();
  const budget = {
    id: createId(),
    spaceId,
    categoryId: input.categoryId,
    limitCents: input.limitCents,
    createdAt: timestamp,
    updatedAt: timestamp,
    createdBy: user.uid,
    updatedBy: user.uid,
    deletedAt: null,
    version: 1,
  };
  await putRecord('budgets', budget);
  return budget;
}

export async function updateBudget(budgetId, changes) {
  const user = getCurrentUser();
  const budget = await getRecord('budgets', budgetId);
  if (!budget) throw new Error('Limite não encontrado.');
  const updated = { ...budget, ...changes, updatedAt: nowISOTimestamp(), updatedBy: user.uid, version: budget.version + 1 };
  await putRecord('budgets', updated);
  return updated;
}

export async function deleteBudget(budgetId) {
  const user = getCurrentUser();
  const budget = await getRecord('budgets', budgetId);
  if (!budget) throw new Error('Limite não encontrado.');
  const now = nowISOTimestamp();
  await putRecord('budgets', { ...budget, deletedAt: now, updatedAt: now, updatedBy: user.uid, version: budget.version + 1 });
}

// Pura: progresso de um limite de gastos dado o total já gasto na categoria no período.
export function calculateBudgetProgress(limitCents, spentCents) {
  const percentage = limitCents > 0 ? spentCents / limitCents : 0;
  return {
    limitCents,
    spentCents,
    remainingCents: limitCents - spentCents,
    percentage,
    isOverLimit: spentCents > limitCents,
    isNearLimit: percentage >= NEAR_LIMIT_THRESHOLD && spentCents <= limitCents,
  };
}
