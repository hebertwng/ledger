// Máscara monetária dos campos de valor (input[data-money]): os dígitos entram pela direita, como
// em app de banco — "1" vira 0,01, "12345" vira 123,45 — sempre com separador de milhar. Um "-"
// em qualquer posição deixa o valor negativo (útil no saldo inicial de conta).

export function formatCentsForInput(cents, locale = 'pt-BR') {
  const value = Math.abs(Math.trunc(Number(cents) || 0)) / 100;
  const text = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
  return cents < 0 ? `-${text}` : text;
}

// Pura: aplica a máscara a um texto digitado e devolve o texto formatado.
export function maskMoneyText(text, locale = 'pt-BR', { allowNegative = false } = {}) {
  const raw = String(text ?? '');
  const digits = raw.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  if (!digits) return allowNegative && raw.includes('-') ? '-' : '';
  const cents = Number(digits.slice(-15));
  return formatCentsForInput(allowNegative && raw.includes('-') ? -cents : cents, locale);
}

export function attachMoneyMask(root, getLocale) {
  // Fase de captura: formata antes de qualquer outro ouvinte ler o valor do campo.
  root.addEventListener('input', (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !input.hasAttribute('data-money')) return;
    const masked = maskMoneyText(input.value, getLocale(), { allowNegative: input.hasAttribute('data-money-negative') });
    if (masked !== input.value) {
      input.value = masked;
      input.setSelectionRange(masked.length, masked.length);
    }
  }, true);
}
