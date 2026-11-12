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
  // Redesenho de uma janela que já está aberta (ex.: trocar Despesa ↔ Receita, abrir a repetição):
  // troca só o conteúdo, sem repetir a animação de abertura — senão a janela "pisca".
  const previous = slot.querySelector('[data-modal-overlay]');
  const isRefresh = Boolean(previous && !previous.classList.contains('is-closing'));
  slot.innerHTML = `
    <div class="modal-overlay ${isRefresh ? 'is-refresh' : ''}" data-modal-overlay>
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

/**
 * Confirmação no padrão das janelas do app (substitui o window.confirm, que alguns navegadores —
 * como o navegador embutido do app — bloqueiam e respondem "cancelar" sozinhos).
 * Abre por cima de qualquer janela aberta. Devolve uma Promise<boolean>: true ao confirmar;
 * false ao cancelar, fechar, clicar fora ou apertar Esc. Enter confirma.
 *
 *   if (!(await confirmDialog(t('x.deleteConfirm')))) return;
 */
export function confirmDialog(message, { title, confirmLabel, cancelLabel, danger = true } = {}) {
  const pt = (document.documentElement.lang || 'pt-BR').startsWith('pt');
  const labels = {
    title: title || (pt ? 'Confirmar' : 'Confirm'),
    confirm: confirmLabel || (danger ? (pt ? 'Excluir' : 'Delete') : pt ? 'Confirmar' : 'Confirm'),
    cancel: cancelLabel || (pt ? 'Cancelar' : 'Cancel'),
  };
  return new Promise((resolve) => {
    const previousFocus = document.activeElement;
    const host = document.createElement('div');
    host.innerHTML = `
      <div class="modal-overlay modal-overlay--confirm" data-confirm-overlay>
        <div class="modal modal--sm confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-dialog-title" aria-describedby="confirm-dialog-message">
          <header class="modal__header">
            <h2 class="modal__title" id="confirm-dialog-title">${escapeHtml(labels.title)}</h2>
          </header>
          <div class="modal__body">
            <div class="confirm-dialog__message">
              <span class="confirm-dialog__icon ${danger ? 'is-danger' : ''}">${iconSvg(danger ? 'trash' : 'info', { size: 20 })}</span>
              <p id="confirm-dialog-message">${escapeHtml(message)}</p>
            </div>
            <div class="form-actions">
              <button type="button" class="button" data-confirm-cancel>${escapeHtml(labels.cancel)}</button>
              <button type="button" class="button ${danger ? 'button--danger' : 'button--primary'}" data-confirm-ok>${escapeHtml(labels.confirm)}</button>
            </div>
          </div>
        </div>
      </div>`;
    document.body.appendChild(host);
    const overlay = host.querySelector('[data-confirm-overlay]');
    let done = false;
    const finish = (answer) => {
      if (done) return;
      done = true;
      document.removeEventListener('keydown', onKey, true);
      const remove = () => {
        host.remove();
        previousFocus?.focus?.();
        resolve(answer);
      };
      if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return remove();
      overlay.classList.add('is-closing');
      setTimeout(remove, 170);
    };
    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        finish(false);
      } else if (event.key === 'Enter') {
        event.preventDefault();
        event.stopPropagation();
        finish(true);
      }
    };
    document.addEventListener('keydown', onKey, true);
    overlay.addEventListener('mousedown', (event) => {
      if (event.target === overlay) finish(false);
    });
    host.querySelector('[data-confirm-cancel]').addEventListener('click', () => finish(false));
    host.querySelector('[data-confirm-ok]').addEventListener('click', () => finish(true));
    host.querySelector('[data-confirm-ok]').focus();
  });
}
