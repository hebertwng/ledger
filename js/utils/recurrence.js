// Matemática pura de datas e valores para parcelamento (seção 9) e recorrência (seção 10).
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const SAFETY_MAX_OCCURRENCES = 500;

function toUTCDate(isoDate) {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function toISODate(date) {
  return date.toISOString().slice(0, 10);
}

function lastDayOfMonth(year, monthIndexZeroBased) {
  return new Date(Date.UTC(year, monthIndexZeroBased + 1, 0)).getUTCDate();
}

// Soma meses preservando o "dia" quando possível; cai para o último dia do mês de destino
// quando o dia original não existe nele (ex.: 31/jan + 1 mês = 28/fev, nunca 3/mar).
export function addMonths(isoDate, months) {
  const date = toUTCDate(isoDate);
  const originalDay = date.getUTCDate();
  const targetMonthIndex = date.getUTCMonth() + months;
  const targetYear = date.getUTCFullYear() + Math.floor(targetMonthIndex / 12);
  const normalizedMonthIndex = ((targetMonthIndex % 12) + 12) % 12;
  const day = Math.min(originalDay, lastDayOfMonth(targetYear, normalizedMonthIndex));
  return toISODate(new Date(Date.UTC(targetYear, normalizedMonthIndex, day)));
}

export function addWeeks(isoDate, weeks) {
  const date = toUTCDate(isoDate);
  return toISODate(new Date(date.getTime() + weeks * 7 * MS_PER_DAY));
}

export function addYears(isoDate, years) {
  return addMonths(isoDate, years * 12);
}

export function advanceDate(isoDate, frequency, steps) {
  if (frequency === 'weekly') return addWeeks(isoDate, steps);
  if (frequency === 'annual') return addYears(isoDate, steps);
  return addMonths(isoDate, steps);
}

// Pura: divide o valor total em N parcelas inteiras (centavos); a diferença de arredondamento
// é sempre ajustada na última parcela, nunca distribuída de forma que a soma não feche.
export function buildInstallmentAmounts(totalCents, installmentsCount) {
  const baseAmount = Math.floor(totalCents / installmentsCount);
  const amounts = new Array(installmentsCount).fill(baseAmount);
  amounts[installmentsCount - 1] += totalCents - baseAmount * installmentsCount;
  return amounts;
}

export function buildInstallmentDates(startDate, installmentsCount) {
  return Array.from({ length: installmentsCount }, (_, index) => advanceDate(startDate, 'monthly', index));
}

// Gera as datas de ocorrência de uma recorrência a partir de startDate, respeitando endDate
// (se houver) e o horizonte informado — por padrão os próximos 12 meses (seção 10), nunca
// gerando indefinidamente.
export function buildRecurringDates(startDate, frequency, endDate, horizonEndDate) {
  const effectiveEnd = endDate && endDate < horizonEndDate ? endDate : horizonEndDate;
  const dates = [];
  for (let step = 0; step < SAFETY_MAX_OCCURRENCES; step += 1) {
    const occurrenceDate = advanceDate(startDate, frequency, step);
    if (occurrenceDate > effectiveEnd) break;
    dates.push(occurrenceDate);
  }
  return dates;
}

export function addDays(isoDate, days) {
  const date = toUTCDate(isoDate);
  return toISODate(new Date(date.getTime() + days * MS_PER_DAY));
}

// Último dia do mês de uma data ISO qualquer (ex.: '2026-02-10' → '2026-02-28').
export function endOfMonth(isoDate) {
  const date = toUTCDate(isoDate);
  return toISODate(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)));
}

// Pura: decide quais ocorrências de uma série (parcelamento ou recorrência) ainda precisam ser
// criadas até "throughDate". As ocorrências não são mais geradas todas de uma vez na criação:
// só passam a existir quando o mês em que caem é visualizado. "existing"
// deve incluir também as ocorrências excluídas (deletedAt preenchido), para que uma parcela
// apagada "somente esta" nunca seja recriada.
export function planMissingOccurrences(series, existing, throughDate) {
  if (!series || series.deletedAt) return [];
  const planned = [];

  if (series.kind === 'installment') {
    const amounts = series.installmentAmountsCents;
    if (!Array.isArray(amounts) || amounts.length === 0) return [];
    const existingNumbers = new Set(existing.map((transaction) => transaction.installmentNumber));
    const dates = buildInstallmentDates(series.startDate, amounts.length);
    for (let index = 0; index < dates.length; index += 1) {
      const date = dates[index];
      if (date > throughDate) break;
      if (series.endDate && date > series.endDate) break;
      if (existingNumbers.has(index + 1)) continue;
      planned.push({ date, installmentNumber: index + 1, amountCents: amounts[index] });
    }
    return planned;
  }

  if (series.kind === 'recurring') {
    if (series.paused || !series.template) return [];
    const existingDates = new Set(existing.map((transaction) => transaction.date));
    const latestExisting = existing.reduce((latest, transaction) => (transaction.date > latest ? transaction.date : latest), '');
    for (const date of buildRecurringDates(series.startDate, series.frequency, series.endDate, throughDate)) {
      if (existingDates.has(date)) continue;
      // Ao retomar uma recorrência pausada, o período em que ela ficou pausada é pulado.
      if (series.resumeFrom && date < series.resumeFrom && date > latestExisting) continue;
      planned.push({ date, installmentNumber: null, amountCents: series.template.amountCents });
    }
  }
  return planned;
}

// Pura: soma (positiva) das parcelas de um parcelamento no cartão que ainda não foram geradas —
// elas já comprometem o limite do cartão mesmo antes de o mês delas ser visualizado.
export function unmaterializedInstallmentCents(series, existing) {
  if (!series || series.kind !== 'installment' || series.deletedAt || !Array.isArray(series.installmentAmountsCents)) return 0;
  const existingNumbers = new Set(existing.map((transaction) => transaction.installmentNumber));
  const dates = buildInstallmentDates(series.startDate, series.installmentAmountsCents.length);
  return series.installmentAmountsCents.reduce((sum, amount, index) => {
    if (existingNumbers.has(index + 1)) return sum;
    if (series.endDate && dates[index] > series.endDate) return sum;
    return sum + Math.abs(amount);
  }, 0);
}
