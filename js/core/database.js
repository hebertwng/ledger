// Camada de persistência local (IndexedDB). Um object store por coleção (espelha a seção 4
// da especificação, mais "outbox" e "appMeta", que são internos e não documentados lá).
const DB_NAME = 'ledger';
const DB_VERSION = 2;

const STORE_DEFINITIONS = [
  { name: 'spaces', keyPath: 'id' },
  { name: 'members', keyPath: 'id', indexes: [{ name: 'bySpace', keyPath: 'spaceId' }] },
  { name: 'categories', keyPath: 'id', indexes: [{ name: 'bySpace', keyPath: 'spaceId' }] },
  { name: 'accounts', keyPath: 'id', indexes: [{ name: 'bySpace', keyPath: 'spaceId' }] },
  { name: 'creditCards', keyPath: 'id', indexes: [{ name: 'bySpace', keyPath: 'spaceId' }] },
  {
    name: 'invoices',
    keyPath: 'id',
    indexes: [
      { name: 'bySpace', keyPath: 'spaceId' },
      { name: 'byCreditCard', keyPath: 'creditCardId' },
    ],
  },
  { name: 'transactionSeries', keyPath: 'id', indexes: [{ name: 'bySpace', keyPath: 'spaceId' }] },
  {
    name: 'transactions',
    keyPath: 'id',
    indexes: [
      { name: 'bySpace', keyPath: 'spaceId' },
      { name: 'byAccount', keyPath: 'accountId' },
      { name: 'byCreditCard', keyPath: 'creditCardId' },
      { name: 'byInvoice', keyPath: 'invoiceId' },
      { name: 'bySeries', keyPath: 'seriesId' },
    ],
  },
  { name: 'transfers', keyPath: 'id', indexes: [{ name: 'bySpace', keyPath: 'spaceId' }] },
  { name: 'budgets', keyPath: 'id', indexes: [{ name: 'bySpace', keyPath: 'spaceId' }, { name: 'byCategory', keyPath: 'categoryId' }] },
  { name: 'auditLogs', keyPath: 'id', indexes: [{ name: 'bySpace', keyPath: 'spaceId' }] },
  { name: 'outbox', keyPath: 'opId' },
  { name: 'appMeta', keyPath: 'key' },
];

let dbPromise = null;

export function openDatabase() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      for (const store of STORE_DEFINITIONS) {
        if (db.objectStoreNames.contains(store.name)) continue;
        const objectStore = db.createObjectStore(store.name, { keyPath: store.keyPath });
        for (const index of store.indexes || []) {
          objectStore.createIndex(index.name, index.keyPath);
        }
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return dbPromise;
}

function promisifyRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function putRecord(storeName, record) {
  const db = await openDatabase();
  const tx = db.transaction(storeName, 'readwrite');
  await promisifyRequest(tx.objectStore(storeName).put(record));
  return record;
}

export async function getRecord(storeName, key) {
  const db = await openDatabase();
  const tx = db.transaction(storeName, 'readonly');
  return promisifyRequest(tx.objectStore(storeName).get(key));
}

export async function getAllRecords(storeName) {
  const db = await openDatabase();
  const tx = db.transaction(storeName, 'readonly');
  return promisifyRequest(tx.objectStore(storeName).getAll());
}

export async function getAllByIndex(storeName, indexName, value) {
  const db = await openDatabase();
  const tx = db.transaction(storeName, 'readonly');
  return promisifyRequest(tx.objectStore(storeName).index(indexName).getAll(value));
}

export const STORE_NAMES = Object.freeze(STORE_DEFINITIONS.map((store) => store.name));

// Lê o conteúdo de várias coleções numa única transação (cópia de segurança).
export async function readStores(storeNames) {
  const db = await openDatabase();
  const tx = db.transaction(storeNames, 'readonly');
  const entries = await Promise.all(storeNames.map(async (name) => [name, await promisifyRequest(tx.objectStore(name).getAll())]));
  return Object.fromEntries(entries);
}

// Esvazia as coleções indicadas e, opcionalmente, grava registros novos nelas — tudo numa única
// transação: ou tudo é aplicado, ou nada muda (uma falha no meio não deixa o banco pela metade).
export async function replaceStores(storeNames, recordsByStore = {}) {
  const db = await openDatabase();
  const tx = db.transaction(storeNames, 'readwrite');
  const done = new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Transação cancelada.'));
  });
  for (const name of storeNames) {
    const store = tx.objectStore(name);
    store.clear();
    for (const record of recordsByStore[name] || []) store.put(record);
  }
  await done;
}

export async function deleteRecord(storeName, key) {
  const db = await openDatabase();
  const tx = db.transaction(storeName, 'readwrite');
  await promisifyRequest(tx.objectStore(storeName).delete(key));
}
