import { getAllRecords, putRecord } from './database.js';
import { getCurrentUser } from './auth.js';
import { t } from './i18n.js';
import { createId } from '../utils/ids.js';
import { nowISOTimestamp } from '../utils/dates.js';

// Árvore de categorias padrão (seção 7). As chaves são usadas para resolver a tradução
// (core/i18n.js); os nomes gravados são texto comum a partir daí, editável pelo usuário.
const DEFAULT_CATEGORY_TREE = [
  { key: 'housing', kind: 'expense', children: ['rent', 'water', 'electricity', 'internet'] },
  { key: 'food', kind: 'expense', children: ['market', 'restaurants', 'delivery'] },
  { key: 'transport', kind: 'expense', children: ['fuel', 'maintenance', 'publicTransport'] },
  { key: 'health', kind: 'expense', children: ['appointments', 'pharmacy', 'exams'] },
  { key: 'education', kind: 'expense', children: ['courses', 'books', 'tuition'] },
  { key: 'shopping', kind: 'expense', children: ['clothing', 'electronics', 'accessories'] },
  { key: 'leisure', kind: 'expense', children: ['travel', 'outings', 'entertainment'] },
  { key: 'family', kind: 'expense', children: ['children', 'gifts', 'care'] },
  { key: 'taxes', kind: 'expense', children: ['propertyTax', 'vehicleTax', 'fees'] },
  { key: 'financial', kind: 'expense', children: ['interest', 'fees', 'charges'] },
  { key: 'salary', kind: 'income', children: ['salary', 'advance', 'bonus'] },
  { key: 'investments', kind: 'income', children: ['returns', 'dividends'] },
  { key: 'extraIncome', kind: 'income', children: ['freelance', 'services'] },
  { key: 'gifts', kind: 'income', children: ['donations', 'receivedValues'] },
  { key: 'rentals', kind: 'income', children: ['propertyIncome'] },
  { key: 'otherIncome', kind: 'income', children: ['refunds', 'otherEntries'] },
];

function buildCategoryRecords(spaceId, userId, createdAt) {
  const records = [];

  for (const parent of DEFAULT_CATEGORY_TREE) {
    const parentId = createId();
    records.push({
      id: parentId,
      spaceId,
      name: t(`categories.${parent.key}`),
      kind: parent.kind,
      parentId: null,
      icon: null,
      color: null,
      archived: false,
      createdAt,
      updatedAt: createdAt,
      createdBy: userId,
      updatedBy: userId,
      deletedAt: null,
      version: 1,
    });

    for (const childKey of parent.children) {
      records.push({
        id: createId(),
        spaceId,
        name: t(`categories.${parent.key}.${childKey}`),
        kind: parent.kind,
        parentId,
        icon: null,
        color: null,
        archived: false,
        createdAt,
        updatedAt: createdAt,
        createdBy: userId,
        updatedBy: userId,
        deletedAt: null,
        version: 1,
      });
    }
  }

  return records;
}

// Etapa 2: há sempre um único espaço ativo. A troca entre múltiplos espaços (seção 3)
// chega junto do compartilhamento, na Etapa 7.
export async function getActiveSpace() {
  const spaces = await getAllRecords('spaces');
  return spaces.find((space) => !space.deletedAt) || null;
}

// Cria o primeiro espaço financeiro local (com categorias padrão) na primeira execução.
// Se um espaço já existir, apenas o devolve — nunca recria ou duplica.
export async function ensureDefaultSpace() {
  const activeSpace = await getActiveSpace();
  if (activeSpace) return activeSpace;

  const user = getCurrentUser();
  const createdAt = nowISOTimestamp();

  const space = {
    id: createId(),
    name: t('bootstrap.defaultSpaceName'),
    type: 'personal',
    ownerId: user.uid,
    createdAt,
    updatedAt: createdAt,
    createdBy: user.uid,
    updatedBy: user.uid,
    deletedAt: null,
    version: 1,
  };
  await putRecord('spaces', space);

  for (const category of buildCategoryRecords(space.id, user.uid, createdAt)) {
    await putRecord('categories', category);
  }

  return space;
}
