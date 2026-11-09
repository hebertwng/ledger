import { getAllByIndex, putRecord, getRecord } from '../core/database.js';
import { getCurrentUser } from '../core/auth.js';
import { createId } from '../utils/ids.js';
import { nowISOTimestamp } from '../utils/dates.js';

export async function listCategories(spaceId) {
  const categories = (await getAllByIndex('categories', 'bySpace', spaceId)).filter((category) => !category.deletedAt);
  return categories.sort((a, b) => a.name.localeCompare(b.name));
}

// Pura: organiza a lista plana (categorias + subcategorias) em árvore para exibição.
export function buildCategoryTree(categories) {
  const parents = categories.filter((category) => !category.parentId);
  return parents.map((parent) => ({
    ...parent,
    children: categories.filter((category) => category.parentId === parent.id),
  }));
}

export async function createCategory(spaceId, input) {
  const user = getCurrentUser();
  const createdAt = nowISOTimestamp();
  const category = {
    id: createId(),
    spaceId,
    name: input.name.trim(),
    kind: input.kind,
    parentId: input.parentId || null,
    icon: input.icon || null,
    color: input.color || null,
    archived: false,
    createdAt,
    updatedAt: createdAt,
    createdBy: user.uid,
    updatedBy: user.uid,
    deletedAt: null,
    version: 1,
  };
  await putRecord('categories', category);
  return category;
}

export async function updateCategory(categoryId, changes) {
  const user = getCurrentUser();
  const category = await getRecord('categories', categoryId);
  if (!category) throw new Error('Categoria não encontrada.');
  const updated = { ...category, ...changes, updatedAt: nowISOTimestamp(), updatedBy: user.uid, version: category.version + 1 };
  await putRecord('categories', updated);
  return updated;
}

export async function setCategoryArchived(categoryId, archived) {
  return updateCategory(categoryId, { archived });
}

// Pura: decide se uma categoria pode ser excluída diretamente, ou se exige tratamento
// (reclassificar os lançamentos para outra categoria, ou apenas arquivar) — seção 7.
export function resolveCategoryDeletion(linkedTransactionsCount, childCategoriesCount) {
  if (childCategoriesCount > 0) return { allowed: false, reason: 'hasChildren' };
  if (linkedTransactionsCount > 0) return { allowed: false, reason: 'hasTransactions' };
  return { allowed: true };
}

export async function deleteCategory(spaceId, categoryId) {
  const [transactions, categories] = await Promise.all([
    getAllByIndex('transactions', 'bySpace', spaceId),
    getAllByIndex('categories', 'bySpace', spaceId),
  ]);
  const linkedTransactionsCount = transactions.filter((t) => t.categoryId === categoryId && !t.deletedAt).length;
  const childCategoriesCount = categories.filter((c) => c.parentId === categoryId && !c.deletedAt).length;

  const decision = resolveCategoryDeletion(linkedTransactionsCount, childCategoriesCount);
  if (!decision.allowed) return decision;

  const category = await getRecord('categories', categoryId);
  const user = getCurrentUser();
  const now = nowISOTimestamp();
  await putRecord('categories', { ...category, deletedAt: now, updatedAt: now, updatedBy: user.uid, version: category.version + 1 });
  return { allowed: true };
}

// Move todos os lançamentos da categoria para outra categoria antes de excluí-la logicamente.
export async function reclassifyAndDeleteCategory(spaceId, categoryId, targetCategoryId) {
  const transactions = await getAllByIndex('transactions', 'bySpace', spaceId);
  const linked = transactions.filter((t) => t.categoryId === categoryId && !t.deletedAt);
  const user = getCurrentUser();
  const now = nowISOTimestamp();

  for (const transaction of linked) {
    await putRecord('transactions', {
      ...transaction,
      categoryId: targetCategoryId,
      updatedAt: now,
      updatedBy: user.uid,
      version: transaction.version + 1,
    });
  }

  const category = await getRecord('categories', categoryId);
  await putRecord('categories', { ...category, deletedAt: now, updatedAt: now, updatedBy: user.uid, version: category.version + 1 });
}
