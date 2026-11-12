// Cálculos dos investimentos — puros (sem banco), para ficarem simples de testar.
//
// Investimentos ficam à parte dos lançamentos: não entram nas receitas/despesas do mês, nos saldos
// das contas nem na saúde financeira de Ledi. Cada investimento tem movimentações:
//   • contribution (aporte)  → soma ao valor e ao total aplicado;
//   • withdrawal  (resgate)  → subtrai do valor e do total aplicado;
//   • valuation   (atualização do valor) → define o valor do investimento naquela data (o saldo que
//     a instituição informa); a diferença para o que estava é o rendimento.
// As movimentações são aplicadas em ordem (data e, no mesmo dia, ordem de registro).
export const INVESTMENT_TYPES = Object.freeze(['fixedIncome', 'treasury', 'savings', 'stocks', 'funds', 'realEstateFunds', 'pension', 'crypto', 'other']);
export const ENTRY_KINDS = Object.freeze(['contribution', 'withdrawal', 'valuation']);

export function sortEntries(entries) {
  return entries
    .slice()
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : String(a.createdAt || '').localeCompare(String(b.createdAt || ''))));
}

// Valor do investimento ao fim do dia "date" (AAAA-MM-DD).
export function valueAt(entries, date) {
  let value = 0;
  for (const entry of sortEntries(entries)) {
    if (entry.date > date) break;
    if (entry.kind === 'valuation') value = entry.amountCents;
    else if (entry.kind === 'contribution') value += entry.amountCents;
    else if (entry.kind === 'withdrawal') value -= entry.amountCents;
  }
  return value;
}

// Aportes, resgates e total aplicado (aportes − resgates) até "date".
export function flowsUntil(entries, date) {
  let contributed = 0;
  let withdrawn = 0;
  for (const entry of entries) {
    if (entry.date > date) continue;
    if (entry.kind === 'contribution') contributed += entry.amountCents;
    else if (entry.kind === 'withdrawal') withdrawn += entry.amountCents;
  }
  return { contributedCents: contributed, withdrawnCents: withdrawn, investedCents: contributed - withdrawn };
}

export function summarizeInvestment(entries, date) {
  const valueCents = valueAt(entries, date);
  const flows = flowsUntil(entries, date);
  const gainCents = valueCents - flows.investedCents;
  return { valueCents, ...flows, gainCents, gainRate: flows.investedCents > 0 ? gainCents / flows.investedCents : null };
}

/* ------------------------------------------------------------------ */
/* Meses                                                               */
/* ------------------------------------------------------------------ */
export function shiftMonth(yearMonth, delta) {
  const [year, month] = yearMonth.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function monthEnd(yearMonth) {
  const [year, month] = yearMonth.split('-').map(Number);
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${yearMonth}-${String(last).padStart(2, '0')}`;
}

export function monthsBetween(startMonth, endMonth) {
  const months = [];
  for (let month = startMonth; month <= endMonth && months.length < 600; month = shiftMonth(month, 1)) months.push(month);
  return months;
}

// Mês da primeira movimentação (ou null, sem movimentações).
export function firstEntryMonth(entries) {
  let first = null;
  for (const entry of entries) if (!first || entry.date < first) first = entry.date;
  return first ? first.slice(0, 7) : null;
}

/**
 * Evolução mês a mês de um conjunto de investimentos (já filtrado). groups: lista de listas de
 * movimentações, uma por investimento. Para cada mês: valor ao fim do mês, aportes, resgates, total
 * aplicado acumulado e rendimento do mês (= valor final − valor inicial − aportes + resgates), com
 * o percentual sobre o que estava aplicado no mês (valor inicial + aportes).
 */
export function buildInvestmentSeries(groups, { startMonth, endMonth }) {
  const all = groups.flat();
  const sumValue = (date) => groups.reduce((sum, entries) => sum + valueAt(entries, date), 0);
  let previousValue = sumValue(monthEnd(shiftMonth(startMonth, -1)));
  return monthsBetween(startMonth, endMonth).map((month) => {
    const start = `${month}-01`;
    const end = monthEnd(month);
    let contributionsCents = 0;
    let withdrawalsCents = 0;
    for (const entry of all) {
      if (entry.date < start || entry.date > end) continue;
      if (entry.kind === 'contribution') contributionsCents += entry.amountCents;
      else if (entry.kind === 'withdrawal') withdrawalsCents += entry.amountCents;
    }
    const valueCents = sumValue(end);
    const startValueCents = previousValue;
    const gainCents = valueCents - startValueCents - contributionsCents + withdrawalsCents;
    const base = startValueCents + contributionsCents;
    previousValue = valueCents;
    return {
      month,
      startValueCents,
      valueCents,
      contributionsCents,
      withdrawalsCents,
      netFlowCents: contributionsCents - withdrawalsCents,
      investedCents: flowsUntil(all, end).investedCents,
      gainCents,
      gainRate: base > 0 ? gainCents / base : null,
    };
  });
}

// Totais de um período a partir da série mensal.
export function summarizeSeries(series) {
  if (!series.length) return { startValueCents: 0, endValueCents: 0, contributionsCents: 0, withdrawalsCents: 0, gainCents: 0, gainRate: null };
  const startValueCents = series[0].startValueCents;
  const endValueCents = series[series.length - 1].valueCents;
  const contributionsCents = series.reduce((sum, item) => sum + item.contributionsCents, 0);
  const withdrawalsCents = series.reduce((sum, item) => sum + item.withdrawalsCents, 0);
  const gainCents = endValueCents - startValueCents - contributionsCents + withdrawalsCents;
  const base = startValueCents + contributionsCents;
  return { startValueCents, endValueCents, contributionsCents, withdrawalsCents, gainCents, gainRate: base > 0 ? gainCents / base : null };
}
