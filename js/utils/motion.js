import { centsToDisplay } from './currency.js';

export function prefersReducedMotion() {
  return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
}

// Anima os valores em dinheiro de [data-countup="<centavos>"] de zero até o valor final,
// sempre terminando exatamente no valor formatado.
export function countUpMoney(root, locale, { duration = 900 } = {}) {
  const elements = root.querySelectorAll('[data-countup]');
  if (!elements.length || prefersReducedMotion()) return;
  const start = performance.now();
  const targets = [...elements].map((element) => ({ element, cents: Number(element.dataset.countup) || 0 }));
  const ease = (progress) => 1 - Math.pow(1 - progress, 3);

  const step = (now) => {
    const progress = Math.min(1, (now - start) / duration);
    for (const { element, cents } of targets) {
      if (!element.isConnected) continue;
      element.textContent = centsToDisplay(Math.round(cents * ease(progress)), locale);
    }
    if (progress < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
