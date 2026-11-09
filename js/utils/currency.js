// Valores monetários são sempre inteiros em centavos (nunca ponto flutuante), conforme a especificação.
const CURRENCY_BY_LOCALE = {
  'pt-BR': 'BRL',
  'en-US': 'USD',
};

export function centsToDisplay(cents, locale = 'pt-BR') {
  const amount = (cents ?? 0) / 100;
  const currency = CURRENCY_BY_LOCALE[locale] || CURRENCY_BY_LOCALE['pt-BR'];
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount);
}

// Aceita tanto "1.234,56" (pt-BR) quanto "1234.56" (en-US) e devolve centavos inteiros.
export function parseCurrencyInputToCents(text) {
  const normalized = String(text ?? '').trim().replace(/[^\d,.-]/g, '');
  if (!normalized) return 0;

  const lastComma = normalized.lastIndexOf(',');
  const lastDot = normalized.lastIndexOf('.');
  const decimalSeparatorIndex = Math.max(lastComma, lastDot);

  let integerPart = normalized;
  let decimalPart = '00';

  if (decimalSeparatorIndex !== -1) {
    integerPart = normalized.slice(0, decimalSeparatorIndex).replace(/[.,]/g, '');
    decimalPart = normalized
      .slice(decimalSeparatorIndex + 1)
      .replace(/[.,]/g, '')
      .padEnd(2, '0')
      .slice(0, 2);
  }

  const isNegative = integerPart.trim().startsWith('-');
  integerPart = integerPart.replace('-', '') || '0';

  const cents = parseInt(integerPart, 10) * 100 + parseInt(decimalPart || '0', 10);
  return isNegative ? -cents : cents;
}
