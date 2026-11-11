import { STORE_NAMES, readStores, replaceStores } from '../core/database.js';
import { nowISOTimestamp } from '../utils/dates.js';

export const BACKUP_FORMAT = 'ledger-backup';
export const BACKUP_VERSION = 1;

// Coleções de movimentação: apagá-las zera lançamentos, séries (parcelas/recorrências),
// transferências e faturas, mas mantém espaço, contas, cartões, categorias e limites de gastos.
export const MOVEMENT_STORES = Object.freeze(['transactions', 'transactionSeries', 'transfers', 'invoices', 'auditLogs', 'outbox']);

// Preferências locais ligadas aos dados (não às escolhas de interface como tema e idioma).
const DATA_LINKED_STORAGE_PREFIXES = ['ledger.categoryIconsApplied.', 'ledger.overviewCollapsed', 'ledger.hideValues'];

export async function buildBackup() {
  const stores = await readStores([...STORE_NAMES]);
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: nowISOTimestamp(), stores };
}

// Pura: confere se um objeto lido de arquivo é uma cópia do LEDGER que dá para restaurar.
// Devolve { ok: true, stores } ou { ok: false, reason }.
export function validateBackup(data) {
  if (!data || typeof data !== 'object') return { ok: false, reason: 'invalidFile' };
  if (data.format !== BACKUP_FORMAT || typeof data.stores !== 'object' || data.stores === null) return { ok: false, reason: 'notLedger' };
  if (Number(data.version) > BACKUP_VERSION) return { ok: false, reason: 'newerVersion' };
  const stores = {};
  for (const name of STORE_NAMES) {
    const records = data.stores[name] ?? [];
    if (!Array.isArray(records)) return { ok: false, reason: 'invalidFile' };
    stores[name] = records;
  }
  if (!stores.spaces.length) return { ok: false, reason: 'empty' };
  return { ok: true, stores };
}

// Pura: resumo de uma cópia (para o usuário confirmar o que vai ser restaurado).
export function summarizeBackup(stores) {
  const live = (name) => (stores[name] || []).filter((record) => !record.deletedAt).length;
  return {
    accounts: live('accounts'),
    creditCards: live('creditCards'),
    categories: live('categories'),
    transactions: live('transactions'),
  };
}

export async function restoreBackup(stores) {
  await replaceStores([...STORE_NAMES], stores);
  clearDataLinkedStorage();
}

export async function deleteMovements() {
  await replaceStores([...MOVEMENT_STORES]);
}

// Apaga tudo o que está gravado no navegador. Ao recarregar, o app cria de novo um espaço vazio
// com as categorias padrão — como numa primeira instalação.
export async function deleteAllData() {
  await replaceStores([...STORE_NAMES]);
  clearDataLinkedStorage();
}

function clearDataLinkedStorage() {
  try {
    for (const key of Object.keys(window.localStorage)) {
      if (DATA_LINKED_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix))) window.localStorage.removeItem(key);
    }
  } catch {
    // Sem localStorage: não há o que limpar.
  }
}
