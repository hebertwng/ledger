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
