// Datas (dia) são armazenadas como string ISO "YYYY-MM-DD"; timestamps como ISO 8601 completo.
export function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

export function nowISOTimestamp() {
  return new Date().toISOString();
}

export function formatDateDisplay(isoDate, locale = 'pt-BR') {
  if (!isoDate) return '';
  const [year, month, day] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return new Intl.DateTimeFormat(locale, { timeZone: 'UTC', dateStyle: 'medium' }).format(date);
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Semana corrente (segunda a domingo) contendo a data de referência — usado pelo filtro
// "esta semana" da seção 16.
export function currentWeekRange(referenceISODate = todayISODate()) {
  const [year, month, day] = referenceISODate.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  const monday = new Date(date.getTime() - daysSinceMonday * MS_PER_DAY);
  const sunday = new Date(monday.getTime() + 6 * MS_PER_DAY);
  return { startDate: monday.toISOString().slice(0, 10), endDate: sunday.toISOString().slice(0, 10) };
}

// Formata um "mês de referência" (YYYY-MM, usado pelas faturas) para exibição, ex.: "jan. de 2026".
export function formatReferenceMonth(referenceMonth, locale = 'pt-BR') {
  const [year, month] = referenceMonth.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, 1));
  return new Intl.DateTimeFormat(locale, { timeZone: 'UTC', month: 'short', year: 'numeric' }).format(date);
}

// Intervalo de datas (primeiro ao último dia) de um "YYYY-MM" qualquer — usado pelos filtros
// de período do dashboard e dos relatórios (seção 14/16), que trabalham com <input type="month">.
export function monthRange(yearMonth) {
  const [year, month] = yearMonth.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { startDate: `${yearMonth}-01`, endDate: `${yearMonth}-${String(lastDay).padStart(2, '0')}` };
}

export function currentMonthRange(referenceISODate = todayISODate()) {
  const [year, month] = referenceISODate.split('-').map(Number);
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));
  return { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) };
}
