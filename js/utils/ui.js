import { iconSvg, hasIcon, CATEGORY_ICON_KEYS } from './icons.js';
import { escapeHtml } from './html.js';

// Paleta oferecida no cadastro de categoria (cores médias, legíveis com ícone branco por cima).
export const CATEGORY_COLORS = Object.freeze([
  '#8193ff', '#5096de', '#2bb5a9', '#2ec27e', '#7cb342', '#f0b429',
  '#ff977c', '#ff6c6c', '#e05561', '#ff70a1', '#c671e4', '#8e6bd8',
  '#a1724e', '#787878', '#4b5563', '#2e312d',
]);

// Logos de instituições disponíveis em assets/icons/institutions/ (escolhidas no cadastro de
// conta e de cartão). A chave é o nome do arquivo, sem extensão.
export const INSTITUTIONS = Object.freeze([
  { key: 'bb', label: 'Banco do Brasil' },
  { key: 'bradesco', label: 'Bradesco' },
  { key: 'btgpactual', label: 'BTG Pactual' },
  { key: 'c6bank', label: 'C6 Bank' },
  { key: 'caixa', label: 'Caixa' },
  { key: 'cooperativa-ailos', label: 'Cooperativa Ailos' },
  { key: 'intermedium', label: 'Inter' },
  { key: 'itau', label: 'Itaú' },
  { key: 'itaupersonnalite', label: 'Itaú Personnalité' },
  { key: 'mercadopago', label: 'Mercado Pago' },
  { key: 'nubank', label: 'Nubank' },
  { key: 'picpay', label: 'PicPay' },
  { key: 'safra', label: 'Safra' },
  { key: 'santander', label: 'Santander' },
  { key: 'viacredi', label: 'Viacredi' },
  { key: 'xp', label: 'XP' },
  { key: 'amex', label: 'American Express' },
  { key: 'credicard', label: 'Credicard' },
  { key: 'diners', label: 'Diners' },
  { key: 'elo', label: 'Elo' },
  { key: 'hipercard', label: 'Hipercard' },
  { key: 'mastercard', label: 'Mastercard' },
  { key: 'master-black', label: 'Mastercard Black' },
  { key: 'visa', label: 'Visa' },
]);

const INSTITUTION_KEYS = new Set(INSTITUTIONS.map((item) => item.key));

export function institutionLabel(key) {
  return INSTITUTIONS.find((item) => item.key === key)?.label || '';
}

// Cor determinística a partir de um texto — usada quando o item não tem uma cor própria, só para
// dar variedade visual aos ícones.
export function colorFromText(text) {
  if (!text) return '#94a3b8';
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) hash = text.charCodeAt(index) + ((hash << 5) - hash);
  return CATEGORY_COLORS[Math.abs(hash) % CATEGORY_COLORS.length];
}

// Círculo colorido com o ícone da categoria (ou a inicial, se a categoria ainda não tem ícone).
// Subcategorias sem ícone/cor próprios herdam os da categoria principal.
export function categoryIconHtml(category, { parent = null, size = 36, className = '' } = {}) {
  const icon = category?.icon || parent?.icon || null;
  const color = category?.color || parent?.color || colorFromText(category?.name || '');
  const inner = hasIcon(icon)
    ? iconSvg(icon, { size: Math.round(size * 0.5), strokeWidth: 2 })
    : escapeHtml(category?.name ? category.name.trim().charAt(0).toUpperCase() : '•');
  return `<span class="entity-icon ${className}" style="--entity-size:${size}px;background:${escapeHtml(color)}">${inner}</span>`;
}

// Logo da instituição (conta/cartão) ou, sem instituição, um ícone genérico sobre a cor do item.
export function institutionIconHtml(item, { fallbackIcon = 'accounts', size = 36, className = '' } = {}) {
  if (item?.institution && INSTITUTION_KEYS.has(item.institution)) {
    return `<span class="entity-icon entity-icon--logo ${className}" style="--entity-size:${size}px"><img src="assets/icons/institutions/${item.institution}.png" alt="" loading="lazy" /></span>`;
  }
  const color = item?.color || colorFromText(item?.name || '');
  return `<span class="entity-icon ${className}" style="--entity-size:${size}px;background:${escapeHtml(color)}">${iconSvg(fallbackIcon, { size: Math.round(size * 0.5) })}</span>`;
}

export function iconPickerHtml(name, selected) {
  return `
    <div class="icon-picker" role="radiogroup">
      ${CATEGORY_ICON_KEYS.map(
        (key) => `
          <label class="icon-picker__option" title="${key}">
            <input type="radio" name="${name}" value="${key}" ${selected === key ? 'checked' : ''} />
            <span>${iconSvg(key, { size: 18 })}</span>
          </label>`
      ).join('')}
    </div>
  `;
}

export function colorPickerHtml(name, selected) {
  return `
    <div class="color-picker" role="radiogroup">
      ${CATEGORY_COLORS.map(
        (color) => `
          <label class="color-picker__option" title="${color}">
            <input type="radio" name="${name}" value="${color}" ${selected === color ? 'checked' : ''} />
            <span style="background:${color}"></span>
          </label>`
      ).join('')}
    </div>
  `;
}

export function institutionPickerHtml(name, selected, noneLabel) {
  return `
    <div class="institution-picker" role="radiogroup">
      <label class="institution-picker__option" title="${escapeHtml(noneLabel)}">
        <input type="radio" name="${name}" value="" ${!selected ? 'checked' : ''} />
        <span class="institution-picker__none">${iconSvg('accounts', { size: 18 })}</span>
        <small>${escapeHtml(noneLabel)}</small>
      </label>
      ${INSTITUTIONS.map(
        (item) => `
          <label class="institution-picker__option" title="${escapeHtml(item.label)}">
            <input type="radio" name="${name}" value="${item.key}" ${selected === item.key ? 'checked' : ''} />
            <img src="assets/icons/institutions/${item.key}.png" alt="" loading="lazy" />
            <small>${escapeHtml(item.label)}</small>
          </label>`
      ).join('')}
    </div>
  `;
}

// Modal padrão: sobreposição + caixa com título e botão de fechar. Devolve o elemento da caixa.
// Fecha com o X, clicando fora ou com Esc (chama onClose).
export function openModal(slot, { title, body, size = 'md', onClose }) {
  slot.innerHTML = `
    <div class="modal-overlay" data-modal-overlay>
      <div class="modal modal--${size}" role="dialog" aria-modal="true">
        <header class="modal__header">
          <h2 class="modal__title">${title}</h2>
          <button type="button" class="icon-button" data-modal-close aria-label="Fechar">${iconSvg('close', { size: 18 })}</button>
        </header>
        ${body}
      </div>
    </div>
  `;
  const overlay = slot.querySelector('[data-modal-overlay]');
  let closing = false;
  // Fecha com animação de saída (css/motion.css) e só então avisa a tela.
  const close = () => {
    if (closing) return;
    closing = true;
    document.removeEventListener('keydown', onKey);
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) {
      onClose?.();
      return;
    }
    overlay.classList.add('is-closing');
    setTimeout(() => onClose?.(), 170);
  };
  const onKey = (event) => {
    // A tela pode ter sido redesenhada (ex.: depois de salvar) sem passar por close().
    if (!document.body.contains(overlay)) {
      document.removeEventListener('keydown', onKey);
      return;
    }
    if (event.key === 'Escape') {
      event.stopPropagation();
      close();
    }
  };
  document.addEventListener('keydown', onKey);
  overlay.addEventListener('mousedown', (event) => {
    if (event.target === overlay) close();
  });
  overlay.querySelector('[data-modal-close]').addEventListener('click', close);
  return overlay.querySelector('.modal');
}
