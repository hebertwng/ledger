// Funções puras de agregação para o Dashboard (seção 14) e Relatórios (seção 15). Operam sobre
// listas já carregadas (sem acesso a banco), para permanecerem simples de testar.
import { todayISODate } from '../utils/dates.js';
import { addMonths } from '../utils/recurrence.js';

function monthKey(isoDate) {
  return isoDate.slice(0, 7);
}

export function sumByKind(transactions, kind) {
  return transactions.filter((transaction) => transaction.kind === kind).reduce((sum, transaction) => sum + Math.abs(transaction.amountCents), 0);
}

// Agrupa receitas/despesas por categoria. Com rollup=true, uma subcategoria é somada na
// categoria principal; com rollup=false, cada categoria/subcategoria fica em sua própria linha.
export function groupByCategory(transactions, categoriesById, kind, { rollup = false } = {}) {
  const buckets = new Map();
  for (const transaction of transactions) {
    if (transaction.kind !== kind) continue;
    let category = transaction.categoryId ? categoriesById.get(transaction.categoryId) : null;
    if (rollup && category && category.parentId) {
      category = categoriesById.get(category.parentId) || category;
    }
    const key = category ? category.id : 'none';
    if (!buckets.has(key)) {
      buckets.set(key, { categoryId: category ? category.id : null, name: category ? category.name : null, totalCents: 0 });
    }
    buckets.get(key).totalCents += Math.abs(transaction.amountCents);
  }
  return Array.from(buckets.values()).sort((a, b) => b.totalCents - a.totalCents);
}

export function groupByAccount(transactions, accountsById) {
  const buckets = new Map();
  for (const transaction of transactions) {
    if (transaction.kind !== 'expense' || !transaction.accountId) continue;
    const account = accountsById.get(transaction.accountId);
    if (!buckets.has(transaction.accountId)) {
      buckets.set(transaction.accountId, { accountId: transaction.accountId, name: account ? account.name : null, totalCents: 0 });
    }
    buckets.get(transaction.accountId).totalCents += Math.abs(transaction.amountCents);
  }
  return Array.from(buckets.values()).sort((a, b) => b.totalCents - a.totalCents);
}

export function groupByCard(transactions, cardsById) {
  const buckets = new Map();
  for (const transaction of transactions) {
    if (transaction.kind !== 'expense' || !transaction.creditCardId) continue;
    const card = cardsById.get(transaction.creditCardId);
    if (!buckets.has(transaction.creditCardId)) {
      buckets.set(transaction.creditCardId, { creditCardId: transaction.creditCardId, name: card ? card.name : null, totalCents: 0 });
    }
    buckets.get(transaction.creditCardId).totalCents += Math.abs(transaction.amountCents);
  }
  return Array.from(buckets.values()).sort((a, b) => b.totalCents - a.totalCents);
}

export function topExpenses(transactions, limit = 10) {
  return transactions
    .filter((transaction) => transaction.kind === 'expense')
    .slice()
    .sort((a, b) => Math.abs(b.amountCents) - Math.abs(a.amountCents))
    .slice(0, limit);
}

// Série mensal (receita/despesa/resultado) dos últimos "monthsCount" meses, terminando em
// referenceDate — usada pelos gráficos de evolução e comparação (seção 14).
export function buildMonthlySeries(transactions, { monthsCount = 12, referenceDate = todayISODate() } = {}) {
  const months = [];
  for (let i = monthsCount - 1; i >= 0; i -= 1) {
    months.push(monthKey(addMonths(referenceDate, -i)));
  }
  const totals = new Map(months.map((month) => [month, { month, incomeCents: 0, expenseCents: 0 }]));

  for (const transaction of transactions) {
    if (transaction.kind !== 'income' && transaction.kind !== 'expense') continue;
    const key = monthKey(transaction.date);
    if (!totals.has(key)) continue;
    const bucket = totals.get(key);
    if (transaction.kind === 'income') bucket.incomeCents += Math.abs(transaction.amountCents);
    else bucket.expenseCents += Math.abs(transaction.amountCents);
  }

  return months.map((month) => {
    const bucket = totals.get(month);
    return { ...bucket, resultCents: bucket.incomeCents - bucket.expenseCents };
  });
}

export function buildYearlySeries(transactions, { yearsCount = 5, referenceYear = Number(todayISODate().slice(0, 4)) } = {}) {
  const years = Array.from({ length: yearsCount }, (_, index) => referenceYear - (yearsCount - 1 - index));
  const totals = new Map(years.map((year) => [year, { year, incomeCents: 0, expenseCents: 0 }]));

  for (const transaction of transactions) {
    if (transaction.kind !== 'income' && transaction.kind !== 'expense') continue;
    const year = Number(transaction.date.slice(0, 4));
    if (!totals.has(year)) continue;
    const bucket = totals.get(year);
    if (transaction.kind === 'income') bucket.incomeCents += Math.abs(transaction.amountCents);
    else bucket.expenseCents += Math.abs(transaction.amountCents);
  }

  return years.map((year) => {
    const bucket = totals.get(year);
    return { ...bucket, resultCents: bucket.incomeCents - bucket.expenseCents };
  });
}

export function upcomingDueInvoices(invoices, limit = 3) {
  return invoices
    .filter((invoice) => invoice.status !== 'paid')
    .slice()
    .sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0))
    .slice(0, limit);
}
