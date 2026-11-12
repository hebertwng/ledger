import { getAllRecords, getAllByIndex, putRecord } from './database.js';
import { getCurrentUser } from './auth.js';
import { t } from './i18n.js';
import ptBR from '../locales/pt-BR.js';
import enUS from '../locales/en-US.js';
import { createId } from '../utils/ids.js';
import { nowISOTimestamp } from '../utils/dates.js';

// Árvore de categorias padrão (seção 7). As chaves são usadas para resolver a tradução
// (core/i18n.js); os nomes gravados são texto comum a partir daí, editável pelo usuário.
// Ícone e cor de cada categoria principal padrão.
const DEFAULT_CATEGORY_STYLE = {
  housing: { icon: 'home', color: '#8193ff' },
  food: { icon: 'utensils', color: '#ff977c' },
  transport: { icon: 'car', color: '#5096de' },
  health: { icon: 'heart', color: '#ff6c6c' },
  education: { icon: 'graduation', color: '#8e6bd8' },
  shopping: { icon: 'bag', color: '#ff70a1' },
  leisure: { icon: 'plane', color: '#2bb5a9' },
  family: { icon: 'users', color: '#f0b429' },
  taxes: { icon: 'receipt', color: '#a1724e' },
  financial: { icon: 'bank', color: '#4b5563' },
  salary: { icon: 'briefcase', color: '#2ec27e' },
  investments: { icon: 'trendingUp', color: '#5096de' },
  extraIncome: { icon: 'star', color: '#f0b429' },
  gifts: { icon: 'gift', color: '#ff70a1' },
  rentals: { icon: 'key', color: '#8193ff' },
  otherIncome: { icon: 'refund', color: '#787878' },
};

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
      icon: DEFAULT_CATEGORY_STYLE[parent.key]?.icon || null,
      color: DEFAULT_CATEGORY_STYLE[parent.key]?.color || null,
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

// Espaços criados antes dos ícones de categoria: dá ícone e cor às categorias principais padrão
// que ainda não têm ícone (reconhecidas pelo nome em qualquer idioma). Não mexe nas que o
// usuário já personalizou.
export async function applyDefaultCategoryIcons(spaceId) {
  const dictionaries = await Promise.all([import('../locales/pt-BR.js'), import('../locales/en-US.js')]);
  const styleByName = new Map();
  for (const { default: dictionary } of dictionaries) {
    for (const [key, style] of Object.entries(DEFAULT_CATEGORY_STYLE)) {
      const name = dictionary[`categories.${key}`];
      if (name) styleByName.set(name.trim().toLowerCase(), style);
    }
  }
  const categories = await getAllByIndex('categories', 'bySpace', spaceId);
  for (const category of categories) {
    if (category.parentId || category.icon || category.deletedAt) continue;
    const style = styleByName.get(category.name.trim().toLowerCase());
    if (!style) continue;
    await putRecord('categories', { ...category, icon: style.icon, color: category.color || style.color });
  }
}

// Etapa 2: há sempre um único espaço ativo. A troca entre múltiplos espaços (seção 3)
// chega junto do compartilhamento, na Etapa 7.
// Nome que a pessoa informou para o espaço, ou '' se ainda é o nome padrão criado no primeiro
// acesso ("Pessoal"/"Personal") — nesse caso a interface não exibe nome nenhum.
const DEFAULT_SPACE_NAMES = new Set([ptBR['bootstrap.defaultSpaceName'], enUS['bootstrap.defaultSpaceName']].map((name) => name.toLowerCase()));

export function spaceDisplayName(space) {
  const ownerName = (space?.ownerName || '').trim();
  if (ownerName) return ownerName;
  const name = (space?.name || '').trim();
  return name && !DEFAULT_SPACE_NAMES.has(name.toLowerCase()) ? name : '';
}

// Nome com que a pessoa se identificou (Configurações → Seu perfil). Fica no próprio espaço, então
// entra na cópia de segurança. Quando houver login com Google, este campo pode ser preenchido com o
// nome da conta Google (a pessoa continua podendo trocá-lo aqui).
export async function updateOwnerName(name) {
  const space = await getActiveSpace();
  if (!space) return null;
  const user = getCurrentUser();
  const updated = {
    ...space,
    ownerName: String(name || '').trim().slice(0, 60),
    updatedAt: nowISOTimestamp(),
    updatedBy: user.uid,
    version: (space.version || 1) + 1,
  };
  await putRecord('spaces', updated);
  return updated;
}

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
