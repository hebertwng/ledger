import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveCategoryDeletion, buildCategoryTree } from '../js/services/categoryRepository.js';

test('resolveCategoryDeletion permite excluir categoria sem filhos e sem lançamentos', () => {
  assert.deepEqual(resolveCategoryDeletion(0, 0), { allowed: true });
});

test('resolveCategoryDeletion bloqueia exclusão de categoria com subcategorias', () => {
  assert.deepEqual(resolveCategoryDeletion(0, 2), { allowed: false, reason: 'hasChildren' });
});

test('resolveCategoryDeletion bloqueia exclusão de categoria com lançamentos vinculados', () => {
  assert.deepEqual(resolveCategoryDeletion(3, 0), { allowed: false, reason: 'hasTransactions' });
});

test('buildCategoryTree agrupa subcategorias sob a categoria principal', () => {
  const categories = [
    { id: 'p1', name: 'Moradia', parentId: null },
    { id: 'c1', name: 'Aluguel', parentId: 'p1' },
    { id: 'c2', name: 'Água', parentId: 'p1' },
    { id: 'p2', name: 'Salário', parentId: null },
  ];
  const tree = buildCategoryTree(categories);
  assert.equal(tree.length, 2);
  const moradia = tree.find((node) => node.id === 'p1');
  assert.equal(moradia.children.length, 2);
  const salario = tree.find((node) => node.id === 'p2');
  assert.equal(salario.children.length, 0);
});
